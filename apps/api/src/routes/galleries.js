// apps/api/src/routes/galleries.js — Gallery CRUD
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { getDb }  from '../db/database.js';
import { genId, hashPassword, getSettings, listGalleryMembers, upsertGalleryMembership, removeGalleryMembership, GALLERY_ROLE_HIERARCHY, getUserById, getGalleryRole, createViewerTokenDb, listViewerTokens, deleteViewerToken, audit } from '../db/helpers.js';
import { requireAdmin, requireStudioRole, requireAuth } from '../middleware/auth.js';
import { sendPhotosReadyEmail } from '../services/email.js';
import { can } from '../authorization/index.js';
import { ROOT } from '../../../../packages/engine/src/fs.js';

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

function getFirstPhoto(slug) {
  try {
    const dir = path.join(ROOT, 'src', slug, 'photos');
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(f => IMG_EXTS.has(path.extname(f).toLowerCase())).sort();
    return files[0] || null;
  } catch { return null; }
}

function getNeedsRebuild(row) {
  if (!row.built_at) return false;
  try {
    const dir = path.join(ROOT, 'src', row.slug, 'photos');
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir)
      .filter(f => IMG_EXTS.has(path.extname(f).toLowerCase()))
      .some(f => fs.statSync(path.join(dir, f)).mtimeMs > row.built_at);
  } catch { return false; }
}

function getPhotoCount(slug) {
  try {
    const dir = path.join(ROOT, 'src', slug, 'photos');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter(f => IMG_EXTS.has(path.extname(f).toLowerCase())).length;
  } catch { return 0; }
}

function getDiskSize(slug) {
  let total = 0;
  function walk(dir) {
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else try { total += fs.statSync(p).size; } catch {}
      }
    } catch {}
  }
  walk(path.join(ROOT, 'src', slug));
  walk(path.join(ROOT, 'dist', slug));
  return total;
}

function getDateRange(slug) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', slug, 'photos.json'), 'utf8'));
    const dates = Object.values(manifest.photos || {})
      .map(p => p.exif?.date).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
    if (!dates.length) return null;
    return { from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) };
  } catch { return null; }
}

const router = Router();
router.use(requireAuth);

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
    description:          row.description,
    firstPhoto:           row.cover_photo || getFirstPhoto(row.slug),
    dateRange:            row.build_status === 'done' ? getDateRange(row.slug) : null,
    needsRebuild:         row.needs_rebuild === 1 || getNeedsRebuild(row),
    photoCount:           getPhotoCount(row.slug),
    diskSize:             getDiskSize(row.slug),
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
  const galleryRole = getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'read', 'gallery', { gallery: row, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(rowToGallery(row));
});

// POST /api/galleries
router.post('/', (req, res) => {
  if (!can(req.user, 'publish', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const st = getSettings(req.studioId) || {};
  const defLocale  = st.default_locale                || 'fr';
  const defAccess  = st.default_access                || 'public';
  const defDlImg   = st.default_allow_download_image  !== 0;
  const defDlGal   = st.default_allow_download_gallery === 1;
  const defPrivate = st.default_private               === 1;

  const {
    slug, title, description, subtitle,
    author      = st.default_author       || null,
    authorEmail = st.default_author_email || null,
    date, location,
    locale = defLocale, access = defAccess, password, private: priv = defPrivate,
    standalone = false, allowDownloadImage = defDlImg, allowDownloadGallery = defDlGal,
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
      (id, studio_id, slug, title, description, subtitle, author, author_email, date, location,
       locale, access, password, private, standalone,
       allow_download_image, allow_download_gallery, cover_photo,
       slideshow_interval, copyright, build_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id, req.studioId, slug, title ?? slug, description ?? null, subtitle ?? null, author ?? null,
    authorEmail ?? null, date ?? null, location ?? null,
    locale, access, password ?? null, priv ? 1 : 0, standalone ? 1 : 0,
    allowDownloadImage ? 1 : 0, allowDownloadGallery ? 1 : 0,
    coverPhoto ?? null, slideshowInterval ?? null, copyright ?? null,
    now, now
  );

  const row = getDb().prepare('SELECT * FROM galleries WHERE id = ?').get(id);
  try { audit(req.studioId, req.userId, 'gallery.create', 'gallery', id, { slug }); } catch {}
  res.status(201).json(rowToGallery(row));
});

// PATCH /api/galleries/:id
router.patch('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  const galleryRole = getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const allowed = [
    'title','description','subtitle','author','author_email','date','location',
    'locale','access','password','password_hash','private','standalone',
    'allow_download_image','allow_download_gallery','cover_photo',
    'slideshow_interval','copyright',
  ];

  // Map camelCase body keys to snake_case DB columns
  const camelToSnake = {
    authorEmail: 'author_email', allowDownloadImage: 'allow_download_image',
    allowDownloadGallery: 'allow_download_gallery', coverPhoto: 'cover_photo',
    slideshowInterval: 'slideshow_interval',
  };

  // Columns that must be stored as INTEGER 0/1 in SQLite
  const boolCols = new Set(['private','standalone','allow_download_image','allow_download_gallery']);

  const updates = {};
  for (const [key, val] of Object.entries(req.body || {})) {
    const col = camelToSnake[key] || key;
    if (!allowed.includes(col)) continue;
    // Convert JS booleans → SQLite integers; leave everything else as-is
    updates[col] = boolCols.has(col) ? (val ? 1 : 0) : val;
  }

  // Hash password when provided (for password-protected galleries)
  if (updates.password) {
    updates.password_hash = hashPassword(updates.password);
    delete updates.password; // don't store plain text
  }

  // Sync private column when access is updated (access is canonical; private kept for compat)
  if (updates.access !== undefined) {
    updates.private = updates.access === 'public' ? 0 : 1;
  }

  if (!Object.keys(updates).length) return res.json(rowToGallery(row));

  updates.updated_at = Date.now();
  updates.needs_rebuild = 1;
  const sets = Object.keys(updates).map(c => `${c} = ?`).join(', ');
  const vals = [...Object.values(updates), req.params.id];
  getDb().prepare(`UPDATE galleries SET ${sets} WHERE id = ?`).run(...vals);

  const updated = getDb().prepare('SELECT * FROM galleries WHERE id = ?').get(req.params.id);
  res.json(rowToGallery(updated));
});

// POST /api/galleries/:id/rename — rename slug (renames folder on disk)
router.post('/:id/rename', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  const galleryRole = getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { slug } = req.body || {};
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });
  }
  const conflict = getDb()
    .prepare('SELECT id FROM galleries WHERE studio_id = ? AND slug = ? AND id != ?')
    .get(req.studioId, slug, req.params.id);
  if (conflict) return res.status(409).json({ error: 'A gallery with this slug already exists' });

  // Rename directories on disk
  for (const base of ['src', 'dist']) {
    const oldDir = path.join(ROOT, base, row.slug);
    const newDir = path.join(ROOT, base, slug);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      fs.renameSync(oldDir, newDir);
    }
  }

  getDb().prepare('UPDATE galleries SET slug = ?, updated_at = ? WHERE id = ?')
    .run(slug, Date.now(), req.params.id);

  const updated = getDb().prepare('SELECT * FROM galleries WHERE id = ?').get(req.params.id);
  res.json(rowToGallery(updated));
});

