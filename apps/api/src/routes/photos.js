// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/photos.js — photo upload, list, delete, reorder
import { Router }   from 'express';
import multer       from 'multer';
import path         from 'path';
import fs           from 'fs';
import { query }    from '../db/database.js';
import { getGalleryRole, listGalleryRoleAssignments, listStudioMembers, getSettings, audit } from '../db/helpers.js';
import { sendEmail } from '../services/email.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import { ROOT }         from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';

// Storage adapter — resolved once at startup from env
export const fileStorage = createStorage();

const router = Router();
router.use(requireAuth);

// Source photos path: src/<slug>/photos/ (local) or equivalent prefix (S3)
function photosDir(slug) {
  return path.join(ROOT, 'src', slug, 'photos');
}

async function ensureGalleryBelongsToStudio(req, res) {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Gallery not found' }); return null; }
  return rows[0];
}

// Multer: store files in src/<slug>/photos/
const storage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      const [rows] = await query(
        'SELECT slug FROM galleries WHERE id = ? AND studio_id = ?',
        [req.params.id, req.studioId]
      );
      if (!rows[0]) return cb(new Error('Gallery not found'));
      const dir = photosDir(rows[0].slug);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    // Preserve original filename; sanitize to avoid path traversal
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB per file
  fileFilter(req, file, cb) {
    const allowed = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
    if (allowed.has(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.originalname}`));
  },
});

// GET /api/galleries/:id/photos/:filename/preview — serve original photo resized to 800px
router.get('/:id/photos/:filename/preview', async (req, res) => {
  const gallery = await ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const safe     = path.basename(req.params.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  try {
    const { default: sharp } = await import('sharp');
    const buf = await sharp(filePath)
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/galleries/:id/photos
router.get('/:id/photos', async (req, res) => {
  const gallery = await ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const dir = photosDir(gallery.slug);
  if (!fs.existsSync(dir)) return res.json([]);

  const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
  const allFiles = fs.readdirSync(dir)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()));

  // Apply saved order from DB (photo_order column).
  // Lazy migration: if DB column is NULL but legacy file exists, import once then remove file.
  let savedOrder = null;
  const [galleryRows] = await query('SELECT photo_order FROM galleries WHERE id = ?', [gallery.id]);
  const galleryRow = galleryRows[0];
  if (galleryRow?.photo_order) {
    try { savedOrder = JSON.parse(galleryRow.photo_order); } catch {}
  } else {
    // Legacy fallback — read from disk and migrate to DB
    const orderFile = path.join(ROOT, 'src', gallery.slug, 'photo_order.json');
    try {
      if (fs.existsSync(orderFile)) {
        savedOrder = JSON.parse(fs.readFileSync(orderFile, 'utf8'));
        await query('UPDATE galleries SET photo_order = ? WHERE id = ?', [JSON.stringify(savedOrder), gallery.id]);
        try { fs.unlinkSync(orderFile); } catch {}
      }
    } catch {}
  }

  let sortedNames;
  if (savedOrder && Array.isArray(savedOrder)) {
    const set = new Set(allFiles);
    const orderedSet = new Set(savedOrder);
    const unordered = allFiles.filter(f => !orderedSet.has(f)).sort();
    sortedNames = [...savedOrder.filter(f => set.has(f)), ...unordered];
  } else {
    sortedNames = [...allFiles].sort();
  }

  const files = sortedNames.map(f => {
    const stat = fs.statSync(path.join(dir, f));
    return { file: f, size: stat.size, mtime: stat.mtimeMs };
  });

  // Attach processed thumbnail name from photos.json manifest if available
  const manifestKey = path.join('dist', gallery.slug, 'photos.json').replace(/\\/g, '/');
  let nameMap = {};
  try {
    const buf = await fileStorage.read(manifestKey);
    const manifest = JSON.parse(buf.toString('utf8'));
    for (const [file, info] of Object.entries(manifest.photos || {})) {
      nameMap[file] = info.name;
    }
  } catch (_) {}

  res.json(files.map(f => ({ ...f, thumb: nameMap[f.file] || null })));
});

const MAX_PHOTOS_PER_GALLERY = 500;

// POST /api/galleries/:id/photos — upload one or more photos
router.post('/:id/photos', upload.array('photos', 200), async (req, res) => {
  const gallery = await ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Enforce max photos quota
  const dir = photosDir(gallery.slug);
  const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
  const existing = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => EXTS.has(path.extname(f).toLowerCase())).length
    : 0;

  if (existing + (req.files?.length || 0) > MAX_PHOTOS_PER_GALLERY) {
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(422).json({
      error: `Gallery quota exceeded. Max ${MAX_PHOTOS_PER_GALLERY} photos per gallery (currently ${existing}).`,
    });
  }

  const uploaded = (req.files || []).map(f => ({ file: f.filename, size: f.size }));
  if (uploaded.length > 0) {
    await query(
      'UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?',
      [Date.now(), req.params.id]
    );
    for (const f of uploaded) {
      try { await audit(req.studioId, req.userId, 'photo.upload', 'gallery', req.params.id, { filename: f.file }); } catch {}
    }
  }
  res.status(201).json({ uploaded: uploaded.length, files: uploaded });
});

// DELETE /api/galleries/:id/photos/:filename
router.delete('/:id/photos/:filename', async (req, res) => {
  const gallery = await ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'delete', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const safe = path.basename(req.params.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  fs.unlinkSync(filePath);
  await query(
    'UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?',
    [Date.now(), req.params.id]
  );
  try { await audit(req.studioId, req.userId, 'photo.delete', 'gallery', req.params.id, { filename: safe }); } catch {}
  res.json({ ok: true });
});

// PUT /api/galleries/:id/photos/order — save explicit photo order
router.put('/:id/photos/order', async (req, res) => {
  const gallery = await ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of filenames' });

  const cleanOrder = order.map(f => path.basename(f));
  await query(
    'UPDATE galleries SET photo_order = ?, cover_photo = ?, needs_rebuild = 1, updated_at = ? WHERE id = ?',
    [JSON.stringify(cleanOrder), cleanOrder[0] || null, Date.now(), req.params.id]
  );

  res.json({ ok: true });
});

// POST /api/galleries/:id/photos/upload-done — photographer signals they're done uploading
router.post('/:id/photos/upload-done', async (req, res) => {
  const gallery = await ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Collect editors/admins to notify
  const galleryEditors = (await listGalleryRoleAssignments(gallery.id)).filter(m => m.role === 'editor');
  const studioEditors  = (await listStudioMembers(req.studioId))
    .filter(m => ['collaborator', 'admin', 'owner'].includes(m.role));

  const allEmails = [...new Set([
    ...galleryEditors.map(m => m.email),
    ...studioEditors.map(m => m.user.email),
  ])].filter(Boolean);

  const s = await getSettings(req.studioId);
  const base = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const galleryUrl = `${base}/admin/#/galleries/${gallery.id}`;
  const uploaderName = req.user.name || req.user.email;

  for (const to of allEmails) {
    sendEmail({
      studioId: req.studioId,
      to,
      subject: `Photos prêtes à publier — ${gallery.title}`,
      text: `${uploaderName} a terminé d'uploader des photos dans la galerie "${gallery.title}".\n\nVous pouvez maintenant les vérifier et publier la galerie :\n${galleryUrl}\n`,
      html: `<p><strong>${uploaderName}</strong> a terminé d'uploader des photos dans la galerie <strong>${gallery.title}</strong>.</p><p><a href="${galleryUrl}">Ouvrir la galerie pour publier →</a></p>`,
      template: 'upload-done',
    });
  }

  res.json({ ok: true, notified: allEmails.length });
});

export default router;
