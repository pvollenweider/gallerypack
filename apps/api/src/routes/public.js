// apps/api/src/routes/public.js — public-facing gallery listing (no auth required)
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { getDb } from '../db/database.js';
import { ROOT }  from '../../../../packages/engine/src/fs.js';

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

function getPublicDateRange(slug) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', slug, 'photos.json'), 'utf8'));
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

export function getPublicGalleries() {
  const rows = getDb()
    .prepare(`SELECT slug, title, subtitle, description, date, location, access, build_status, cover_photo
              FROM galleries
              WHERE access = 'public'
              ORDER BY date DESC, created_at DESC`)
    .all();
  return rows.map(row => ({
    slug:        row.slug,
    title:       row.title || row.slug,
    subtitle:    row.subtitle || null,
    description: row.description || null,
    date:        row.date || null,
    location:    row.location || null,
    access:      row.access,
    built:       row.build_status === 'done',
    coverName:   row.build_status === 'done' ? getCoverName(row) : null,
    photoCount:  getPublicPhotoCount(row.slug),
    dateRange:   row.build_status === 'done' ? getPublicDateRange(row.slug) : null,
  }));
}

// GET /api/public/galleries — list non-private galleries for the public landing page
router.get('/galleries', (req, res) => {
  res.json(getPublicGalleries());
});

function getCoverName(row) {
  try {
    const manifestPath = path.join(ROOT, 'dist', row.slug, 'photos.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const photos = manifest.photos || {};
    if (row.cover_photo && photos[row.cover_photo]) return photos[row.cover_photo].name;
    const first = Object.values(photos)[0];
    return first?.name || null;
  } catch { return null; }
}

export default router;
