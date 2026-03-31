// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/galleries.js — Gallery CRUD
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { marked } from 'marked';
import { query }  from '../db/database.js';
import { genId, hashPassword, getSettings, getProject,
  listGalleryRoleAssignments, upsertGalleryRoleAssignment, removeGalleryRoleAssignment, GALLERY_ROLE_HIERARCHY_V2,
  getUserById, getGalleryRole, createViewerTokenDb, listViewerTokens, deleteViewerToken, audit } from '../db/helpers.js';
import { requireAdmin, requireStudioRole, requireAuth } from '../middleware/auth.js';
import { sendPhotosReadyEmail } from '../services/email.js';
import { can } from '../authorization/index.js';
import { SRC_ROOT, DIST_ROOT, INTERNAL_ROOT } from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';
import { photoThumbnails } from '../services/thumbnailService.js';

const fileStorage = createStorage();

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

function getFirstPhoto(slug) {
  try {
    const dir = path.join(SRC_ROOT, slug, 'photos');
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(f => IMG_EXTS.has(path.extname(f).toLowerCase())).sort();
    return files[0] || null;
  } catch { return null; }
}

function getNeedsRebuild(row) {
  if (!row.built_at) return false;
  try {
    const dir = path.join(SRC_ROOT, row.slug, 'photos');
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir)
      .filter(f => IMG_EXTS.has(path.extname(f).toLowerCase()))
      .some(f => fs.statSync(path.join(dir, f)).mtimeMs > row.built_at);
  } catch { return false; }
}

function getPhotoCount(slug) {
  try {
    const dir = path.join(SRC_ROOT, slug, 'photos');
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
  walk(path.join(SRC_ROOT, slug));
  walk(path.join(DIST_ROOT, slug));
  return total;
}

async function getDateRange(slug) {
  try {
    const buf = await fileStorage.read(`public/${slug}/photos.json`);
    const manifest = JSON.parse(buf.toString('utf8'));
    const dates = Object.values(manifest.photos || {})
      .map(p => p.exif?.date).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
    if (!dates.length) return null;
    return { from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) };
  } catch { return null; }
}

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToGallery(row, { dateRange = null } = {}) {
  if (!row) return null;
  return {
    id:                   row.id,
    organizationId:       row.organization_id ?? row.studio_id,  // canonical (Sprint 22)
    studioId:             row.studio_id,                          // legacy alias
    projectId:            row.project_id ?? null,
    slug:                 row.slug,
    title:                row.title,
    subtitle:             row.subtitle,
    author:               row.author,
    authorEmail:          row.author_email,
    date:                 row.date,
    location:             row.location,
    locale:               row.locale,
    access:               row.access,
    private:              row.access !== 'public',
    standalone:           !!row.standalone,
    downloadMode:          row.download_mode || 'display',
    apacheProtection:      !!row.apache_protection,
    allowDownloadImage:    !!row.allow_download_image,
    allowDownloadGallery:  !!row.allow_download_gallery,
    allowDownloadOriginal: !!row.allow_download_original,
    coverPhoto:           row.cover_photo,
    slideshowInterval:    row.slideshow_interval,
    copyright:            row.copyright,
    buildStatus:          row.build_status,
    builtAt:              row.built_at,
    distName:             row.dist_name || null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
    description:          row.description,
    descriptionMd:        row.description_md ?? null,
    descriptionHtml:      row.description_md ? marked.parse(row.description_md) : null,
    primaryPhotographerId: row.primary_photographer_id ?? null,
    firstPhoto:           row.cover_photo || getFirstPhoto(row.slug),
    dateRange,
    needsRebuild:         row.needs_rebuild === 1 || getNeedsRebuild(row),
    photoCount:           getPhotoCount(row.slug),
    diskSize:             getDiskSize(row.slug),
    watermark:            (() => { try { return JSON.parse(row.config_json || '{}').watermark ?? null; } catch { return null; } })(),
  };
}

async function rowToGalleryAsync(row) {
  const dateRange = row.build_status === 'done' ? await getDateRange(row.slug) : null;
  return rowToGallery(row, { dateRange });
}

// ── Routes ────────────────────────────────────────────────────────────────────

// ── Legacy flat routes (deprecated — use /api/projects/:projectId/galleries) ──

