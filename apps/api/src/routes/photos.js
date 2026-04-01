// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/photos.js — photo upload, list, delete, reorder, upload-links, inbox
import { Router }   from 'express';
import multer       from 'multer';
import path         from 'path';
import fs           from 'fs';
import { randomUUID } from 'crypto';
import { query }    from '../db/database.js';
import {
  getGalleryRole, listGalleryRoleAssignments, getSettings, audit,
  createUploadLink, listUploadLinks, revokeUploadLink,
  listPhotosByStatus, getPhotoStatusCounts, bulkSetPhotoStatus, setGalleryStatus,
  createPhotographer, getPhotographer, listPhotographers, updatePhotographer, deletePhotographer,
  setPhotoPhotographer, bulkSetPhotoPhotographer,
} from '../db/helpers.js';
import { listOrgMembers } from '../services/organization.js';
import { sendEmail } from '../services/email.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import { SRC_ROOT }     from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';
import { enqueueSm, enqueueMd, photoThumbnails, thumbPath } from '../services/thumbnailService.js';
import { enqueuePrerender, uploadStarted, uploadFinished } from '../services/prerenderService.js';
import { decrementStorageUsed } from '../services/tusService.js';
import { extractExif } from '../../../../packages/engine/src/exif.js';
import { runSharp } from '../services/sharpProcess.js';

// Storage adapter — resolved once at startup from env
export const fileStorage = createStorage();

const router = Router();
router.use(requireAuth);

// Source photos path: private/<slug>/photos/ (local) or equivalent prefix (S3)
function photosDir(slug) {
  return path.join(SRC_ROOT, slug, 'photos');
}

async function ensureGalleryBelongsToOrg(req, res) {
  const [rows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND organization_id = ?',
    [req.params.id, req.organizationId]
  );
  if (!rows[0]) { res.status(404).json({ error: 'Gallery not found' }); return null; }
  return rows[0];
}

