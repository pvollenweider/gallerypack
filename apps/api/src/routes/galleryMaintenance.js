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
import path              from 'node:path';
import { query }         from '../db/database.js';
import { requireAuth }   from '../middleware/auth.js';
import { can }           from '../authorization/index.js';
import { getGalleryRole, genId } from '../db/helpers.js';
import { DIST_ROOT, SRC_ROOT } from '../../../../packages/engine/src/fs.js';

const router = Router();
router.use(requireAuth);

// ── Shared helper: load gallery with project slug ──────────────────────────

async function loadGallery(id, studioId) {
  const [rows] = await query(
    `SELECT g.*, p.slug AS proj_slug
     FROM galleries g
     LEFT JOIN projects p ON p.id = g.project_id
     WHERE g.id = ? AND g.studio_id = ? LIMIT 1`,
    [id, studioId]
  );
  return rows[0] ?? null;
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
    const gallery = await loadGallery(req.params.id, req.studioId);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
    if (!await requireOwner(req, res, gallery)) return;

    const slug = distSlug(gallery);
    const distPath = path.join(DIST_ROOT, slug);

    // Remove the built output directory (safe even if it doesn't exist)
    await fs.rm(distPath, { recursive: true, force: true });

    // Reset gallery build state
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await query(
      `UPDATE galleries
       SET build_status = 'pending', workflow_status = 'draft',
           build_date = NULL, last_job_id = NULL, needs_rebuild = 0,
           updated_at = ?
       WHERE id = ?`,
      [now, gallery.id]
    );

    res.json({ ok: true, message: 'Built output flushed. Gallery is now in draft.' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:id/dist/originals — strip originals when downloads disabled ──

router.delete('/:id/dist/originals', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.studioId);
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
    const gallery = await loadGallery(req.params.id, req.studioId);
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

    // List files in DB
    const [dbRows] = await query('SELECT filename FROM photos WHERE gallery_id = ?', [gallery.id]);
    const dbSet = new Set(dbRows.map(r => r.filename));

    // Insert missing
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let added = 0;
    const alreadyPresent = dbRows.length;

    for (const filename of diskFiles) {
      if (dbSet.has(filename)) continue;
      const fullPath = path.join(photosDir, filename);
      let sizeBytes = null;
      try {
        const stat = await fs.stat(fullPath);
        sizeBytes = stat.size;
      } catch { /* ignore */ }

      const id = genId();
      await query(
        `INSERT IGNORE INTO photos (id, gallery_id, filename, size_bytes, sort_order, status, created_at)
         VALUES (?, ?, ?, ?, 0, 'validated', ?)`,
        [id, gallery.id, filename, sizeBytes, now]
      );
      added++;
    }

    // Flag for rebuild if anything changed
    if (added > 0) {
      await query('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?', [now, gallery.id]);
    }

    res.json({
      ok: true,
      added,
      alreadyPresent,
      skipped: 0,
      total: diskFiles.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/photos/deduplicate — find / remove content-identical photos ──

router.post('/:id/photos/deduplicate', async (req, res, next) => {
  try {
    const gallery = await loadGallery(req.params.id, req.studioId);
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
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
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
      await query('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?', [now, gallery.id]);
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

export default router;
