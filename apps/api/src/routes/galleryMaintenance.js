// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/galleryMaintenance.js — gallery maintenance operations
// DELETE /:id/dist                 — flush all built output
// DELETE /:id/dist/originals       — strip originals when downloads are disabled
// POST   /:id/photos/reconcile     — re-register photos from src/ into DB
// POST   /:id/photos/deduplicate   — find / remove content-identical photos

import { Router }        from 'express';
import { createHash }    from 'node:crypto';
import fs                from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path              from 'node:path';
import { query }         from '../db/database.js';
import { requireAuth }   from '../middleware/auth.js';
import { can }           from '../authorization/index.js';
import { getGalleryRole, genId } from '../db/helpers.js';
import { DIST_ROOT, SRC_ROOT } from '../../../../packages/engine/src/fs.js';
import { generateSingleThumbnail, thumbPath, THUMB_SIZES } from '../services/thumbnailService.js';
import { extractExif }   from '../../../../packages/engine/src/exif.js';
import { runSharp }      from '../services/sharpProcess.js';

const router = Router();
router.use(requireAuth);

// ── Shared helper: load gallery with project slug ──────────────────────────

async function loadGallery(id, organizationId) {
  const [rows] = await query(
    `SELECT g.*, p.slug AS proj_slug
     FROM galleries g
     LEFT JOIN projects p ON p.id = g.project_id
     WHERE g.id = ? AND g.organization_id = ? LIMIT 1`,
    [id, organizationId]
  );
  return rows[0] ?? null;
}

async function getGalleryPrimaryPhotographer(galleryId) {
  const [rows] = await query(
    'SELECT primary_photographer_id FROM galleries WHERE id = ?',
    [galleryId]
  );
  return rows[0]?.primary_photographer_id ?? null;
}

function distSlug(gallery) {
  return gallery.proj_slug
    ? `${gallery.proj_slug}/${gallery.slug}`
    : gallery.slug;
}

// ── Authorization helper ───────────────────────────────────────────────────

