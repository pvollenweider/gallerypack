// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/public.js — public-facing gallery listing (no auth required)
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { query } from '../db/database.js';
import { SRC_ROOT }  from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';

const fileStorage = createStorage();

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

export async function getPublicDateRange(distSlug) {
  try {
    const buf = await fileStorage.read(`public/${distSlug}/photos.json`);
    const manifest = JSON.parse(buf.toString('utf8'));
    const dates = Object.values(manifest.photos || {})
      .map(p => p.exif?.date).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
    if (!dates.length) return null;
    return { from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) };
  } catch { return null; }
}

export function getPublicPhotoCount(srcSlug) {
  try {
    const dir = path.join(SRC_ROOT, srcSlug, 'photos');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => IMG_EXTS.has(path.extname(f).toLowerCase())).length;
  } catch { return 0; }
}

const router = Router();

export async function getPublicGalleries() {
  const [rows] = await query(
    `SELECT slug, title, subtitle, description, date, location, access, build_status, cover_photo
     FROM galleries
     WHERE access = 'public'
     ORDER BY date DESC, created_at DESC`
  );
  return Promise.all(rows.map(async row => ({
    slug:        row.slug,
    title:       row.title || row.slug,
    subtitle:    row.subtitle || null,
    description: row.description || null,
    date:        row.date || null,
    location:    row.location || null,
    access:      row.access,
    built:       row.build_status === 'done',
    coverName:   row.build_status === 'done' ? await getCoverName(row) : null,
    photoCount:  getPublicPhotoCount(row.slug),
    dateRange:   row.build_status === 'done' ? await getPublicDateRange(row.slug) : null,
  })));
}

// GET /api/public/galleries — list non-private galleries for the public landing page
router.get('/galleries', async (req, res) => {
  res.json(await getPublicGalleries());
});

export async function getCoverName(row, distSlug) {
  const slug = distSlug || row.slug;
  try {
    const buf = await fileStorage.read(`public/${slug}/photos.json`);
    const manifest = JSON.parse(buf.toString('utf8'));
    const photos = manifest.photos || {};
    if (row.cover_photo && photos[row.cover_photo]) return photos[row.cover_photo].name;
    const first = Object.values(photos)[0];
    return first?.name || null;
  } catch { return null; }
}

export default router;
