// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/insights.js — GET /api/galleries/:id/insights
//
// Unified EXIF analytics endpoint covering:
//   focal · lens · aperture · shutter · ISO
// plus auto-generated text insights (from autoInsights.js)

import { Router }  from 'express';
import { query }   from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { can }     from '../authorization/index.js';
import { getGalleryRole } from '../db/helpers.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';
import { photoThumbnails } from '../services/thumbnailService.js';
import { computeInsights } from '../services/photoInsights.js';

const fileStorage = createStorage();
const router = Router();
router.use(requireAuth);

router.get('/:id/insights', async (req, res, next) => {
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

    // Read the built manifest (dist/<distSlug>/photos.json)
    const distSlug = gallery.proj_slug
      ? `${gallery.proj_slug}/${gallery.slug}`
      : gallery.slug;

    let manifest;
    try {
      const buf = await fileStorage.read(`public/${distSlug}/photos.json`);
      manifest = JSON.parse(buf.toString('utf8'));
    } catch {
      return res.json({
        focal:    { total: 0, withData: 0, photos: [], bins: [], dominant: null },
        lens:     { total: 0, withData: 0, items: [] },
        aperture: { total: 0, withData: 0, items: [] },
        shutter:  { total: 0, withData: 0, items: [] },
        iso:      { total: 0, withData: 0, items: [] },
        insights: {},
      });
    }

    // Build photo array with DB IDs for thumbnail URLs
    const [dbPhotos] = await query('SELECT id, filename FROM photos WHERE gallery_id = ?', [gallery.id]);
    const idByFilename = Object.fromEntries(dbPhotos.map(r => [r.filename, r.id]));

    const photos = Object.entries(manifest.photos || {}).map(([filename, photo]) => {
      const photoId = idByFilename[filename] ?? null;
      return {
        filename,
        exif:      photo.exif ?? {},
        id:        photoId,
        thumbnail: photoId ? photoThumbnails(photoId) : { sm: null, md: null },
      };
    });

    res.json(computeInsights(photos));
  } catch (err) {
    next(err);
  }
});

export default router;
