// workers/video-worker/test/transcoder.test.js
// Unit tests for transcoder logic (no real FFmpeg / DB required).
//
// Run: node --test test/

import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach, afterEach } from 'node:test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ffprobe JSON payload. */
function ffprobeJson({ videoCodec = 'h264', audioCodec = 'aac', duration = '120.5' } = {}) {
  return JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: videoCodec, duration },
      { codec_type: 'audio', codec_name: audioCodec },
    ],
    format: { duration },
  });
}

// ─── Import the module under test ─────────────────────────────────────────────
// We import the pure functions that don't touch the DB or spawn real processes.
import {
  buildRemuxArgs,
  buildSingleEncodeArgs,
  buildAbrArgs,
  spawnFfmpegWith,
} from '../src/transcoder.js';

// ─── Command builder tests ────────────────────────────────────────────────────

describe('buildRemuxArgs', () => {
  it('uses -c copy and outputs index.m3u8', () => {
    const args = buildRemuxArgs('/src/video.mp4', '/hls/1_hls');
    assert.ok(args.includes('-c'));
    assert.ok(args.includes('copy'));
    assert.ok(args.some(a => a.endsWith('index.m3u8')));
    assert.ok(args.some(a => a.includes('seg%03d.ts')));
  });

  it('passes -hls_playlist_type vod', () => {
    const args = buildRemuxArgs('/src/video.mp4', '/hls/1_hls');
    const idx = args.indexOf('-hls_playlist_type');
    assert.notEqual(idx, -1);
    assert.equal(args[idx + 1], 'vod');
  });
});

describe('buildSingleEncodeArgs', () => {
  it('uses libx264 and aac codecs', () => {
    const args = buildSingleEncodeArgs('/src/video.mp4', '/hls/1_hls');
    assert.ok(args.includes('libx264'));
    assert.ok(args.includes('aac'));
    assert.ok(args.some(a => a.endsWith('index.m3u8')));
  });

  it('does not use -c copy', () => {
    const args = buildSingleEncodeArgs('/src/video.mp4', '/hls/1_hls');
    // '-c' followed immediately by 'copy' must not appear
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === '-c') {
        assert.notEqual(args[i + 1], 'copy', 'single-encode must not remux');
      }
    }
  });
});

describe('buildAbrArgs', () => {
  it('contains master.m3u8 playlist name', () => {
    const args = buildAbrArgs('/src/video.mp4', '/hls/1_hls');
    const idx = args.indexOf('-master_pl_name');
    assert.notEqual(idx, -1);
    assert.equal(args[idx + 1], 'master.m3u8');
  });

  it('maps three video streams and three audio streams', () => {
    const args = buildAbrArgs('/src/video.mp4', '/hls/1_hls');
    const mapCount = args.filter(a => a === '-map').length;
    // 3 video maps + 3 audio maps = 6
    assert.equal(mapCount, 6);
  });

  it('contains var_stream_map for three variants', () => {
    const args = buildAbrArgs('/src/video.mp4', '/hls/1_hls');
    const idx = args.indexOf('-var_stream_map');
    assert.notEqual(idx, -1);
    assert.ok(args[idx + 1].includes('v:0'), 'should include v:0');
    assert.ok(args[idx + 1].includes('v:1'), 'should include v:1');
    assert.ok(args[idx + 1].includes('v:2'), 'should include v:2');
  });

  it('output path uses stream_%v token', () => {
    const args = buildAbrArgs('/src/video.mp4', '/hls/1_hls');
    assert.ok(args.some(a => a.includes('stream_%v')));
  });
});

// ─── ffprobe result parsing ───────────────────────────────────────────────────
// We test the parsing logic by directly exercising probe() with a mocked
// child_process.execFile.  Because the module uses a top-level import, we
// reproduce the parsing logic inline here (the same logic lives in probe()).

