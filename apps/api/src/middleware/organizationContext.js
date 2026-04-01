// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/middleware/organizationContext.js — resolve organization from request hostname
//
// Must be mounted BEFORE requireAuth so that req.organizationId is set from
// hostname context, not from the authenticated user's home org.
//
// In PLATFORM_MODE=single: resolves the default organization for every request.
// In PLATFORM_MODE=multi:  resolves by hostname; returns 404 for API routes
//                          that hit an unknown hostname.
//
// Sets req.organizationId (canonical).

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
 * Attach org context to req.
 * Sets req.organization, req.organizationId.
 */
function attachContext(req, entity) {
  req.organization   = entity;
  req.organizationId = entity.id;
}

/**
 * Resolve organization context and attach req.organization + req.organizationId.
 *
 * For API routes in multi-org mode, rejects with 404 if no org is found.
 *
 * A superadmin can override the context with the `organization_override` cookie
 * (set via POST /api/platform/switch/:orgId).
 */
export async function resolveOrganizationContext(req, res, next) {
  // Superadmin org override — skip hostname resolution
  const override = req.cookies?.organization_override;
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
