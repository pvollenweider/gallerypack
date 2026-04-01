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
       WHERE g.id = ? AND g.organization_id = ? LIMIT 1`,
      [id, req.organizationId]
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

    let photos;
    try {
      const buf = await fileStorage.read(`public/${distSlug}/photos.json`);
      const manifest = JSON.parse(buf.toString('utf8'));
      const [dbPhotos] = await query(
        `SELECT p.id, p.filename, pg.name AS photographer_name
         FROM photos p
         LEFT JOIN photographers pg ON pg.id = p.photographer_id
         WHERE p.gallery_id = ?`,
        [gallery.id]
      );
      const infoByFilename = Object.fromEntries(dbPhotos.map(r => [r.filename, r]));
      photos = Object.entries(manifest.photos || {}).map(([filename, photo]) => {
        const info    = infoByFilename[filename] ?? null;
        const photoId = info?.id ?? null;
        return {
          filename,
          exif:         photo.exif ?? {},
          id:           photoId,
          thumbnail:    photoId ? photoThumbnails(photoId) : { sm: null, md: null },
          photographer: info?.photographer_name ?? null,
        };
      });
    } catch {
      // No built manifest — fall back to EXIF stored in DB at upload time
      const [dbPhotos] = await query(
        `SELECT p.id, p.filename, p.exif, pg.name AS photographer_name
         FROM photos p
         LEFT JOIN photographers pg ON pg.id = p.photographer_id
         WHERE p.gallery_id = ? AND p.status != 'uploaded'`,
        [gallery.id]
      );
      if (!dbPhotos.length) {
        return res.json({
          focal:    { total: 0, withData: 0, photos: [], bins: [], dominant: null },
          lens:     { total: 0, withData: 0, items: [] },
          aperture: { total: 0, withData: 0, items: [] },
          shutter:  { total: 0, withData: 0, items: [] },
          iso:      { total: 0, withData: 0, items: [] },
          insights: {},
        });
      }
      photos = dbPhotos.map(p => {
        const exif = p.exif ? (typeof p.exif === 'string' ? JSON.parse(p.exif) : p.exif) : {};
        return {
          filename:     p.filename,
          exif,
          id:           p.id,
          thumbnail:    photoThumbnails(p.id),
          photographer: p.photographer_name ?? null,
        };
      });
    }

    res.json(computeInsights(photos));
  } catch (err) {
    next(err);
  }
});

export default router;
