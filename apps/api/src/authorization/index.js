// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/authorization/index.js — centralized authorization engine
//
// Permission model (platform → organization → project → gallery):
//
// Organization roles (ascending):  photographer < collaborator < admin < owner
// Project roles (ascending): contributor  < editor < manager
// Gallery roles (ascending): viewer < contributor < editor
//
// Inheritance:
//   1. Platform 'superadmin' → all actions everywhere
//   2. Organization owner/admin   → all actions in their org
//   3. Organization collaborator  → gallery.read/edit/upload/build/publish + project.read
//   4. Organization photographer  → gallery.read only (write requires explicit gallery role)
//   5. Project manager      → all gallery actions within the project
//   6. Project editor       → gallery.read/edit/upload
//   7. Project contributor  → gallery.upload
//   8. Gallery editor       → gallery.edit/upload/deletePhoto/build/publish
//   9. Gallery contributor  → gallery.upload
//  10. Gallery viewer       → gallery.read
//  11. Viewer token         → gallery.read for the specific gallery
//
// See docs/permissions.md for the full matrix.

const ORG_ROLES     = ['photographer', 'collaborator', 'admin', 'owner'];
const PROJECT_ROLES = ['contributor', 'editor', 'manager'];
const GALLERY_ROLES = ['viewer', 'contributor', 'editor'];

function isValidOrgRole(role) {
  return ORG_ROLES.includes(role);
}

function isValidGalleryRole(role) {
  return GALLERY_ROLES.includes(role);
}

function hasOrgRole(orgRole, minRole) {
  if (!orgRole) return false;
  return ORG_ROLES.indexOf(orgRole) >= ORG_ROLES.indexOf(minRole);
}

function hasProjectRole(projectRole, minRole) {
  if (!projectRole) return false;
  return PROJECT_ROLES.indexOf(projectRole) >= PROJECT_ROLES.indexOf(minRole);
}

function hasGalleryRole(galleryRole, minRole) {
  if (!galleryRole) return false;
  return GALLERY_ROLES.indexOf(galleryRole) >= GALLERY_ROLES.indexOf(minRole);
}

/**
 * Centralized authorization check.
 *
 * @param {object} user     - The request user object ({ id, organization_id, role })
 * @param {string} action   - See matrix above
 * @param {string} resource - 'gallery' | 'photo' | 'studio' | 'organization' | 'member' | 'project'
 * @param {object} context  - { platformRole?, studioRole?, orgRole?, projectRole?, galleryRole?, gallery?, viewerToken? }
 * @returns {boolean}
 */
export function can(user, action, resource, context = {}) {
  // orgRole is the canonical name (Sprint 22); studioRole is the legacy alias — accept either.
  // orgRole takes precedence so that new callers using the canonical name aren't overridden by old code.
  const studioRole = context.orgRole ?? context.studioRole ?? null;
  const { projectRole, galleryRole, gallery, viewerToken } = context;

  // ── Platform superadmin bypasses all checks ───────────────────────────────
  // Accept platformRole from context (legacy callers) or directly from user object
  const platformRole = context.platformRole ?? user?.platform_role ?? null;
  if (platformRole === 'superadmin') return true;

  // ── Organization-level actions (resource = 'studio' or 'organization') ───

  if (resource === 'studio' || resource === 'organization') {
    if (action === 'read') return isValidOrgRole(studioRole);

    // manage / manageSettings / manageProjects / manageMembers → admin+
    if (action === 'manage' || action === 'manageSettings' ||
        action === 'manageProjects' || action === 'manageMembers') {
      return hasOrgRole(studioRole, 'admin');
    }
    return false;
  }

  // ── Member-level actions (compat) ─────────────────────────────────────────

  if (resource === 'member') {
    if (action === 'manage') return hasOrgRole(studioRole, 'admin');
    return false;
  }

  // ── Project-level actions ─────────────────────────────────────────────────

  if (resource === 'project') {
    if (action === 'read') {
      return isValidOrgRole(studioRole) || hasProjectRole(projectRole, 'contributor');
    }

    // write / edit → admin+ or project manager
    if (action === 'write' || action === 'edit') {
      return hasOrgRole(studioRole, 'admin') || hasProjectRole(projectRole, 'manager');
    }

    if (action === 'delete') return hasOrgRole(studioRole, 'admin');

    // manage / manageMembers → admin+
    if (action === 'manage' || action === 'manageMembers') {
      return hasOrgRole(studioRole, 'admin') || hasProjectRole(projectRole, 'manager');
    }

    // manageAccess → collaborator+ or project manager
    if (action === 'manageAccess') {
      return hasOrgRole(studioRole, 'collaborator') || hasProjectRole(projectRole, 'manager');
    }
    return false;
  }

  // ── Gallery-level actions ─────────────────────────────────────────────────

  if (resource === 'gallery') {

    if (action === 'read') {
      if (!gallery) return false;
      if (gallery.access === 'public') return true;
      if (viewerToken) return true;
      if (isValidOrgRole(studioRole)) return true;   // any studio member
      if (hasGalleryRole(galleryRole, 'viewer')) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      return false;
    }

    // write / edit → collaborator+ | project editor+ | gallery editor
    if (action === 'write' || action === 'edit') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    if (action === 'delete') return hasOrgRole(studioRole, 'admin');

    // publish / build → same as write
    if (action === 'publish' || action === 'build') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    // upload (gallery resource) → collaborator+ | project contributor+ | gallery contributor+
    if (action === 'upload') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      if (hasGalleryRole(galleryRole, 'contributor')) return true;
      return false;
    }

    // deletePhoto → collaborator+ | project editor+ | gallery editor
    if (action === 'deletePhoto') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    // manageAccess → collaborator+ | project manager | gallery editor
    if (action === 'manageAccess') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'manager')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    // viewBuildLogs → any member (studio, project, or gallery role)
    if (action === 'viewBuildLogs') {
      if (isValidOrgRole(studioRole)) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      if (isValidGalleryRole(galleryRole)) return true;
      return false;
    }

    // notify = signal "photos are ready" to studio admins
    if (action === 'notify') {
      if (hasGalleryRole(galleryRole, 'contributor')) return true;
      if (isValidOrgRole(studioRole)) return true;
      return false;
    }

    return false;
  }

  // ── Photo-level actions (compat aliases) ──────────────────────────────────

  if (resource === 'photo') {
    if (action === 'upload') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      if (hasGalleryRole(galleryRole, 'contributor')) return true;
      return false;
    }
    if (action === 'delete') {
      if (hasOrgRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }
    return false;
  }

  return false;
}
