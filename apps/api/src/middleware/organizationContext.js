// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/middleware/organizationContext.js — resolve organization from request hostname
//
// Must be mounted BEFORE requireAuth so that req.organizationId / req.studioId
// are set from hostname context, not from the authenticated user's home org.
//
// In PLATFORM_MODE=single: resolves the default organization for every request.
// In PLATFORM_MODE=multi:  resolves by hostname; returns 404 for API routes
//                          that hit an unknown hostname.
//
// Sets both req.organizationId and req.studioId (same value — IDs are identical
// during the Sprint 22 transitional period).

import { resolveOrganizationFromHostname } from '../services/contextResolver.js';
import { getOrganization } from '../services/organization.js';

const PLATFORM_MODE = process.env.PLATFORM_MODE || 'single';

/**
 * Read the effective hostname, respecting the X-Forwarded-Host header set
 * by Caddy (first value only to avoid header injection).
 */
function effectiveHostname(req) {
  const fwd = req.headers['x-forwarded-host'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.hostname || req.headers.host || '';
}

/**
 * Attach org/studio context to req.
 * Sets req.organization, req.organizationId, req.studio, req.studioId.
 */
function attachContext(req, entity) {
  req.organization   = entity;
  req.organizationId = entity.id;
  // Keep legacy aliases in sync
  req.studio   = entity;
  req.studioId = entity.id;
}

/**
 * Resolve organization context and attach req.organization + req.organizationId
 * (and legacy req.studio + req.studioId aliases).
 *
 * For API routes in multi-org mode, rejects with 404 if no org is found.
 *
 * A superadmin can override the context with the `organization_override` cookie
 * (set via POST /api/platform/switch/:orgId). Legacy `studio_override` is also accepted.
 */
export async function resolveOrganizationContext(req, res, next) {
  // Superadmin org override — skip hostname resolution
  const override = req.cookies?.organization_override || req.cookies?.studio_override;
  if (override) {
    const overrideOrg = await getOrganization(override);
    if (overrideOrg) {
      attachContext(req, overrideOrg);
      return next();
    }
    // stale cookie — ignore and fall through to normal resolution
  }

  const hostname = effectiveHostname(req);
  const org      = await resolveOrganizationFromHostname(hostname);

  if (!org) {
    if (PLATFORM_MODE === 'multi' && req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Organization not found for this domain' });
    }
    return next();
  }

  attachContext(req, org);
  next();
}

// Legacy alias
export const resolveStudioContext = resolveOrganizationContext;
