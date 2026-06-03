// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// workers/video-worker/src/transcoder.js — FFmpeg transcoding (remux, single-encode, force_abr)
// CPU priority is managed via k8s resource limits — see Dockerfile.video-worker.

import { execFile }  from 'node:child_process';
import { spawn }     from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { query }            from '../../../apps/api/src/db/database.js';
import { prerenderProject } from '../../../apps/api/src/services/prerender.js';

const execFileAsync = promisify(execFile);

// ─── Environment ──────────────────────────────────────────────────────────────
const FFMPEG_PATH   = process.env.FFMPEG_PATH   || 'ffmpeg';
const FFPROBE_PATH  = process.env.FFPROBE_PATH  || 'ffprobe';
// VIDEO_STORAGE_PATH is the root under which {galleryId}/{videoId}.{ext} files live
const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || 'storage/videos';
const SEGMENT_SEC   = process.env.VIDEO_HLS_SEGMENT_SEC   || '6';
const B_1080P       = process.env.VIDEO_HLS_1080P_BITRATE  || '4000k';
const B_720P        = process.env.VIDEO_HLS_720P_BITRATE   || '2000k';
const B_480P        = process.env.VIDEO_HLS_480P_BITRATE   || '800k';
const B_AUDIO       = process.env.VIDEO_HLS_AUDIO_BITRATE  || '128k';
const TIMEOUT_MS    = (parseInt(process.env.VIDEO_TRANSCODE_TIMEOUT_SEC, 10) || 10800) * 1000;

// ─── ffprobe ──────────────────────────────────────────────────────────────────

/**
 * Run ffprobe on `inputPath` and return parsed stream/format info.
 * @param {string} inputPath
 * @returns {Promise<{videoCodec:string, audioCodec:string, durationSec:number, isH264Aac:boolean}>}
 */
export async function probe(inputPath) {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    inputPath,
  ]);

  const data = JSON.parse(stdout);
  const streams = data.streams || [];
  const format  = data.format  || {};

  const videoStream = streams.find(s => s.codec_type === 'video');
  const audioStream = streams.find(s => s.codec_type === 'audio');

  const videoCodec = videoStream?.codec_name || 'unknown';
  const audioCodec = audioStream?.codec_name || 'unknown';

  // Prefer stream duration, fall back to format duration
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

// ─── FFmpeg spawn ─────────────────────────────────────────────────────────────

/**
 * Spawn `binary` with `args`, kill after `timeoutMs`, resolve on exit 0.
 * Exported for testing with an injectable binary path.
 * @param {string}   binary
 * @param {string[]} args
 * @param {number}   timeoutMs
 * @returns {Promise<void>}
 */
/** Parse FFmpeg progress line → { encodedSec, speed } or null */
function parseProgress(line) {
  const timeMatch  = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  const speedMatch = line.match(/speed=\s*([\d.]+)x/);
  if (!timeMatch) return null;
  const encodedSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
  const speed      = speedMatch ? parseFloat(speedMatch[1]) : 1;
  return { encodedSec, speed };
}

