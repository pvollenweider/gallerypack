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

// ── Route 1: Token-protected HLS file serving ─────────────────────────────────
// GET /api/v/:token/galleries/:galleryId/videos/:videoSlug/stream/*filepath
router.get('/:token/galleries/:galleryId/videos/:videoSlug/stream/*filepath', async (req, res) => {
  try {
    const { token: rawToken, galleryId, videoSlug } = req.params;
    const filepath = req.params.filepath;

    // 1. Validate token
    const token = await getViewerToken(rawToken);
    if (!token) return res.status(403).json({ error: 'Invalid or expired token' });

    // 2. Check token scope
    if (!(token.scope_type === 'gallery' && token.scope_id === galleryId)) {
      return res.status(403).json({ error: 'Token not valid for this gallery' });
    }

    // 3. Lookup video
    const [rows] = await query(
      "SELECT * FROM videos WHERE gallery_id = ? AND slug = ? AND status = 'ready'",
      [galleryId, videoSlug]
    );
    const video = rows[0];
    if (!video) return res.status(404).json({ error: 'Video not found' });

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

    // 7. Touch token (fire and forget)
    touchViewerToken(token.id).catch(() => {});

    // 8. Send file with explicit root to satisfy Express 5
    res.sendFile(path.basename(resolvedPath), { root: path.dirname(resolvedPath) }, (err) => {
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
      hls_entry: path.basename(hls_path || 'index.m3u8'),
    })),
  });
});

// ── Route 3: Track view events ────────────────────────────────────────────────
// POST /api/v/:token/track
router.post('/:token/track', async (req, res) => {
  try {
    const vt = await getViewerToken(req.params.token);
    if (!vt) return res.status(401).json({ error: 'Invalid token' });

    const { video_id, event_type, position_sec } = req.body || {};
    const VALID = ['play', 'pause', 'seek', 'heartbeat', 'ended'];
    if (!video_id || !VALID.includes(event_type)) {
      return res.status(400).json({ error: 'Invalid event' });
    }

    const [vrows] = await query(
      'SELECT id FROM videos WHERE id = ? AND gallery_id = ?', [video_id, vt.scope_id]
    );
    if (!vrows[0]) return res.status(404).json({ error: 'Video not found' });

    const ua = req.headers['user-agent'] || '';
    const uaHash = createHash('md5').update(ua).digest('hex').slice(0, 16);

    await query(
      'INSERT INTO video_view_events (video_id, token_id, event_type, position_sec, ua_hash, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [video_id, vt.id, event_type, parseInt(position_sec) || 0, uaHash]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[track]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
