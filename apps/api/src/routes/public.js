// apps/api/src/routes/public.js — public-facing gallery listing (no auth required)
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { getDb } from '../db/database.js';
import { ROOT }  from '../../../../packages/engine/src/fs.js';

const router = Router();

export function getPublicGalleries() {
  const rows = getDb()
    .prepare(`SELECT slug, title, subtitle, date, location, access, build_status, cover_photo
              FROM galleries
              WHERE access != 'private'
              ORDER BY date DESC, created_at DESC`)
    .all();
  return rows.map(row => ({
    slug:      row.slug,
    title:     row.title || row.slug,
    subtitle:  row.subtitle || null,
    date:      row.date || null,
    location:  row.location || null,
    access:    row.access,
    built:     row.build_status === 'done',
    coverName: row.build_status === 'done' ? getCoverName(row) : null,
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
