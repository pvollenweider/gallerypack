// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/watch.js — public video viewer page at /watch/:token
import { Router } from 'express';
import path       from 'path';
import { getViewerToken } from '../db/helpers.js';
import { query }          from '../db/database.js';
import { renderWatchPage } from '../views/watch.js';

const router = Router();

const INVALID_HTML = () => renderWatchPage('', null, [], "Ce lien n'est plus valide.");

// GET /watch/:token
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // 1. Validate token
    const vt = await getViewerToken(token);
    if (!vt || vt.scope_type !== 'gallery') {
      return res.type('html').send(INVALID_HTML());
    }

    // 2. Fetch gallery (must be of type 'video')
    const [galRows] = await query(
      "SELECT id, title FROM galleries WHERE id = ? AND type = 'video'",
      [vt.scope_id]
    );
    const gallery = galRows[0];
    if (!gallery) {
      return res.type('html').send(INVALID_HTML());
    }

    // 3. Fetch ready videos — expose hls_entry (basename only)
    const [videoRows] = await query(
      "SELECT id, title, slug, duration_sec, hls_path FROM videos WHERE gallery_id = ? AND status = 'ready' ORDER BY sort_order ASC",
      [gallery.id]
    );
    const videos = videoRows.map(({ hls_path, ...v }) => ({
      ...v,
      hls_entry: path.basename(hls_path || 'index.m3u8'),
    }));

    // 4. Render and send
    res.set('Cache-Control', 'no-store');
    return res.type('html').send(renderWatchPage(token, gallery, videos));
  } catch (err) {
    req.log?.error({ err }, 'watch route error');
    return res.type('html').send(INVALID_HTML());
  }
});

export default router;
