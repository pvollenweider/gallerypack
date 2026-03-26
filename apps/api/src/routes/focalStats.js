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

const fileStorage = createStorage();

const router = Router();
router.use(requireAuth);

router.get('/:id/focal-stats', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await query(
      'SELECT * FROM galleries WHERE id = ? AND studio_id = ? LIMIT 1',
      [id, req.studioId]
    );
    const gallery = rows[0];
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

    const galleryRole = await getGalleryRole(req.userId, gallery.id);
    if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Read the built manifest (dist/<slug>/photos.json)
    let manifest;
    try {
      const buf = await fileStorage.read(`dist/${gallery.slug}/photos.json`);
      manifest = JSON.parse(buf.toString('utf8'));
    } catch {
      return res.json({ total: 0, withData: 0, bins: [], dominant: null });
    }

    const photos = Object.values(manifest.photos || {});
    const total  = photos.length;

    // Bin every photo that has focal35 data
    const counts = Object.fromEntries(FOCAL_BINS.map(b => [b.key, 0]));
    let withData = 0;

    for (const photo of photos) {
      const mm = parseFocal35(photo.exif?.focal35);
      if (mm === null) continue;
      const key = binFocalLength(mm);
      if (key) { counts[key]++; withData++; }
    }

    // Build sorted bins (descending count), skip empty ones
    const bins = FOCAL_BINS
      .map(b => ({ key: b.key, label: b.label, count: counts[b.key] }))
      .filter(b => b.count > 0)
      .sort((a, b) => b.count - a.count);

    const dominant = bins[0]?.key ?? null;

    res.json({ total, withData, bins, dominant });
  } catch (err) {
    next(err);
  }
});

export default router;
