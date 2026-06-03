// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/videoStream.js — token-protected HLS streaming + gallery info
import { Router } from 'express';
import path       from 'path';
import fs         from 'fs';
import { createHash } from 'crypto';
import { getViewerToken, touchViewerToken } from '../db/helpers.js';
import { query } from '../db/database.js';

const router = Router();

const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || 'storage/videos';

// ── In-memory cache: token → { galleryId, expires } ──────────────────────────
// Eliminates 2 DB queries per .ts segment (critical for smooth HLS playback).
// TTL: 60s — short enough to catch revocations promptly.
const TOKEN_CACHE = new Map();
const TOKEN_CACHE_TTL = 60_000;

function getCachedToken(rawToken) {
  const entry = TOKEN_CACHE.get(rawToken);
  if (!entry) return null;
  if (Date.now() > entry.expires) { TOKEN_CACHE.delete(rawToken); return null; }
  return entry;
}

function setCachedToken(rawToken, galleryId, tokenId) {
  TOKEN_CACHE.set(rawToken, { galleryId, tokenId, expires: Date.now() + TOKEN_CACHE_TTL });
}

// ── In-memory cache: `${galleryId}:${videoSlug}` → { videoId, expires } ──────
const VIDEO_CACHE = new Map();
const VIDEO_CACHE_TTL = 300_000; // 5 min — videos don't change status mid-playback

function getCachedVideo(galleryId, slug) {
  const key = `${galleryId}:${slug}`;
  const entry = VIDEO_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { VIDEO_CACHE.delete(key); return null; }
  return entry;
}

function setCachedVideo(galleryId, slug, videoId) {
  VIDEO_CACHE.set(`${galleryId}:${slug}`, { videoId, expires: Date.now() + VIDEO_CACHE_TTL });
}

