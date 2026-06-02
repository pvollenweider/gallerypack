// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// workers/video-worker/src/index.js — video transcoding worker
// Polls the videos table for pending videos and transcodes them one at a time.
// Runs as a standalone process alongside the API server.
import fs from 'fs';
import { query }        from '../../../apps/api/src/db/database.js';
import { runMigrations } from '../../../apps/api/src/db/migrations/run.js';
import { transcode }    from './transcoder.js';

const POLL_MS = 3000;

let busy = false;

// ── Main poll loop ────────────────────────────────────────────────────────────
async function poll() {
  if (busy) return;

  const [rows] = await query(
    "SELECT * FROM videos WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
  );
  const video = rows[0];
  if (!video) return;

  busy = true;
  await query(
    "UPDATE videos SET status = 'transcoding', updated_at = NOW() WHERE id = ?",
    [video.id]
  );

  console.log(`  →  Transcoding video ${video.id} (${video.title || video.slug})`);
  try {
    await transcode(video);
    console.log(`  ✓  Video ${video.id} ready`);
  } catch (err) {
    console.error(`  ✗  Video ${video.id} failed: ${err.message}`);
    await query(
      "UPDATE videos SET status = 'error', error_message = ?, updated_at = NOW() WHERE id = ?",
      [err.message, video.id]
    );
  } finally {
    busy = false;
  }
}

// ── Bootstrap then start ──────────────────────────────────────────────────────
(async () => {
  try {
    await runMigrations();

    // Reset any videos stuck in 'transcoding' — orphaned from a previous crash/restart
    const [stuck] = await query("UPDATE videos SET status='pending', error_message=NULL WHERE status='transcoding'");
    if (stuck.affectedRows > 0) {
      console.log(`  ⚠  Reset ${stuck.affectedRows} orphaned transcoding job(s) to pending`);
    }

    console.log('\n  ✓  GalleryPack video worker started\n');

    setInterval(poll, POLL_MS);

    // Write a liveness file for the Docker HEALTHCHECK every 30s
    const ALIVE_FILE = '/tmp/video-worker.alive';
    function touchAlive() { try { fs.writeFileSync(ALIVE_FILE, String(Date.now())); } catch {} }
    touchAlive();
    setInterval(touchAlive, 30_000);
  } catch (err) {
    console.error('Fatal video worker startup error:', err);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', () => { console.log('Video worker shutting down…'); process.exit(0); });
process.on('SIGINT',  () => { console.log('Video worker shutting down…'); process.exit(0); });
