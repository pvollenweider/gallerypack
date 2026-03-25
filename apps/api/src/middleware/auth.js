// apps/api/src/middleware/auth.js — session authentication middleware
import { getSession, getUserById, getStudioRole, ROLE_HIERARCHY, getViewerToken, touchViewerToken } from '../db/helpers.js';

/**
 * Require a valid session cookie.
 * Attaches req.user, req.userId, req.studioId, and req.studioRole on success.
 * Express 5 supports async middleware natively.
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });

  const user = await getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  req.user   = user;
  req.userId = user.id;

  // studioId precedence: hostname-resolved context > user's home studio
  // (hostname context is set by resolveStudioContext middleware in multi mode)
  if (!req.studioId) req.studioId = user.studio_id;

  // Attach studio role for the resolved studio
  if (req.studioId) {
    req.studioRole = (await getStudioRole(user.id, req.studioId)) || null;
  }

  next();
}

/**
 * Require a minimum studio role.
 * Role hierarchy (lowest → highest): photographer < collaborator < admin < owner
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
 * If a valid, non-expired, non-revoked token is found sets:
 *   req.viewerToken  = raw token string (for can() checks)
 *   req.viewerScope  = { type: 'project'|'gallery', id: scopeId }
 * Does NOT set req.user — viewer tokens never create user sessions.
 */
export async function resolveViewerToken(req, res, next) {
  let raw = req.query.vt;
  if (!raw) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      raw = authHeader.slice(7).trim();
    }
  }

  if (!raw) return next();

  const row = await getViewerToken(raw);
  if (row) {
    req.viewerToken = raw;
    req.viewerScope = { type: row.scope_type, id: row.scope_id };
    // Fire-and-forget: update last_used_at without blocking the request
    touchViewerToken(row.id).catch(() => {});
  }

  next();
}

/**
 * Require admin access (owner or admin studio role).
 */
export async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.studioRole !== 'owner' && req.studioRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}