// Multer: store files in src/<slug>/photos/
const storage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      const [rows] = await query(
        'SELECT slug FROM galleries WHERE id = ? AND organization_id = ?',
        [req.params.id, req.organizationId]
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
    // UUID-based disk filename — prevents concurrent uploads of the same original
    // filename from overwriting each other on disk.  original_name stores the
    // human-readable name; filename is the stable on-disk/URL key.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const UPLOAD_MAX_SIZE_BYTES = (Number(process.env.UPLOAD_MAX_SIZE_MB) || 100) * 1024 * 1024;

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_SIZE_BYTES },
  fileFilter(req, file, cb) {
    const allowed = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
    if (allowed.has(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.originalname}`));
  },
});

// GET /api/galleries/:id/photos/:filename/preview — serve original photo resized to 800px
router.get('/:id/photos/:filename/preview', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
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
    const buf = await sharp(filePath, { failOn: 'none', sequentialRead: true })
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

// GET /api/galleries/:id/photos/:photoId/download-original
// Stream the original source file. Requires allow_download_original on the gallery.
router.get('/:id/photos/:photoId/download-original', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  if (!gallery.allow_download_original) {
    return res.status(403).json({ error: 'Original downloads are not enabled for this gallery' });
  }

  const [rows] = await query('SELECT id, filename FROM photos WHERE id = ? AND gallery_id = ? LIMIT 1', [req.params.photoId, gallery.id]);
  const photo = rows[0];
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const safe     = path.basename(photo.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Original file not found' });

  res.set('Content-Disposition', `attachment; filename="${safe}"`);
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
});

// GET /api/galleries/:id/photos — list photos (DB-backed, falls back to filesystem for legacy rows)
router.get('/:id/photos', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Try DB-backed photo list first
  const dbPhotos = await listPhotosByStatus(gallery.id, null);
  if (dbPhotos.length > 0) {
    // Attach thumbnail name from photos.json manifest if available
    const manifestKey = path.join('dist', gallery.slug, 'photos.json').replace(/\\/g, '/');
    let nameMap = {};
    try {
      const buf = await fileStorage.read(manifestKey);
      const manifest = JSON.parse(buf.toString('utf8'));
      for (const [file, info] of Object.entries(manifest.photos || {})) {
        nameMap[file] = info.name;
      }
    } catch (_) {}

    return res.json(dbPhotos.map(p => ({
      file:              p.filename,
      original_name:     p.original_name || null,
      exif:              p.exif ? (typeof p.exif === 'string' ? JSON.parse(p.exif) : p.exif) : null,
      size:              p.size_bytes,
      mtime:             p.created_at,
      status:            p.status,
      id:                p.id,
      sort_order:        p.sort_order,
      upload_link_label: p.upload_link_label || null,
      thumb:             nameMap[p.filename] || null,
      thumbnail:         photoThumbnails(p.id),
      photographer_id:   p.photographer_id || null,
    })));
  }

  // Legacy fallback — filesystem-only galleries (not yet migrated to photos table)
  const dir = photosDir(gallery.slug);
  if (!fs.existsSync(dir)) return res.json([]);

  const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
  const allFiles = fs.readdirSync(dir)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()));

  let savedOrder = null;
  const [galleryRows] = await query('SELECT photo_order FROM galleries WHERE id = ?', [gallery.id]);
  const galleryRow = galleryRows[0];
  if (galleryRow?.photo_order) {
    try { savedOrder = JSON.parse(galleryRow.photo_order); } catch {}
  } else {
    const orderFile = path.join(SRC_ROOT, gallery.slug, 'photo_order.json');
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

// GET /api/galleries/:id/photos/inbox — photos awaiting validation (status=uploaded)
router.get('/:id/photos/inbox', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const photos = await listPhotosByStatus(gallery.id, 'uploaded');
  const counts = await getPhotoStatusCounts(gallery.id);
  res.json({ photos, counts });
});

const MAX_PHOTOS_PER_GALLERY = Number(process.env.GALLERY_MAX_PHOTOS) || 500;

// POST /api/galleries/:id/photos — upload one or more photos (authenticated)
router.post('/:id/photos', (req, res, next) => {
  upload.array('photos', 200)(req, res, (err) => {
    if (err) return res.status(err.message === 'Gallery not found' ? 404 : 400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  uploadStarted();
  try {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Deduplicate by original_name — skip files already in this gallery so that
  // retrying a failed upload doesn't create duplicate rows and inflate the quota.
  const incomingFiles = req.files || [];
  const incomingNames = incomingFiles.map(f => f.originalname);
  let newFiles = incomingFiles;
  if (incomingNames.length > 0) {
    const placeholders = incomingNames.map(() => '?').join(',');
    const [dupRows] = await query(
      `SELECT original_name FROM photos WHERE gallery_id = ? AND original_name IN (${placeholders})`,
      [gallery.id, ...incomingNames],
    );
    const dupNames = new Set(dupRows.map(r => r.original_name));
    if (dupNames.size > 0) {
      newFiles = incomingFiles.filter(f => !dupNames.has(f.originalname));
      // Remove multer-written files for duplicates — they're not needed
      for (const f of incomingFiles.filter(f => dupNames.has(f.originalname))) {
        try { fs.unlinkSync(f.path); } catch {}
      }
    }
  }

  // Enforce quota only against truly new files
  const [countRows] = await query('SELECT COUNT(*) AS n FROM photos WHERE gallery_id = ?', [gallery.id]);
  const existing = Number(countRows[0].n);

  if (existing + newFiles.length > MAX_PHOTOS_PER_GALLERY) {
    for (const f of newFiles) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(422).json({
      error: `Gallery quota exceeded. Max ${MAX_PHOTOS_PER_GALLERY} photos per gallery (currently ${existing}).`,
    });
  }

  const SUPPORTED_FORMATS = 'JPG, PNG, TIFF, HEIC, HEIF, AVIF';

  const validFiles  = [];
  const rejectedFiles = [];
  for (const f of newFiles) {
    // photoId == the UUID multer assigned as the disk filename (minus extension)
    const ext     = path.extname(f.filename).toLowerCase();
    const photoId = path.basename(f.filename, ext);
    const smDest  = thumbPath(photoId, 'sm');
    const mdDest  = thumbPath(photoId, 'md');
    try {
      await runSharp({ op: 'validate-and-thumbs', srcPath: f.path, smPath: smDest, mdPath: mdDest });
      validFiles.push({ ...f, _photoId: photoId });
    } catch {
      // Do NOT unlink on validation failure — a concurrent upload of the same
      // filename may have already succeeded and written this file; deleting it
      // here would break that upload's prerender job.  Orphaned files from
      // truly-corrupt uploads are cleaned up by the maintenance route.
      rejectedFiles.push({
        name:   f.originalname,
        reason: `Format non reconnu ou fichier corrompu. Formats supportés : ${SUPPORTED_FORMATS}.`,
      });
    }
  }

  // If everything was rejected, return 422 immediately
  if (validFiles.length === 0 && rejectedFiles.length > 0) {
    return res.status(422).json({
      error:    `Fichier(s) rejeté(s) — format non supporté ou corrompu. Formats acceptés : ${SUPPORTED_FORMATS}.`,
      rejected: rejectedFiles,
    });
  }

  const uploaded = [];
  for (const f of validFiles) {
    const photoId = f._photoId;
    const [result] = await query(
      `INSERT INTO photos (id, gallery_id, filename, original_name, size_bytes, status, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'validated', ?)
       ON DUPLICATE KEY UPDATE size_bytes = VALUES(size_bytes), original_name = VALUES(original_name)`,
      [photoId, gallery.id, f.filename, f.originalname, f.size, req.userId]
    );
    // affectedRows === 2 means ON DUPLICATE KEY fired — another concurrent upload already inserted
    // this filename. Clean up the orphan UUID file multer wrote to disk and skip.
    if (result.affectedRows === 2) {
      try { fs.unlinkSync(f.path); } catch {}
      try { fs.unlinkSync(thumbPath(photoId, 'sm')); } catch {}
      try { fs.unlinkSync(thumbPath(photoId, 'md')); } catch {}
      continue;
    }
    // sm thumbnail already generated above — enqueueSm will skip if file exists
    // md thumbnail — low priority queue
    // Phase 4: prerender — very low priority, generates full build variants in background
    enqueueSm(f.path, photoId);
    enqueueMd(f.path, photoId);
    enqueuePrerender(f.path, f.filename);
    extractExif(f.path).then(exif => {
      if (exif && Object.keys(exif).length > 0) {
        query('UPDATE photos SET exif = ? WHERE id = ?', [JSON.stringify(exif), photoId]).catch(() => {});
      }
    }).catch(() => {});

    uploaded.push({ id: photoId, file: f.filename, size: f.size, thumbnail: photoThumbnails(photoId) });
  }

  if (uploaded.length > 0) {
    await query(
      'UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?',
      [Date.now(), req.params.id]
    );
    for (const f of uploaded) {
      try { await audit(req.organizationId, req.userId, 'photo.upload', 'gallery', req.params.id, { filename: f.file }); } catch {}
    }
  }
  res.status(201).json({ uploaded: uploaded.length, files: uploaded, rejected: rejectedFiles });
  } finally {
    uploadFinished();
  }
});

// POST /api/galleries/:id/photos/validate — bulk validate (accept) inbox photos
router.post('/:id/photos/validate', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { photoIds, all } = req.body || {};

  let affected = 0;
  if (all) {
    const [result] = await query(
      `UPDATE photos SET status = 'validated' WHERE gallery_id = ? AND status = 'uploaded'`,
      [gallery.id]
    );
    affected = result.affectedRows;
  } else if (Array.isArray(photoIds) && photoIds.length > 0) {
    affected = await bulkSetPhotoStatus(photoIds, 'validated');
  } else {
    return res.status(400).json({ error: 'Provide photoIds array or all=true' });
  }

  if (affected > 0) {
    await query('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?', [Date.now(), gallery.id]);
  }
  res.json({ ok: true, affected });
});

// POST /api/galleries/:id/photos/reject — bulk reject (delete) inbox photos
router.post('/:id/photos/reject', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { photoIds, all } = req.body || {};

  let toDelete = [];
  if (all) {
    const [rows] = await query(
      `SELECT id, filename FROM photos WHERE gallery_id = ? AND status = 'uploaded'`,
      [gallery.id]
    );
    toDelete = rows;
  } else if (Array.isArray(photoIds) && photoIds.length > 0) {
    const placeholders = photoIds.map(() => '?').join(',');
    const [rows] = await query(
      `SELECT id, filename FROM photos WHERE gallery_id = ? AND id IN (${placeholders})`,
      [gallery.id, ...photoIds]
    );
    toDelete = rows;
  } else {
    return res.status(400).json({ error: 'Provide photoIds array or all=true' });
  }

  for (const p of toDelete) {
    const filePath = path.join(photosDir(gallery.slug), path.basename(p.filename));
    try { fs.unlinkSync(filePath); } catch {}
    await query('DELETE FROM photos WHERE id = ?', [p.id]);
  }

  res.json({ ok: true, rejected: toDelete.length });
});

// DELETE /api/galleries/:id/photos/:filename
router.delete('/:id/photos/:filename', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'delete', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const safe = path.basename(req.params.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const fileSize = fs.statSync(filePath).size;
  fs.unlinkSync(filePath);
  await query('DELETE FROM photos WHERE gallery_id = ? AND filename = ?', [gallery.id, safe]);
  await decrementStorageUsed(req.organizationId, fileSize);
  await query(
    'UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?',
    [Date.now(), req.params.id]
  );
  try { await audit(req.organizationId, req.userId, 'photo.delete', 'gallery', req.params.id, { filename: safe }); } catch {}
  res.json({ ok: true });
});

// PUT /api/galleries/:id/photos/order — save explicit photo order
router.put('/:id/photos/order', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of filenames' });

  const cleanOrder = order.map(f => path.basename(f));

  // Update sort_order in photos table
  for (let i = 0; i < cleanOrder.length; i++) {
    await query(
      'UPDATE photos SET sort_order = ? WHERE gallery_id = ? AND filename = ?',
      [i, gallery.id, cleanOrder[i]]
    );
  }

  // Also persist in galleries.photo_order for legacy engine compatibility
  await query(
    'UPDATE galleries SET photo_order = ?, cover_photo = ?, needs_rebuild = 1, updated_at = ? WHERE id = ?',
    [JSON.stringify(cleanOrder), cleanOrder[0] || null, Date.now(), req.params.id]
  );

  res.json({ ok: true });
});

// POST /api/galleries/:id/photos/upload-done — photographer signals they're done uploading
router.post('/:id/photos/upload-done', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Collect editors/admins to notify
  const galleryEditors = (await listGalleryRoleAssignments(gallery.id)).filter(m => m.role === 'editor');
  const orgEditors     = (await listOrgMembers(req.organizationId))
    .filter(m => ['collaborator', 'admin', 'owner'].includes(m.role));

  const allEmails = [...new Set([
    ...galleryEditors.map(m => m.email),
    ...orgEditors.map(m => m.email),
  ])].filter(Boolean);

  const s = await getSettings(req.organizationId);
  const base = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const galleryUrl = `${base}/admin/#/galleries/${gallery.id}`;
  const uploaderName = req.user.name || req.user.email;

  for (const to of allEmails) {
    sendEmail({
      studioId: req.organizationId,
      to,
      subject: `Photos prêtes à publier — ${gallery.title}`,
      text: `${uploaderName} a terminé d'uploader des photos dans la galerie "${gallery.title}".\n\nVous pouvez maintenant les vérifier et publier la galerie :\n${galleryUrl}\n`,
      html: `<p><strong>${uploaderName}</strong> a terminé d'uploader des photos dans la galerie <strong>${gallery.title}</strong>.</p><p><a href="${galleryUrl}">Ouvrir la galerie pour publier →</a></p>`,
      template: 'upload-done',
    });
  }

  res.json({ ok: true, notified: allEmails.length });
});

