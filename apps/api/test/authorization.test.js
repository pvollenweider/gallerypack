// apps/api/test/authorization.test.js
// Table-driven tests for the can() permission matrix.
// No database required — can() is a pure function of its arguments.
// Studio roles: photographer < collaborator < admin < owner
// Project roles: contributor < editor < manager
// Gallery roles: viewer < contributor < editor
import { test } from 'node:test';
import assert   from 'node:assert/strict';

const { can } = await import('../src/authorization/index.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const publicGallery   = { access: 'public' };
const privateGallery  = { access: 'private' };
const passwordGallery = { access: 'password' };

const user = {};

// ── Test cases ────────────────────────────────────────────────────────────────
// Format: [description, action, resource, context, expectedResult]

const cases = [

  // ── platform superadmin ─────────────────────────────────────────────────────

  ['superadmin bypasses delete gallery',
    'delete', 'gallery', { platformRole: 'superadmin' }, true],
  ['superadmin bypasses manage studio',
    'manageSettings', 'studio', { platformRole: 'superadmin' }, true],

  // ── studio.read ─────────────────────────────────────────────────────────────

  ['studio.read: photographer can read studio',
    'read', 'studio', { studioRole: 'photographer' }, true],
  ['studio.read: collaborator can read studio',
    'read', 'studio', { studioRole: 'collaborator' }, true],
  ['studio.read: anonymous cannot read studio',
    'read', 'studio', {}, false],

  // ── studio.manage / manageMembers / manageProjects / manageSettings ──────────

  ['manageSettings studio: owner can manage',
    'manageSettings', 'studio', { studioRole: 'owner' }, true],
  ['manageSettings studio: admin can manage',
    'manageSettings', 'studio', { studioRole: 'admin' }, true],
  ['manageSettings studio: collaborator cannot manage',
    'manageSettings', 'studio', { studioRole: 'collaborator' }, false],
  ['manageMembers studio: admin can manage',
    'manageMembers', 'studio', { studioRole: 'admin' }, true],
  ['manageMembers studio: collaborator cannot manage',
    'manageMembers', 'studio', { studioRole: 'collaborator' }, false],
  ['manageProjects studio: admin can manage',
    'manageProjects', 'studio', { studioRole: 'admin' }, true],
  ['manageProjects studio: photographer cannot manage',
    'manageProjects', 'studio', { studioRole: 'photographer' }, false],

  // ── gallery.read ─────────────────────────────────────────────────────────────

  ['public gallery is readable without auth',
    'read', 'gallery', { gallery: publicGallery }, true],
  ['public gallery is readable with viewer token',
    'read', 'gallery', { gallery: publicGallery, viewerToken: 'tok' }, true],
  ['public gallery is readable by photographer',
    'read', 'gallery', { gallery: publicGallery, studioRole: 'photographer' }, true],

  ['private gallery: anonymous cannot read',
    'read', 'gallery', { gallery: privateGallery }, false],
  ['private gallery: owner can read',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'owner' }, true],
  ['private gallery: admin can read',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'admin' }, true],
  ['private gallery: collaborator can read',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'collaborator' }, true],
  ['private gallery: photographer can read',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'photographer' }, true],
  ['private gallery: project contributor can read',
    'read', 'gallery', { gallery: privateGallery, projectRole: 'contributor' }, true],
  ['private gallery: gallery editor can read',
    'read', 'gallery', { gallery: privateGallery, galleryRole: 'editor' }, true],
  ['private gallery: gallery contributor can read',
    'read', 'gallery', { gallery: privateGallery, galleryRole: 'contributor' }, true],
  ['private gallery: gallery viewer can read',
    'read', 'gallery', { gallery: privateGallery, galleryRole: 'viewer' }, true],
  ['private gallery: viewer token grants read',
    'read', 'gallery', { gallery: privateGallery, viewerToken: 'tok' }, true],

  ['password gallery: anonymous cannot read',
    'read', 'gallery', { gallery: passwordGallery }, false],
  ['password gallery: photographer can read',
    'read', 'gallery', { gallery: passwordGallery, studioRole: 'photographer' }, true],
  ['password gallery: viewer token grants read',
    'read', 'gallery', { gallery: passwordGallery, viewerToken: 'tok' }, true],

  ['read gallery without gallery object returns false',
    'read', 'gallery', { studioRole: 'owner' }, false],

  // ── gallery.write ─────────────────────────────────────────────────────────

  ['write gallery: owner can write',
    'write', 'gallery', { studioRole: 'owner' }, true],
  ['write gallery: admin can write',
    'write', 'gallery', { studioRole: 'admin' }, true],
  ['write gallery: collaborator can write',
    'write', 'gallery', { studioRole: 'collaborator' }, true],
  ['write gallery: photographer cannot write',
    'write', 'gallery', { studioRole: 'photographer' }, false],
  ['write gallery: project editor can write',
    'write', 'gallery', { projectRole: 'editor' }, true],
  ['write gallery: project manager can write',
    'write', 'gallery', { projectRole: 'manager' }, true],
  ['write gallery: project contributor cannot write',
    'write', 'gallery', { projectRole: 'contributor' }, false],
  ['write gallery: gallery editor can write',
    'write', 'gallery', { galleryRole: 'editor' }, true],
  ['write gallery: gallery contributor cannot write',
    'write', 'gallery', { galleryRole: 'contributor' }, false],
  ['write gallery: gallery viewer cannot write',
    'write', 'gallery', { galleryRole: 'viewer' }, false],
  ['write gallery: anonymous cannot write',
    'write', 'gallery', {}, false],

  // ── gallery.delete ────────────────────────────────────────────────────────

  ['delete gallery: owner can delete',
    'delete', 'gallery', { studioRole: 'owner' }, true],
  ['delete gallery: admin can delete',
    'delete', 'gallery', { studioRole: 'admin' }, true],
  ['delete gallery: collaborator cannot delete',
    'delete', 'gallery', { studioRole: 'collaborator' }, false],
  ['delete gallery: photographer cannot delete',
    'delete', 'gallery', { studioRole: 'photographer' }, false],
  ['delete gallery: gallery editor cannot delete',
    'delete', 'gallery', { galleryRole: 'editor' }, false],
  ['delete gallery: project manager cannot delete (studio admin only)',
    'delete', 'gallery', { projectRole: 'manager' }, false],

  // ── gallery.publish ───────────────────────────────────────────────────────

  ['publish gallery: owner can publish',
    'publish', 'gallery', { studioRole: 'owner' }, true],
  ['publish gallery: admin can publish',
    'publish', 'gallery', { studioRole: 'admin' }, true],
  ['publish gallery: collaborator can publish',
    'publish', 'gallery', { studioRole: 'collaborator' }, true],
  ['publish gallery: photographer cannot publish without role',
    'publish', 'gallery', { studioRole: 'photographer' }, false],
  ['publish gallery: project editor can publish',
    'publish', 'gallery', { projectRole: 'editor' }, true],
  ['publish gallery: project contributor cannot publish',
    'publish', 'gallery', { projectRole: 'contributor' }, false],
  ['publish gallery: gallery editor can publish',
    'publish', 'gallery', { galleryRole: 'editor' }, true],
  ['publish gallery: gallery contributor cannot publish',
    'publish', 'gallery', { galleryRole: 'contributor' }, false],
  ['publish gallery: anonymous cannot publish',
    'publish', 'gallery', {}, false],
  ['publish gallery: photographer + gallery editor can publish',
    'publish', 'gallery', { studioRole: 'photographer', galleryRole: 'editor' }, true],

  // ── gallery.build ─────────────────────────────────────────────────────────

  ['build gallery: admin can build',
    'build', 'gallery', { studioRole: 'admin' }, true],
  ['build gallery: collaborator can build',
    'build', 'gallery', { studioRole: 'collaborator' }, true],
  ['build gallery: photographer cannot build without role',
    'build', 'gallery', { studioRole: 'photographer' }, false],
  ['build gallery: project editor can build',
    'build', 'gallery', { projectRole: 'editor' }, true],
  ['build gallery: gallery editor can build',
    'build', 'gallery', { galleryRole: 'editor' }, true],
  ['build gallery: gallery contributor cannot build',
    'build', 'gallery', { galleryRole: 'contributor' }, false],

  // ── gallery.upload ────────────────────────────────────────────────────────

  ['upload gallery: collaborator can upload',
    'upload', 'gallery', { studioRole: 'collaborator' }, true],
  ['upload gallery: photographer cannot upload without role',
    'upload', 'gallery', { studioRole: 'photographer' }, false],
  ['upload gallery: project contributor can upload',
    'upload', 'gallery', { projectRole: 'contributor' }, true],
  ['upload gallery: gallery contributor can upload',
    'upload', 'gallery', { galleryRole: 'contributor' }, true],
  ['upload gallery: gallery viewer cannot upload',
    'upload', 'gallery', { galleryRole: 'viewer' }, false],

  // ── gallery.deletePhoto ───────────────────────────────────────────────────

  ['deletePhoto: admin can deletePhoto',
    'deletePhoto', 'gallery', { studioRole: 'admin' }, true],
  ['deletePhoto: collaborator can deletePhoto',
    'deletePhoto', 'gallery', { studioRole: 'collaborator' }, true],
  ['deletePhoto: photographer cannot deletePhoto',
    'deletePhoto', 'gallery', { studioRole: 'photographer' }, false],
  ['deletePhoto: project editor can deletePhoto',
    'deletePhoto', 'gallery', { projectRole: 'editor' }, true],
  ['deletePhoto: project contributor cannot deletePhoto',
    'deletePhoto', 'gallery', { projectRole: 'contributor' }, false],
  ['deletePhoto: gallery editor can deletePhoto',
    'deletePhoto', 'gallery', { galleryRole: 'editor' }, true],
  ['deletePhoto: gallery contributor cannot deletePhoto',
    'deletePhoto', 'gallery', { galleryRole: 'contributor' }, false],

  // ── gallery.manageAccess ──────────────────────────────────────────────────

  ['manageAccess gallery: admin can manage',
    'manageAccess', 'gallery', { studioRole: 'admin' }, true],
  ['manageAccess gallery: collaborator cannot manage',
    'manageAccess', 'gallery', { studioRole: 'collaborator' }, false],
  ['manageAccess gallery: project manager can manage',
    'manageAccess', 'gallery', { projectRole: 'manager' }, true],
  ['manageAccess gallery: project editor cannot manage',
    'manageAccess', 'gallery', { projectRole: 'editor' }, false],
  ['manageAccess gallery: gallery editor can manage',
    'manageAccess', 'gallery', { galleryRole: 'editor' }, true],
  ['manageAccess gallery: gallery contributor cannot manage',
    'manageAccess', 'gallery', { galleryRole: 'contributor' }, false],

  // ── gallery.viewBuildLogs ─────────────────────────────────────────────────

  ['viewBuildLogs: photographer can view',
    'viewBuildLogs', 'gallery', { studioRole: 'photographer' }, true],
  ['viewBuildLogs: project contributor can view',
    'viewBuildLogs', 'gallery', { projectRole: 'contributor' }, true],
  ['viewBuildLogs: gallery viewer can view',
    'viewBuildLogs', 'gallery', { galleryRole: 'viewer' }, true],
  ['viewBuildLogs: anonymous cannot view',
    'viewBuildLogs', 'gallery', {}, false],

  // ── gallery.notify ────────────────────────────────────────────────────────

  ['notify gallery: gallery contributor can notify',
    'notify', 'gallery', { galleryRole: 'contributor' }, true],
  ['notify gallery: gallery editor can notify',
    'notify', 'gallery', { galleryRole: 'editor' }, true],
  ['notify gallery: gallery viewer cannot notify',
    'notify', 'gallery', { galleryRole: 'viewer' }, false],
  ['notify gallery: studio member can notify',
    'notify', 'gallery', { studioRole: 'photographer' }, true],
  ['notify gallery: anonymous cannot notify',
    'notify', 'gallery', {}, false],

  // ── photo.upload (compat) ─────────────────────────────────────────────────

  ['upload photo: owner can upload',
    'upload', 'photo', { studioRole: 'owner' }, true],
  ['upload photo: admin can upload',
    'upload', 'photo', { studioRole: 'admin' }, true],
  ['upload photo: collaborator can upload',
    'upload', 'photo', { studioRole: 'collaborator' }, true],
  ['upload photo: photographer cannot upload without gallery role',
    'upload', 'photo', { studioRole: 'photographer' }, false],
  ['upload photo: gallery contributor can upload',
    'upload', 'photo', { galleryRole: 'contributor' }, true],
  ['upload photo: gallery editor can upload',
    'upload', 'photo', { galleryRole: 'editor' }, true],
  ['upload photo: gallery viewer cannot upload',
    'upload', 'photo', { galleryRole: 'viewer' }, false],
  ['upload photo: project contributor can upload',
    'upload', 'photo', { projectRole: 'contributor' }, true],
  ['upload photo: anonymous cannot upload',
    'upload', 'photo', {}, false],
  ['upload photo: photographer + gallery contributor can upload',
    'upload', 'photo', { studioRole: 'photographer', galleryRole: 'contributor' }, true],

  // ── photo.delete (compat) ─────────────────────────────────────────────────

  ['delete photo: owner can delete',
    'delete', 'photo', { studioRole: 'owner' }, true],
  ['delete photo: admin can delete',
    'delete', 'photo', { studioRole: 'admin' }, true],
  ['delete photo: collaborator can delete',
    'delete', 'photo', { studioRole: 'collaborator' }, true],
  ['delete photo: photographer cannot delete',
    'delete', 'photo', { studioRole: 'photographer' }, false],
  ['delete photo: gallery editor can delete',
    'delete', 'photo', { galleryRole: 'editor' }, true],
  ['delete photo: gallery contributor cannot delete',
    'delete', 'photo', { galleryRole: 'contributor' }, false],
  ['delete photo: project editor can delete',
    'delete', 'photo', { projectRole: 'editor' }, true],
  ['delete photo: anonymous cannot delete',
    'delete', 'photo', {}, false],

  // ── studio.manage (compat) ────────────────────────────────────────────────

  ['manage studio: owner can manage',
    'manage', 'studio', { studioRole: 'owner' }, true],
  ['manage studio: admin can manage',
    'manage', 'studio', { studioRole: 'admin' }, true],
  ['manage studio: collaborator cannot manage',
    'manage', 'studio', { studioRole: 'collaborator' }, false],
  ['manage studio: photographer cannot manage',
    'manage', 'studio', { studioRole: 'photographer' }, false],

  // ── member.manage (compat) ────────────────────────────────────────────────

  ['manage member: owner can manage',
    'manage', 'member', { studioRole: 'owner' }, true],
  ['manage member: admin can manage',
    'manage', 'member', { studioRole: 'admin' }, true],
  ['manage member: collaborator cannot manage',
    'manage', 'member', { studioRole: 'collaborator' }, false],
  ['manage member: photographer cannot manage',
    'manage', 'member', { studioRole: 'photographer' }, false],

  // ── project actions ───────────────────────────────────────────────────────

  ['project.read: photographer can read',
    'read', 'project', { studioRole: 'photographer' }, true],
  ['project.read: project contributor can read',
    'read', 'project', { projectRole: 'contributor' }, true],
  ['project.read: anonymous cannot read',
    'read', 'project', {}, false],
  ['project.write: admin can write',
    'write', 'project', { studioRole: 'admin' }, true],
  ['project.write: collaborator cannot write',
    'write', 'project', { studioRole: 'collaborator' }, false],
  ['project.write: project manager can write',
    'write', 'project', { projectRole: 'manager' }, true],
  ['project.delete: admin can delete',
    'delete', 'project', { studioRole: 'admin' }, true],
  ['project.delete: owner can delete',
    'delete', 'project', { studioRole: 'owner' }, true],
  ['project.delete: collaborator cannot delete',
    'delete', 'project', { studioRole: 'collaborator' }, false],
  ['project.manage: admin can manage',
    'manage', 'project', { studioRole: 'admin' }, true],
  ['project.manage: project manager can manage',
    'manage', 'project', { projectRole: 'manager' }, true],
  ['project.manage: project editor cannot manage',
    'manage', 'project', { projectRole: 'editor' }, false],

  // ── cross-studio denial ───────────────────────────────────────────────────

  ['cross-studio: no roles means no delete access',
    'delete', 'gallery', {}, false],
  ['cross-studio: no roles means no manage studio access',
    'manage', 'studio', {}, false],

  // ── unknown action / resource fallthrough ─────────────────────────────────

  ['unknown action returns false',
    'fly', 'gallery', { studioRole: 'owner' }, false],
  ['unknown resource returns false',
    'read', 'spaceship', { studioRole: 'owner' }, false],
];

// ── Runner ────────────────────────────────────────────────────────────────────

for (const [description, action, resource, context, expected] of cases) {
  test(description, () => {
    const result = can(user, action, resource, context);
    assert.equal(result, expected,
      `can(_, '${action}', '${resource}', ${JSON.stringify(context)}) → expected ${expected}, got ${result}`);
  });
}
