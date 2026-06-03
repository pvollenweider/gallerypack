// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/videos.js — video upload, list, update, delete, reorder, retranscode
import { Router }     from 'express';
import multer         from 'multer';
import path           from 'path';
import fs             from 'fs';
import { randomUUID } from 'crypto';
import { query }      from '../db/database.js';
import { getGalleryRole, genId } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { can }         from '../authorization/index.js';
import { prerenderProject } from '../services/prerender.js';

// ── Public router (no auth) — mounted separately at /api/video-covers ───────
export const publicVideoRouter = Router();
publicVideoRouter.get('/:id', async (req, res) => {
  const [rows] = await query('SELECT id FROM galleries WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).end();
  const coverPath = path.resolve(VIDEO_STORAGE_PATH, req.params.id, 'cover.jpg');
  if (!fs.existsSync(coverPath)) return res.status(404).end();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.basename(coverPath), { root: path.dirname(coverPath) });
});

const router = Router();
router.use(requireAuth);

const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || 'storage/videos';
const VIDEO_MAX_UPLOAD_BYTES = (Number(process.env.VIDEO_MAX_UPLOAD_MB) || 10000) * 1024 * 1024;

const ALLOWED_EXTS = new Set(['.mp4', '.mov', '.mkv']);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureGalleryBelongsToOrg(req, res) {
  const isSuperadmin = req.platformRole === 'superadmin';
  const [rows] = isSuperadmin
    ? await query('SELECT * FROM galleries WHERE id = ?', [req.params.id])
    : await query('SELECT * FROM galleries WHERE id = ? AND organization_id = ?', [req.params.id, req.organizationId]);
  if (!rows[0]) { res.status(404).json({ error: 'Gallery not found' }); return null; }
  return rows[0];
}

/** Slugify a string: lowercase, replace non-alphanumeric with hyphens, collapse runs */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'video';
}

/** Ensure slug is unique within the gallery, appending -2, -3, … as needed.
 *  Excludes `excludeId` row (for updates where the video already occupies its own slug). */
async function uniqueSlug(galleryId, baseSlug, excludeId = null) {
  let candidate = baseSlug;
  let n = 1;
  for (;;) {
    const [rows] = excludeId
      ? await query('SELECT id FROM videos WHERE gallery_id = ? AND slug = ? AND id != ? LIMIT 1', [galleryId, candidate, excludeId])
      : await query('SELECT id FROM videos WHERE gallery_id = ? AND slug = ? LIMIT 1', [galleryId, candidate]);
    if (!rows[0]) return candidate;
    n++;
    candidate = `${baseSlug}-${n}`;
  }
}

/** Safe video directory path for a gallery */
function videoDir(galleryId) {
  // Sanitize: only allow alphanumeric, hyphens, underscores (UUID format)
  if (!/^[a-zA-Z0-9_-]+$/.test(galleryId)) {
    throw new Error('Invalid gallery ID');
  }
  return path.resolve(process.cwd(), VIDEO_STORAGE_PATH, galleryId);
}

