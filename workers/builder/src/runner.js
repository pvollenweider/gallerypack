// workers/builder/src/runner.js — execute a single build job
// Calls the engine's buildGallery() directly (no subprocess) and writes
// progress events to the build_events table for SSE streaming.
import path from 'path';
import { getDb }                       from '../../../apps/api/src/db/database.js';
import { getJob, updateJobStatus, appendEvent, getSettings } from '../../../apps/api/src/db/helpers.js';
import { buildGallery }                from '../../../packages/engine/src/gallery.js';
import { downloadVendors, downloadFonts } from '../../../packages/engine/src/network.js';
import { ROOT }        from '../../../packages/engine/src/fs.js';
import { createStorage } from '../../../packages/shared/src/storage/index.js';
import fs from 'fs';

// Storage adapter — used for reading/writing build artifacts
const storage = createStorage();

// Redirect stdout writes to build_events during a build
function makeEventWriter(jobId) {
  return {
    log:  (msg) => appendEvent(jobId, 'log', msg),
    done: (msg) => appendEvent(jobId, 'done', msg),
    err:  (msg) => appendEvent(jobId, 'error', msg),
  };
}

export async function runJob(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'queued') return; // already picked up

  // Mark as running
  updateJobStatus(jobId, 'running', { started_at: Date.now() });

  const gallery = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ?')
    .get(job.gallery_id);
  if (!gallery) {
    updateJobStatus(jobId, 'error', { error_msg: 'Gallery not found' });
    appendEvent(jobId, 'error', 'Gallery not found in database');
    return;
  }

  // Get settings for this studio (GALLERY_APACHE_PATH etc.)
  const settings = getSettings(job.studio_id);
  if (settings?.apache_path) {
    process.env.GALLERY_APACHE_PATH = settings.apache_path;
  }

  const ew = makeEventWriter(jobId);

  // Intercept process.stdout.write so engine log lines go to build_events
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    const line = typeof chunk === 'string' ? chunk : chunk.toString();
    // Strip ANSI colour codes for storage
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\n$/, '');
    if (clean.trim()) appendEvent(jobId, 'log', clean);
    return originalWrite(chunk, ...args);
  };

  try {
    appendEvent(jobId, 'log', `Starting build for gallery: ${gallery.slug}`);

    // Load build config
    const buildCfgPath = path.join(ROOT, 'build.config.json');
    if (!fs.existsSync(buildCfgPath)) throw new Error('build.config.json not found');
    const buildCfg = JSON.parse(fs.readFileSync(buildCfgPath, 'utf8'));

    // Download shared assets (idempotent — skips if already present)
    await downloadVendors();
    const fontCss = await downloadFonts();

    const result = await buildGallery(
      gallery.slug,
      { build: buildCfg },
      fontCss,
      {
        force:             !!job.force,
        generateApacheAuth: !!settings?.apache_path,
        geocoder:          undefined, // use default Nominatim
      }
    );

    // Verify artifact exists via storage adapter (works for both local and S3)
    const manifestKey = `dist/${result?.distName || gallery.slug}/photos.json`;
    const artifactOk  = await storage.exists(manifestKey);
    if (!artifactOk) throw new Error(`Build completed but manifest not found: ${manifestKey}`);

    // Persist artifact metadata back to the gallery row
    getDb().prepare(
      'UPDATE galleries SET build_status = ?, built_at = ?, updated_at = ? WHERE id = ?'
    ).run('done', Date.now(), Date.now(), gallery.id);

    updateJobStatus(jobId, 'done', { finished_at: Date.now() });
    appendEvent(jobId, 'done', JSON.stringify({
      photoCount: result?.photoCount,
      distName:   result?.distName,
      durationMs: result?.durationMs,
    }));
  } catch (err) {
    getDb().prepare(
      'UPDATE galleries SET build_status = ?, updated_at = ? WHERE id = ?'
    ).run('error', Date.now(), gallery.id);
    updateJobStatus(jobId, 'error', { error_msg: err.message, finished_at: Date.now() });
    appendEvent(jobId, 'error', err.message);
  } finally {
    // Restore stdout
    process.stdout.write = originalWrite;
  }
}
