// apps/api/src/authorization/index.js — centralized authorization engine

const STUDIO_ROLES  = ['photographer', 'editor', 'admin', 'owner'];
const GALLERY_ROLES = ['viewer', 'contributor', 'editor'];

/**
 * Determine whether a gallery is publicly accessible.
 * The `access` column is canonical; falls back to `!private` for legacy rows.
 * @param {object} gallery
 * @returns {boolean}
 */
function isPublic(gallery) {
  if (gallery.access !== undefined) return gallery.access === 'public';
  return !gallery.private;
}

function hasStudioRole(studioRole, minRole) {
  if (!studioRole) return false;
  return STUDIO_ROLES.indexOf(studioRole) >= STUDIO_ROLES.indexOf(minRole);
}

function hasGalleryRole(galleryRole, minRole) {
  if (!galleryRole) return false;
  return GALLERY_ROLES.indexOf(galleryRole) >= GALLERY_ROLES.indexOf(minRole);
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
 * @param {string} action   - 'read' | 'write' | 'delete' | 'manage' | 'publish' | 'upload'
 * @param {string} resource - 'gallery' | 'photo' | 'studio' | 'member'
 * @param {object} context  - Extra info: { gallery, studioRole, galleryRole, viewerToken? }
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
    if (viewerToken) return true;  // valid viewer token grants read-only access
    if (isValidStudioRole(studioRole)) return true;
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
    return hasStudioRole(studioRole, 'editor');
  }

  // ── Photo-level actions ─────────────────────────────────────────────────────

  if (resource === 'photo' && action === 'upload') {
    if (hasStudioRole(studioRole, 'editor')) return true;  // editor/admin/owner → anywhere
    if (galleryRole === 'contributor' || galleryRole === 'editor') return true;  // photographer → only where granted
    return false;
  }

  if (resource === 'photo' && action === 'delete') {
    if (hasStudioRole(studioRole, 'editor')) return true;
    if (galleryRole === 'editor') return true;
    return false;
  }

  return false;
}
