// apps/api/src/authorization/can.test.js — unit tests for the can() engine
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { can } from './index.js';

const user = { id: 'u1', studio_id: 's1', role: 'admin' };

// ── Studio-level: manage studio ───────────────────────────────────────────────

describe('can manage studio', () => {
  test('owner can manage studio', () => {
    assert.equal(can(user, 'manage', 'studio', { studioRole: 'owner' }), true);
  });

  test('admin can manage studio', () => {
    assert.equal(can(user, 'manage', 'studio', { studioRole: 'admin' }), true);
  });

  test('editor cannot manage studio', () => {
    assert.equal(can(user, 'manage', 'studio', { studioRole: 'editor' }), false);
  });

  test('photographer cannot manage studio', () => {
    assert.equal(can(user, 'manage', 'studio', { studioRole: 'photographer' }), false);
  });

  test('no studio role cannot manage studio', () => {
    assert.equal(can(user, 'manage', 'studio', {}), false);
  });
});

// ── Studio-level: manage member ───────────────────────────────────────────────

describe('can manage member', () => {
  test('owner can manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'owner' }), true);
  });

  test('admin can manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'admin' }), true);
  });

  test('editor cannot manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'editor' }), false);
  });

  test('photographer cannot manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'photographer' }), false);
  });
});

// ── Gallery-level: read gallery ───────────────────────────────────────────────

describe('can read gallery', () => {
  const publicGallery  = { access: 'public',  private: false };
  const privateGallery = { access: 'private', private: true  };
  // access column is now canonical: access='public' means public even if private=1
  const publicButPriv  = { access: 'public',  private: true  };

  test('public gallery is readable by anyone (no roles)', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: publicGallery }), true);
  });

  test('access column is canonical: access=public overrides private flag', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: publicButPriv }), true);
  });

  test('private gallery is not readable without roles', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery }), false);
  });

  test('studio photographer can read private gallery', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, studioRole: 'photographer' }), true);
  });

  test('studio editor can read private gallery', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, studioRole: 'editor' }), true);
  });

  test('gallery viewer role grants read access', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, galleryRole: 'viewer' }), true);
  });

  test('gallery contributor role grants read access', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, galleryRole: 'contributor' }), true);
  });

  test('gallery editor role grants read access', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, galleryRole: 'editor' }), true);
  });
});

// ── Gallery-level: viewer token read access ───────────────────────────────────

describe('can read gallery with viewerToken', () => {
  const privateGallery = { access: 'private', private: true };

  test('valid viewerToken grants read access to a private gallery', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, viewerToken: true }), true);
  });

  test('viewerToken without gallery context returns false', () => {
    assert.equal(can(user, 'read', 'gallery', { viewerToken: true }), false);
  });

  test('viewerToken does not grant write access', () => {
    assert.equal(can(user, 'write', 'gallery', { gallery: privateGallery, viewerToken: true }), false);
  });
});

// ── Gallery-level: write gallery ──────────────────────────────────────────────

describe('can write gallery', () => {
  test('studio owner can write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { studioRole: 'owner' }), true);
  });

  test('studio admin can write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { studioRole: 'admin' }), true);
  });

  test('studio editor can write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { studioRole: 'editor' }), true);
  });

  test('studio photographer cannot write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { studioRole: 'photographer' }), false);
  });

  test('gallery editor role can write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { galleryRole: 'editor' }), true);
  });

  test('gallery contributor role cannot write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { galleryRole: 'contributor' }), false);
  });

  test('gallery viewer role cannot write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { galleryRole: 'viewer' }), false);
  });

  test('no roles cannot write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', {}), false);
  });
});

// ── Gallery-level: delete gallery ─────────────────────────────────────────────

