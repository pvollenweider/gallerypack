// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/jobs/cleanExpiredUploads.js
//
// Cron job: delete incomplete tus uploads older than TUS_UPLOAD_TTL_H hours.
// Runs every hour. Skips if a previous run is still in progress.
//
// tus FileStore layout under internal/tus/:
//   <uploadId>       — binary data file
//   <uploadId>.json  — tus info file
//
// An upload is "incomplete" if its .json sidecar exists (tus deletes it on
// completion when we move the file in onUploadFinish).

import path   from 'node:path';
import fs     from 'node:fs';
import { INTERNAL_ROOT } from '../../../../packages/engine/src/fs.js';
import { logger }        from '../lib/logger.js';

const TTL_MS    = (Number(process.env.TUS_UPLOAD_TTL_H) || 24) * 60 * 60 * 1000;
const TUS_DIR   = path.join(INTERNAL_ROOT, 'tus');
const log       = logger.child({ subsystem: 'cleanup' });

let _running = false;

export async function cleanExpiredUploads() {
  if (_running) {
    log.debug('previous run still in progress — skip');
    return;
  }
  _running = true;

  let purged = 0;
  const now  = Date.now();

  try {
    if (!fs.existsSync(TUS_DIR)) return;

    const entries = fs.readdirSync(TUS_DIR);

    for (const name of entries) {
      // Only process .json info files — they represent incomplete uploads
      if (!name.endsWith('.json')) continue;

      const infoPath  = path.join(TUS_DIR, name);
      const dataPath  = path.join(TUS_DIR, name.slice(0, -5));   // strip .json

      let mtime;
      try {
        mtime = fs.statSync(infoPath).mtimeMs;
      } catch {
        continue;
      }

      if (now - mtime < TTL_MS) continue;

      // Expired — delete data file + info file
      try { fs.unlinkSync(dataPath);  } catch {}
      try { fs.unlinkSync(infoPath);  } catch {}
      purged++;
    }

    if (purged > 0) {
      log.info({ purged, ttl_h: TTL_MS / 3_600_000 }, 'expired tus uploads purged');
    }
  } catch (err) {
    log.error({ err }, 'cleanExpiredUploads failed');
  } finally {
    _running = false;
  }
}

// ── Schedule (every hour) ─────────────────────────────────────────────────────

export function startCleanupCron() {
  const INTERVAL_MS = 60 * 60 * 1000;  // 1 hour
  // Run once at startup to clean any leftovers from a crash
  cleanExpiredUploads().catch(() => {});
  setInterval(() => cleanExpiredUploads().catch(() => {}), INTERVAL_MS);
  log.info({ ttl_h: TTL_MS / 3_600_000, interval_h: 1 }, 'tus cleanup cron started');
}