// ── Upload links management ────────────────────────────────────────────────────

// GET /api/galleries/:id/upload-links
router.get('/:id/upload-links', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const base  = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const links = (await listUploadLinks(gallery.id)).map(l => ({
    ...l,
    uploadUrl: l.token ? `${base}/upload/${l.token}` : null,
    token: undefined, // strip raw token from response body (URL is sufficient)
  }));
  res.json(links);
});

// POST /api/galleries/:id/upload-links — create new upload link
// Body: { label?, expiresAt?, photographerName?, photographerEmail?, photographerBio? }
// If photographerName is provided, a photographers row is created and linked to the upload link.
router.post('/:id/upload-links', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { label, expiresAt, photographerName, photographerEmail, photographerBio } = req.body || {};
  const link = await createUploadLink(gallery.id, req.userId, { label, expiresAt });

  // If a photographer name was provided, create a photographer record linked to this upload link
  let photographer = null;
  if (photographerName) {
    photographer = await createPhotographer(gallery.id, {
      name:          photographerName,
      email:         photographerEmail || null,
      bio:           photographerBio   || null,
      uploadLinkId:  link.id,
      organizationId: req.organizationId || req.organizationId,
    });
  }

  const s = await getSettings(req.organizationId);
  const base = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const uploadUrl = `${base}/upload/${link.token}`;

  try { await audit(req.organizationId, req.userId, 'upload_link.create', 'gallery', gallery.id, { label, photographerName }); } catch {}
  res.status(201).json({ ...link, uploadUrl, photographer });
});

