// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/projectGalleries.js — Gallery CRUD scoped to a project
// Canonical routes: /api/projects/:projectId/galleries[/:id]
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { query }  from '../db/database.js';
import {
  genId, hashPassword, getProject, getStudio, getSettings,
  getUserById, getGalleryRole,
  createViewerTokenDb, listViewerTokens, deleteViewerToken,
  listGalleryRoleAssignments, upsertGalleryRoleAssignment, removeGalleryRoleAssignment,
  GALLERY_ROLE_HIERARCHY_V2,
  audit,
} from '../db/helpers.js';
import { requireStudioRole } from '../middleware/auth.js';
import { sendPhotosReadyEmail } from '../services/email.js';
import { can } from '../authorization/index.js';
import { ROOT } from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';

const fileStorage = createStorage();
const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

// ── FS helpers (shared with legacy galleries route) ───────────────────────────

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

async function getDateRange(slug) {
  try {
    const buf = await fileStorage.read(`dist/${slug}/photos.json`);
    const manifest = JSON.parse(buf.toString('utf8'));
    const dates = Object.values(manifest.photos || {})
      .map(p => p.exif?.date).filter(Boolean).map(d => new Date(d)).sort((a, b) => a - b);
    if (!dates.length) return null;
    return { from: dates[0].toISOString().slice(0, 10), to: dates[dates.length - 1].toISOString().slice(0, 10) };
  } catch { return null; }
}

// ── Serializers ───────────────────────────────────────────────────────────────

function rowToGallery(row, { dateRange = null, studio = null, project = null } = {}) {
  if (!row) return null;
  const g = {
    id:                   row.id,
    studioId:             row.studio_id,
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
    dateRange,
    needsRebuild:         row.needs_rebuild === 1 || getNeedsRebuild(row),
    photoCount:           getPhotoCount(row.slug),
    diskSize:             getDiskSize(row.slug),
  };
  // Breadcrumb context when studio/project are provided (detail route)
  if (studio || project) {
    g.breadcrumb = {
      studio:  studio  ? { id: studio.id,  name: studio.name,  slug: studio.slug  } : null,
      project: project ? { id: project.id, name: project.name, slug: project.slug } : null,
    };
  }
  return g;
}

async function rowToGalleryAsync(row, opts = {}) {
  const dateRange = row.build_status === 'done' ? await getDateRange(row.slug) : null;
  return rowToGallery(row, { ...opts, dateRange });
}

// ── Middleware: resolve project, enforce studio ownership ─────────────────────

async function resolveProject(req, res, next) {
  const project = await getProject(req.params.projectId);
  if (!project || project.studio_id !== req.studioId) {
    return res.status(404).json({ error: 'Project not found' });
  }
  req.project = project;
  next();
}

// ── Router ────────────────────────────────────────────────────────────────────

// mergeParams so :projectId is accessible alongside :id
const router = Router({ mergeParams: true });
router.use(resolveProject);

// GET /api/projects/:projectId/galleries
router.get('/', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE project_id = ? ORDER BY created_at DESC',
    [req.project.id]
  );
  res.json(await Promise.all(rows.map(r => rowToGalleryAsync(r))));
});

