// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/contextResolver.js — hostname → organization resolution
//
// PLATFORM_MODE=single (default): all requests resolve to the default organization.
// PLATFORM_MODE=multi: organization resolved from X-Forwarded-Host / Host header.
//
// Resolution order (multi mode):
//   1. Exact match in studio_domains (organization_id column, Sprint 22)
//   2. Subdomain match: <slug>.BASE_DOMAIN → organizations.slug
//   3. BASE_DOMAIN itself → platform root (no organization)
//   4. Unknown hostname → null
//
// NOTE: Returns organization rows. Since organizations.id === studios.id,
// callers that use the result as a "studio" continue to work unchanged.

import {
  getOrganizationByDomain,
  getOrganizationBySlug,
  getDefaultOrganization,
} from './organization.js';

const PLATFORM_MODE = process.env.PLATFORM_MODE || 'single';
const BASE_DOMAIN   = (process.env.BASE_DOMAIN || 'gallerypack.app').toLowerCase();

/**
 * Resolve an organization from an incoming hostname string.
 * Returns an organization row or null.
 *
 * @param {string|undefined} rawHostname - e.g. "circus.gallerypack.app" or "circus.gallerypack.app:4000"
 * @returns {Promise<object|null>}
 */
export async function resolveOrganizationFromHostname(rawHostname) {
  const host = rawHostname?.split(':')[0]?.toLowerCase()?.trim() || '';

  if (PLATFORM_MODE === 'single') {
    return getDefaultOrganization();
  }

  // ── Multi-tenant resolution ─────────────────────────────────────────────────

  if (!host) return null;

  // Platform root
  if (host === BASE_DOMAIN || host === `www.${BASE_DOMAIN}`) return null;

  // 1. Exact domain match
  const byDomain = await getOrganizationByDomain(host);
  if (byDomain) return byDomain;

  // 2. Subdomain of BASE_DOMAIN → slug
  const subdomainSuffix = `.${BASE_DOMAIN}`;
  if (host.endsWith(subdomainSuffix)) {
    const slug = host.slice(0, -subdomainSuffix.length);
    if (slug) {
      return getOrganizationBySlug(slug);
    }
  }

  return null; // unknown hostname
}

// Legacy alias
export const resolveStudioFromHostname = resolveOrganizationFromHostname;
