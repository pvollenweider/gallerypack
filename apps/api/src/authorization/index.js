// apps/api/src/authorization/index.js — centralized authorization engine
//
// Permission model (Option A — documented decision):
//   Any studio member can read any gallery in their studio.
//   Write/publish/delete/upload are restricted by role.
//
// Studio roles (ascending): photographer < editor < admin < owner
// Gallery roles (ascending): viewer < contributor < editor
//
// See docs/permissions.md for the full matrix.

const STUDIO_ROLES  = ['photographer', 'editor', 'admin', 'owner'];
const GALLERY_ROLES = ['viewer', 'contributor', 'editor'];

/**
 * Determine whether a gallery is publicly accessible.
 * `access` column is canonical — all rows have it since migration 013.
 */
function isPublic(gallery) {
  return gallery.access === 'public';
}

function hasStudioRole(studioRole, minRole) {
  if (!studioRole) return false;
  return STUDIO_ROLES.indexOf(studioRole) >= STUDIO_ROLES.indexOf(minRole);
}

function isValidStudioRole(role) {
  return STUDIO_ROLES.includes(role);
}

function isValidGalleryRole(role) {
  return GALLERY_ROLES.includes(role);
}

/**
 * Centralized authorization check.
 *
 * @param {object} user     - The request user object ({ id, studio_id, role })
 * @param {string} action   - 'read' | 'write' | 'delete' | 'manage' | 'publish' | 'upload' | 'notify'
 * @param {string} resource - 'gallery' | 'photo' | 'studio' | 'member'
 * @param {object} context  - { gallery?, studioRole?, galleryRole?, viewerToken? }
 * @returns {boolean}
 */
export function can(user, action, resource, context = {}) {
  const { gallery, studioRole, galleryRole, viewerToken } = context;

  // ── Studio-level actions ────────────────────────────────────────────────────

  if (resource === 'studio' && action === 'manage') {
    return studioRole === 'owner' || studioRole === 'admin';
  }

  if (resource === 'member' && action === 'manage') {
    return studioRole === 'owner' || studioRole === 'admin';
  }

  // ── Gallery-level actions ───────────────────────────────────────────────────

  if (resource === 'gallery' && action === 'read') {
    if (!gallery) return false;
    if (isPublic(gallery)) return true;
    if (viewerToken) return true;           // viewer link grants read-only
    if (isValidStudioRole(studioRole)) return true; // Option A: any studio member reads all galleries
    if (isValidGalleryRole(galleryRole)) return true;
    return false;
  }

  if (resource === 'gallery' && action === 'write') {
    if (hasStudioRole(studioRole, 'editor')) return true;
    if (galleryRole === 'editor') return true;
    return false;
  }

  if (resource === 'gallery' && action === 'delete') {
    return studioRole === 'admin' || studioRole === 'owner';
  }

  if (resource === 'gallery' && action === 'publish') {
    if (hasStudioRole(studioRole, 'editor')) return true;
    if (galleryRole === 'editor') return true; // gallery editor can trigger builds
    return false;
  }

  // notify = photographer signals "photos are ready" to studio admins
  if (resource === 'gallery' && action === 'notify') {
    if (galleryRole === 'contributor' || galleryRole === 'editor') return true;
    if (isValidStudioRole(studioRole)) return true; // studio members can also notify
    return false;
  }

  // ── Photo-level actions ─────────────────────────────────────────────────────

  if (resource === 'photo' && action === 'upload') {
    if (hasStudioRole(studioRole, 'editor')) return true;
    if (galleryRole === 'contributor' || galleryRole === 'editor') return true;
    return false;
  }

  if (resource === 'photo' && action === 'delete') {
    if (hasStudioRole(studioRole, 'editor')) return true;
    if (galleryRole === 'editor') return true;
    return false;
  }

  return false;
}
