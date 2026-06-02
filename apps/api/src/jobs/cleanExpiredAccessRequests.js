// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/jobs/cleanExpiredAccessRequests.js
//
// Cron job: purge old access_requests (and their associated viewer_tokens)
// that are older than ACCESS_REQUEST_RETENTION_DAYS (default: 180 days).
// Runs once per day at startup and on a 24-hour interval.
//
// Rows eligible for deletion:
//   - status = 'pending'  AND created_at older than retention window
//     (never confirmed — abandoned enrollment attempts)
//   - status = 'confirmed' AND confirmed_at older than retention window
//     (long-time confirmed requests whose token can be cleaned up)
//   - status = 'revoked'  AND created_at older than retention window

import { query }  from '../db/database.js';
import { logger } from '../lib/logger.js';

const RETENTION_DAYS = parseInt(process.env.ACCESS_REQUEST_RETENTION_DAYS || '180', 10);
const log            = logger.child({ subsystem: 'access-request-cleanup' });

let _running = false;

export async function cleanExpiredAccessRequests() {
  if (_running) {
    log.debug('previous run still in progress — skip');
    return;
  }
  _running = true;

  try {
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    // DATETIME is stored as local time in MariaDB; use FROM_UNIXTIME for comparison
    const cutoffSec = Math.floor(cutoffMs / 1000);

    // 1. Collect token_ids to revoke (viewer_tokens linked to old confirmed requests)
    const [tokenRows] = await query(
      `SELECT token_id FROM access_requests
       WHERE token_id IS NOT NULL
         AND (
           (status = 'confirmed' AND confirmed_at < FROM_UNIXTIME(?))
           OR created_at < FROM_UNIXTIME(?)
         )`,
      [cutoffSec, cutoffSec]
    );

    // 2. Revoke associated viewer tokens
    if (tokenRows.length > 0) {
      const tokenIds = tokenRows.map(r => r.token_id);
      const placeholders = tokenIds.map(() => '?').join(',');
      await query(
        `UPDATE viewer_tokens SET revoked_at = ? WHERE id IN (${placeholders}) AND revoked_at IS NULL`,
        [Date.now(), ...tokenIds]
      );
    }

    // 3. Delete the access_requests rows
    const [result] = await query(
      `DELETE FROM access_requests
       WHERE created_at < FROM_UNIXTIME(?)`,
      [cutoffSec]
    );

    const deleted = result?.affectedRows ?? 0;
    if (deleted > 0 || tokenRows.length > 0) {
      log.info(
        { deleted, tokens_revoked: tokenRows.length, retention_days: RETENTION_DAYS },
        'expired access_requests purged'
      );
    }
  } catch (err) {
    log.error({ err }, 'cleanExpiredAccessRequests failed');
  } finally {
    _running = false;
  }
}

// ── Schedule (once per day) ───────────────────────────────────────────────────

export function startAccessRequestCleanupCron() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
  // Run once at startup to catch any leftovers
  cleanExpiredAccessRequests().catch(() => {});
  setInterval(() => cleanExpiredAccessRequests().catch(() => {}), INTERVAL_MS);
  log.info({ retention_days: RETENTION_DAYS, interval_h: 24 }, 'access_request cleanup cron started');
}