// GET /api/galleries — list, optionally filtered by ?projectId=
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  let rows;
  if (projectId) {
    [rows] = await query(
      'SELECT * FROM galleries WHERE studio_id = ? AND project_id = ? ORDER BY created_at DESC',
      [req.studioId, projectId]
    );
  } else {
    [rows] = await query(
      'SELECT * FROM galleries WHERE studio_id = ? ORDER BY created_at DESC',
      [req.studioId]
    );
  }

  // Batch-fetch first photo ID per gallery for cover thumbnails (1 query for all galleries)
  const galleryIds = rows.map(r => r.id);
  let coverPhotoMap = {};
  if (galleryIds.length > 0) {
    const placeholders = galleryIds.map(() => '?').join(',');
    const [coverRows] = await query(
      `SELECT gallery_id, id AS photo_id
       FROM photos
       WHERE gallery_id IN (${placeholders}) AND status != 'rejected'
       ORDER BY sort_order ASC, created_at ASC`,
      galleryIds
    );
    // Keep only the first photo per gallery
    for (const r of coverRows) {
      if (!coverPhotoMap[r.gallery_id]) coverPhotoMap[r.gallery_id] = r.photo_id;
    }
  }

  const galleries = await Promise.all(rows.map(async row => {
    const g = await rowToGalleryAsync(row);
    const photoId = coverPhotoMap[row.id];
    g.coverThumbnailUrl = photoId ? (photoThumbnails(photoId).md ?? null) : null;
    return g;
  }));

  res.json(galleries);
});