async function requireOwner(req, res, gallery) {
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'update', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// ── DELETE /:id/dist — flush all built output ──────────────────────────────

router.delete('/:id/dist', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.organizationId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const slug = distSlug(gallery);
    const distPath = path.join(DIST_ROOT, slug);

    // Remove the built output directory (safe even if it doesn't exist)
    await fs.rm(distPath, { recursive: true, force: true });

    // Reset gallery build state
    await query(
      `UPDATE galleries
       SET build_status = 'pending', workflow_status = 'draft',
           built_at = NULL, needs_rebuild = 0,
           updated_at = ?
       WHERE id = ?`,
      [Date.now(), gallery.id]
    );

    res.json({ ok: true, message: 'Built output flushed. Gallery is now in draft.' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:id/dist/originals — strip originals when downloads disabled ──

router.delete('/:id/dist/originals', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.organizationId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const originalsDir = path.join(DIST_ROOT, distSlug(gallery), 'originals');
    let deleted = 0;
    try {
      const entries = await fs.readdir(originalsDir, { withFileTypes: true });
      for (const entry of entries.filter(e => e.isFile())) {
        await fs.unlink(path.join(originalsDir, entry.name));
        deleted++;
      }
      // Remove empty dir
      await fs.rmdir(originalsDir).catch(() => {});
    } catch {
      // originalsDir doesn't exist — nothing to strip
    }

    res.json({ ok: true, deleted, message: `Stripped ${deleted} original file(s) from dist.` });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/photos/reconcile — re-register photos from src/ ─────────────

router.post('/:id/photos/reconcile', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.organizationId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const photosDir = path.join(SRC_ROOT, gallery.slug, 'photos');

    // List files on disk
    let diskFiles = [];
    try {
      const entries = await fs.readdir(photosDir, { withFileTypes: true });
      diskFiles = entries
        .filter(e => e.isFile() && /\.(jpg|jpeg|png|webp|gif|tiff?|heic|avif)$/i.test(e.name))
        .map(e => e.name);
    } catch {
      diskFiles = [];
    }

    const primaryPhotographerId = await getGalleryPrimaryPhotographer(gallery.id);

    // List files in DB
    const [dbRows] = await query('SELECT id, filename FROM photos WHERE gallery_id = ?', [gallery.id]);
    const dbSet = new Set(dbRows.map(r => r.filename));

    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const nowMs  = Date.now();
    let added   = 0;
    let purged  = 0;
    const corruptFiles  = [];
    const missingFiles  = [];

    // Remove DB entries whose source file is corrupt (undecodable by Sharp)
    for (const row of dbRows) {
      const fullPath = path.join(photosDir, row.filename);
      if (!existsSync(fullPath)) {
        missingFiles.push(row.filename);
        continue;
      }
      try {
        await runSharp({ op: 'metadata', srcPath: fullPath });
      } catch (sharpErr) {
        console.warn(`[reconcile] corrupt source — ${row.filename} (id=${row.id}): ${sharpErr.message}`);
        try { await fs.unlink(fullPath); } catch {}
        for (const size of Object.keys(THUMB_SIZES)) {
          try { await fs.unlink(thumbPath(row.id, size)); } catch {}
        }
        await query('DELETE FROM photos WHERE id = ?', [row.id]);
        corruptFiles.push(row.filename);
        purged++;
      }
    }

    // Re-read DB set after purge
    const [freshRows] = await query('SELECT filename FROM photos WHERE gallery_id = ?', [gallery.id]);
    const freshSet = new Set(freshRows.map(r => r.filename));

    // Insert disk files not yet in DB (skip corrupt ones just purged)
    // UUID-format filenames (e.g. "a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx.jpg") that are
    // absent from the DB are upload orphans — created when a dedup UNIQUE constraint
    // rejected the INSERT but multer had already written the file to disk.  Delete them
    // instead of re-importing; importing them would create visual duplicates.
    const UUID_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$/i;

    const corruptSet = new Set(corruptFiles);
    const alreadyPresent = freshRows.length;
    let orphansPurged = 0;
    for (const filename of diskFiles) {
      if (freshSet.has(filename) || corruptSet.has(filename)) continue;
      const fullPath = path.join(photosDir, filename);

      // UUID-named file not in DB → upload orphan, remove it
      if (UUID_FILENAME_RE.test(filename)) {
        console.log(`[reconcile] orphan UUID file — deleting ${filename}`);
        try { await fs.unlink(fullPath); } catch {}
        orphansPurged++;
        continue;
      }

      try {
        await runSharp({ op: 'metadata', srcPath: fullPath });
      } catch (sharpErr) {
        console.warn(`[reconcile/new] corrupt file — ${filename}: ${sharpErr.message}`);
        try { await fs.unlink(fullPath); } catch {}
        corruptFiles.push(filename);
        continue;
      }
      let sizeBytes = null;
      try { const stat = await fs.stat(fullPath); sizeBytes = stat.size; } catch {}
      const id = genId();
      await query(
        `INSERT IGNORE INTO photos (id, gallery_id, filename, size_bytes, sort_order, status, photographer_id, created_at)
         VALUES (?, ?, ?, ?, 0, 'validated', ?, ?)`,
        [id, gallery.id, filename, sizeBytes, primaryPhotographerId ?? null, nowStr]
      );
      added++;
    }

    if (added > 0 || purged > 0) {
      await query('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?', [nowMs, gallery.id]);
    }

    res.json({
      ok: true,
      added,
      purged: purged + orphansPurged,
      corruptFiles,
      missingFiles,
      alreadyPresent,
      total: diskFiles.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/photos/deduplicate — find / remove content-identical photos ──

router.post('/:id/photos/deduplicate', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.organizationId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const dryRun = req.query.dry_run === 'true' || req.body?.dry_run === true;
    const photosDir = path.join(SRC_ROOT, gallery.slug, 'photos');

    // Get all photos from DB
    const [dbRows] = await query(
      'SELECT id, filename FROM photos WHERE gallery_id = ? ORDER BY sort_order ASC, created_at ASC',
      [gallery.id]
    );

    // Compute SHA-256 for each file
    const hashMap = new Map(); // hash → [{ id, filename }]
    for (const row of dbRows) {
      const filePath = path.join(photosDir, row.filename);
      try {
        const buf  = await fs.readFile(filePath);
        const hash = createHash('sha256').update(buf).digest('hex');
        if (!hashMap.has(hash)) hashMap.set(hash, []);
        hashMap.get(hash).push(row);
      } catch {
        // File missing from disk — skip
      }
    }

    // Find duplicate sets (groups with >1 photo)
    const duplicateSets = [];
    for (const [hash, photos] of hashMap) {
      if (photos.length < 2) continue;
      // Keep the first (lowest sort_order), mark rest as duplicates
      const [keep, ...dupes] = photos;
      duplicateSets.push({ hash, keep, dupes });
    }

    if (dryRun || duplicateSets.length === 0) {
      return res.json({
        ok: true,
        dryRun: true,
        duplicateSets: duplicateSets.map(s => ({
          hash: s.hash,
          keep: s.keep.filename,
          dupes: s.dupes.map(d => d.filename),
        })),
        totalDuplicates: duplicateSets.reduce((n, s) => n + s.dupes.length, 0),
      });
    }

    // Delete duplicates
    let deleted = 0;
    for (const { dupes } of duplicateSets) {
      for (const dupe of dupes) {
        // Remove file from disk
        try { await fs.unlink(path.join(photosDir, dupe.filename)); } catch { /* ignore */ }
        // Remove from DB
        await query('DELETE FROM photos WHERE id = ?', [dupe.id]);
        deleted++;
      }
    }

    if (deleted > 0) {
      await query('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?', [Date.now(), gallery.id]);
    }

    res.json({
      ok: true,
      dryRun: false,
      deleted,
      duplicateSets: duplicateSets.map(s => ({
        hash: s.hash,
        kept: s.keep.filename,
        deleted: s.dupes.map(d => d.filename),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Returns true if a thumbnail file exists on disk and is non-empty.
function thumbOk(photoId, size) {
  const p = thumbPath(photoId, size);
  if (!existsSync(p)) return false;
  try { return statSync(p).size > 0; } catch { return false; }
}

// ── GET /:id/photos/reanalyze — count photos missing thumbnails or EXIF ───────

router.get('/:id/photos/reanalyze', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.organizationId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const photosDir = path.join(SRC_ROOT, gallery.slug, 'photos');
    const [photos] = await query(
      'SELECT id, filename, exif FROM photos WHERE gallery_id = ?',
      [gallery.id]
    );

    let missingThumbs = 0;
    let missingExif   = 0;

    for (const p of photos) {
      const anyMissing = Object.keys(THUMB_SIZES).some(size => !thumbOk(p.id, size));
      if (anyMissing) missingThumbs++;

      const hasExif = p.exif !== null && p.exif !== undefined;
      if (!hasExif) {
        const srcPath = path.join(photosDir, p.filename);
        if (existsSync(srcPath)) missingExif++;
      }
    }

    res.json({ total: photos.length, missingThumbs, missingExif });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/photos/reanalyze — regenerate missing thumbnails + EXIF ─────────

router.post('/:id/photos/reanalyze', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.organizationId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const photosDir = path.join(SRC_ROOT, gallery.slug, 'photos');
    const [photos] = await query(
      'SELECT id, filename, exif FROM photos WHERE gallery_id = ?',
      [gallery.id]
    );

    // force=true → delete and regenerate ALL thumbnails, even existing ones
    const force = req.body?.force === true || req.query.force === 'true';

    let thumbsGenerated = 0;
    let exifExtracted   = 0;
    let skipped         = 0;
    const errors        = [];
    const deleted       = [];

    for (const p of photos) {
      const srcPath   = path.join(photosDir, p.filename);
      const srcExists = existsSync(srcPath);
      if (!srcExists) { skipped++; continue; }

      // Validate in an isolated child process — SIGBUS kills the child, not the API.
      try {
        await runSharp({ op: 'metadata', srcPath });
      } catch (sharpErr) {
        console.warn(`[reanalyze] corrupt source — ${p.filename} (id=${p.id}): ${sharpErr.message}`);
        try { await fs.unlink(srcPath); } catch {}
        for (const size of Object.keys(THUMB_SIZES)) {
          try { await fs.unlink(thumbPath(p.id, size)); } catch {}
        }
        await query('DELETE FROM photos WHERE id = ?', [p.id]);
        deleted.push(p.filename);
        continue;
      }

      // Check each thumbnail size individually.
      // A thumbnail is considered missing if the file doesn't exist OR is 0 bytes.
      // When force=true, delete existing thumbnails first so they are always regenerated.
      for (const size of Object.keys(THUMB_SIZES)) {
        if (!force && thumbOk(p.id, size)) continue;
        if (force) { try { await fs.unlink(thumbPath(p.id, size)); } catch {} }
        try {
          await generateSingleThumbnail(srcPath, p.id, size);
          thumbsGenerated++;
        } catch (err) {
          errors.push(`thumb:${size}:${p.filename}: ${err.message}`);
        }
      }

      const hasExif = p.exif !== null && p.exif !== undefined;
      if (!hasExif || force) {
        try {
          const exif = await extractExif(srcPath);
          if (exif && Object.keys(exif).length > 0) {
            await query('UPDATE photos SET exif = ? WHERE id = ?', [JSON.stringify(exif), p.id]);
            exifExtracted++;
          }
        } catch (err) {
          errors.push(`exif:${p.filename}: ${err.message}`);
        }
      }
    }

    if (deleted.length > 0) {
      await query('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?', [Date.now(), gallery.id]);
    }

    res.json({ ok: true, total: photos.length, thumbsGenerated, exifExtracted, skipped, deleted, errors });
  } catch (err) {
    next(err);
  }
});

export default router;
