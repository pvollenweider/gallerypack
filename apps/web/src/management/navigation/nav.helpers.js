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
  if (/^\/admin\/organizations\/[^/]+/.test(pathname)) return 'organization';
  if (/^\/admin\/projects\/[^/]+/.test(pathname)) return 'project';
  if (/^\/admin\/galleries\/[^/]+/.test(pathname)) return 'gallery';
  return null;
}

/**
 * Extract scope params from the current pathname.
 * @returns {{ orgId?: string, projectId?: string, galleryId?: string }}
 */
export function extractScopeParams(pathname) {
  const org     = pathname.match(/^\/admin\/organizations\/([^/]+)/);
  const project = pathname.match(/^\/admin\/projects\/([^/]+)/);
  const gallery = pathname.match(/^\/admin\/galleries\/([^/]+)/);

  if (org)     return { orgId: org[1] };
  if (project) return { projectId: project[1] };
  if (gallery) return { galleryId: gallery[1] };
  return {};
}

/** Segment label overrides for breadcrumb generation */
const SEGMENT_LABELS = {
  admin:         null,
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
  insights:      'Insights',
  overview:      'Overview',
  photos:        'Photos',
  inbox:         'Inbox',
  jobs:          'Jobs',
  profile:       'Profile',
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
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = [];
  let path = '';

  for (const seg of segments) {
    path += '/' + seg;

    // If this segment is a known entity ID, show its human name
    if (entityNames[seg]) {
      crumbs.push({ label: entityNames[seg], href: path });
      continue;
    }

    const label = SEGMENT_LABELS[seg];
    if (label === null) continue;        // skip 'admin', 'manage'
    if (label === undefined) {
      // Unknown segment — likely an entity ID with no name loaded yet
      crumbs.push({ label: seg.length > 12 ? seg.slice(0, 8) + '…' : seg, href: path });
    } else {
      crumbs.push({ label, href: path });
    }
  }

  return crumbs;
}