// DELETE /api/galleries/:id/upload-links/:linkId — revoke upload link
router.delete('/:id/upload-links/:linkId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Verify the link belongs to this gallery
  const [rows] = await query(
    'SELECT id FROM gallery_upload_links WHERE id = ? AND gallery_id = ?',
    [req.params.linkId, gallery.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Upload link not found' });

  await revokeUploadLink(req.params.linkId);
  try { await audit(req.organizationId, req.userId, 'upload_link.revoke', 'gallery', gallery.id, { linkId: req.params.linkId }); } catch {}
  res.json({ ok: true });
});

// ── Photographers CRUD ─────────────────────────────────────────────────────────

// GET /api/galleries/:id/photographers
router.get('/:id/photographers', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  res.json(await listPhotographers(gallery.id));
});

// GET /api/galleries/:id/photographers/active — users with at least one photo attributed in this gallery
router.get('/:id/photographers/active', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const [rows] = await query(
    `SELECT DISTINCT u.id, u.name, u.email, u.is_photographer
     FROM users u
     INNER JOIN photos ph ON ph.photographer_id = u.id
     WHERE ph.gallery_id = ? AND ph.status != 'rejected'
     ORDER BY u.name ASC`,
    [gallery.id]
  );
  res.json(rows);
});

// POST /api/galleries/:id/photographers
router.post('/:id/photographers', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, email, bio } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const pg = await createPhotographer(gallery.id, {
    name, email, bio,
    organizationId: req.organizationId || req.organizationId,
  });
  res.status(201).json(pg);
});

