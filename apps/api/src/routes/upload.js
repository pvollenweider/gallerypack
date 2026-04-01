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
import { randomUUID, createHash } from 'crypto';
import { createReadStream }       from 'fs';
import { query }      from '../db/database.js';
import { getUploadLinkByToken, getPhotographerByUploadLink } from '../db/helpers.js';
import { emit, EVENTS } from '../services/events.js';
import { SRC_ROOT }       from '../../../../packages/engine/src/fs.js';
import { getPublicTusServer } from '../services/tusService.js';
import { generateThumbnails, photoThumbnails, thumbPath } from '../services/thumbnailService.js';
import { extractExif } from '../../../../packages/engine/src/exif.js';
import { runSharp } from '../services/sharpProcess.js';

const router = Router();

function photosDir(slug) {
  return path.join(SRC_ROOT, slug, 'photos');
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('end',  ()    => resolve(hash.digest('hex')))
      .on('error', reject);
  });
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
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
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
// Browsers are redirected to the admin SPA; API clients receive JSON directly.
router.get('/:token', async (req, res) => {
  if (req.accepts(['json', 'html']) === 'html') {
    return res.redirect(302, `/admin/upload/${req.params.token}`);
  }
  const link = await getUploadLinkByToken(req.params.token);
  if (!link) return res.status(404).json({ error: 'Invalid or expired upload link' });

  // Include photographer name if one is linked to this upload link
  const photographer = await getPhotographerByUploadLink(link.id);

  res.json({
    galleryId:      link.gallery_id,
    galleryTitle:   link.gallery_title,
    label:          link.label,
    expiresAt:      link.expires_at,
    photographerName: photographer?.name ?? null,
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

  // Resolve linked photographer for auto-attribution
  const photographer = await getPhotographerByUploadLink(link.id);

  // Content-hash dedup: skip files whose content already exists in this gallery
  const incomingFiles = req.files || [];
  const withHashes = await Promise.all(
    incomingFiles.map(async f => ({ ...f, _contentHash: await hashFile(f.path) }))
  );
  let newFiles = withHashes;
  if (withHashes.length > 0) {
    const hashes       = withHashes.map(f => f._contentHash);
    const placeholders = hashes.map(() => '?').join(',');
    const [dupRows]    = await query(
      `SELECT content_hash FROM photos WHERE gallery_id = ? AND content_hash IN (${placeholders})`,
      [link.gallery_id, ...hashes],
    );
    const dupHashes = new Set(dupRows.map(r => r.content_hash));
    if (dupHashes.size > 0) {
      newFiles = withHashes.filter(f => !dupHashes.has(f._contentHash));
      for (const f of withHashes.filter(f => dupHashes.has(f._contentHash))) {
        try { fs.unlinkSync(f.path); } catch {}
      }
    }
  }

  // Enforce quota against truly new files only
  const [countRows] = await query('SELECT COUNT(*) AS n FROM photos WHERE gallery_id = ?', [link.gallery_id]);
  const existing = Number(countRows[0].n);
  if (existing + newFiles.length > MAX_PHOTOS_PER_GALLERY) {
    for (const f of newFiles) { try { fs.unlinkSync(f.path); } catch {} }
    return res.status(422).json({
      error: `Gallery quota exceeded. Max ${MAX_PHOTOS_PER_GALLERY} photos (currently ${existing}).`,
    });
  }

  const validFiles    = [];
  const rejectedFiles = [];
  for (const f of newFiles) {
    const ext     = path.extname(f.filename).toLowerCase();
    const photoId = path.basename(f.filename, ext);
    const smDest  = thumbPath(photoId, 'sm');
    const mdDest  = thumbPath(photoId, 'md');
    try {
      await runSharp({ op: 'validate-and-thumbs', srcPath: f.path, smPath: smDest, mdPath: mdDest });
      validFiles.push({ ...f, _photoId: photoId, _contentHash: f._contentHash });
    } catch {
      rejectedFiles.push(f.originalname || f.filename);
    }
  }
  if (rejectedFiles.length > 0) {
    console.warn(`[upload-token] rejected ${rejectedFiles.length} undecodable file(s): ${rejectedFiles.join(', ')}`);
  }

  const uploaded = [];
  for (const f of validFiles) {
    const photoId = f._photoId;
    await query(
      `INSERT INTO photos (id, gallery_id, filename, original_name, content_hash, size_bytes, status, upload_link_id, photographer_id)
       VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)
       ON DUPLICATE KEY UPDATE
         size_bytes = VALUES(size_bytes),
         original_name = VALUES(original_name),
         photographer_id = VALUES(photographer_id)`,
      [photoId, link.gallery_id, f.filename, f.originalname, f._contentHash, f.size, link.id, photographer?.id ?? null]
    );
    // sm already done above; generate md thumbnail
    try {
      await generateThumbnails(f.path, photoId);
    } catch (err) {
      console.error(`[upload-token] thumbnail generation failed for ${photoId}: ${err.message}`);
    }
    // Extract EXIF and persist to DB — fire-and-forget, does not block response
    extractExif(f.path).then(exif => {
      if (exif && Object.keys(exif).length > 0) {
        query('UPDATE photos SET exif = ? WHERE id = ?', [JSON.stringify(exif), photoId]).catch(() => {});
      }
    }).catch(() => {});

    uploaded.push({ id: photoId, file: f.filename, size: f.size, photographerId: photographer?.id ?? null, thumbnail: photoThumbnails(photoId) });
  }

  if (uploaded.length > 0) {
    await query(
      'UPDATE galleries SET needs_rebuild = 1, updated_at = ? WHERE id = ?',
      [Date.now(), link.gallery_id]
    );
    // Emit business event so editors get notified
    const orgId = link.organization_id;
    emit(EVENTS.PHOTO_UPLOADED, {
      studioId:        orgId,
      galleryId:       link.gallery_id,
      galleryTitle:    link.gallery_title,
      uploadLinkLabel: link.label,
      photographerName: photographer?.name ?? null,
      photoCount:      uploaded.length,
    });
  }

  res.status(201).json({ uploaded: uploaded.length, files: uploaded });
});

// ── tus resumable upload endpoint for token-based (photographer) uploads ───────
// /upload/:token/tus  and  /upload/:token/tus/:uploadId
// Token is passed in via URL — attached to req before handing off to tus server.

const TUS_METHODS = ['OPTIONS', 'HEAD', 'POST', 'PATCH', 'DELETE'];

function handlePublicTus(req, res) {
  if (!TUS_METHODS.includes(req.method)) {
    return res.status(405).set('Allow', TUS_METHODS.join(', ')).end();
  }
  req._uploadToken = req.params.token;
  const server = getPublicTusServer();
  req.url = req.originalUrl.replace(`/upload/${req.params.token}/tus`, '') || '/';
  server.handle(req, res);
}

router.all('/:token/tus',           handlePublicTus);
router.all('/:token/tus/:uploadId', handlePublicTus);

export default router;