// POST /api/projects/:projectId/galleries
router.post('/', async (req, res) => {
  if (!can(req.user, 'publish', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const st        = (await getSettings(req.studioId)) || {};
  const defLocale = st.default_locale                || 'fr';
  const defAccess = st.default_access                || 'public';
  const defDlImg  = st.default_allow_download_image  !== 0;
  const defDlGal  = st.default_allow_download_gallery === 1;
  const {
    slug, title, description, subtitle,
    author      = st.default_author       || null,
    authorEmail = st.default_author_email || null,
    date, location,
    locale = defLocale, access = defAccess, password,
    standalone = false, allowDownloadImage = defDlImg, allowDownloadGallery = defDlGal,
    coverPhoto, slideshowInterval, copyright,
  } = req.body || {};

  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers, hyphens and forward slashes only' });
  }

  const [existingRows] = await query(
    'SELECT id FROM galleries WHERE studio_id = ? AND slug = ?',
    [req.studioId, slug]
  );
  if (existingRows[0]) return res.status(409).json({ error: 'A gallery with this slug already exists' });

  const id           = genId();
  const now          = Date.now();
  const passwordHash = access === 'password' && password ? hashPassword(password) : null;

  await query(`
    INSERT INTO galleries
      (id, studio_id, project_id, slug, title, description, subtitle, author, author_email, date, location,
       locale, access, password_hash, standalone,
       allow_download_image, allow_download_gallery, cover_photo,
       slideshow_interval, copyright, build_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `, [
    id, req.studioId, req.project.id, slug, title ?? slug, description ?? null, subtitle ?? null,
    author ?? null, authorEmail ?? null, date ?? null, location ?? null,
    locale, access, passwordHash, standalone ? 1 : 0,
    allowDownloadImage ? 1 : 0, allowDownloadGallery ? 1 : 0,
    coverPhoto ?? null, slideshowInterval ?? null, copyright ?? null,
    now, now,
  ]);

  const [newRows] = await query('SELECT * FROM galleries WHERE id = ?', [id]);
  try { await audit(req.studioId, req.userId, 'gallery.create', 'gallery', id, { slug, projectId: req.project.id }); } catch {}
  res.status(201).json(await rowToGalleryAsync(newRows[0]));
});

// ── Gallery-scoped middleware: resolve gallery within this project ─────────────

async function resolveGallery(req, res, next) {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND project_id = ? AND studio_id = ?',
    [req.params.id, req.project.id, req.studioId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Gallery not found' });
  req.gallery = rows[0];
  next();
}

// GET /api/projects/:projectId/galleries/:id — with breadcrumb
router.get('/:id', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery: req.gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const studio = await getStudio(req.studioId);
  res.json(await rowToGalleryAsync(req.gallery, { studio, project: req.project }));
});

// PATCH /api/projects/:projectId/galleries/:id
router.patch('/:id', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const allowed = [
    'title','description','subtitle','author','author_email','date','location',
    'locale','access','password','standalone',
    'allow_download_image','allow_download_gallery','cover_photo',
    'slideshow_interval','copyright',
  ];
  const camelToSnake = {
    authorEmail: 'author_email', allowDownloadImage: 'allow_download_image',
    allowDownloadGallery: 'allow_download_gallery', coverPhoto: 'cover_photo',
    slideshowInterval: 'slideshow_interval',
  };
  const boolCols = new Set(['standalone','allow_download_image','allow_download_gallery']);

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
  if (!Object.keys(updates).length) return res.json(await rowToGalleryAsync(req.gallery));

  updates.updated_at    = Date.now();
  updates.needs_rebuild = 1;
  const sets = Object.keys(updates).map(c => `${c} = ?`).join(', ');
  await query(`UPDATE galleries SET ${sets} WHERE id = ?`, [...Object.values(updates), req.gallery.id]);

  const [updatedRows] = await query('SELECT * FROM galleries WHERE id = ?', [req.gallery.id]);
  if (updates.access !== undefined || updates.password_hash !== undefined) {
    try { await audit(req.studioId, req.userId, 'gallery.access_changed', 'gallery', req.gallery.id, { access: updates.access ?? req.gallery.access }); } catch {}
  }
  res.json(await rowToGalleryAsync(updatedRows[0]));
});

// POST /api/projects/:projectId/galleries/:id/rename
router.post('/:id/rename', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { slug } = req.body || {};
  if (!slug || !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers, hyphens and forward slashes only' });
  }
  const [conflictRows] = await query(
    'SELECT id FROM galleries WHERE studio_id = ? AND slug = ? AND id != ?',
    [req.studioId, slug, req.gallery.id]
  );
  if (conflictRows[0]) return res.status(409).json({ error: 'A gallery with this slug already exists' });

  for (const base of ['src', 'dist']) {
    const oldDir = path.join(ROOT, base, req.gallery.slug);
    const newDir = path.join(ROOT, base, slug);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      try { fs.renameSync(oldDir, newDir); } catch (err) {
        console.error(`[rename] failed to move ${base}/${req.gallery.slug} → ${base}/${slug}:`, err.message);
      }
    }
  }

  await query(
    'UPDATE galleries SET slug = ?, needs_rebuild = 1, updated_at = ? WHERE id = ?',
    [slug, Date.now(), req.gallery.id]
  );
  try { await audit(req.studioId, req.userId, 'gallery.rename', 'gallery', req.gallery.id, { from: req.gallery.slug, to: slug }); } catch {}

  const [updatedRows] = await query('SELECT * FROM galleries WHERE id = ?', [req.gallery.id]);
  res.json(await rowToGalleryAsync(updatedRows[0]));
});

