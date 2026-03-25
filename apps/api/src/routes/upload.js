// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/upload.js — unauthenticated photographer upload via token
import { Router }     from 'express';
import multer         from 'multer';
import path           from 'path';
import fs             from 'fs';
import { randomUUID } from 'crypto';
import { query }      from '../db/database.js';
import { getUploadLinkByToken } from '../db/helpers.js';
import { emit, EVENTS } from '../services/events.js';
import { ROOT }       from '../../../../packages/engine/src/fs.js';

const router = Router();

function photosDir(slug) {
  return path.join(ROOT, 'src', slug, 'photos');
}

// Multer for token-based uploads — destination resolved after token validation
const storage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      // uploadLink is attached to req by the GET /upload/:token route chain below,
      // but for POST we validate inline. Re-validate here as destination is called first.
      const link = await getUploadLinkByToken(req.params.token);
      if (!link) return cb(new Error('Invalid or expired upload link'));
      const dir = photosDir(link.gallery_slug);
      fs.mkdirSync(dir, { recursive: true });
      req._uploadLink = link; // cache for later use in the handler
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
    if (allowed.has(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.originalname}`));
  },
});

// GET /upload/:token — gallery info for the upload page (no auth required)
router.get('/:token', async (req, res) => {
  const link = await getUploadLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired upload link' });

  res.json({
    galleryId:    link.gallery_id,
    galleryTitle: link.gallery_title,
    label:        link.label,
    expiresAt:    link.expires_at,
  });
});

const MAX_PHOTOS_PER_GALLERY = 500;

// POST /upload/:token/photos — upload photos via link token (no auth required)
router.post('/:token/photos', upload.array('photos', 50), async (req, res) => {
  // _uploadLink is set by multer storage.destination; fall back to re-validating
  const link = req._uploadLink || await getUploadLinkByToken(req.params.token);
  if (!link) {
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(401).json({ error: 'Invalid or expired upload link' });
  }

  // Enforce quota
  const [countRows] = await query('SELECT COUNT(*) AS n FROM photos WHERE gallery_id = ?', [link.gallery_id]);
  const existing = Number(countRows[0].n);
  if (existing + (req.files?.length || 0) > MAX_PHOTOS_PER_GALLERY) {
    for (const f of req.files || []) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(422).json({
      error: `Gallery quota exceeded. Max ${MAX_PHOTOS_PER_GALLERY} photos (currently ${existing}).`,
    });
  }

  const uploaded = [];
  for (const f of req.files || []) {
    const photoId = randomUUID();
    await query(
      `INSERT INTO photos (id, gallery_id, filename, original_name, size_bytes, status, upload_link_id)
       VALUES (?, ?, ?, ?, ?, 'uploaded', ?)
       ON DUPLICATE KEY UPDATE size_bytes = VALUES(size_bytes), original_name = VALUES(original_name)`,
      [photoId, link.gallery_id, f.filename, f.originalname, f.size, link.id]
    );
    uploaded.push({ id: photoId, file: f.filename, size: f.size });
  }

  if (uploaded.length > 0) {
    await query(
      'UPDATE galleries SET updated_at = ? WHERE id = ?',
      [Date.now(), link.gallery_id]
    );
    // Emit business event so editors get notified
    const orgId = link.organization_id || link.studio_id;
    emit(EVENTS.PHOTO_UPLOADED, {
      studioId:        orgId,
      galleryId:       link.gallery_id,
      galleryTitle:    link.gallery_title,
      uploadLinkLabel: link.label,
      photoCount:      uploaded.length,
    });
  }

  res.status(201).json({ uploaded: uploaded.length, files: uploaded });
});

export default router;