// PATCH /api/galleries/:id/photographers/:pgId
router.patch('/:id/photographers/:pgId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const pg = await getPhotographer(req.params.pgId);
  if (!pg || pg.gallery_id !== gallery.id) return res.status(404).json({ error: 'Photographer not found' });

  const { name, email, bio } = req.body || {};
  const updated = await updatePhotographer(pg.id, { name, email, bio });
  res.json(updated);
});

// DELETE /api/galleries/:id/photographers/:pgId
router.delete('/:id/photographers/:pgId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const pg = await getPhotographer(req.params.pgId);
  if (!pg || pg.gallery_id !== gallery.id) return res.status(404).json({ error: 'Photographer not found' });

  await deletePhotographer(pg.id);
  res.json({ ok: true });
});

// ── Manual photo attribution ───────────────────────────────────────────────────

// PATCH /api/galleries/:id/photos/bulk-attribute — bulk set photographer on multiple photos
// NOTE: must be declared before /:id/photos/:photoId to avoid the wildcard swallowing it
router.patch('/:id/photos/bulk-attribute', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { photoIds, photographerId } = req.body || {};
  if (!Array.isArray(photoIds) || !photoIds.length) {
    return res.status(400).json({ error: 'photoIds array is required' });
  }
  if (photographerId) {
    const [urows] = await query('SELECT id FROM users WHERE id = ?', [photographerId]);
    if (!urows[0]) return res.status(400).json({ error: 'User not found' });
  }

  const count = await bulkSetPhotoPhotographer(photoIds, photographerId ?? null);
  res.json({ ok: true, updated: count });
});

// PATCH /api/galleries/:id/photos/:photoId — manually set photographer_id on a single photo
router.patch('/:id/photos/:photoId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { photographerId } = req.body || {};
  // photographerId = null clears attribution
  if (photographerId !== undefined && photographerId !== null) {
    const [urows] = await query('SELECT id FROM users WHERE id = ?', [photographerId]);
    if (!urows[0]) return res.status(400).json({ error: 'User not found' });
  }

  await setPhotoPhotographer(req.params.photoId, photographerId ?? null);
  res.json({ ok: true });
});

export default router;