// GET /api/galleries/:id
router.get('/:id', async (req, res) => {
  const [rows] = await query(
    `SELECT g.*, p.id AS proj_id, p.slug AS proj_slug, p.name AS proj_name
     FROM galleries g
     LEFT JOIN projects p ON p.id = g.project_id
     WHERE g.id = ? AND g.studio_id = ?`,
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  const galleryRole = await getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'read', 'gallery', { gallery: row, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const g = await rowToGalleryAsync(row);
  if (row.proj_id) {
    g.breadcrumb = { project: { id: row.proj_id, slug: row.proj_slug, name: row.proj_name } };
  }
  res.json(g);
});

// POST /api/galleries
router.post('/', async (req, res) => {
  if (!can(req.user, 'publish', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const st         = (await getSettings(req.studioId)) || {};
  const defLocale  = st.default_locale                || 'fr';
  const defAccess  = st.default_access                || 'public';
  const defDlImg   = st.default_allow_download_image  !== 0;
  const defDlGal   = st.default_allow_download_gallery === 1;
  const {
    slug, title, description, subtitle,
    projectId = null,
    author      = st.default_author       || null,
    authorEmail = st.default_author_email || null,
    date, location,
    locale = defLocale, access = defAccess, password,
    standalone = false, allowDownloadImage = defDlImg, allowDownloadGallery = defDlGal,
    coverPhoto, slideshowInterval, copyright,
  } = req.body || {};

  if (!slug) return res.status(400).json({ error: 'slug is required' });

  // Validate project if provided — must belong to the resolved studio
  if (projectId) {
    const project = await getProject(projectId);
    if (!project || project.studio_id !== req.studioId) {
      return res.status(400).json({ error: 'Invalid projectId: project not found or does not belong to this studio' });
    }
  }

  const [existingRows] = await query(
    'SELECT id FROM galleries WHERE studio_id = ? AND slug = ?',
    [req.studioId, slug]
  );
  if (existingRows[0]) return res.status(409).json({ error: 'A gallery with this slug already exists' });

  const id  = genId();
  const now = Date.now();
  const passwordHash = access === 'password' && password ? hashPassword(password) : null;

  await query(`
    INSERT INTO galleries
      (id, studio_id, project_id, slug, title, description, subtitle, author, author_email, date, location,
       locale, access, password_hash, standalone,
       allow_download_image, allow_download_gallery, cover_photo,
       slideshow_interval, copyright, build_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `, [
    id, req.studioId, projectId ?? null, slug, title ?? slug, description ?? null, subtitle ?? null, author ?? null,
    authorEmail ?? null, date ?? null, location ?? null,
    locale, access, passwordHash, standalone ? 1 : 0,
    allowDownloadImage ? 1 : 0, allowDownloadGallery ? 1 : 0,
    coverPhoto ?? null, slideshowInterval ?? null, copyright ?? null,
    now, now,
  ]);

  const [newRows] = await query('SELECT * FROM galleries WHERE id = ?', [id]);
  try { await audit(req.studioId, req.userId, 'gallery.create', 'gallery', id, { slug }); } catch {}
  res.status(201).json(await rowToGalleryAsync(newRows[0]));
});

// PATCH /api/galleries/:id
router.patch('/:id', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  const galleryRole = await getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const allowed = [
    'title','description','description_md','subtitle','author','author_email','date','location',
    'locale','access','password','standalone',
    'download_mode','apache_protection',
    'allow_download_image','allow_download_gallery','allow_download_original','cover_photo',
    'slideshow_interval','copyright','primary_photographer_id','config_json',
  ];

  const camelToSnake = {
    authorEmail: 'author_email', allowDownloadImage: 'allow_download_image',
    allowDownloadGallery: 'allow_download_gallery', allowDownloadOriginal: 'allow_download_original', coverPhoto: 'cover_photo',
    slideshowInterval: 'slideshow_interval',
    downloadMode: 'download_mode', apacheProtection: 'apache_protection',
    descriptionMd: 'description_md', primaryPhotographerId: 'primary_photographer_id',
    configJson: 'config_json',
  };

  const boolCols = new Set(['standalone','allow_download_image','allow_download_gallery','allow_download_original','apache_protection']);

  const updates = {};
  for (const [key, val] of Object.entries(req.body || {})) {
    const col = camelToSnake[key] || key;
    if (!allowed.includes(col)) continue;
    updates[col] = boolCols.has(col) ? (val ? 1 : 0) : val;
  }

  if ('password' in updates) {
    if (updates.password) updates.password_hash = hashPassword(updates.password);
    delete updates.password;
  }

  if (!Object.keys(updates).length) return res.json(await rowToGalleryAsync(row));

  updates.updated_at    = Date.now();
  updates.needs_rebuild = 1;
  const sets = Object.keys(updates).map(c => `${c} = ?`).join(', ');
  const vals = [...Object.values(updates), req.params.id];
  await query(`UPDATE galleries SET ${sets} WHERE id = ?`, vals);

  const [updatedRows] = await query('SELECT * FROM galleries WHERE id = ?', [req.params.id]);
  if (updates.access !== undefined || updates.password_hash !== undefined) {
    try { await audit(req.studioId, req.userId, 'gallery.access_changed', 'gallery', req.params.id, { access: updates.access ?? row.access }); } catch {}
  }
  res.json(await rowToGalleryAsync(updatedRows[0]));
});

// POST /api/galleries/:id/rename — rename slug (renames folder on disk)
router.post('/:id/rename', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  const galleryRole = await getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { slug } = req.body || {};
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });
  }
  const [conflictRows] = await query(
    'SELECT id FROM galleries WHERE studio_id = ? AND slug = ? AND id != ?',
    [req.studioId, slug, req.params.id]
  );
  if (conflictRows[0]) return res.status(409).json({ error: 'A gallery with this slug already exists' });

  for (const [base, baseRoot] of [['src', SRC_ROOT], ['dist', DIST_ROOT]]) {
    const oldDir = path.join(baseRoot, row.slug);
    const newDir = path.join(baseRoot, slug);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      try { fs.renameSync(oldDir, newDir); } catch (err) {
        console.error(`[rename] failed to move ${base}/${row.slug} → ${base}/${slug}:`, err.message);
      }
    }
  }

  await query(
    'UPDATE galleries SET slug = ?, needs_rebuild = 1, updated_at = ? WHERE id = ?',
    [slug, Date.now(), req.params.id]
  );
  try { await audit(req.studioId, req.userId, 'gallery.rename', 'gallery', req.params.id, { from: row.slug, to: slug }); } catch {}

  const [updatedRows] = await query('SELECT * FROM galleries WHERE id = ?', [req.params.id]);
  res.json(await rowToGalleryAsync(updatedRows[0]));
});