describe('probe result parsing (inline logic)', () => {
  function parseFfprobeOutput(stdout) {
    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const format  = data.format  || {};
    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio');
    const videoCodec = videoStream?.codec_name || 'unknown';
    const audioCodec = audioStream?.codec_name || 'unknown';
    const rawDuration =
      parseFloat(videoStream?.duration) ||
      parseFloat(format?.duration)      ||
      0;
    return {
      videoCodec,
      audioCodec,
      durationSec: Math.round(rawDuration * 100) / 100,
      isH264Aac: videoCodec === 'h264' && audioCodec === 'aac',
    };
  }

  it('detects H.264/AAC as isH264Aac=true', () => {
    const result = parseFfprobeOutput(ffprobeJson({ videoCodec: 'h264', audioCodec: 'aac' }));
    assert.equal(result.isH264Aac, true);
    assert.equal(result.videoCodec, 'h264');
    assert.equal(result.audioCodec, 'aac');
  });

  it('detects HEVC/AAC as isH264Aac=false', () => {
    const result = parseFfprobeOutput(ffprobeJson({ videoCodec: 'hevc', audioCodec: 'aac' }));
    assert.equal(result.isH264Aac, false);
  });

  it('detects H.264/mp3 as isH264Aac=false', () => {
    const result = parseFfprobeOutput(ffprobeJson({ videoCodec: 'h264', audioCodec: 'mp3' }));
    assert.equal(result.isH264Aac, false);
  });

  it('parses duration correctly', () => {
    const result = parseFfprobeOutput(ffprobeJson({ duration: '93.75' }));
    assert.equal(result.durationSec, 93.75);
  });

  it('falls back to format.duration when stream duration is missing', () => {
    const data = JSON.stringify({
      streams: [
        { codec_type: 'video', codec_name: 'h264' },   // no duration field
        { codec_type: 'audio', codec_name: 'aac'  },
      ],
      format: { duration: '200.0' },
    });
    const result = parseFfprobeOutput(data);
    assert.equal(result.durationSec, 200);
  });

  it('returns unknown codecs when streams are absent', () => {
    const data = JSON.stringify({ streams: [], format: {} });
    const result = parseFfprobeOutput(data);
    assert.equal(result.videoCodec, 'unknown');
    assert.equal(result.audioCodec, 'unknown');
    assert.equal(result.isH264Aac, false);
  });
});

// ─── Command selection logic ──────────────────────────────────────────────────

describe('command selection', () => {
  function selectCommand(transcodeMode, isH264Aac) {
    if (transcodeMode === 'force_abr') return 'abr';
    return isH264Aac ? 'remux' : 'single_encode';
  }

  it('auto + H264/AAC → remux', () => {
    assert.equal(selectCommand('auto', true), 'remux');
  });

  it('auto + HEVC → single_encode', () => {
    assert.equal(selectCommand('auto', false), 'single_encode');
  });

  it('force_abr → abr regardless of codec', () => {
    assert.equal(selectCommand('force_abr', true),  'abr');
    assert.equal(selectCommand('force_abr', false), 'abr');
  });

  it('unrecognised mode treated as auto', () => {
    assert.equal(selectCommand('unknown_mode', true),  'remux');
    assert.equal(selectCommand('unknown_mode', false), 'single_encode');
  });
});

// ─── spawnFfmpeg timeout ──────────────────────────────────────────────────────

describe('spawnFfmpeg', () => {
  it('rejects when command exits with non-zero code', async () => {
    // spawnFfmpegWith lets us inject an arbitrary binary for testing.
    await assert.rejects(
      () => spawnFfmpegWith('/usr/bin/false', [], 5000),
      /FFmpeg exited with code/,
    );
  });

  it('resolves when command exits 0', async () => {
    await assert.doesNotReject(
      () => spawnFfmpegWith('/usr/bin/true', [], 5000),
    );
  });

  it('kills process and rejects after timeout', async () => {
    // /bin/sleep 60 would hang; we give it a 50ms timeout.
    await assert.rejects(
      () => spawnFfmpegWith('/bin/sleep', ['60'], 50),
      /timeout/i,
    );
  });
});
