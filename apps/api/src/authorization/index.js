// apps/api/src/authorization/index.js — centralized authorization engine
//
// Permission model (platform → studio → project → gallery):
//
// Studio roles (ascending):  photographer < collaborator < admin < owner
// Project roles (ascending): contributor  < editor < manager
// Gallery roles (ascending): viewer < contributor < editor
//
// Inheritance:
//   1. Platform 'superadmin' → all actions everywhere
//   2. Studio owner/admin   → all actions in their studio
//   3. Studio collaborator  → gallery.read/edit/upload/build/publish + project.read
//   4. Studio photographer  → gallery.read only (write requires explicit gallery role)
//   5. Project manager      → all gallery actions within the project
//   6. Project editor       → gallery.read/edit/upload
//   7. Project contributor  → gallery.upload
//   8. Gallery editor       → gallery.edit/upload/deletePhoto/build/publish
//   9. Gallery contributor  → gallery.upload
//  10. Gallery viewer       → gallery.read
//  11. Viewer token         → gallery.read for the specific gallery
//
// See docs/permissions.md for the full matrix.

const STUDIO_ROLES  = ['photographer', 'collaborator', 'admin', 'owner'];
const PROJECT_ROLES = ['contributor', 'editor', 'manager'];
const GALLERY_ROLES = ['viewer', 'contributor', 'editor'];

function isValidStudioRole(role) {
  return STUDIO_ROLES.includes(role);
}

function isValidGalleryRole(role) {
  return GALLERY_ROLES.includes(role);
}

function hasStudioRole(studioRole, minRole) {
  if (!studioRole) return false;
  return STUDIO_ROLES.indexOf(studioRole) >= STUDIO_ROLES.indexOf(minRole);
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
 * @param {object} user     - The request user object ({ id, studio_id, role })
 * @param {string} action   - See matrix above
 * @param {string} resource - 'gallery' | 'photo' | 'studio' | 'member' | 'project'
 * @param {object} context  - { platformRole?, studioRole?, projectRole?, galleryRole?, gallery?, viewerToken? }
 * @returns {boolean}
 */
export function can(user, action, resource, context = {}) {
  const { platformRole, studioRole, projectRole, galleryRole, gallery, viewerToken } = context;

  // ── Platform superadmin bypasses all checks ───────────────────────────────

  if (platformRole === 'superadmin') return true;

  // ── Studio-level actions ──────────────────────────────────────────────────

  if (resource === 'studio') {
    if (action === 'read') return isValidStudioRole(studioRole);

    // manage / manageSettings / manageProjects / manageMembers → admin+
    if (action === 'manage' || action === 'manageSettings' ||
        action === 'manageProjects' || action === 'manageMembers') {
      return hasStudioRole(studioRole, 'admin');
    }
    return false;
  }

  // ── Member-level actions (compat) ─────────────────────────────────────────

  if (resource === 'member') {
    if (action === 'manage') return hasStudioRole(studioRole, 'admin');
    return false;
  }

  // ── Project-level actions ─────────────────────────────────────────────────

  if (resource === 'project') {
    if (action === 'read') {
      return isValidStudioRole(studioRole) || hasProjectRole(projectRole, 'contributor');
    }

    // write / edit → admin+ or project manager
    if (action === 'write' || action === 'edit') {
      return hasStudioRole(studioRole, 'admin') || hasProjectRole(projectRole, 'manager');
    }

    if (action === 'delete') return hasStudioRole(studioRole, 'admin');

    // manage / manageMembers / manageAccess → admin+ or project manager
    if (action === 'manage' || action === 'manageMembers' || action === 'manageAccess') {
      return hasStudioRole(studioRole, 'admin') || hasProjectRole(projectRole, 'manager');
    }
    return false;
  }

  // ── Gallery-level actions ─────────────────────────────────────────────────

  if (resource === 'gallery') {

    if (action === 'read') {
      if (!gallery) return false;
      if (gallery.access === 'public') return true;
      if (viewerToken) return true;
      if (isValidStudioRole(studioRole)) return true;   // any studio member
      if (hasGalleryRole(galleryRole, 'viewer')) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      return false;
    }

    // write / edit → collaborator+ | project editor+ | gallery editor
    if (action === 'write' || action === 'edit') {
      if (hasStudioRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    if (action === 'delete') return hasStudioRole(studioRole, 'admin');

    // publish / build → same as write
    if (action === 'publish' || action === 'build') {
      if (hasStudioRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    // upload (gallery resource) → collaborator+ | project contributor+ | gallery contributor+
    if (action === 'upload') {
      if (hasStudioRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      if (hasGalleryRole(galleryRole, 'contributor')) return true;
      return false;
    }

    // deletePhoto → collaborator+ | project editor+ | gallery editor
    if (action === 'deletePhoto') {
      if (hasStudioRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    // manageAccess → admin+ | project manager | gallery editor
    if (action === 'manageAccess') {
      if (hasStudioRole(studioRole, 'admin')) return true;
      if (hasProjectRole(projectRole, 'manager')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }

    // viewBuildLogs → any member (studio, project, or gallery role)
    if (action === 'viewBuildLogs') {
      if (isValidStudioRole(studioRole)) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      if (isValidGalleryRole(galleryRole)) return true;
      return false;
    }

    // notify = signal "photos are ready" to studio admins
    if (action === 'notify') {
      if (hasGalleryRole(galleryRole, 'contributor')) return true;
      if (isValidStudioRole(studioRole)) return true;
      return false;
    }

    return false;
  }

  // ── Photo-level actions (compat aliases) ──────────────────────────────────

  if (resource === 'photo') {
    if (action === 'upload') {
      if (hasStudioRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'contributor')) return true;
      if (hasGalleryRole(galleryRole, 'contributor')) return true;
      return false;
    }
    if (action === 'delete') {
      if (hasStudioRole(studioRole, 'collaborator')) return true;
      if (hasProjectRole(projectRole, 'editor')) return true;
      if (hasGalleryRole(galleryRole, 'editor')) return true;
      return false;
    }
    return false;
  }

  return false;
}
