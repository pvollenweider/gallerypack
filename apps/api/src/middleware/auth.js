// apps/api/src/middleware/auth.js — session authentication middleware
import { getSession, getUserById, getStudioRole, ROLE_HIERARCHY, getViewerToken, touchViewerToken } from '../db/helpers.js';

/**
 * Require a valid session cookie.
 * Attaches req.user, req.userId, req.studioId, and req.studioRole on success.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });

  const user = getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  req.user     = user;
  req.userId   = user.id;
  req.studioId = user.studio_id;

  // Attach studio role if the user belongs to a studio
  if (user.studio_id) {
    req.studioRole = getStudioRole(user.id, user.studio_id) || null;
  }

  next();
}

/**
 * Require a minimum studio role.
 * Role hierarchy (lowest → highest): photographer < editor < admin < owner
 *
 * Usage: router.get('/...', requireAuth, requireStudioRole('admin'), handler)
 */
export function requireStudioRole(minRole) {
  return (req, res, next) => {
    const role = req.studioRole;
    if (!role) return res.status(403).json({ error: 'Forbidden: no studio membership' });

    const userLevel = ROLE_HIERARCHY.indexOf(role);
    const minLevel  = ROLE_HIERARCHY.indexOf(minRole);

    if (userLevel < minLevel) {
      return res.status(403).json({ error: `Forbidden: requires role '${minRole}' or higher` });
    }
    next();
  };
}

/**
 * Resolve a viewer token from query param `?vt=<token>` or `Authorization: Bearer <token>`.
 * If a valid, non-expired viewer token is found, sets req.viewerGalleryId and calls next().
 * Does NOT set req.user — this is anonymous/public access.
 * Safe to use alongside requireAuth on routes that support both access modes.
 */
export function resolveViewerToken(req, res, next) {
  // Prefer query param ?vt=; fall back to Authorization: Bearer header
  let raw = req.query.vt;
  if (!raw) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      raw = authHeader.slice(7).trim();
    }
  }

  if (!raw) return next();

  const row = getViewerToken(raw);
  if (row) {
    req.viewerGalleryId = row.gallery_id;
    // Fire-and-forget: update last_used_at without blocking the request
    touchViewerToken(row.id);
  }

  next();
}

/**
 * Require admin access.
 * A user qualifies as admin if their studio membership role is 'owner' or 'admin'.
 * Falls back to checking the legacy users.role column for backward compat.
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const studioRole = req.studioRole;
    const legacyRole = req.user?.role;

    const isAdmin =
      studioRole === 'owner' ||
      studioRole === 'admin' ||
      legacyRole === 'admin'; // backward compat for existing sessions pre-memberships

    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}
