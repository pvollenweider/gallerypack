// apps/api/src/routes/photos.js — photo upload, list, delete, reorder
import { Router }   from 'express';
import multer       from 'multer';
import path         from 'path';
import fs           from 'fs';
import { getDb }    from '../db/database.js';
import { getGalleryRole, audit } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import { ROOT }         from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';

// Storage adapter — resolved once at startup from env
// Provides a uniform interface whether files live on disk or in S3.
export const fileStorage = createStorage();

const router = Router();
router.use(requireAuth);

// Source photos path: src/<slug>/photos/ (local) or equivalent prefix (S3)
function photosPrefix(slug) {
  return path.join('src', slug, 'photos');
}

// Absolute path on disk (only used for multer + fs ops — local driver only)
function photosDir(slug) {
  return path.join(ROOT, 'src', slug, 'photos');
}

function ensureGalleryBelongsToStudio(req, res) {
  const row = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!row) { res.status(404).json({ error: 'Gallery not found' }); return null; }
  return row;
}

// Multer: store files in src/<slug>/photos/
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const gallery = getDb()
      .prepare('SELECT slug FROM galleries WHERE id = ? AND studio_id = ?')
      .get(req.params.id, req.studioId);
    if (!gallery) return cb(new Error('Gallery not found'));
    const dir = photosDir(gallery.slug);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
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
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const safe     = path.basename(req.params.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  try {
    const { default: sharp } = await import('sharp');
    const buf = await sharp(filePath)
      .rotate()               // auto-orient via EXIF
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
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const dir = photosDir(gallery.slug);
  if (!fs.existsSync(dir)) return res.json([]);

  const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
  const allFiles = fs.readdirSync(dir)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()));

  // Apply saved order from photo_order.json
  const orderFile = path.join(ROOT, 'src', gallery.slug, 'photo_order.json');
  let savedOrder = null;
  try {
    if (fs.existsSync(orderFile)) savedOrder = JSON.parse(fs.readFileSync(orderFile, 'utf8'));
  } catch {}

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
  // Use storage adapter so this works for both local and S3 deployments.
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
router.post('/:id/photos', upload.array('photos', 200), (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'upload', 'photo', { studioRole: req.studioRole, galleryRole })) {
    // Clean up any already-uploaded files
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
    // Delete just-uploaded files to avoid leaving orphans
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(422).json({
      error: `Gallery quota exceeded. Max ${MAX_PHOTOS_PER_GALLERY} photos per gallery (currently ${existing}).`,
    });
  }

  const uploaded = (req.files || []).map(f => ({ file: f.filename, size: f.size }));
  if (uploaded.length > 0) {
    getDb().prepare('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?')
      .run(Date.now(), req.params.id);
    for (const f of uploaded) {
      try { audit(req.studioId, req.userId, 'photo.upload', 'gallery', req.params.id, { filename: f.file }); } catch {}
    }
  }
  res.status(201).json({ uploaded: uploaded.length, files: uploaded });
});

// DELETE /api/galleries/:id/photos/:filename
router.delete('/:id/photos/:filename', (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'delete', 'photo', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const safe = path.basename(req.params.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  fs.unlinkSync(filePath);
  getDb().prepare('UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?')
    .run(Date.now(), req.params.id);
  try { audit(req.studioId, req.userId, 'photo.delete', 'gallery', req.params.id, { filename: safe }); } catch {}
  res.json({ ok: true });
});

// PUT /api/galleries/:id/photos/order — save explicit photo order
router.put('/:id/photos/order', (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const galleryRole = getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'write', 'gallery', { studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of filenames' });

  // Persist the order as photo_order.json in the gallery source directory
  const galleryDir = path.join(ROOT, 'src', gallery.slug);
  fs.mkdirSync(galleryDir, { recursive: true });
  const orderFile = path.join(galleryDir, 'photo_order.json');
  fs.writeFileSync(orderFile, JSON.stringify(order.map(f => path.basename(f))));

  // Mark gallery as needing rebuild and update cover_photo to first photo
  getDb().prepare('UPDATE galleries SET cover_photo = ?, needs_rebuild = 1, updated_at = ? WHERE id = ?')
    .run(order[0] ? path.basename(order[0]) : null, Date.now(), req.params.id);

  res.json({ ok: true });
});

export default router;
