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
  { key: 'hub',           label: 'Manage Hub',    icon: 'fas fa-tachometer-alt', href: '/admin' },
  { key: 'platform',      label: 'Platform',       icon: 'fas fa-server',         href: '/admin/platform', superadminOnly: true },
  { key: 'organizations', label: 'Organizations',  icon: 'fas fa-building',       href: '/admin/organizations' },
  { key: 'projects',      label: 'Projects',       icon: 'fas fa-folder-open',    href: '/admin/projects' },
  { key: 'galleries',     label: 'Galleries',      icon: 'fas fa-images',         href: '/admin/galleries' },
  { key: 'tokens',        label: 'Upload Tokens',  icon: 'fas fa-key',            href: '/admin/tokens' },
];

export const scopeNav = {
  platform: [
    { key: 'overview',  label: 'Overview',  icon: 'fas fa-home',        href: '/admin/platform' },
    { key: 'smtp',      label: 'SMTP',      icon: 'fas fa-envelope',    href: '/admin/platform/smtp' },
    { key: 'license',   label: 'License',   icon: 'fas fa-certificate', href: '/admin/platform/license' },
    { key: 'branding',  label: 'Branding',  icon: 'fas fa-paint-brush', href: '/admin/platform/branding' },
  ],

  organization: [
    { key: 'overview',  label: 'Overview',        icon: 'fas fa-home',         href: '/admin/organizations/:orgId' },
    { key: 'general',   label: 'General',         icon: 'fas fa-info-circle',  href: '/admin/organizations/:orgId/general' },
    { key: 'defaults',  label: 'Defaults',        icon: 'fas fa-sliders-h',    href: '/admin/organizations/:orgId/defaults' },
    { key: 'access',    label: 'Access & Privacy',icon: 'fas fa-lock',         href: '/admin/organizations/:orgId/access' },
    { key: 'team',      label: 'Team',            icon: 'fas fa-users',        href: '/admin/organizations/:orgId/team' },
    { key: 'projects',  label: 'Projects',        icon: 'fas fa-folder-open',  href: '/admin/organizations/:orgId/projects' },
  ],

  project: [
    { key: 'overview',   label: 'Overview',  icon: 'fas fa-home',        href: '/admin/projects/:projectId' },
    { key: 'general',    label: 'General',   icon: 'fas fa-info-circle', href: '/admin/projects/:projectId/general' },
    { key: 'galleries',  label: 'Galleries', icon: 'fas fa-images',      href: '/admin/projects/:projectId/galleries' },
    { key: 'access',     label: 'Access',    icon: 'fas fa-lock',        href: '/admin/projects/:projectId/access' },
    { key: 'delivery',   label: 'Delivery',  icon: 'fas fa-truck',       href: '/admin/projects/:projectId/delivery' },
  ],

  gallery: [
    { key: 'overview',   label: 'Overview',   icon: 'fas fa-home',       href: '/admin/galleries/:galleryId' },
    { key: 'photos',     label: 'Photos',     icon: 'fas fa-images',     href: '/admin/galleries/:galleryId/photos' },
    { key: 'inbox',      label: 'Inbox',      icon: 'fas fa-inbox',      href: '/admin/galleries/:galleryId/inbox' },
    { key: 'jobs',       label: 'Jobs',       icon: 'fas fa-hammer',     href: '/admin/galleries/:galleryId/jobs' },
    { key: 'general',    label: 'General',    icon: 'fas fa-info-circle',href: '/admin/galleries/:galleryId/general' },
    { key: 'access',     label: 'Access',     icon: 'fas fa-lock',       href: '/admin/galleries/:galleryId/access' },
    { key: 'downloads',  label: 'Downloads',  icon: 'fas fa-download',   href: '/admin/galleries/:galleryId/downloads' },
    { key: 'upload',     label: 'Upload',     icon: 'fas fa-upload',     href: '/admin/galleries/:galleryId/upload' },
    { key: 'publish',    label: 'Publish',    icon: 'fas fa-rocket',     href: '/admin/galleries/:galleryId/publish' },
    { key: 'insights',   label: 'Insights',   icon: 'fas fa-chart-bar',  href: '/admin/galleries/:galleryId/insights' },
  ],
};

/** Human-readable scope labels */
export const scopeLabels = {
  platform:     'Platform',
  organization: 'Organization',
  project:      'Project',
  gallery:      'Gallery',
};
