// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// workers/builder/src/runner.js — execute a single build job
// Calls the engine's buildGallery() directly (no subprocess) and writes
// progress events to the build_events table for SSE streaming.
import path from 'path';
import { marked }                                              from 'marked';
import { query }                                                from '../../../apps/api/src/db/database.js';
import { getJob, updateJobStatus, appendEvent, getSettings }   from '../../../apps/api/src/db/helpers.js';
import { sendGalleryReadyEmail }                               from '../../../apps/api/src/services/email.js';
import { emit, EVENTS }                                        from '../../../apps/api/src/services/events.js';
import { buildGallery }                                        from '../../../packages/engine/src/gallery.js';
import { downloadVendors, downloadFonts }                      from '../../../packages/engine/src/network.js';
import { SRC_ROOT, DIST_ROOT, BUILD_CFG_PATH }               from '../../../packages/engine/src/fs.js';
import { createStorage }                                       from '../../../packages/shared/src/storage/index.js';
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

/**
 * Map a gallery DB row to the engine's project config format.
 */
function galleryToProjectConfig(g) {
  const proj = {};
  proj.name                 = g.slug;
  if (g.title)              proj.title              = g.title;
  if (g.subtitle)           proj.subtitle           = g.subtitle;
  if (g.author)             proj.author             = g.author;
  if (g.author_email)       proj.authorEmail        = g.author_email;
  if (g.date)               proj.date               = g.date;
  if (g.location)           proj.location           = g.location;
  if (g.locale)             proj.locale             = g.locale;
  if (g.access)             proj.access             = g.access;
  if (g.description)        proj.description        = g.description;
  if (g.description_md)     proj.descriptionHtml    = marked.parse(g.description_md);
  if (g.cover_photo)        proj.coverPhoto         = g.cover_photo;
  if (g.slideshow_interval) proj.autoplay           = { slideshowInterval: g.slideshow_interval };
  proj.private              = g.access !== 'public';
  proj.standalone           = !!g.standalone;
  proj.downloadMode         = g.download_mode || 'display';
  proj.apacheProtection     = !!g.apache_protection;
  // Legacy fields kept for backward compat with CLI builds
  if (g.allow_download_image   !== null) proj.allowDownloadImage   = g.allow_download_image   !== 0;
  if (g.allow_download_gallery !== null) proj.allowDownloadGallery = g.allow_download_gallery !== 0;
  return proj;
}

