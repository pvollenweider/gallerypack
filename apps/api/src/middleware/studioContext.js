// apps/api/src/middleware/studioContext.js — resolve studio from request hostname
//
// Must be mounted BEFORE requireAuth so that req.studioId is set from hostname
// context, not from the authenticated user's home studio.
//
// In PLATFORM_MODE=single: resolves the default studio for every request.
// In PLATFORM_MODE=multi:  resolves by hostname; returns 404 for API routes
//                          that hit an unknown hostname.

import { resolveStudioFromHostname } from '../services/contextResolver.js';

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
 * Resolve studio context and attach req.studio + req.studioId.
 * For API routes in multi-studio mode, rejects with 404 if no studio is found.
 */
export async function resolveStudioContext(req, res, next) {
  const hostname = effectiveHostname(req);
  const studio   = await resolveStudioFromHostname(hostname);

  if (!studio) {
    if (PLATFORM_MODE === 'multi' && req.path.startsWith('/api/')) {
      // Every API request in multi mode needs a studio context.
      // Platform-level routes (/api/platform/...) are handled before this.
      return res.status(404).json({ error: 'Studio not found for this domain' });
    }
    // Single mode or non-API path: continue without studio context
    return next();
  }

  req.studio   = studio;
  req.studioId = studio.id;
  next();
}