export function spawnFfmpegWith(binary, args, timeoutMs, { durationSec, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr  = '';
    let lastReport = 0;

    proc.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;

      // Throttle progress updates to once per 3s
      if (onProgress && durationSec && Date.now() - lastReport > 3000) {
        for (const line of chunk.split('\r').reverse()) {
          const p = parseProgress(line);
          if (p && p.encodedSec > 0) {
            const progress = Math.min(p.encodedSec / durationSec, 0.99);
            const etaSec   = p.speed > 0 ? Math.round((durationSec - p.encodedSec) / p.speed) : null;
            onProgress(progress, etaSec);
            lastReport = Date.now();
            break;
          }
        }
      }
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg timeout after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Convenience wrapper that uses the configured FFMPEG_PATH.
 * @param {string[]} args
 * @param {number}   timeoutMs
 * @returns {Promise<void>}
 */
export function spawnFfmpeg(args, timeoutMs, opts = {}) {
  return spawnFfmpegWith(FFMPEG_PATH, args, timeoutMs, opts);
}

// ─── Command builders ─────────────────────────────────────────────────────────

/**
 * Build FFmpeg args for a fast remux (H.264/AAC copy, no re-encode).
 */
export function buildRemuxArgs(inputPath, hlsDir) {
  return [
    '-i', inputPath,
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', SEGMENT_SEC,
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/seg%03d.ts`,
    `${hlsDir}/index.m3u8`,
  ];
}

/**
 * Build FFmpeg args for a single-quality 1080p re-encode.
 */
export function buildSingleEncodeArgs(inputPath, hlsDir) {
  return [
    '-i', inputPath,
    '-c:v', 'libx264', '-crf', '22', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', B_AUDIO,
    '-f', 'hls',
    '-hls_time', SEGMENT_SEC,
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/seg%03d.ts`,
    `${hlsDir}/index.m3u8`,
  ];
}

/**
 * Build FFmpeg args for Creator 1080p streaming mode.
 * Equivalent to HandBrake "Creator 1080p60" — CRF 20 + maxrate cap for
 * predictable segment sizes. Produces single-quality HLS (index.m3u8).
 * maxrate 6000k → segment ≤ ~5 MB at 6s — smooth streaming without buffering.
 */
export function buildCreator1080pArgs(inputPath, hlsDir) {
  return [
    '-i', inputPath,
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
    '-maxrate', '6000k', '-bufsize', '12000k',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-ac', '2',
    '-f', 'hls',
    '-hls_time', SEGMENT_SEC,
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/seg%03d.ts`,
    `${hlsDir}/index.m3u8`,
  ];
}

/**
 * Build FFmpeg args for Creator 720p streaming mode.
 * Equivalent to HandBrake "Creator 720p60" — CRF 19 + maxrate cap.
 * maxrate 3500k → segment ≤ ~3 MB at 6s — optimal for reliable streaming.
 */
export function buildCreator720pArgs(inputPath, hlsDir) {
  return [
    '-i', inputPath,
    '-c:v', 'libx264', '-crf', '19', '-preset', 'medium',
    '-maxrate', '3500k', '-bufsize', '7000k',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-f', 'hls',
    '-hls_time', SEGMENT_SEC,
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/seg%03d.ts`,
    `${hlsDir}/index.m3u8`,
  ];
}

/**
 * Build FFmpeg args for multi-bitrate ABR (1080p / 720p / 480p) with a master playlist.
 */
export function buildAbrArgs(inputPath, hlsDir) {
  return [
    '-i', inputPath,
    '-filter_complex',
    '[v:0]split=3[v1][v2][v3];[v1]scale=1920:1080[v1o];[v2]scale=1280:720[v2o];[v3]scale=854:480[v3o]',
    '-map', '[v1o]', '-c:v:0', 'libx264', '-b:v:0', B_1080P,
    '-map', '[v2o]', '-c:v:1', 'libx264', '-b:v:1', B_720P,
    '-map', '[v3o]', '-c:v:2', 'libx264', '-b:v:2', B_480P,
    '-map', 'a:0', '-map', 'a:0', '-map', 'a:0',
    '-c:a', 'aac', '-b:a', B_AUDIO,
    '-f', 'hls',
    '-hls_time', SEGMENT_SEC,
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', `${hlsDir}/stream_%v/seg%03d.ts`,
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2',
    `${hlsDir}/stream_%v/index.m3u8`,
  ];
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Transcode a video row to HLS and update the DB on completion.
 *
 * @param {object} video - Row from the `videos` table.
 * @param {number} video.id
 * @param {string} video.original_path  - Absolute path to the source file.
 * @param {string} video.gallery_id
 * @param {string} video.transcode_mode - 'auto' | 'force_abr'
 */
export async function transcode(video) {
  // ── Step 1: cancellation check ─────────────────────────────────────────────
  const [rows] = await query(
    'SELECT status FROM videos WHERE id = ?',
    [video.id],
  );
  const current = rows[0];
  if (!current || current.status === 'cancelled') {
    // Not an error — job was cancelled before we started; leave status as-is.
    return;
  }

  // ── Step 2: resolve paths ──────────────────────────────────────────────────
  const inputPath = video.original_path;
  const hlsDir    = `${VIDEO_STORAGE_PATH}/${video.gallery_id}/${video.id}_hls`;

  mkdirSync(hlsDir, { recursive: true });

  // For ABR we also need per-stream subdirectories (FFmpeg creates them, but
  // mkdirSync with recursive is idempotent so we pre-create them as well).
  if (video.transcode_mode === 'force_abr') {
    mkdirSync(`${hlsDir}/stream_0`, { recursive: true });
    mkdirSync(`${hlsDir}/stream_1`, { recursive: true });
    mkdirSync(`${hlsDir}/stream_2`, { recursive: true });
  }

  // ── Step 3: ffprobe ────────────────────────────────────────────────────────
  const { videoCodec, audioCodec, durationSec, isH264Aac } = await probe(inputPath);

  // ── Step 4: choose FFmpeg strategy ────────────────────────────────────────
  let ffmpegArgs;
  let hlsPath;

  if (video.transcode_mode === 'force_abr') {
    ffmpegArgs = buildAbrArgs(inputPath, hlsDir);
    hlsPath    = `${hlsDir}/master.m3u8`;
  } else if (video.transcode_mode === 'creator_1080p') {
    ffmpegArgs = buildCreator1080pArgs(inputPath, hlsDir);
    hlsPath    = `${hlsDir}/index.m3u8`;
  } else if (video.transcode_mode === 'creator_720p') {
    ffmpegArgs = buildCreator720pArgs(inputPath, hlsDir);
    hlsPath    = `${hlsDir}/index.m3u8`;
  } else {
    // 'auto' (default): remux if already H.264/AAC, else single re-encode
    if (isH264Aac) {
      ffmpegArgs = buildRemuxArgs(inputPath, hlsDir);
    } else {
      ffmpegArgs = buildSingleEncodeArgs(inputPath, hlsDir);
    }
    hlsPath = `${hlsDir}/index.m3u8`;
  }

  // ── Step 5: spawn FFmpeg (with hard timeout + progress reporting) ────────────
  await spawnFfmpeg(ffmpegArgs, TIMEOUT_MS, {
    durationSec,
    onProgress: async (progress, etaSec) => {
      await query(
        'UPDATE videos SET transcode_progress = ?, transcode_eta_sec = ? WHERE id = ?',
        [progress, etaSec, video.id]
      ).catch(() => {});
    },
  });

  // ── Step 6: extract cover thumbnail (best-effort, don't fail transcode) ────
  const coverPath = `${VIDEO_STORAGE_PATH}/${video.gallery_id}/cover_${video.id}.jpg`;
  try {
    const { existsSync, renameSync } = await import('fs');

    // Per-video poster (always generated)
    const videoPoster = `${VIDEO_STORAGE_PATH}/${video.gallery_id}/poster_${video.id}.jpg`;
    await spawnFfmpegWith(FFMPEG_PATH, [
      '-ss', '5', '-i', inputPath,
      '-frames:v', '1', '-vf', 'scale=640:-1',
      '-q:v', '3', videoPoster,
    ], 30_000);

    // Gallery cover: use first video's poster if no cover yet
    const galleryCover = `${VIDEO_STORAGE_PATH}/${video.gallery_id}/cover.jpg`;
    if (!existsSync(galleryCover) && existsSync(videoPoster)) {
      const { copyFileSync } = await import('fs');
      copyFileSync(videoPoster, galleryCover);
    }
  } catch (_) { /* thumbnail failure must not abort the transcode */ }

  // ── Step 7: update DB ──────────────────────────────────────────────────────
  await query(
    "UPDATE videos SET status='ready', hls_path=?, duration_sec=?, source_codec=?, transcode_progress=1, transcode_eta_sec=0, updated_at=NOW() WHERE id=?",
    [hlsPath, durationSec, `${videoCodec}/${audioCodec}`, video.id],
  );

  // ── Step 8: prerender project listing to update video gallery card ─────────
  try {
    const [projRows] = await query(
      'SELECT p.slug FROM galleries g JOIN projects p ON p.id = g.project_id WHERE g.id = ? LIMIT 1',
      [video.gallery_id]
    );
    if (projRows[0]?.slug) {
      prerenderProject(projRows[0].slug).catch(() => {});
    }
  } catch (_) { /* prerender failure must not mark the transcode as failed */ }
}
