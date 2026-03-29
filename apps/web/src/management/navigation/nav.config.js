// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * Single source of truth for all management navigation.
 * Scope-level items use :param placeholders — call interpolatePath() before rendering.
 */

export const globalNav = [
  { key: 'hub',           labelKey: 'nav_hub',           icon: 'fas fa-tachometer-alt', href: '/admin' },
  { key: 'platform',      labelKey: 'nav_platform',      icon: 'fas fa-server',         href: '/admin/platform', superadminOnly: true },
  { key: 'organizations', labelKey: 'nav_organizations', icon: 'fas fa-building',       href: '/admin/organizations' },
  { key: 'projects',      labelKey: 'nav_projects',      icon: 'fas fa-folder-open',    href: '/admin/projects' },
  { key: 'tokens',        labelKey: 'nav_tokens',        icon: 'fas fa-key',            href: '/admin/tokens' },
];

export const scopeNav = {
  platform: [
    { key: 'overview',  labelKey: 'nav_overview',  icon: 'fas fa-home',        href: '/admin/platform' },
    { key: 'smtp',      labelKey: 'nav_smtp',      icon: 'fas fa-envelope',    href: '/admin/platform/smtp' },
    { key: 'license',   labelKey: 'nav_license',   icon: 'fas fa-certificate', href: '/admin/platform/license' },
    { key: 'branding',  labelKey: 'nav_branding',  icon: 'fas fa-paint-brush', href: '/admin/platform/branding' },
  ],

  organization: [
    { key: 'overview',  labelKey: 'nav_overview',   icon: 'fas fa-home',         href: '/admin/organizations/:orgId' },
    { key: 'general',   labelKey: 'nav_general',    icon: 'fas fa-info-circle',  href: '/admin/organizations/:orgId/general' },
    { key: 'defaults',  labelKey: 'nav_defaults',   icon: 'fas fa-sliders-h',    href: '/admin/organizations/:orgId/defaults' },
    { key: 'access',    labelKey: 'nav_org_access', icon: 'fas fa-lock',         href: '/admin/organizations/:orgId/access' },
    { key: 'team',      labelKey: 'nav_team',       icon: 'fas fa-users',        href: '/admin/organizations/:orgId/team' },
    { key: 'projects',  labelKey: 'nav_projects',   icon: 'fas fa-folder-open',  href: '/admin/organizations/:orgId/projects' },
  ],

  project: [
    { key: 'overview',   labelKey: 'nav_overview',  icon: 'fas fa-home',        href: '/admin/projects/:projectId' },
    { key: 'general',    labelKey: 'nav_general',   icon: 'fas fa-info-circle', href: '/admin/projects/:projectId/general' },
    { key: 'galleries',  labelKey: 'nav_galleries', icon: 'fas fa-images',      href: '/admin/projects/:projectId/galleries' },
    { key: 'access',     labelKey: 'nav_access',    icon: 'fas fa-lock',        href: '/admin/projects/:projectId/access' },
    { key: 'delivery',   labelKey: 'nav_delivery',  icon: 'fas fa-truck',       href: '/admin/projects/:projectId/delivery' },
  ],

  gallery: [
    { key: 'overview',   labelKey: 'nav_overview',   icon: 'fas fa-home',        href: '/admin/galleries/:galleryId' },
    { key: 'photos',     labelKey: 'nav_photos',     icon: 'fas fa-images',      href: '/admin/galleries/:galleryId/photos' },
    { key: 'inbox',      labelKey: 'nav_inbox',      icon: 'fas fa-inbox',       href: '/admin/galleries/:galleryId/inbox' },
    { key: 'jobs',       labelKey: 'nav_jobs',       icon: 'fas fa-hammer',      href: '/admin/galleries/:galleryId/jobs' },
    { key: 'general',    labelKey: 'nav_general',    icon: 'fas fa-info-circle', href: '/admin/galleries/:galleryId/general' },
    { key: 'access',     labelKey: 'nav_access',     icon: 'fas fa-lock',        href: '/admin/galleries/:galleryId/access' },
    { key: 'downloads',  labelKey: 'nav_downloads',  icon: 'fas fa-download',    href: '/admin/galleries/:galleryId/downloads' },
    { key: 'upload',     labelKey: 'nav_upload',     icon: 'fas fa-upload',      href: '/admin/galleries/:galleryId/upload' },
    { key: 'publish',    labelKey: 'nav_publish',    icon: 'fas fa-rocket',      href: '/admin/galleries/:galleryId/publish' },
    { key: 'photographers', labelKey: 'nav_photographers', icon: 'fas fa-camera', href: '/admin/galleries/:galleryId/photographers' },
    { key: 'insights',      labelKey: 'tab_insights',      icon: 'fas fa-chart-bar',   href: '/admin/galleries/:galleryId/insights' },
  ],
};

/** Scope section label i18n keys */
export const scopeLabels = {
  platform:     'scope_platform',
  organization: 'scope_organization',
  project:      'scope_project',
  gallery:      'scope_gallery',
};
