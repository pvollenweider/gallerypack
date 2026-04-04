// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/access.js — gallery viewer access control
import { Router } from 'express';
import { query }  from '../db/database.js';
import {
  verifyPassword, createViewerToken, verifyViewerToken,
  getViewerToken, touchViewerToken,
} from '../db/helpers.js';

const router = Router();

// ── POST /api/galleries/:id/verify-password ───────────────────────────────────
// Public route: verify viewer password and set a short-lived viewer cookie.
router.post('/:id/verify-password', async (req, res) => {
  const [rows] = await query(
    'SELECT id, access, password_hash FROM galleries WHERE id = ?',
    [req.params.id]
  );
  const gallery = rows[0];

  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
  if (gallery.access !== 'password') return res.status(400).json({ error: 'Gallery is not password-protected' });

  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (!verifyPassword(password, gallery.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = createViewerToken(gallery.id);
  res.cookie(`viewer_${gallery.id}`, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24h
    secure: process.env.NODE_ENV === 'production',
  });

  res.json({ ok: true });
});

// ── GET /api/galleries/:id/view ───────────────────────────────────────────────
// Public route: return gallery data if authorized.
router.get('/:id/view', async (req, res) => {
  const [rows] = await query(
    `SELECT id, slug, project_id, title, subtitle, author, author_email, date, location,
            locale, access, cover_photo, allow_download_image, allow_download_gallery,
            build_status, built_at
     FROM galleries WHERE id = ?`,
    [req.params.id]
  );
  const gallery = rows[0];

  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  if (gallery.access === 'public') {
    return res.json(gallery);
  }

  if (gallery.access === 'password') {
    const cookieToken         = req.cookies?.[`viewer_${gallery.id}`];
    const authorizedGalleryId = verifyViewerToken(cookieToken);
    if (authorizedGalleryId !== gallery.id) {
      return res.status(401).json({ error: 'Password required', requiresPassword: true });
    }
    return res.json(gallery);
  }

  // private — check for a valid viewer token in ?vt= query param
  if (gallery.access === 'private') {
    const rawToken = req.query.vt;
    if (rawToken) {
      const vt = await getViewerToken(rawToken);
      if (vt && (
        (vt.scope_type === 'gallery' && vt.scope_id === gallery.id) ||
        (vt.scope_type === 'project' && gallery.project_id && vt.scope_id === gallery.project_id)
      )) {
        await touchViewerToken(vt.id);
        return res.json(gallery);
      }
    }
    return res.status(403).json({ error: 'Access denied' });
  }

  return res.status(403).json({ error: 'Access denied' });
});

export default router;
