// apps/api/src/routes/access.js — gallery viewer access control
import { Router }  from 'express';
import { getDb }   from '../db/database.js';
import {
  verifyPassword, createViewerToken, verifyViewerToken,
} from '../db/helpers.js';

const router = Router();

// ── POST /api/galleries/:id/verify-password ───────────────────────────────────
// Public route: verify viewer password and set a short-lived viewer cookie.
router.post('/:id/verify-password', (req, res) => {
  const gallery = getDb()
    .prepare('SELECT id, access, password_hash FROM galleries WHERE id = ?')
    .get(req.params.id);

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
// - access=public → always allowed
// - access=password → requires valid viewer cookie
// - access=private → only studio members (use requireAuth elsewhere; 403 here)
router.get('/:id/view', (req, res) => {
  const gallery = getDb()
    .prepare(`SELECT id, slug, title, subtitle, author, author_email, date, location,
                     locale, access, cover_photo, allow_download_image, allow_download_gallery,
                     build_status, built_at
              FROM galleries WHERE id = ?`)
    .get(req.params.id);

  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  if (gallery.access === 'public') {
    return res.json(gallery);
  }

  if (gallery.access === 'password') {
    const cookieToken = req.cookies?.[`viewer_${gallery.id}`];
    const authorizedGalleryId = verifyViewerToken(cookieToken);
    if (authorizedGalleryId !== gallery.id) {
      return res.status(401).json({ error: 'Password required', requiresPassword: true });
    }
    return res.json(gallery);
  }

  // private — require studio auth (handled by requireAuth middleware in caller)
  return res.status(403).json({ error: 'Access denied' });
});

export default router;