describe('can delete gallery', () => {
  test('owner can delete gallery', () => {
    assert.equal(can(user, 'delete', 'gallery', { studioRole: 'owner' }), true);
  });

  test('admin can delete gallery', () => {
    assert.equal(can(user, 'delete', 'gallery', { studioRole: 'admin' }), true);
  });

  test('editor cannot delete gallery', () => {
    assert.equal(can(user, 'delete', 'gallery', { studioRole: 'editor' }), false);
  });

  test('photographer cannot delete gallery', () => {
    assert.equal(can(user, 'delete', 'gallery', { studioRole: 'photographer' }), false);
  });

  test('gallery editor role cannot delete gallery (studio-only)', () => {
    assert.equal(can(user, 'delete', 'gallery', { galleryRole: 'editor' }), false);
  });
});

// ── Gallery-level: publish gallery ────────────────────────────────────────────

describe('can publish gallery', () => {
  test('owner can publish gallery', () => {
    assert.equal(can(user, 'publish', 'gallery', { studioRole: 'owner' }), true);
  });

  test('admin can publish gallery', () => {
    assert.equal(can(user, 'publish', 'gallery', { studioRole: 'admin' }), true);
  });

  test('editor can publish gallery', () => {
    assert.equal(can(user, 'publish', 'gallery', { studioRole: 'editor' }), true);
  });

  test('photographer cannot publish gallery', () => {
    assert.equal(can(user, 'publish', 'gallery', { studioRole: 'photographer' }), false);
  });

  test('gallery editor role cannot publish (studio-only action)', () => {
    assert.equal(can(user, 'publish', 'gallery', { galleryRole: 'editor' }), false);
  });
});

// ── Photo-level: upload photo ─────────────────────────────────────────────────

describe('can upload photo', () => {
  // Studio editor+ can upload anywhere (no gallery role needed)
  test('studio editor can upload anywhere', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'editor' }), true);
  });

  test('studio admin can upload anywhere', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'admin' }), true);
  });

  test('studio owner can upload anywhere', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'owner' }), true);
  });

  // Photographer needs an explicit gallery role (contributor or editor)
  test('studio photographer alone cannot upload (needs gallery role)', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'photographer' }), false);
  });

  test('photographer with contributor gallery role can upload', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'photographer', galleryRole: 'contributor' }), true);
  });

  test('photographer with editor gallery role can upload', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'photographer', galleryRole: 'editor' }), true);
  });

  test('photographer with viewer gallery role cannot upload', () => {
    assert.equal(can(user, 'upload', 'photo', { studioRole: 'photographer', galleryRole: 'viewer' }), false);
  });

  // Gallery role alone (no studio role) — external contributor
  test('gallery contributor (no studio role) can upload', () => {
    assert.equal(can(user, 'upload', 'photo', { galleryRole: 'contributor' }), true);
  });

  test('gallery editor (no studio role) can upload', () => {
    assert.equal(can(user, 'upload', 'photo', { galleryRole: 'editor' }), true);
  });

  test('gallery viewer cannot upload', () => {
    assert.equal(can(user, 'upload', 'photo', { galleryRole: 'viewer' }), false);
  });

  test('no roles cannot upload', () => {
    assert.equal(can(user, 'upload', 'photo', {}), false);
  });
});

// ── Photo-level: delete photo ─────────────────────────────────────────────────

describe('can delete photo', () => {
  test('studio owner can delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { studioRole: 'owner' }), true);
  });

  test('studio admin can delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { studioRole: 'admin' }), true);
  });

  test('studio editor can delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { studioRole: 'editor' }), true);
  });

  test('studio photographer cannot delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { studioRole: 'photographer' }), false);
  });

  test('gallery editor can delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { galleryRole: 'editor' }), true);
  });

  test('gallery contributor cannot delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { galleryRole: 'contributor' }), false);
  });

  test('gallery viewer cannot delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', { galleryRole: 'viewer' }), false);
  });

  test('no roles cannot delete photo', () => {
    assert.equal(can(user, 'delete', 'photo', {}), false);
  });
});

// ── Unknown action/resource returns false ─────────────────────────────────────

describe('unknown action/resource', () => {
  test('unknown action returns false', () => {
    assert.equal(can(user, 'fly', 'gallery', { studioRole: 'owner' }), false);
  });

  test('unknown resource returns false', () => {
    assert.equal(can(user, 'read', 'unicorn', { studioRole: 'owner' }), false);
  });
});
