// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/personalUpload.js
// POST /api/upload/token — upload photos via personal Bearer token (curl / scripts).
//
// Usage:
//   curl -X POST https://example.com/api/upload/token \
//     -H "Authorization: Bearer gp_<token>" \
//     -F "gallery_id=<uuid>" \
//     -F "photos=@photo1.jpg" \
//     -F "photos=@photo2.jpg"

import { Router }     from 'express';
import multer         from 'multer';
import path           from 'path';
import fs             from 'fs';
import { randomUUID } from 'node:crypto';
import { query }      from '../db/database.js';
import { validateToken, tokenCoversGallery } from '../services/personalTokenService.js';
import { generateThumbnails, photoThumbnails } from '../services/thumbnailService.js';
import { SRC_ROOT } from '../../../../packages/engine/src/fs.js';

const router = Router();

const ALLOWED_EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif','.webp']);
const MAX_FILE_SIZE  = 200 * 1024 * 1024; // 200 MB
const MAX_FILES      = 50;
const MAX_PER_GALLERY = 500;

function photosDir(slug) {
  return path.join(SRC_ROOT, slug, 'photos');
}

/** Extract Bearer token from Authorization header */
function extractBearer(req) {
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Bearer\s+(gp_\S+)$/i);
  return match ? match[1] : null;
}

// Multer — destination resolved after token validation (middleware runs in sequence)
const storage = multer.diskStorage({
  async destination(req, file, cb) {
    // req._personalUploadGallery is set by the auth middleware below
    const gallery = req._personalUploadGallery;
    if (!gallery) return cb(new Error('Gallery not resolved'));
    const dir = photosDir(gallery.slug);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(req, file, cb) {
    if (ALLOWED_EXTS.has(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.originalname}`));
  },
});

/** Middleware: validate Bearer token and resolve gallery */
async function authAndResolve(req, res, next) {
  const raw = extractBearer(req);
  if (!raw) return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer gp_<token>' });

  const token = await validateToken(raw).catch(() => null);
  if (!token) return res.status(401).json({ error: 'Invalid, expired, or revoked token' });

  // gallery_id can come from form field (multipart) or query string
  // For multipart, it will be available after multer runs — handle in two passes.
  // We use a pre-parse approach: read gallery_id from query string or JSON body.
  // For multipart/form-data, we read it from the URL query: ?gallery_id=xxx
  const galleryId = req.query.gallery_id || req.body?.gallery_id;
  if (!galleryId) {
    return res.status(400).json({
      error: 'gallery_id is required (pass as query param: ?gallery_id=<uuid> or form field)',
    });
  }

  const covers = await tokenCoversGallery(token, galleryId).catch(() => false);
  if (!covers) return res.status(403).json({ error: 'Token scope does not cover this gallery' });

  // Load gallery record
  const [rows] = await query(
    'SELECT id, slug, organization_id, project_id FROM galleries WHERE id = ? LIMIT 1',
    [galleryId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Gallery not found' });

  req._personalToken   = token;
  req._personalUploadGallery = rows[0];
  next();
}

// POST /api/upload/token?gallery_id=<uuid>  (multipart/form-data, field name: photos)
router.post('/', authAndResolve, upload.array('photos', MAX_FILES), async (req, res) => {
  const gallery = req._personalUploadGallery;
  const token   = req._personalToken;

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files received. Field name must be "photos".' });
  }

  // Enforce quota
  const [countRows] = await query(
    'SELECT COUNT(*) AS n FROM photos WHERE gallery_id = ?',
    [gallery.id]
  );
  const existing = Number(countRows[0].n);
  if (existing + req.files.length > MAX_PER_GALLERY) {
    for (const f of req.files) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(422).json({
      error: `Gallery quota exceeded. Max ${MAX_PER_GALLERY} photos (currently ${existing}).`,
    });
  }

  const uploaded = [];
  for (const f of req.files) {
    const photoId = randomUUID();
    await query(
      `INSERT INTO photos
         (id, gallery_id, filename, original_name, size_bytes, status, uploaded_by_user_id, personal_token_id)
       VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?)
       ON DUPLICATE KEY UPDATE
         size_bytes = VALUES(size_bytes),
         original_name = VALUES(original_name),
         personal_token_id = VALUES(personal_token_id)`,
      [photoId, gallery.id, f.filename, f.originalname, f.size, token.userId, token.id]
    );

    // Thumbnails — failure does not abort
    try {
      await generateThumbnails(f.path, photoId);
    } catch (err) {
      console.error(`[personal-upload] thumbnail failed for ${photoId}: ${err.message}`);
    }

    uploaded.push({
      id:        photoId,
      file:      f.filename,
      size:      f.size,
      thumbnail: photoThumbnails(photoId),
    });
  }

  if (uploaded.length > 0) {
    await query(
      'UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?',
      [Date.now(), gallery.id]
    );
  }

  res.status(201).json({
    uploaded:  uploaded.length,
    galleryId: gallery.id,
    files:     uploaded,
  });
});

export default router;
