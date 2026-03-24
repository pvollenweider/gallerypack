// workers/builder/src/watchdog.js — detect and recover stuck jobs
// A job is "stuck" if it has been in `running` status for longer than STUCK_TIMEOUT_MS
// with no new build_events written.
import { getDb }              from '../../../apps/api/src/db/database.js';
import { appendEvent }        from '../../../apps/api/src/db/helpers.js';

const STUCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes with no new event = stuck

export function runWatchdog() {
  const db  = getDb();
  const now = Date.now();

  // Find running jobs whose last event is older than STUCK_TIMEOUT_MS
  const stuckJobs = db.prepare(`
    SELECT j.id, j.gallery_id,
           MAX(e.created_at) as last_event_at
    FROM build_jobs j
    LEFT JOIN build_events e ON e.job_id = j.id
    WHERE j.status = 'running'
    GROUP BY j.id
    HAVING last_event_at IS NULL OR last_event_at < ?
  `).all(now - STUCK_TIMEOUT_MS);

  for (const job of stuckJobs) {
    console.warn(`  ⚠  Watchdog: job ${job.id} stuck (last event ${job.last_event_at ? new Date(job.last_event_at).toISOString() : 'never'}), marking as error`);
    db.prepare('UPDATE build_jobs SET status = ?, error_msg = ?, finished_at = ? WHERE id = ?')
      .run('error', 'Job timed out (watchdog)', now, job.id);
    db.prepare('UPDATE galleries SET build_status = ?, updated_at = ? WHERE id = ?')
      .run('error', now, job.gallery_id);
    appendEvent(job.id, 'error', 'Build timed out — killed by watchdog');
  }

  // Also reset any jobs that are still 'queued' after a restart (orphaned queued jobs)
  // These are safe to re-queue — the worker will pick them up on next poll.
  // (No action needed — the main poll loop picks queued jobs naturally.)

  return stuckJobs.length;
}
