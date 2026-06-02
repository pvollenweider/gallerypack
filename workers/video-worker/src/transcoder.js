// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// workers/video-worker/src/transcoder.js — FFmpeg transcoding stub
// Real FFmpeg logic is wired in a separate task.
import { query } from '../../../apps/api/src/db/database.js';

const FFMPEG_PATH               = process.env.FFMPEG_PATH               || 'ffmpeg';
const VIDEO_STORAGE_DRIVER      = process.env.VIDEO_STORAGE_DRIVER      || 'local';
const VIDEO_STORAGE_PATH        = process.env.VIDEO_STORAGE_PATH        || 'storage/videos';
const VIDEO_HLS_1080P_BITRATE   = process.env.VIDEO_HLS_1080P_BITRATE   || '4000k';
const VIDEO_HLS_720P_BITRATE    = process.env.VIDEO_HLS_720P_BITRATE    || '2000k';
const VIDEO_HLS_480P_BITRATE    = process.env.VIDEO_HLS_480P_BITRATE    || '800k';
const VIDEO_HLS_AUDIO_BITRATE   = process.env.VIDEO_HLS_AUDIO_BITRATE   || '128k';
const VIDEO_HLS_SEGMENT_SEC     = Number(process.env.VIDEO_HLS_SEGMENT_SEC)     || 6;
const VIDEO_TRANSCODE_TIMEOUT_SEC = Number(process.env.VIDEO_TRANSCODE_TIMEOUT_SEC) || 10800;

/**
 * Transcode a video row to HLS.
 * @param {object} video - Row from the videos table.
 */
export async function transcode(video) {
  // Cancellation check: abort early if the video was cancelled before we started.
  const [rows] = await query(
    "SELECT status FROM videos WHERE id = ?",
    [video.id]
  );
  const current = rows[0];
  if (!current || current.status === 'cancelled') {
    throw new Error(`Video ${video.id} was cancelled before transcoding started`);
  }

  // Hard timeout: reject after VIDEO_TRANSCODE_TIMEOUT_SEC seconds.
  await new Promise((_resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Transcode timeout after ${VIDEO_TRANSCODE_TIMEOUT_SEC}s`)),
      VIDEO_TRANSCODE_TIMEOUT_SEC * 1000
    );

    // TODO: spawn FFmpeg here and resolve/reject based on exit code.
    // Unref the timer so it doesn't keep the process alive if we resolve early.
    timer.unref();

    // Stub: not yet implemented.
    clearTimeout(timer);
    reject(new Error('transcoder not yet implemented'));
  });
}
