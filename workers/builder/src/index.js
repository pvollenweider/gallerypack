// workers/builder/src/index.js — build queue worker
// Polls build_jobs for queued jobs and executes them one at a time.
// Runs as a standalone process alongside the API server.
import { getDb }    from '../../../apps/api/src/db/database.js';
import { runJob }   from './runner.js';
import { runWatchdog } from './watchdog.js';
import { runMigrations } from '../../../apps/api/src/db/migrations/run.js';

const POLL_INTERVAL_MS     = 2000;  // check for new jobs every 2s
const WATCHDOG_INTERVAL_MS = 60000; // run watchdog every 60s

let busy = false;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
runMigrations();
console.log('\n  ✓  GalleryPack builder worker started\n');

// ── Main poll loop ────────────────────────────────────────────────────────────
async function poll() {
  if (busy) return;

  const job = getDb()
    .prepare("SELECT id FROM build_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
    .get();

  if (!job) return;

  busy = true;
  console.log(`  →  Processing job ${job.id}`);
  try {
    await runJob(job.id);
    console.log(`  ✓  Job ${job.id} complete`);
  } catch (err) {
    console.error(`  ✗  Job ${job.id} failed: ${err.message}`);
  } finally {
    busy = false;
  }
}

// ── Watchdog ──────────────────────────────────────────────────────────────────
function watchdog() {
  const n = runWatchdog();
  if (n > 0) console.log(`  ⚠  Watchdog recovered ${n} stuck job(s)`);
}

// ── Start ─────────────────────────────────────────────────────────────────────
setInterval(poll, POLL_INTERVAL_MS);
setInterval(watchdog, WATCHDOG_INTERVAL_MS);

// Graceful shutdown
process.on('SIGTERM', () => { console.log('Worker shutting down…'); process.exit(0); });
process.on('SIGINT',  () => { console.log('Worker shutting down…'); process.exit(0); });