export async function runJob(jobId) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'queued') return; // already picked up

  // Mark as running
  await updateJobStatus(jobId, 'running', { started_at: Date.now() });

  const [galleryRows] = await query(`
    SELECT g.*, p.slug AS project_slug, p.name AS project_name
    FROM galleries g
    LEFT JOIN projects p ON p.id = g.project_id
    WHERE g.id = ?
  `, [job.gallery_id]);
  const gallery = galleryRows[0];
  if (!gallery) {
    await updateJobStatus(jobId, 'error', { error_msg: 'Gallery not found' });
    await appendEvent(jobId, 'error', 'Gallery not found in database');
    return;
  }

  const settings = await getSettings(job.studio_id);

  // Intercept process.stdout.write so engine log lines go to build_events
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...args) => {
    const line  = typeof chunk === 'string' ? chunk : chunk.toString();
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\n$/, '');
    if (clean.trim()) appendEvent(jobId, 'log', clean);
    return originalWrite(chunk, ...args);
  };

  try {
    await appendEvent(jobId, 'log', `Starting build for gallery: ${gallery.slug}`);

    // Sprint 11: write photo_order.json with only validated (or published) photos.
    // The engine's listPhotos() respects this file and treats it as the full ordered list.
    // This excludes 'uploaded' photos that are still pending review.
    const [validatedRows] = await query(
      `SELECT ph.filename, u.name AS photographer_name
       FROM photos ph
       LEFT JOIN users u ON u.id = ph.photographer_id
       WHERE ph.gallery_id = ? AND ph.status IN ('validated', 'published')
       ORDER BY ph.sort_order ASC, ph.created_at ASC`,
      [gallery.id]
    );
    if (validatedRows.length > 0) {
      const galSrcDir = path.join(SRC_ROOT, gallery.slug);
      fs.mkdirSync(galSrcDir, { recursive: true });

      // photo_order.json — ordered list of filenames (engine filter)
      const orderFile = path.join(galSrcDir, 'photo_order.json');
      fs.writeFileSync(orderFile, JSON.stringify(validatedRows.map(r => r.filename)));
      await appendEvent(jobId, 'log', `Photo filter: ${validatedRows.length} validated photo(s) will be built`);

      // photo_attribution.json — filename → photographer name (issue #133)
      const attribution = {};
      for (const r of validatedRows) {
        if (r.photographer_name) attribution[r.filename] = r.photographer_name;
      }
      const attrFile = path.join(galSrcDir, 'photo_attribution.json');
      fs.writeFileSync(attrFile, JSON.stringify(attribution));
      const creditCount = Object.keys(attribution).length;
      if (creditCount > 0) {
        await appendEvent(jobId, 'log', `Photo attribution: ${creditCount} photo(s) with photographer credits`);
      }
    }

    // Load build config
    const buildCfgPath = BUILD_CFG_PATH;
    if (!fs.existsSync(buildCfgPath)) throw new Error('build.config.json not found');
    const buildCfg = JSON.parse(fs.readFileSync(buildCfgPath, 'utf8'));

    // Download shared assets (idempotent — skips if already present)
    await downloadVendors();
    const fontCss = await downloadFonts();

    // For public galleries in a project, build to {project-slug}/{gallery-slug}/
    // Private galleries keep their hash-based distName for security.
    const galCfg = galleryToProjectConfig(gallery);
    const distNameOverride = (gallery.project_slug && gallery.access !== 'password' && galCfg.private !== true)
      ? `${gallery.project_slug}/${gallery.slug}`
      : undefined;

    const result = await buildGallery(
      gallery.slug,
      { build: buildCfg, project: galCfg, distName: distNameOverride },
      fontCss,
      {
        force:              !!job.force,
        generateApacheAuth: false,
        geocoder:           undefined, // use default Nominatim
      }
    );

    // Verify artifact exists via storage adapter (works for both local and S3)
    const finalDistName = result?.distName || gallery.slug;
    const manifestKey   = `public/${finalDistName}/photos.json`;
    const artifactOk    = await storage.exists(manifestKey);
    if (!artifactOk) throw new Error(`Build completed but manifest not found: ${manifestKey}`);

    // Clean up old flat dist directory if the gallery moved to a project-scoped path
    if (finalDistName !== gallery.slug) {
      const oldDistDir = path.join(DIST_ROOT, gallery.slug);
      try {
        if (fs.existsSync(oldDistDir)) {
          fs.rmSync(oldDistDir, { recursive: true, force: true });
          await appendEvent(jobId, 'log', `Removed old dist directory: dist/${gallery.slug}`);
        }
      } catch (e) {
        await appendEvent(jobId, 'log', `Warning: could not remove old dist dir: ${e.message}`);
      }
    }

    // Sprint 13: mark validated photos as published, count newly published ones
    const [newlyPublished] = await query(
      `UPDATE photos SET status = 'published' WHERE gallery_id = ? AND status = 'validated'`,
      [gallery.id]
    );
    const newPhotoCount = newlyPublished.affectedRows || 0;
    await appendEvent(jobId, 'log', `Published ${newPhotoCount} new photo(s)`);

    // Persist artifact metadata back to the gallery row
    await query(
      'UPDATE galleries SET build_status = ?, built_at = ?, dist_name = ?, needs_rebuild = 0, workflow_status = \'published\', updated_at = ? WHERE id = ?',
      ['done', Date.now(), result?.distName || null, Date.now(), gallery.id]
    );

    await updateJobStatus(jobId, 'done', { finished_at: Date.now() });
    await appendEvent(jobId, 'done', JSON.stringify({
      photoCount: result?.photoCount,
      distName:   result?.distName,
      durationMs: result?.durationMs,
    }));

    // Sprint 13: smart notification — only fire if new photos were published
    const studioId = gallery.studio_id || gallery.organization_id;
    emit(EVENTS.GALLERY_PUBLISHED, {
      studioId,
      galleryId:    gallery.id,
      galleryTitle: gallery.title || gallery.slug,
      gallerySlug:  result?.distName || gallery.slug,
      newPhotoCount,
    });

    // Legacy: send gallery-ready email to the author if configured
    if (gallery.author_email) {
      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
      sendGalleryReadyEmail({
        studioId,
        to:           gallery.author_email,
        galleryTitle: gallery.title || gallery.slug,
        galleryUrl:   `${baseUrl}/${result?.distName || gallery.slug}/`,
      });
    }
  } catch (err) {
    await query(
      'UPDATE galleries SET build_status = ?, updated_at = ? WHERE id = ?',
      ['error', Date.now(), gallery.id]
    );
    await updateJobStatus(jobId, 'error', { error_msg: err.message, finished_at: Date.now() });
    await appendEvent(jobId, 'error', err.message);
    emit(EVENTS.GALLERY_BUILD_FAILED, {
      studioId:          gallery.studio_id || gallery.organization_id,
      galleryId:         gallery.id,
      galleryTitle:      gallery.title || gallery.slug,
      triggeredByUserId: job.triggered_by_user_id || null,
      errorMsg:          err.message,
    });
  } finally {
    // Restore stdout
    process.stdout.write = originalWrite;

    // Clean up any temp work directories left by the build (e.g. __tmp_* under dist/)
    try {
      const tmpPattern = path.join(DIST_ROOT, `__tmp_${gallery.slug}_*`);
      const { globSync } = await import('glob').catch(() => ({ globSync: null }));
      if (globSync) {
        for (const dir of globSync(tmpPattern)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    } catch {} // non-fatal — temp cleanup is best-effort
  }
}
