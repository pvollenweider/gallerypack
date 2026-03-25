// workers/builder/src/watchdog.js — detect and recover stuck jobs
// A job is "stuck" if it has been in `running` status for longer than STUCK_TIMEOUT_MS
// with no new build_events written.
import { query }       from '../../../apps/api/src/db/database.js';
import { appendEvent } from '../../../apps/api/src/db/helpers.js';

const STUCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes with no new event = stuck

export async function runWatchdog() {
  const now = Date.now();

  const [stuckJobs] = await query(`
    SELECT j.id, j.gallery_id,
           MAX(e.created_at) AS last_event_at
    FROM build_jobs j
    LEFT JOIN build_events e ON e.job_id = j.id
    WHERE j.status = 'running'
    GROUP BY j.id
    HAVING last_event_at IS NULL OR last_event_at < ?
  `, [now - STUCK_TIMEOUT_MS]);

  for (const job of stuckJobs) {
    console.warn(`  ⚠  Watchdog: job ${job.id} stuck (last event ${job.last_event_at ? new Date(job.last_event_at).toISOString() : 'never'}), marking as error`);
    await query(
      'UPDATE build_jobs SET status = ?, error_msg = ?, finished_at = ? WHERE id = ?',
      ['error', 'Job timed out (watchdog)', now, job.id]
    );
    await query(
      'UPDATE galleries SET build_status = ?, updated_at = ? WHERE id = ?',
      ['error', now, job.gallery_id]
    );
    await appendEvent(job.id, 'error', 'Build timed out — killed by watchdog');
  }

  return stuckJobs.length;
}
