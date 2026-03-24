// apps/api/src/routes/galleries.js — Gallery CRUD
import { Router } from 'express';
import { getDb }  from '../db/database.js';
import { genId }  from '../db/helpers.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToGallery(row) {
  if (!row) return null;
  return {
    id:                   row.id,
    studioId:             row.studio_id,
    slug:                 row.slug,
    title:                row.title,
    subtitle:             row.subtitle,
    author:               row.author,
    authorEmail:          row.author_email,
    date:                 row.date,
    location:             row.location,
    locale:               row.locale,
    access:               row.access,
    private:              !!row.private,
    standalone:           !!row.standalone,
    allowDownloadImage:   !!row.allow_download_image,
    allowDownloadGallery: !!row.allow_download_gallery,
    coverPhoto:           row.cover_photo,
    slideshowInterval:    row.slideshow_interval,
    copyright:            row.copyright,
    buildStatus:          row.build_status,
    builtAt:              row.built_at,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/galleries
router.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM galleries WHERE studio_id = ? ORDER BY created_at DESC')
    .all(req.studioId);
  res.json(rows.map(rowToGallery));
});

// GET /api/galleries/:id
router.get('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  res.json(rowToGallery(row));
});

// POST /api/galleries
router.post('/', (req, res) => {
  const {
    slug, title, subtitle, author, authorEmail, date, location,
    locale = 'fr', access = 'public', password, private: priv = false,
    standalone = false, allowDownloadImage = true, allowDownloadGallery = true,
    coverPhoto, slideshowInterval, copyright,
  } = req.body || {};

  if (!slug) return res.status(400).json({ error: 'slug is required' });

  // Check uniqueness within studio
  const existing = getDb()
    .prepare('SELECT id FROM galleries WHERE studio_id = ? AND slug = ?')
    .get(req.studioId, slug);
  if (existing) return res.status(409).json({ error: 'A gallery with this slug already exists' });

  const id  = genId();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO galleries
      (id, studio_id, slug, title, subtitle, author, author_email, date, location,
       locale, access, password, private, standalone,
       allow_download_image, allow_download_gallery, cover_photo,
       slideshow_interval, copyright, build_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id, req.studioId, slug, title ?? slug, subtitle ?? null, author ?? null,
    authorEmail ?? null, date ?? null, location ?? null,
    locale, access, password ?? null, priv ? 1 : 0, standalone ? 1 : 0,
    allowDownloadImage ? 1 : 0, allowDownloadGallery ? 1 : 0,
    coverPhoto ?? null, slideshowInterval ?? null, copyright ?? null,
    now, now
  );

  const row = getDb().prepare('SELECT * FROM galleries WHERE id = ?').get(id);
  res.status(201).json(rowToGallery(row));
});

// PATCH /api/galleries/:id
router.patch('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const allowed = [
    'title','subtitle','author','author_email','date','location',
    'locale','access','password','private','standalone',
    'allow_download_image','allow_download_gallery','cover_photo',
    'slideshow_interval','copyright',
  ];

  // Map camelCase body keys to snake_case DB columns
  const camelToSnake = {
    authorEmail: 'author_email', allowDownloadImage: 'allow_download_image',
    allowDownloadGallery: 'allow_download_gallery', coverPhoto: 'cover_photo',
    slideshowInterval: 'slideshow_interval',
  };

  const updates = {};
  for (const [key, val] of Object.entries(req.body || {})) {
    const col = camelToSnake[key] || key;
    if (allowed.includes(col)) updates[col] = val;
  }

  if (!Object.keys(updates).length) return res.json(rowToGallery(row));

  updates.updated_at = Date.now();
  const sets = Object.keys(updates).map(c => `${c} = ?`).join(', ');
  const vals = [...Object.values(updates), req.params.id];
  getDb().prepare(`UPDATE galleries SET ${sets} WHERE id = ?`).run(...vals);

  const updated = getDb().prepare('SELECT * FROM galleries WHERE id = ?').get(req.params.id);
  res.json(rowToGallery(updated));
});

// DELETE /api/galleries/:id
router.delete('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  getDb().prepare('DELETE FROM galleries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