// ── Multer storage ────────────────────────────────────────────────────────────
// We use a two-step approach: multer stores to a temp name, then the handler
// moves it to the final {videoId}{ext} path after we have an ID.
const videoStorage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      const isSuperadmin = req.platformRole === 'superadmin';
      const [rows] = isSuperadmin
        ? await query('SELECT id FROM galleries WHERE id = ?', [req.params.id])
        : await query('SELECT id FROM galleries WHERE id = ? AND organization_id = ?', [req.params.id, req.organizationId]);
      if (!rows[0]) return cb(new Error('Gallery not found'));
      const dir = videoDir(req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    // Temporary name — handler renames to {videoId}{ext}
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `tmp_${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: videoStorage,
  limits: { fileSize: VIDEO_MAX_UPLOAD_BYTES },
  fileFilter(req, file, cb) {
    if (ALLOWED_EXTS.has(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error(`Unsupported video format. Accepted: ${[...ALLOWED_EXTS].join(', ')}`));
  },
});

// ── Public video row shape (omit internal paths) ──────────────────────────────
function publicVideo(v) {
  const { original_path: _op, hls_path: _hp, ...rest } = v;
  return rest;
}

// ── POST /:id/videos — upload a video ────────────────────────────────────────
router.post('/:id/videos', (req, res, next) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      const statusCode = err.message === 'Gallery not found' ? 404 : 400;
      const errorMsg = err.message === 'Gallery not found' ? 'Gallery not found' : 'Invalid file or request';
      return res.status(statusCode).json({ error: errorMsg });
    }
    next();
  });
}, async (req, res) => {
  try {
    const gallery = await ensureGalleryBelongsToOrg(req, res);
    if (!gallery) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return;
    }

    const galleryRole = await getGalleryRole(req.userId, gallery.id);
    if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided (field name: video)' });
    }

    const videoId  = genId();
    const ext      = path.extname(req.file.originalname).toLowerCase();
    const finalDir = videoDir(gallery.id);
    const finalName = `${videoId}${ext}`;
    const finalPath = path.join(finalDir, finalName);

    // Rename temp file to final destination
    fs.renameSync(req.file.path, finalPath);

    // Build slug from title or filename
    const rawTitle = (req.body?.title || '').trim();
    const titleForSlug = rawTitle || path.basename(req.file.originalname, ext);
    const base = slugify(titleForSlug);
    const slug = await uniqueSlug(gallery.id, base);

    // Max sort_order
    const [[maxRow]] = await query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM videos WHERE gallery_id = ?',
      [gallery.id]
    );

    await query(
      `INSERT INTO videos
         (id, gallery_id, title, slug, original_path, hls_path, transcode_mode, source_codec,
          status, error_message, duration_sec, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'auto', NULL, 'pending', NULL, NULL, ?, NOW(), NOW())`,
      [videoId, gallery.id, rawTitle || path.basename(req.file.originalname, ext), slug,
       finalPath, maxRow.next_order]
    );

    const [[video]] = await query('SELECT * FROM videos WHERE id = ?', [videoId]);
    return res.status(201).json(publicVideo(video));
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    console.error('Video upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /:id/videos/stats — admin stats (per-video + per-token) ───────────────
router.get('/:id/videos/stats', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [videoStats] = await query(`
    SELECT v.id, v.title, v.slug, v.duration_sec,
      COUNT(CASE WHEN e.event_type = 'play' THEN 1 END) AS total_plays,
      COALESCE(MAX(e.position_sec), 0) AS max_position_reached
    FROM videos v
    LEFT JOIN video_view_events e ON e.video_id = v.id
    WHERE v.gallery_id = ?
    GROUP BY v.id ORDER BY v.sort_order ASC
  `, [gallery.id]);

  const [tokenStats] = await query(`
    SELECT vt.id AS token_id, vt.label,
      COUNT(CASE WHEN e.event_type = 'play' THEN 1 END) AS session_count,
      COALESCE(MAX(e.position_sec), 0) AS max_position_reached,
      MAX(e.created_at) AS last_view_at
    FROM viewer_tokens vt
    LEFT JOIN video_view_events e ON e.token_id = vt.id
    WHERE vt.scope_type = 'gallery' AND vt.scope_id = ? AND vt.revoked_at IS NULL
    GROUP BY vt.id ORDER BY MAX(e.created_at) IS NULL, MAX(e.created_at) DESC
  `, [gallery.id]);

  res.json({
    videos: videoStats,
    tokens: tokenStats,
    disclaimer: "Estimation basée sur les liens d'accès, non nominative."
  });
});

// ── GET /:id/videos — list videos ─────────────────────────────────────────────
router.get('/:id/videos', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [rows] = await query(
    'SELECT * FROM videos WHERE gallery_id = ? ORDER BY sort_order ASC',
    [gallery.id]
  );
  res.json(rows.map(publicVideo));
});

// ── PATCH /:id/videos/reorder — update sort_order ────────────────────────────
// NOTE: must be declared before /:id/videos/:videoId to avoid the wildcard swallowing it
router.patch('/:id/videos/reorder', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { order } = req.body || {};
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of video IDs' });
  }

  // Batch update: UPDATE videos SET sort_order = CASE id WHEN ? THEN 0 WHEN ? THEN 1 ... END
  const cases = order.map(() => 'WHEN ? THEN ?').join(' ');
  const caseVals = order.flatMap((id, i) => [id, i]);
  const inPlaceholders = order.map(() => '?').join(', ');

  await query(
    `UPDATE videos SET sort_order = CASE id ${cases} END, updated_at = NOW() WHERE gallery_id = ? AND id IN (${inPlaceholders})`,
    [...caseVals, gallery.id, ...order]
  );

  res.json({ ok: true });
});

// ── PATCH /:id/videos/:videoId — update title / transcode_mode ───────────────
router.patch('/:id/videos/:videoId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [[video]] = await query(
    'SELECT * FROM videos WHERE id = ? AND gallery_id = ?',
    [req.params.videoId, gallery.id]
  );
  if (!video) return res.status(404).json({ error: 'Video not found' });

  const { title, transcode_mode } = req.body || {};

  const updates = [];
  const params  = [];

  if (title !== undefined) {
    const newTitle = String(title).trim();
    updates.push('title = ?');
    params.push(newTitle);

    // Regenerate slug if title changed
    if (newTitle !== video.title) {
      const base = slugify(newTitle || video.slug);
      const newSlug = await uniqueSlug(gallery.id, base, video.id);
      updates.push('slug = ?');
      params.push(newSlug);
    }
  }

  if (transcode_mode !== undefined) {
    const allowed = new Set(['auto', 'force_abr', 'creator_1080p', 'creator_720p']);
    if (!allowed.has(transcode_mode)) {
      return res.status(400).json({ error: "transcode_mode must be 'auto', 'force_abr', 'creator_1080p' or 'creator_720p'" });
    }
    updates.push('transcode_mode = ?');
    params.push(transcode_mode);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.push('updated_at = NOW()');
  params.push(req.params.videoId, gallery.id);

  await query(`UPDATE videos SET ${updates.join(', ')} WHERE id = ? AND gallery_id = ?`, params);

  const [[updated]] = await query('SELECT * FROM videos WHERE id = ? AND gallery_id = ?', [req.params.videoId, gallery.id]);
  res.json(publicVideo(updated));
});

// ── DELETE /:id/videos/:videoId — delete a video ─────────────────────────────
router.delete('/:id/videos/:videoId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [[video]] = await query(
    'SELECT * FROM videos WHERE id = ? AND gallery_id = ?',
    [req.params.videoId, gallery.id]
  );
  if (!video) return res.status(404).json({ error: 'Video not found' });

  // Delete DB row first (so even if FS cleanup fails we don't leave an orphaned row)
  await query('DELETE FROM videos WHERE id = ?', [video.id]);

  // Delete original file
  if (video.original_path) {
    try { fs.unlinkSync(video.original_path); } catch {}
  }

  // Delete entire HLS directory (hls_path points to the directory or a .m3u8 file)
  if (video.hls_path) {
    try {
      const hlsDir = fs.statSync(video.hls_path).isDirectory()
        ? video.hls_path
        : path.dirname(video.hls_path);
      fs.rmSync(hlsDir, { recursive: true, force: true });
    } catch {}
  }

  res.json({ ok: true });
});

// ── POST /:id/videos/:videoId/retranscode — re-queue a failed/cancelled video ─
router.post('/:id/videos/:videoId/retranscode', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [[video]] = await query(
    'SELECT * FROM videos WHERE id = ? AND gallery_id = ?',
    [req.params.videoId, gallery.id]
  );
  if (!video) return res.status(404).json({ error: 'Video not found' });

  await query(
    "UPDATE videos SET status = 'pending', error_message = NULL, hls_path = NULL, updated_at = NOW() WHERE id = ? AND gallery_id = ?",
    [video.id, gallery.id]
  );

  const [[updated]] = await query('SELECT * FROM videos WHERE id = ? AND gallery_id = ?', [video.id, gallery.id]);
  res.json(publicVideo(updated));
});

// ── GET /:id/access-requests — list enrollment requests ──────────────────────
router.get('/:id/access-requests', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;

  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'read', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [rows] = await query(
    'SELECT id, email, status, created_at, confirmed_at FROM access_requests WHERE gallery_id = ? ORDER BY created_at DESC',
    [gallery.id]
  );
  res.json(rows);
});

// ── DELETE /:id/access-requests/:requestId ────────────────────────────────────
router.delete('/:id/access-requests/:requestId', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const [rows] = await query(
    'SELECT id, token_id FROM access_requests WHERE id = ? AND gallery_id = ?',
    [req.params.requestId, gallery.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  // Revoke associated viewer token if any
  if (rows[0].token_id) {
    await query('UPDATE viewer_tokens SET revoked_at = NOW() WHERE id = ?', [rows[0].token_id]);
  }
  await query('DELETE FROM access_requests WHERE id = ?', [req.params.requestId]);
  res.json({ ok: true });
});

// ── GET /:id/videos/:videoId/poster — serve per-video poster (authenticated) ─────────
router.get('/:id/videos/:videoId/poster', async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const posterPath = path.resolve(VIDEO_STORAGE_PATH, gallery.id, `poster_${req.params.videoId}.jpg`);
  if (!fs.existsSync(posterPath)) return res.status(404).end();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.basename(posterPath), { root: path.dirname(posterPath) });
});


// ── POST /:id/video-cover — upload custom cover thumbnail ────────────────────
const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.resolve(VIDEO_STORAGE_PATH, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, _file, cb) => cb(null, 'cover_upload_tmp.jpg'),
  }),
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Image JPEG/PNG/WebP only'), ok);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/:id/video-cover', coverUpload.single('cover'), async (req, res) => {
  const gallery = await ensureGalleryBelongsToOrg(req, res);
  if (!gallery) return;
  const galleryRole = await getGalleryRole(req.userId, gallery.id);
  if (!can(req.user, 'edit', 'gallery', { gallery, studioRole: req.studioRole, galleryRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const tmpPath   = req.file.path;
  const coverPath = path.resolve(VIDEO_STORAGE_PATH, gallery.id, 'cover.jpg');
  try {
    // Use Sharp to resize to max 640px wide and convert to JPEG
    const { default: sharp } = await import('sharp');
    await sharp(tmpPath).resize(640, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(coverPath);
    fs.unlinkSync(tmpPath);
    // Prerender project listing to update the video gallery card thumbnail
    const [projRows] = await query('SELECT p.slug FROM galleries g JOIN projects p ON p.id = g.project_id WHERE g.id = ? LIMIT 1', [gallery.id]);
    if (projRows[0]?.slug) prerenderProject(projRows[0].slug).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    res.status(500).json({ error: err.message });
  }
});

export default router;
