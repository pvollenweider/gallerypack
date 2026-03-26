// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * Replace :param placeholders with actual route param values.
 * @param {string} path - e.g. '/manage/organizations/:orgId/general'
 * @param {Record<string,string>} params - e.g. { orgId: 'abc123' }
 */
export function interpolatePath(path, params = {}) {
  return path.replace(/:(\w+)/g, (_, key) => params[key] ?? `:${key}`);
}

/**
 * Detect the active management scope from the current pathname.
 * @returns {'platform'|'organization'|'project'|'gallery'|null}
 */
export function detectScope(pathname) {
  if (pathname.startsWith('/admin/platform')) return 'platform';
  if (/^\/manage\/organizations\/[^/]+/.test(pathname)) return 'organization';
  if (/^\/manage\/projects\/[^/]+/.test(pathname)) return 'project';
  if (/^\/manage\/galleries\/[^/]+/.test(pathname)) return 'gallery';
  return null;
}

/**
 * Extract scope params from the current pathname.
 * @returns {{ orgId?: string, projectId?: string, galleryId?: string }}
 */
export function extractScopeParams(pathname) {
  const org     = pathname.match(/^\/manage\/organizations\/([^/]+)/);
  const project = pathname.match(/^\/manage\/projects\/([^/]+)/);
  const gallery = pathname.match(/^\/manage\/galleries\/([^/]+)/);

  if (org)     return { orgId: org[1] };
  if (project) return { projectId: project[1] };
  if (gallery) return { galleryId: gallery[1] };
  return {};
}

/** Segment label overrides for breadcrumb generation */
const SEGMENT_LABELS = {
  admin:         null,
  manage:        null,
  platform:      'Platform',
  smtp:          'SMTP',
  license:       'License',
  branding:      'Branding',
  organizations: 'Organizations',
  projects:      'Projects',
  galleries:     'Galleries',
  general:       'General',
  defaults:      'Defaults',
  access:        'Access & Privacy',
  team:          'Team',
  delivery:      'Delivery',
  downloads:     'Downloads',
  upload:        'Upload',
  publish:       'Publish',
  overview:      'Overview',
};

/**
 * Build a breadcrumb array from a pathname.
 * Entity IDs are passed as-is — callers can replace them with real names later.
 *
 * @param {string} pathname
 * @param {Record<string,string>} entityNames - { orgId: 'Acme', projectId: 'Paris 2024', ... }
 * @returns {{ label: string, href: string }[]}
 */
export function buildBreadcrumb(pathname, entityNames = {}) {
  const paramKeys = { orgId: true, projectId: true, galleryId: true };
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = [];
  let path = '';

  for (const seg of segments) {
    path += '/' + seg;

    // Check if this segment is a known entity param value
    const entityKey = Object.keys(entityNames).find(k => entityNames[k] === seg || paramKeys[k]);
    const matchedName = Object.entries(entityNames).find(([, v]) => v === seg)?.[0];
    if (matchedName) {
      // This is an entity ID — show a human name if provided
      const paramKey = Object.keys(entityNames).find(k => entityNames[k] && seg === entityNames[k]);
      crumbs.push({ label: entityNames[seg] ?? seg, href: path });
      continue;
    }

    const label = SEGMENT_LABELS[seg];
    if (label === null) continue; // skip 'admin', 'manage'
    if (label === undefined) {
      // Unknown segment — likely an entity ID. Show short form.
      crumbs.push({ label: seg.length > 12 ? seg.slice(0, 8) + '…' : seg, href: path });
    } else {
      crumbs.push({ label, href: path });
    }
  }

  return crumbs;
}
