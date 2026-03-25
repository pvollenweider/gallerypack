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

  req.user         = user;
  req.userId       = user.id;
  req.platformRole = user.platform_role || null;

  // studioId precedence: hostname-resolved context > user's home studio
  // (hostname context is set by resolveStudioContext middleware in multi mode)
  if (!req.studioId) req.studioId = user.studio_id;

  // Attach studio role for the resolved studio.
  // In single-mode the context resolver always picks the default studio, which may
  // differ from a non-admin user's own studio (e.g. a photographer in a non-default
  // studio).  When the user has no membership in the resolved studio, fall back to
  // their own home studio so API calls resolve to the correct dataset.
  if (req.studioId) {
    req.studioRole = (await getStudioRole(user.id, req.studioId)) || null;

    // If the user has no role in the resolved studio and the studio wasn't
    // explicitly chosen (via studio_override cookie or multi-mode hostname),
    // fall back to the user's own home studio.
    // Do NOT apply this fallback when a superadmin has switched studio context.
    const hasOverride = !!req.cookies?.studio_override;
    if (!req.studioRole && !hasOverride && user.studio_id && user.studio_id !== req.studioId) {
      req.studioId   = user.studio_id;
      req.studioRole = (await getStudioRole(user.id, user.studio_id)) || null;
    }

    if (!req.studioRole && req.platformRole === 'superadmin') {
      req.studioRole = 'owner';
    }
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