// DELETE /api/galleries/:id
router.delete('/:id', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });
  if (!can(req.user, 'delete', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Delete thumbnails for all photos in this gallery
  const THUMB_ROOT = path.join(INTERNAL_ROOT, 'thumbnails');
  const [photos] = await query('SELECT id FROM photos WHERE gallery_id = ?', [req.params.id]);
  for (const photo of photos) {
    for (const size of ['sm', 'md']) {
      const p = path.join(THUMB_ROOT, size, `${photo.id}.webp`);
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  }

  await query('DELETE FROM galleries WHERE id = ?', [req.params.id]);

  // Always delete source dir; always purge dist on explicit delete
  const srcDir = path.join(SRC_ROOT, row.slug);
  try { if (fs.existsSync(srcDir)) fs.rmSync(srcDir, { recursive: true, force: true }); } catch {}

  const distDir = path.join(DIST_ROOT, row.slug);
  try { if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true }); } catch {}

  try { await audit(req.studioId, req.userId, 'gallery.delete', 'gallery', req.params.id, { slug: row.slug }); } catch {}
  res.json({ ok: true });
});

// ── Gallery membership routes (legacy — uses gallery_role_assignments) ────────

router.get('/:id/members', requireStudioRole('admin'), async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Gallery not found' });
  res.json(await listGalleryRoleAssignments(req.params.id));
});

router.put('/:id/members/:userId', requireStudioRole('admin'), async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Gallery not found' });

  const { role } = req.body || {};
  if (!role || !GALLERY_ROLE_HIERARCHY_V2.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${GALLERY_ROLE_HIERARCHY_V2.join(', ')}` });
  }

  const targetUser = await getUserById(req.params.userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const assignment = await upsertGalleryRoleAssignment(req.params.id, req.params.userId, role, req.userId);
  try { await audit(req.studioId, req.userId, 'gallery.member_added', 'gallery', req.params.id, { userId: req.params.userId, role }); } catch {}
  res.json(assignment);
});

router.delete('/:id/members/:userId', requireStudioRole('admin'), async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Gallery not found' });

  await removeGalleryRoleAssignment(req.params.id, req.params.userId);
  try { await audit(req.studioId, req.userId, 'gallery.member_removed', 'gallery', req.params.id, { userId: req.params.userId }); } catch {}
  res.json({ ok: true });
});

// ── Viewer token routes ───────────────────────────────────────────────────────

router.post('/:id/viewer-tokens', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = await getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { label = null, expiresAt = null } = req.body || {};
  const token = await createViewerTokenDb('gallery', row.id, req.userId, { label, expiresAt });
  try { await audit(req.studioId, req.userId, 'viewer_token.created', 'gallery', row.id, { label }); } catch {}
  res.status(201).json(token);
});

router.get('/:id/viewer-tokens', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = await getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(await listViewerTokens('gallery', row.id));
});

router.delete('/:id/viewer-tokens/:tokenId', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = await getGalleryRole(req.userId, row.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await deleteViewerToken(req.params.tokenId);
  try { await audit(req.studioId, req.userId, 'viewer_token.revoked', 'gallery', req.params.id, { tokenId: req.params.tokenId }); } catch {}
  res.json({ ok: true });
});

// POST /api/galleries/:id/notify-ready — photographer signals photos are ready
router.post('/:id/notify-ready', requireAuth, async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const gallery = rows[0];
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!galleryRole) return res.status(403).json({ error: 'Forbidden' });

  const [recipients] = await query(
    `SELECT u.email, u.name FROM studio_memberships sm
     JOIN users u ON u.id = sm.user_id
     WHERE sm.studio_id = ? AND sm.role IN ('admin','owner')`,
    [req.studioId]
  );

  const sender = await getUserById(req.userId);
  const base = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const galleryAdminUrl = `${base}/admin/galleries/${gallery.id}`;

  for (const r of recipients) {
    sendPhotosReadyEmail({
      studioId:         req.studioId,
      to:               r.email,
      photographerName: sender.name || sender.email,
      galleryTitle:     gallery.title || gallery.slug,
      galleryAdminUrl,
    });
  }

  try { await audit(req.studioId, req.userId, 'gallery.notify_ready', 'gallery', gallery.id, { notified: recipients.length }); } catch {}
  res.json({ ok: true, notified: recipients.length });
});

export default router;
