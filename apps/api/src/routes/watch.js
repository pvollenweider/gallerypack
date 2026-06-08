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

// GET /watch/:ref  — ref is either a viewer token or a public gallery slug/id
router.get('/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    let galleryId, watchRef;

    // 1. Try viewer token first
    const vt = await getViewerToken(ref);
    if (vt && vt.scope_type === 'gallery') {
      galleryId = vt.scope_id;
      watchRef  = ref; // raw token for HLS URLs
    } else {
      // 2. Fallback: public video gallery by slug or id
      const orgId = req.organizationId ?? null;
      const [galRows] = orgId
        ? await query(
            "SELECT id FROM galleries WHERE (slug = ? OR id = ?) AND type = 'video' AND access = 'public' AND organization_id = ? LIMIT 1",
            [ref, ref, orgId]
          )
        : await query(
            "SELECT id FROM galleries WHERE (slug = ? OR id = ?) AND type = 'video' AND access = 'public' LIMIT 1",
            [ref, ref]
          );
      if (!galRows[0]) return res.type('html').send(INVALID_HTML());
      galleryId = galRows[0].id;
      watchRef  = ref; // gallery slug used in HLS URLs for public galleries
    }

    // 3. Fetch gallery
    const [galInfoRows] = await query(
      "SELECT id, title, description FROM galleries WHERE id = ? AND type = 'video'",
      [galleryId]
    );
    const gallery = galInfoRows[0];
    if (!gallery) return res.type('html').send(INVALID_HTML());

    // 4. Fetch ready videos
    const [videoRows] = await query(
      "SELECT id, title, slug, duration_sec, hls_path FROM videos WHERE gallery_id = ? AND status = 'ready' ORDER BY sort_order ASC",
      [gallery.id]
    );
    const videos = videoRows.map(({ hls_path, ...v }) => ({
      ...v,
      hls_entry: path.basename(hls_path || 'index.m3u8'),
    }));

    res.set('Cache-Control', 'no-store');
    return res.type('html').send(renderWatchPage(watchRef, gallery, videos));
  } catch (err) {
    req.log?.error({ err }, 'watch route error');
    return res.type('html').send(INVALID_HTML());
  }
});

export default router;
