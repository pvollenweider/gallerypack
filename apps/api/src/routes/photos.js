// apps/api/src/routes/photos.js — photo upload, list, delete, reorder
import { Router }   from 'express';
import multer       from 'multer';
import path         from 'path';
import fs           from 'fs';
import { getDb }    from '../db/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { ROOT }         from '../../../../packages/engine/src/fs.js';
import { createStorage } from '../../../../packages/shared/src/storage/index.js';

// Storage adapter — resolved once at startup from env
// Provides a uniform interface whether files live on disk or in S3.
export const fileStorage = createStorage();

const router = Router();
router.use(requireAdmin);

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

// GET /api/galleries/:id/photos
router.get('/:id/photos', async (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;

  const dir = photosDir(gallery.slug);
  if (!fs.existsSync(dir)) return res.json([]);

  const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
  const files = fs.readdirSync(dir)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()))
    .sort()
    .map(f => {
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

// POST /api/galleries/:id/photos — upload one or more photos
router.post('/:id/photos', upload.array('photos', 200), (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;
  const uploaded = (req.files || []).map(f => ({ file: f.filename, size: f.size }));
  res.status(201).json({ uploaded: uploaded.length, files: uploaded });
});

// DELETE /api/galleries/:id/photos/:filename
router.delete('/:id/photos/:filename', (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;

  const safe = path.basename(req.params.filename);
  const filePath = path.join(photosDir(gallery.slug), safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// PUT /api/galleries/:id/photos/order — reorder photos by providing an ordered filename array
router.put('/:id/photos/order', (req, res) => {
  const gallery = ensureGalleryBelongsToStudio(req, res);
  if (!gallery) return;

  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of filenames' });

  const dir = photosDir(gallery.slug);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Photos directory not found' });

  // Rename files with a temporary numeric prefix so order is encoded in filename sort
  const tmp = path.join(dir, '.reorder-tmp');
  fs.mkdirSync(tmp, { recursive: true });

  try {
    for (let i = 0; i < order.length; i++) {
      const safe = path.basename(order[i]);
      const src  = path.join(dir, safe);
      if (!fs.existsSync(src)) continue;
      const tmpName = String(i + 1).padStart(6, '0') + '_' + safe;
      fs.renameSync(src, path.join(tmp, tmpName));
    }
    for (const f of fs.readdirSync(tmp)) {
      const originalName = f.replace(/^\d+_/, '');
      fs.renameSync(path.join(tmp, f), path.join(dir, originalName));
    }
    fs.rmdirSync(tmp);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  // Update cover_photo to first in new order if it was position 0
  getDb().prepare('UPDATE galleries SET cover_photo = ?, updated_at = ? WHERE id = ?')
    .run(order[0] ? path.basename(order[0]) : null, Date.now(), req.params.id);

  res.json({ ok: true });
});

export default router;