// ── Route 1: Token-protected HLS file serving ─────────────────────────────────
// GET /api/v/:token/galleries/:galleryId/videos/:videoSlug/stream/*filepath
router.get('/:token/galleries/:galleryId/videos/:videoSlug/stream/*filepath', async (req, res) => {
  try {
    const { token: rawToken, galleryId, videoSlug } = req.params;
    // Express 5: wildcard param may be an array
    const filepath = Array.isArray(req.params.filepath)
      ? req.params.filepath.join('/')
      : (req.params.filepath || '');

    // 1. Validate token (with cache to avoid DB hit per .ts segment)
    let tokenId = null;
    const cached = getCachedToken(rawToken);
    if (cached) {
      if (cached.galleryId !== galleryId) return res.status(403).json({ error: 'Token not valid for this gallery' });
      tokenId = cached.tokenId;
    } else {
      const token = await getViewerToken(rawToken);
      if (token) {
        if (!(token.scope_type === 'gallery' && token.scope_id === galleryId)) {
          return res.status(403).json({ error: 'Token not valid for this gallery' });
        }
        tokenId = token.id;
        setCachedToken(rawToken, galleryId, tokenId);
      } else {
        // No token — check if gallery is public (cache result too)
        const [pubRows] = await query(
          "SELECT id FROM galleries WHERE id = ? AND type = 'video' AND access = 'public' LIMIT 1",
          [galleryId]
        );
        if (!pubRows[0]) return res.status(403).json({ error: 'Invalid or expired token' });
        setCachedToken(rawToken, galleryId, null); // public gallery — no tokenId
      }
    }

    // 3. Lookup video (with cache)
    let videoId;
    const cachedVideo = getCachedVideo(galleryId, videoSlug);
    if (cachedVideo) {
      videoId = cachedVideo.videoId;
    } else {
      const [rows] = await query(
        "SELECT id FROM videos WHERE gallery_id = ? AND slug = ? AND status = 'ready'",
        [galleryId, videoSlug]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Video not found' });
      videoId = rows[0].id;
      setCachedVideo(galleryId, videoSlug, videoId);
    }
    const video = { id: videoId };

    // 4. Resolve and sanitize file path
    const hlsDir       = path.resolve(VIDEO_STORAGE_PATH, galleryId, video.id + '_hls');
    const resolvedPath = path.resolve(hlsDir, filepath);
    const rel = path.relative(hlsDir, resolvedPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return res.status(403).json({ error: 'Path traversal not allowed' });
    }

    // 5. Check file existence
    if (!fs.existsSync(resolvedPath)) {
      console.error('[stream] file not found:', resolvedPath);
      return res.status(404).json({ error: 'File not found' });
    }

    // 6. Set Content-Type + Cache-Control
    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext === '.m3u8') {
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-cache');
    } else if (ext === '.ts') {
      res.set('Content-Type', 'video/MP2T');
      res.set('Cache-Control', 'public, max-age=3600');
    }

    // 7. Touch token (fire and forget, only for .m3u8 to avoid excessive writes)
    if (tokenId && path.extname(resolvedPath) === '.m3u8') {
      touchViewerToken(tokenId).catch(() => {});
    }

    // 8. Send file with Range support (critical for seeking in large segments)
    res.sendFile(path.basename(resolvedPath), {
      root:         path.dirname(resolvedPath),
      acceptRanges: true,
    }, (err) => {
      if (err && !res.headersSent) {
        console.error('[stream] sendFile error:', err.message, resolvedPath);
        res.status(500).json({ error: 'Stream error' });
      }
    });
  } catch (err) {
    console.error('[stream] handler error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Route 2: Gallery info for the watch page ──────────────────────────────────
// GET /api/v/:token/gallery
router.get('/:token/gallery', async (req, res) => {
  const { token: rawToken } = req.params;

  // Validate token
  const token = await getViewerToken(rawToken);
  if (!token) return res.status(403).json({ error: 'Invalid or expired token' });

  if (token.scope_type !== 'gallery') {
    return res.status(403).json({ error: 'Token is not scoped to a gallery' });
  }

  const galleryId = token.scope_id;

  // Fetch gallery
  const [galRows] = await query(
    "SELECT * FROM galleries WHERE id = ? AND type = 'video'",
    [galleryId]
  );
  const gallery = galRows[0];
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  // Fetch videos (strip internal paths, expose only hls_entry basename)
  const [videoRows] = await query(
    "SELECT id, title, slug, duration_sec, status, hls_path FROM videos WHERE gallery_id = ? AND status = 'ready' ORDER BY sort_order ASC",
    [galleryId]
  );

  // Touch token (fire and forget)
  touchViewerToken(token.id).catch(() => {});

  res.json({
    gallery: { id: gallery.id, title: gallery.title },
    videos: videoRows.map(({ hls_path, ...v }) => ({
      ...v,
      hls_entry:  path.basename(hls_path || 'index.m3u8'),
      poster_url: `/api/v/${rawToken}/galleries/${galleryId}/videos/${v.slug}/poster`,
    })),
  });
});

// ── Route 3: Track view events ────────────────────────────────────────────────
// POST /api/v/:token/track
router.post('/:token/track', async (req, res) => {
  try {
    const rawRef = req.params.token;
    let tokenId  = null;
    let galleryId;

    // Try viewer token first
    const vt = await getViewerToken(rawRef);
    if (vt && vt.scope_type === 'gallery') {
      tokenId   = vt.id;
      galleryId = vt.scope_id;
    } else {
      // Fallback: public gallery by slug or id
      const [pubRows] = await query(
        "SELECT id FROM galleries WHERE (slug = ? OR id = ?) AND type = 'video' AND access = 'public' LIMIT 1",
        [rawRef, rawRef]
      );
      if (!pubRows[0]) return res.status(401).json({ error: 'Invalid token' });
      galleryId = pubRows[0].id;
      // tokenId stays null — public view, no token attribution
    }

    const { video_id, event_type, position_sec } = req.body || {};
    const VALID = ['play', 'pause', 'seek', 'heartbeat', 'ended'];
    if (!video_id || !VALID.includes(event_type)) {
      return res.status(400).json({ error: 'Invalid event' });
    }

    const [vrows] = await query(
      'SELECT id FROM videos WHERE id = ? AND gallery_id = ?', [video_id, galleryId]
    );
    if (!vrows[0]) return res.status(404).json({ error: 'Video not found' });

    const ua = req.headers['user-agent'] || '';
    const uaHash = createHash('md5').update(ua).digest('hex').slice(0, 16);

    await query(
      'INSERT INTO video_view_events (video_id, token_id, event_type, position_sec, ua_hash, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [video_id, tokenId, event_type, parseInt(position_sec) || 0, uaHash]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[track]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/v/:token/galleries/:galleryId/videos/:videoSlug/poster ──────────
// Per-video poster image — served without strict auth (it's a thumbnail).
router.get('/:token/galleries/:galleryId/videos/:videoSlug/poster', async (req, res) => {
  const { galleryId, videoSlug } = req.params;

  // Lookup video id
  const [rows] = await query(
    "SELECT id FROM videos WHERE gallery_id = ? AND slug = ?", [galleryId, videoSlug]
  );
  if (!rows[0]) return res.status(404).end();

  const posterPath = path.resolve(VIDEO_STORAGE_PATH, galleryId, `poster_${rows[0].id}.jpg`);
  if (!fs.existsSync(posterPath)) return res.status(404).end();

  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.basename(posterPath), { root: path.dirname(posterPath) });
});

export default router;
