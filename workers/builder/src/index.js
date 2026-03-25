// workers/builder/src/index.js — build queue worker
// Polls build_jobs for queued jobs and executes them one at a time.
// Runs as a standalone process alongside the API server.
import fs           from 'fs';
import { query }    from '../../../apps/api/src/db/database.js';
import { runJob }   from './runner.js';
import { runWatchdog } from './watchdog.js';
import { runMigrations } from '../../../apps/api/src/db/migrations/run.js';

const POLL_INTERVAL_MS     = 2000;  // check for new jobs every 2s
const WATCHDOG_INTERVAL_MS = 60000; // run watchdog every 60s

let busy = false;

// ── Main poll loop ────────────────────────────────────────────────────────────
async function poll() {
  if (busy) return;

  const [rows] = await query(
    "SELECT id FROM build_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
  );
  const job = rows[0];

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
async function watchdog() {
  const n = await runWatchdog();
  if (n > 0) console.log(`  ⚠  Watchdog recovered ${n} stuck job(s)`);
}

// ── Bootstrap then start ──────────────────────────────────────────────────────
(async () => {
  try {
    await runMigrations();
    console.log('\n  ✓  GalleryPack builder worker started\n');

    setInterval(poll, POLL_INTERVAL_MS);
    setInterval(watchdog, WATCHDOG_INTERVAL_MS);

    // Write a liveness file for the Docker HEALTHCHECK every 30s
    const ALIVE_FILE = '/tmp/worker.alive';
    function touchAlive() { try { fs.writeFileSync(ALIVE_FILE, String(Date.now())); } catch {} }
    touchAlive();
    setInterval(touchAlive, 30_000);
  } catch (err) {
    console.error('Fatal worker startup error:', err);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', () => { console.log('Worker shutting down…'); process.exit(0); });
process.on('SIGINT',  () => { console.log('Worker shutting down…'); process.exit(0); });