// DELETE /api/projects/:projectId/galleries/:id
router.delete('/:id', resolveGallery, async (req, res) => {
  if (!can(req.user, 'delete', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await query('DELETE FROM galleries WHERE id = ?', [req.gallery.id]);

  const srcDir = path.join(ROOT, 'src', req.gallery.slug);
  try { if (fs.existsSync(srcDir)) fs.rmSync(srcDir, { recursive: true, force: true }); } catch {}

  if (req.query.purge === '1') {
    const distDir = path.join(ROOT, 'dist', req.gallery.slug);
    try { if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true }); } catch {}
  }

  try { await audit(req.studioId, req.userId, 'gallery.delete', 'gallery', req.gallery.id, { slug: req.gallery.slug, purge: req.query.purge === '1' }); } catch {}
  res.json({ ok: true });
});

// ── Gallery membership (canonical: gallery_role_assignments) ──────────────────

router.get('/:id/members', resolveGallery, requireStudioRole('admin'), async (req, res) => {
  res.json(await listGalleryRoleAssignments(req.gallery.id));
});

router.put('/:id/members/:userId', resolveGallery, requireStudioRole('admin'), async (req, res) => {
  const { role } = req.body || {};
  if (!role || !GALLERY_ROLE_HIERARCHY_V2.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${GALLERY_ROLE_HIERARCHY_V2.join(', ')}` });
  }

  const targetUser = await getUserById(req.params.userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const assignment = await upsertGalleryRoleAssignment(req.gallery.id, req.params.userId, role, req.userId);
  try { await audit(req.studioId, req.userId, 'gallery.member_added', 'gallery', req.gallery.id, { userId: req.params.userId, role }); } catch {}
  res.json(assignment);
});

router.delete('/:id/members/:userId', resolveGallery, requireStudioRole('admin'), async (req, res) => {
  await removeGalleryRoleAssignment(req.gallery.id, req.params.userId);
  try { await audit(req.studioId, req.userId, 'gallery.member_removed', 'gallery', req.gallery.id, { userId: req.params.userId }); } catch {}
  res.json({ ok: true });
});

// ── Viewer tokens ─────────────────────────────────────────────────────────────

router.post('/:id/viewer-tokens', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { label = null, expiresAt = null } = req.body || {};
  const token = await createViewerTokenDb('gallery', req.gallery.id, req.userId, { label, expiresAt });
  try { await audit(req.studioId, req.userId, 'viewer_token.created', 'gallery', req.gallery.id, { label }); } catch {}
  res.status(201).json(token);
});

router.get('/:id/viewer-tokens', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(await listViewerTokens('gallery', req.gallery.id));
});

router.delete('/:id/viewer-tokens/:tokenId', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await deleteViewerToken(req.params.tokenId);
  try { await audit(req.studioId, req.userId, 'viewer_token.revoked', 'gallery', req.gallery.id, { tokenId: req.params.tokenId }); } catch {}
  res.json({ ok: true });
});

// ── Notify ready ──────────────────────────────────────────────────────────────

router.post('/:id/notify-ready', resolveGallery, async (req, res) => {
  const galleryRole = await getGalleryRole(req.userId, req.gallery.id);
  if (!can(req.user, 'notify', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [recipients] = await query(
    `SELECT u.email, u.name FROM studio_memberships sm
     JOIN users u ON u.id = sm.user_id
     WHERE sm.studio_id = ? AND sm.role IN ('admin','owner')`,
    [req.studioId]
  );

  const sender  = await getUserById(req.userId);
  const base    = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const adminUrl = `${base}/admin/galleries/${req.gallery.id}`;

  for (const r of recipients) {
    sendPhotosReadyEmail({
      studioId:         req.studioId,
      to:               r.email,
      photographerName: sender.name || sender.email,
      galleryTitle:     req.gallery.title || req.gallery.slug,
      galleryAdminUrl:  adminUrl,
    });
  }

  try { await audit(req.studioId, req.userId, 'gallery.notify_ready', 'gallery', req.gallery.id, { notified: recipients.length }); } catch {}
  res.json({ ok: true, notified: recipients.length });
});

export default router;
