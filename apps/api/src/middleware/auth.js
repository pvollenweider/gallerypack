// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/middleware/auth.js — session authentication middleware
import { getSession, getUserById, getOrgRole, ROLE_HIERARCHY, getViewerToken, touchViewerToken } from '../db/helpers.js';

/**
 * Require a valid session cookie.
 *
 * Attaches on req:
 *   user, userId, platformRole
 *   organizationId, orgRole   — canonical
 *
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

  // organizationId precedence:
  //   hostname-resolved context (set by resolveOrganizationContext) > user's home org
  if (!req.organizationId) req.organizationId = user.organization_id;

  // Resolve membership role for the resolved organization.
  if (req.organizationId) {
    const resolvedRole = (await getOrgRole(user.id, req.organizationId)) || null;
    req.orgRole = resolvedRole;

    // If no role found and org wasn't explicitly chosen, fall back to user's home org.
    const hasOverride = !!(req.cookies?.organization_override);
    if (!req.orgRole && !hasOverride) {
      const homeOrgId = user.organization_id;
      if (homeOrgId && homeOrgId !== req.organizationId) {
        req.organizationId = homeOrgId;
        req.orgRole        = (await getOrgRole(user.id, homeOrgId)) || null;
      }
    }

    // Superadmin always gets owner-level access in any org
    if (!req.orgRole && req.platformRole === 'superadmin') {
      req.orgRole = 'owner';
    }
  }

  next();
}

/**
 * Require a minimum organization role.
 * Role hierarchy (lowest → highest): photographer < collaborator < admin < owner
 *
 * Usage: router.get('/...', requireAuth, requireStudioRole('admin'), handler)
 */
export function requireStudioRole(minRole) {
  return (req, res, next) => {
    const role = req.orgRole;
    if (!role) return res.status(403).json({ error: 'Forbidden: no organization membership' });

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
 * Require admin access (owner or admin organization role).
 */
export async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    const role = req.orgRole;
    if (role !== 'owner' && role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}
