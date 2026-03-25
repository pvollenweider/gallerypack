// apps/api/test/authorization.test.js
// Table-driven tests for the can() permission matrix.
// No database required — can() is a pure function of its arguments.
import { test } from 'node:test';
import assert   from 'node:assert/strict';

const { can } = await import('../src/authorization/index.js');

// ── Fixtures ─────────────────────────────────────────────────────────────────

const publicGallery   = { access: 'public' };
const privateGallery  = { access: 'private' };
const passwordGallery = { access: 'password' };

// Minimal user objects (can() only reads them for identity, not for role logic)
const user = {};

// ── Test cases ────────────────────────────────────────────────────────────────
// Format: [description, action, resource, context, expectedResult]

const cases = [

  // ── gallery.read ────────────────────────────────────────────────────────────

  // Public gallery — anyone can read
  ['public gallery is readable without auth',
    'read', 'gallery', { gallery: publicGallery }, true],

  ['public gallery is readable with viewer token',
    'read', 'gallery', { gallery: publicGallery, viewerToken: 'tok' }, true],

  ['public gallery is readable by photographer',
    'read', 'gallery', { gallery: publicGallery, studioRole: 'photographer' }, true],

  // Private gallery — anonymous cannot read
  ['private gallery: anonymous cannot read',
    'read', 'gallery', { gallery: privateGallery }, false],

  // Private gallery — any studio member can read (Option A)
  ['private gallery: owner can read (Option A)',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'owner' }, true],
  ['private gallery: admin can read (Option A)',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'admin' }, true],
  ['private gallery: editor can read (Option A)',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'editor' }, true],
  ['private gallery: photographer can read (Option A)',
    'read', 'gallery', { gallery: privateGallery, studioRole: 'photographer' }, true],

  // Private gallery — gallery role grants read
  ['private gallery: gallery editor can read',
    'read', 'gallery', { gallery: privateGallery, galleryRole: 'editor' }, true],
  ['private gallery: gallery contributor can read',
    'read', 'gallery', { gallery: privateGallery, galleryRole: 'contributor' }, true],
  ['private gallery: gallery viewer can read',
    'read', 'gallery', { gallery: privateGallery, galleryRole: 'viewer' }, true],

  // Private gallery — viewer token grants read
  ['private gallery: viewer token grants read',
    'read', 'gallery', { gallery: privateGallery, viewerToken: 'tok' }, true],

  // Password gallery — same access rules as private
  ['password gallery: anonymous cannot read',
    'read', 'gallery', { gallery: passwordGallery }, false],
  ['password gallery: photographer can read (Option A)',
    'read', 'gallery', { gallery: passwordGallery, studioRole: 'photographer' }, true],
  ['password gallery: viewer token grants read',
    'read', 'gallery', { gallery: passwordGallery, viewerToken: 'tok' }, true],

  // Missing gallery context
  ['read gallery without gallery object returns false',
    'read', 'gallery', { studioRole: 'owner' }, false],

  // ── gallery.write ──────────────────────────────────────────────────────────

  ['write gallery: owner can write',
    'write', 'gallery', { studioRole: 'owner' }, true],
  ['write gallery: admin can write',
    'write', 'gallery', { studioRole: 'admin' }, true],
  ['write gallery: editor (studio) can write',
    'write', 'gallery', { studioRole: 'editor' }, true],
  ['write gallery: photographer cannot write',
    'write', 'gallery', { studioRole: 'photographer' }, false],
  ['write gallery: gallery editor can write',
    'write', 'gallery', { galleryRole: 'editor' }, true],
  ['write gallery: gallery contributor cannot write',
    'write', 'gallery', { galleryRole: 'contributor' }, false],
  ['write gallery: gallery viewer cannot write',
    'write', 'gallery', { galleryRole: 'viewer' }, false],
  ['write gallery: anonymous cannot write',
    'write', 'gallery', {}, false],

  // ── gallery.delete ─────────────────────────────────────────────────────────

  ['delete gallery: owner can delete',
    'delete', 'gallery', { studioRole: 'owner' }, true],
  ['delete gallery: admin can delete',
    'delete', 'gallery', { studioRole: 'admin' }, true],
  ['delete gallery: editor cannot delete',
    'delete', 'gallery', { studioRole: 'editor' }, false],
  ['delete gallery: photographer cannot delete',
    'delete', 'gallery', { studioRole: 'photographer' }, false],
  ['delete gallery: gallery editor cannot delete',
    'delete', 'gallery', { galleryRole: 'editor' }, false],

  // ── gallery.publish ────────────────────────────────────────────────────────

  ['publish gallery: owner can publish',
    'publish', 'gallery', { studioRole: 'owner' }, true],
  ['publish gallery: admin can publish',
    'publish', 'gallery', { studioRole: 'admin' }, true],
  ['publish gallery: studio editor can publish',
    'publish', 'gallery', { studioRole: 'editor' }, true],
  ['publish gallery: photographer cannot publish without gallery role',
    'publish', 'gallery', { studioRole: 'photographer' }, false],
  ['publish gallery: gallery editor can publish',
    'publish', 'gallery', { galleryRole: 'editor' }, true],
  ['publish gallery: gallery contributor cannot publish',
    'publish', 'gallery', { galleryRole: 'contributor' }, false],
  ['publish gallery: anonymous cannot publish',
    'publish', 'gallery', {}, false],

  // Photographer with gallery editor role can publish (e.g. invited collaborator)
  ['publish gallery: photographer + gallery editor can publish',
    'publish', 'gallery', { studioRole: 'photographer', galleryRole: 'editor' }, true],

  // ── gallery.notify ─────────────────────────────────────────────────────────

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

  // ── photo.upload ───────────────────────────────────────────────────────────

  ['upload photo: owner can upload',
    'upload', 'photo', { studioRole: 'owner' }, true],
  ['upload photo: admin can upload',
    'upload', 'photo', { studioRole: 'admin' }, true],
  ['upload photo: studio editor can upload',
    'upload', 'photo', { studioRole: 'editor' }, true],
  ['upload photo: photographer cannot upload without gallery role',
    'upload', 'photo', { studioRole: 'photographer' }, false],
  ['upload photo: gallery contributor can upload',
    'upload', 'photo', { galleryRole: 'contributor' }, true],
  ['upload photo: gallery editor can upload',
    'upload', 'photo', { galleryRole: 'editor' }, true],
  ['upload photo: gallery viewer cannot upload',
    'upload', 'photo', { galleryRole: 'viewer' }, false],
  ['upload photo: anonymous cannot upload',
    'upload', 'photo', {}, false],

  // Photographer with contributor gallery role can upload
  ['upload photo: photographer + gallery contributor can upload',
    'upload', 'photo', { studioRole: 'photographer', galleryRole: 'contributor' }, true],

  // ── photo.delete ───────────────────────────────────────────────────────────

  ['delete photo: owner can delete',
    'delete', 'photo', { studioRole: 'owner' }, true],
  ['delete photo: admin can delete',
    'delete', 'photo', { studioRole: 'admin' }, true],
  ['delete photo: studio editor can delete',
    'delete', 'photo', { studioRole: 'editor' }, true],
  ['delete photo: photographer cannot delete',
    'delete', 'photo', { studioRole: 'photographer' }, false],
  ['delete photo: gallery editor can delete',
    'delete', 'photo', { galleryRole: 'editor' }, true],
  ['delete photo: gallery contributor cannot delete',
    'delete', 'photo', { galleryRole: 'contributor' }, false],
  ['delete photo: anonymous cannot delete',
    'delete', 'photo', {}, false],

  // ── studio.manage ──────────────────────────────────────────────────────────

  ['manage studio: owner can manage',
    'manage', 'studio', { studioRole: 'owner' }, true],
  ['manage studio: admin can manage',
    'manage', 'studio', { studioRole: 'admin' }, true],
  ['manage studio: editor cannot manage',
    'manage', 'studio', { studioRole: 'editor' }, false],
  ['manage studio: photographer cannot manage',
    'manage', 'studio', { studioRole: 'photographer' }, false],

  // ── member.manage ──────────────────────────────────────────────────────────

  ['manage member: owner can manage',
    'manage', 'member', { studioRole: 'owner' }, true],
  ['manage member: admin can manage',
    'manage', 'member', { studioRole: 'admin' }, true],
  ['manage member: editor cannot manage',
    'manage', 'member', { studioRole: 'editor' }, false],
  ['manage member: photographer cannot manage',
    'manage', 'member', { studioRole: 'photographer' }, false],

  // ── unknown action / resource fallthrough ──────────────────────────────────

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
