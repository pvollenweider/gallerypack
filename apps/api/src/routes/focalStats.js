// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/focalStats.js — GET /api/galleries/:id/focal-stats
import { Router } from 'express';
import { query }  from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import { getGalleryRole } from '../db/helpers.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';
import { FOCAL_BINS, binFocalLength, parseFocal35 } from '../../../../packages/shared/src/focalBins.js';
import { photoThumbnails } from '../services/thumbnailService.js';
import { generateFocalInsight, generateWideTeleInsight } from '../services/autoInsights.js';

const fileStorage = createStorage();

const router = Router();
router.use(requireAuth);

router.get('/:id/focal-stats', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await query(
      `SELECT g.*, p.slug AS proj_slug
       FROM galleries g
       LEFT JOIN projects p ON p.id = g.project_id
       WHERE g.id = ? AND g.studio_id = ? LIMIT 1`,
      [id, req.studioId]
    );
    const gallery = rows[0];
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

    const galleryRole = await getGalleryRole(req.userId, gallery.id);
    if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Build the correct dist path (project-scoped galleries live at dist/<proj>/<slug>/)
    const distSlug = gallery.proj_slug
      ? `${gallery.proj_slug}/${gallery.slug}`
      : gallery.slug;

    // Read the built manifest (dist/<distSlug>/photos.json)
    let manifest;
    try {
      const buf = await fileStorage.read(`public/${distSlug}/photos.json`);
      manifest = JSON.parse(buf.toString('utf8'));
    } catch {
      return res.json({ total: 0, withData: 0, bins: [], dominant: null });
    }

    const photoEntries = Object.entries(manifest.photos || {});
    const total = photoEntries.length;

    // Build filename → id map from DB for thumbnail URLs
    const [dbPhotos] = await query('SELECT id, filename FROM photos WHERE gallery_id = ?', [gallery.id]);
    const idByFilename = Object.fromEntries(dbPhotos.map(r => [r.filename, r.id]));

    // Collect raw focal data per photo — client handles all binning
    const rawPhotos = [];
    for (const [filename, photo] of photoEntries) {
      const mm = parseFocal35(photo.exif?.focal35);
      if (mm !== null) {
        const photoId = idByFilename[filename] ?? null;
        rawPhotos.push({
          filename,
          mm,
          lens:      photo.exif?.lens ?? null,
          id:        photoId,
          thumbnail: photoId ? photoThumbnails(photoId) : { sm: null, md: null },
        });
      }
    }
    const withData = rawPhotos.length;

    // Also compute dominant bin server-side (using default bins) for the KPI card
    const counts = Object.fromEntries(FOCAL_BINS.map(b => [b.key, 0]));
    for (const { mm } of rawPhotos) {
      const key = binFocalLength(mm);
      if (key) counts[key]++;
    }
    const dominant = FOCAL_BINS
      .map(b => ({ key: b.key, count: counts[b.key] }))
      .filter(b => b.count > 0)
      .sort((a, b) => b.count - a.count)[0]?.key ?? null;

    // Build a bins summary for auto-insights (server-side, using FOCAL_BINS)
    const focalBinCounts = FOCAL_BINS.map(b => ({
      key:   b.key,
      label: b.label,
      midMm: b.max === Infinity ? b.min + 50 : (b.min + b.max) / 2,
      count: counts[b.key],
    })).filter(b => b.count > 0);

    const insights = {
      focal:    generateFocalInsight({ withData, bins: focalBinCounts }),
      wideTele: generateWideTeleInsight({ withData, photos: rawPhotos }),
    };

    res.json({ total, withData, photos: rawPhotos, dominant, insights });
  } catch (err) {
    next(err);
  }
});

export default router;
