// apps/api/src/services/contextResolver.js — hostname → studio resolution
//
// PLATFORM_MODE=single (default): all requests resolve to the default studio.
// PLATFORM_MODE=multi: studio resolved from X-Forwarded-Host / Host header.
//
// Resolution order (multi mode):
//   1. Exact match in studio_domains table
//   2. Subdomain match: <slug>.BASE_DOMAIN → studios.slug
//   3. BASE_DOMAIN itself → platform root (no studio)
//   4. Unknown hostname → null

import { getStudioByDomain, getStudioBySlug, getDefaultStudio } from '../db/helpers.js';

const PLATFORM_MODE = process.env.PLATFORM_MODE || 'single';
const BASE_DOMAIN   = (process.env.BASE_DOMAIN || 'gallerypack.app').toLowerCase();

/**
 * Resolve a studio entity from an incoming hostname string.
 * Returns the studio row or null (platform root / unknown host).
 *
 * @param {string|undefined} rawHostname - e.g. "circus.gallerypack.app" or "circus.gallerypack.app:4000"
 * @returns {Promise<object|null>}
 */
export async function resolveStudioFromHostname(rawHostname) {
  const host = rawHostname?.split(':')[0]?.toLowerCase()?.trim() || '';

  if (PLATFORM_MODE === 'single') {
    return getDefaultStudio();
  }

  // ── Multi-tenant resolution ─────────────────────────────────────────────────

  if (!host) return null;

  // Platform root
  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;

  // 1. Exact domain match in studio_domains
  const byDomain = await getStudioByDomain(host);
  if (byDomain) return byDomain;

  // 2. Subdomain of BASE_DOMAIN → studio slug
  const subdomainSuffix = `.${BASE_DOMAIN}`;
  if (host.endsWith(subdomainSuffix)) {
    const slug = host.slice(0, -subdomainSuffix.length);
    if (slug) return getStudioBySlug(slug);
  }

  return null; // unknown hostname
}
