// apps/api/src/routes/public.js — public-facing gallery listing (no auth required)
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { getDb } from '../db/database.js';
import { ROOT }  from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';

const fileStorage = createStorage();

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

async function getPublicDateRange(slug) {
  try {
    const buf = await fileStorage.read(`dist/${slug}/photos.json`);
    const manifest = JSON.parse(buf.toString('utf8'));
    const dates = Object.values(manifest.photos || {})
      .map(p => p.exif?.date).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
    if (!dates.length) return null;
    return { from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) };
  } catch { return null; }
}

function getPublicPhotoCount(slug) {
  try {
    const dir = path.join(ROOT, 'src', slug, 'photos');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => IMG_EXTS.has(path.extname(f).toLowerCase())).length;
  } catch { return 0; }
}

const router = Router();

export async function getPublicGalleries() {
  const rows = getDb()
    .prepare(`SELECT slug, title, subtitle, description, date, location, access, build_status, cover_photo
              FROM galleries
              WHERE access = 'public'
              ORDER BY date DESC, created_at DESC`)
    .all();
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

async function getCoverName(row) {
  try {
    const buf = await fileStorage.read(`dist/${row.slug}/photos.json`);
    const manifest = JSON.parse(buf.toString('utf8'));
    const photos = manifest.photos || {};
    if (row.cover_photo && photos[row.cover_photo]) return photos[row.cover_photo].name;
    const first = Object.values(photos)[0];
    return first?.name || null;
  } catch { return null; }
}

export default router;