// DELETE /api/galleries/:id — removes from DB only, keeps built files on disk
router.delete('/:id', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  if (!can(req.user, 'delete', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  getDb().prepare('DELETE FROM galleries WHERE id = ?').run(req.params.id);
  try { audit(req.studioId, req.userId, 'gallery.delete', 'gallery', req.params.id, { slug: row.slug }); } catch {}
  res.json({ ok: true });
});

// ── Gallery membership routes ─────────────────────────────────────────────────

// GET /api/galleries/:id/members — list gallery members (requires admin+ studio role)
router.get('/:id/members', requireStudioRole('admin'), (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const members = listGalleryMembers(req.params.id);
  res.json(members);
});

// PUT /api/galleries/:id/members/:userId — grant/update membership (requires admin+ studio role)
router.put('/:id/members/:userId', requireStudioRole('admin'), (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const { role } = req.body || {};
  if (!role || !GALLERY_ROLE_HIERARCHY.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${GALLERY_ROLE_HIERARCHY.join(', ')}` });
  }

  const targetUser = getUserById(req.params.userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const membership = upsertGalleryMembership(req.params.id, req.params.userId, role);
  res.json(membership);
});

// DELETE /api/galleries/:id/members/:userId — remove membership (requires admin+ studio role)
router.delete('/:id/members/:userId', requireStudioRole('admin'), (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  removeGalleryMembership(req.params.id, req.params.userId);
  res.json({ ok: true });
});

// ── Viewer token routes ───────────────────────────────────────────────────────

// POST /api/galleries/:id/viewer-tokens — create a viewer token
router.post('/:id/viewer-tokens', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { label = null, expiresAt = null } = req.body || {};
  const token = createViewerTokenDb(row.id, req.userId, { label, expiresAt });
  res.status(201).json(token);
});

// GET /api/galleries/:id/viewer-tokens — list viewer tokens for a gallery
router.get('/:id/viewer-tokens', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const tokens = listViewerTokens(row.id);
  res.json(tokens);
});

// DELETE /api/galleries/:id/viewer-tokens/:tokenId — revoke a viewer token
router.delete('/:id/viewer-tokens/:tokenId', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  deleteViewerToken(req.params.tokenId);
  res.json({ ok: true });
});

// POST /api/galleries/:id/notify-ready — photographer signals photos are ready
router.post('/:id/notify-ready', requireAuth, (req, res) => {
  const gallery = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  // Verify the caller has contributor+ access (must be a gallery member)
  const galleryRole = getGalleryRole(req.userId, gallery.id);
  if (!galleryRole) return res.status(403).json({ error: 'Forbidden' });

  // Find all admins + owners of the studio to notify
  const recipients = getDb()
    .prepare(`SELECT u.email, u.name FROM studio_memberships sm JOIN users u ON u.id = sm.user_id WHERE sm.studio_id = ? AND sm.role IN ('admin','owner')`)
    .all(req.studioId);

  const sender = getUserById(req.userId);
  const base = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const galleryAdminUrl = `${base}/admin/galleries/${gallery.id}`;

  for (const r of recipients) {
    sendPhotosReadyEmail({
      studioId: req.studioId,
      to: r.email,
      photographerName: sender.name || sender.email,
      galleryTitle: gallery.title || gallery.slug,
      galleryAdminUrl,
    });
  }

  res.json({ ok: true, notified: recipients.length });
});

export default router;
