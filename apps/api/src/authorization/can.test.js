// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/authorization/can.test.js — unit tests for the can() engine
// Studio roles: photographer < collaborator < admin < owner
// Project roles: contributor < editor < manager
// Gallery roles: viewer < contributor < editor
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { can } from './index.js';

const user = { id: 'u1', studio_id: 's1', role: 'admin' };

// ── Platform superadmin ───────────────────────────────────────────────────────

describe('platform superadmin bypasses all checks', () => {
  test('superadmin can do anything', () => {
    assert.equal(can(user, 'delete', 'gallery', { platformRole: 'superadmin' }), true);
  });
  test('superadmin can delete studio', () => {
    assert.equal(can(user, 'manageSettings', 'studio', { platformRole: 'superadmin' }), true);
  });
});

// ── Studio-level ──────────────────────────────────────────────────────────────

describe('studio.read', () => {
  test('any studio role can read', () => {
    for (const r of ['photographer', 'collaborator', 'admin', 'owner']) {
      assert.equal(can(user, 'read', 'studio', { studioRole: r }), true, `role=${r}`);
    }
  });
  test('no role cannot read studio', () => {
    assert.equal(can(user, 'read', 'studio', {}), false);
  });
});

describe('studio.manage / manageMembers / manageProjects / manageSettings', () => {
  for (const action of ['manage', 'manageMembers', 'manageProjects', 'manageSettings']) {
    test(`owner can ${action} studio`, () => {
      assert.equal(can(user, action, 'studio', { studioRole: 'owner' }), true);
    });
    test(`admin can ${action} studio`, () => {
      assert.equal(can(user, action, 'studio', { studioRole: 'admin' }), true);
    });
    test(`collaborator cannot ${action} studio`, () => {
      assert.equal(can(user, action, 'studio', { studioRole: 'collaborator' }), false);
    });
    test(`photographer cannot ${action} studio`, () => {
      assert.equal(can(user, action, 'studio', { studioRole: 'photographer' }), false);
    });
  }
});

describe('can manage member', () => {
  test('owner can manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'owner' }), true);
  });
  test('admin can manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'admin' }), true);
  });
  test('collaborator cannot manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'collaborator' }), false);
  });
  test('photographer cannot manage members', () => {
    assert.equal(can(user, 'manage', 'member', { studioRole: 'photographer' }), false);
  });
});

// ── Project-level ─────────────────────────────────────────────────────────────

describe('project.read', () => {
  test('any studio role can read project', () => {
    for (const r of ['photographer', 'collaborator', 'admin', 'owner']) {
      assert.equal(can(user, 'read', 'project', { studioRole: r }), true, `studioRole=${r}`);
    }
  });
  test('project contributor can read project', () => {
    assert.equal(can(user, 'read', 'project', { projectRole: 'contributor' }), true);
  });
  test('no role cannot read project', () => {
    assert.equal(can(user, 'read', 'project', {}), false);
  });
});

describe('project.write / edit', () => {
  for (const action of ['write', 'edit']) {
    test(`admin can ${action} project`, () => {
      assert.equal(can(user, action, 'project', { studioRole: 'admin' }), true);
    });
    test(`collaborator cannot ${action} project`, () => {
      assert.equal(can(user, action, 'project', { studioRole: 'collaborator' }), false);
    });
    test(`project manager can ${action} project`, () => {
      assert.equal(can(user, action, 'project', { projectRole: 'manager' }), true);
    });
    test(`project editor cannot ${action} project`, () => {
      assert.equal(can(user, action, 'project', { projectRole: 'editor' }), false);
    });
  }
});

describe('project.delete', () => {
  test('admin can delete project', () => {
    assert.equal(can(user, 'delete', 'project', { studioRole: 'admin' }), true);
  });
  test('collaborator cannot delete project', () => {
    assert.equal(can(user, 'delete', 'project', { studioRole: 'collaborator' }), false);
  });
  test('project manager cannot delete project (studio admin only)', () => {
    assert.equal(can(user, 'delete', 'project', { projectRole: 'manager' }), false);
  });
});

describe('project.manageMembers / manageAccess', () => {
  for (const action of ['manageMembers', 'manageAccess', 'manage']) {
    test(`admin can ${action} project`, () => {
      assert.equal(can(user, action, 'project', { studioRole: 'admin' }), true);
    });
    test(`project manager can ${action} project`, () => {
      assert.equal(can(user, action, 'project', { projectRole: 'manager' }), true);
    });
    test(`project editor cannot ${action} project`, () => {
      assert.equal(can(user, action, 'project', { projectRole: 'editor' }), false);
    });
  }
});

// ── Gallery-level: read ───────────────────────────────────────────────────────

describe('can read gallery', () => {
  const publicGallery  = { access: 'public' };
  const privateGallery = { access: 'private' };

  test('public gallery is readable by anyone', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: publicGallery }), true);
  });

  test('private gallery: anonymous cannot read', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery }), false);
  });

  test('private gallery: any studio role can read', () => {
    for (const r of ['photographer', 'collaborator', 'admin', 'owner']) {
      assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, studioRole: r }), true, `studioRole=${r}`);
    }
  });

  test('private gallery: project contributor can read', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, projectRole: 'contributor' }), true);
  });

  test('private gallery: gallery viewer can read', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, galleryRole: 'viewer' }), true);
  });

  test('private gallery: viewer token grants read', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, viewerToken: 'tok' }), true);
  });

  test('missing gallery context returns false even with studio role', () => {
    assert.equal(can(user, 'read', 'gallery', { studioRole: 'owner' }), false);
  });
});

// ── Gallery-level: write / edit ───────────────────────────────────────────────

describe('can write / edit gallery', () => {
  for (const action of ['write', 'edit']) {
    test(`studio owner can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { studioRole: 'owner' }), true);
    });
    test(`studio collaborator can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { studioRole: 'collaborator' }), true);
    });
    test(`studio photographer cannot ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { studioRole: 'photographer' }), false);
    });
    test(`project editor can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { projectRole: 'editor' }), true);
    });
    test(`project contributor cannot ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { projectRole: 'contributor' }), false);
    });
    test(`gallery editor can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { galleryRole: 'editor' }), true);
    });
    test(`gallery contributor cannot ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { galleryRole: 'contributor' }), false);
    });
    test(`no roles cannot ${action}`, () => {
      assert.equal(can(user, action, 'gallery', {}), false);
    });
  }
});

// ── Gallery-level: delete ─────────────────────────────────────────────────────

describe('can delete gallery', () => {
  test('owner can delete', () => assert.equal(can(user, 'delete', 'gallery', { studioRole: 'owner' }), true));
  test('admin can delete', () => assert.equal(can(user, 'delete', 'gallery', { studioRole: 'admin' }), true));
  test('collaborator cannot delete', () => assert.equal(can(user, 'delete', 'gallery', { studioRole: 'collaborator' }), false));
  test('gallery editor cannot delete (studio admin only)', () => assert.equal(can(user, 'delete', 'gallery', { galleryRole: 'editor' }), false));
});

// ── Gallery-level: publish / build ────────────────────────────────────────────

describe('can publish / build gallery', () => {
  for (const action of ['publish', 'build']) {
    test(`studio collaborator can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { studioRole: 'collaborator' }), true);
    });
    test(`studio photographer cannot ${action} without role`, () => {
      assert.equal(can(user, action, 'gallery', { studioRole: 'photographer' }), false);
    });
    test(`project editor can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { projectRole: 'editor' }), true);
    });
    test(`project contributor cannot ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { projectRole: 'contributor' }), false);
    });
    test(`gallery editor can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { galleryRole: 'editor' }), true);
    });
    test(`gallery contributor cannot ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { galleryRole: 'contributor' }), false);
    });
    // photographer + gallery editor role combo
    test(`photographer + gallery editor can ${action}`, () => {
      assert.equal(can(user, action, 'gallery', { studioRole: 'photographer', galleryRole: 'editor' }), true);
    });
  }
});

// ── Gallery-level: upload ─────────────────────────────────────────────────────

describe('can upload to gallery', () => {
  test('studio collaborator can upload', () => assert.equal(can(user, 'upload', 'gallery', { studioRole: 'collaborator' }), true));
  test('studio photographer cannot upload without role', () => assert.equal(can(user, 'upload', 'gallery', { studioRole: 'photographer' }), false));
  test('project contributor can upload', () => assert.equal(can(user, 'upload', 'gallery', { projectRole: 'contributor' }), true));
  test('gallery contributor can upload', () => assert.equal(can(user, 'upload', 'gallery', { galleryRole: 'contributor' }), true));
  test('gallery viewer cannot upload', () => assert.equal(can(user, 'upload', 'gallery', { galleryRole: 'viewer' }), false));
  test('photographer + gallery contributor can upload', () => {
    assert.equal(can(user, 'upload', 'gallery', { studioRole: 'photographer', galleryRole: 'contributor' }), true);
  });
});

// ── Gallery-level: deletePhoto ────────────────────────────────────────────────

describe('can deletePhoto from gallery', () => {
  test('studio collaborator can deletePhoto', () => assert.equal(can(user, 'deletePhoto', 'gallery', { studioRole: 'collaborator' }), true));
  test('studio photographer cannot deletePhoto', () => assert.equal(can(user, 'deletePhoto', 'gallery', { studioRole: 'photographer' }), false));
  test('project editor can deletePhoto', () => assert.equal(can(user, 'deletePhoto', 'gallery', { projectRole: 'editor' }), true));
  test('project contributor cannot deletePhoto', () => assert.equal(can(user, 'deletePhoto', 'gallery', { projectRole: 'contributor' }), false));
  test('gallery editor can deletePhoto', () => assert.equal(can(user, 'deletePhoto', 'gallery', { galleryRole: 'editor' }), true));
  test('gallery contributor cannot deletePhoto', () => assert.equal(can(user, 'deletePhoto', 'gallery', { galleryRole: 'contributor' }), false));
});

// ── Gallery-level: manageAccess ───────────────────────────────────────────────

describe('can manageAccess for gallery', () => {
  test('admin can manageAccess', () => assert.equal(can(user, 'manageAccess', 'gallery', { studioRole: 'admin' }), true));
  test('collaborator cannot manageAccess', () => assert.equal(can(user, 'manageAccess', 'gallery', { studioRole: 'collaborator' }), false));
  test('project manager can manageAccess', () => assert.equal(can(user, 'manageAccess', 'gallery', { projectRole: 'manager' }), true));
  test('project editor cannot manageAccess', () => assert.equal(can(user, 'manageAccess', 'gallery', { projectRole: 'editor' }), false));
  test('gallery editor can manageAccess', () => assert.equal(can(user, 'manageAccess', 'gallery', { galleryRole: 'editor' }), true));
  test('gallery contributor cannot manageAccess', () => assert.equal(can(user, 'manageAccess', 'gallery', { galleryRole: 'contributor' }), false));
});

// ── Gallery-level: viewBuildLogs ──────────────────────────────────────────────

describe('can viewBuildLogs', () => {
  test('any studio role can viewBuildLogs', () => {
    for (const r of ['photographer', 'collaborator', 'admin', 'owner']) {
      assert.equal(can(user, 'viewBuildLogs', 'gallery', { studioRole: r }), true, `studioRole=${r}`);
    }
  });
  test('project contributor can viewBuildLogs', () => assert.equal(can(user, 'viewBuildLogs', 'gallery', { projectRole: 'contributor' }), true));
  test('gallery viewer can viewBuildLogs', () => assert.equal(can(user, 'viewBuildLogs', 'gallery', { galleryRole: 'viewer' }), true));
  test('no roles cannot viewBuildLogs', () => assert.equal(can(user, 'viewBuildLogs', 'gallery', {}), false));
});

// ── Gallery-level: notify ─────────────────────────────────────────────────────

describe('can notify gallery ready', () => {
  test('studio member can notify', () => assert.equal(can(user, 'notify', 'gallery', { studioRole: 'photographer' }), true));
  test('gallery contributor can notify', () => assert.equal(can(user, 'notify', 'gallery', { galleryRole: 'contributor' }), true));
  test('gallery editor can notify', () => assert.equal(can(user, 'notify', 'gallery', { galleryRole: 'editor' }), true));
  test('gallery viewer cannot notify', () => assert.equal(can(user, 'notify', 'gallery', { galleryRole: 'viewer' }), false));
  test('no roles cannot notify', () => assert.equal(can(user, 'notify', 'gallery', {}), false));
});

// ── Viewer token ──────────────────────────────────────────────────────────────

describe('viewer token', () => {
  const privateGallery = { access: 'private' };

  test('viewer token grants gallery.read', () => {
    assert.equal(can(user, 'read', 'gallery', { gallery: privateGallery, viewerToken: 'tok' }), true);
  });
  test('viewer token does not grant gallery.write', () => {
    assert.equal(can(user, 'write', 'gallery', { gallery: privateGallery, viewerToken: 'tok' }), false);
  });
  test('viewer token without gallery context returns false', () => {
    assert.equal(can(user, 'read', 'gallery', { viewerToken: 'tok' }), false);
  });
});

// ── Photo compat aliases ──────────────────────────────────────────────────────

describe('photo.upload (compat)', () => {
  test('studio collaborator can upload photo', () => assert.equal(can(user, 'upload', 'photo', { studioRole: 'collaborator' }), true));
  test('studio photographer cannot upload photo without role', () => assert.equal(can(user, 'upload', 'photo', { studioRole: 'photographer' }), false));
  test('gallery contributor can upload photo', () => assert.equal(can(user, 'upload', 'photo', { galleryRole: 'contributor' }), true));
  test('gallery viewer cannot upload photo', () => assert.equal(can(user, 'upload', 'photo', { galleryRole: 'viewer' }), false));
  test('project contributor can upload photo', () => assert.equal(can(user, 'upload', 'photo', { projectRole: 'contributor' }), true));
  test('no roles cannot upload photo', () => assert.equal(can(user, 'upload', 'photo', {}), false));
});

describe('photo.delete (compat)', () => {
  test('studio collaborator can delete photo', () => assert.equal(can(user, 'delete', 'photo', { studioRole: 'collaborator' }), true));
  test('studio photographer cannot delete photo', () => assert.equal(can(user, 'delete', 'photo', { studioRole: 'photographer' }), false));
  test('gallery editor can delete photo', () => assert.equal(can(user, 'delete', 'photo', { galleryRole: 'editor' }), true));
  test('gallery contributor cannot delete photo', () => assert.equal(can(user, 'delete', 'photo', { galleryRole: 'contributor' }), false));
  test('project editor can delete photo', () => assert.equal(can(user, 'delete', 'photo', { projectRole: 'editor' }), true));
  test('no roles cannot delete photo', () => assert.equal(can(user, 'delete', 'photo', {}), false));
});

// ── Cross-studio denial ───────────────────────────────────────────────────────

describe('cross-studio denial', () => {
  test('no roles means no access even for owner-level actions', () => {
    assert.equal(can(user, 'delete', 'gallery', {}), false);
    assert.equal(can(user, 'manage', 'studio', {}), false);
    assert.equal(can(user, 'write', 'gallery', {}), false);
  });
});

// ── Sprint 22: orgRole alias ──────────────────────────────────────────────────
// orgRole is the canonical name for studioRole as of Sprint 22.
// Both should produce identical results when passed to can().

describe('orgRole alias (Sprint 22)', () => {
  test('orgRole owner grants gallery.delete just like studioRole owner', () => {
    assert.equal(can(user, 'delete', 'gallery', { orgRole: 'owner' }), true);
  });
  test('orgRole admin grants studio.manage', () => {
    assert.equal(can(user, 'manage', 'studio', { orgRole: 'admin' }), true);
  });
  test('orgRole photographer cannot write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { orgRole: 'photographer' }), false);
  });
  test('orgRole collaborator can write gallery', () => {
    assert.equal(can(user, 'write', 'gallery', { orgRole: 'collaborator' }), true);
  });
  test('orgRole and studioRole behave identically for all studio actions', () => {
    const actions = ['read', 'manage', 'manageSettings', 'manageMembers', 'manageProjects'];
    const roles   = ['photographer', 'collaborator', 'admin', 'owner'];
    for (const action of actions) {
      for (const role of roles) {
        assert.equal(
          can(user, action, 'studio', { studioRole: role }),
          can(user, action, 'studio', { orgRole: role }),
          `action=${action} role=${role}`
        );
      }
    }
  });
  test('orgRole takes precedence when both are passed', () => {
    // orgRole = owner should win even if studioRole = photographer
    // (in practice they should never differ — this just tests precedence)
    assert.equal(
      can(user, 'delete', 'gallery', { studioRole: 'photographer', orgRole: 'owner' }),
      true
    );
  });
  test('studioRole takes precedence when orgRole is not set', () => {
    assert.equal(can(user, 'delete', 'gallery', { studioRole: 'owner' }), true);
  });
});

// ── Unknown action / resource ─────────────────────────────────────────────────

describe('unknown action/resource', () => {
  test('unknown action returns false', () => {
    assert.equal(can(user, 'fly', 'gallery', { studioRole: 'owner' }), false);
  });
  test('unknown resource returns false', () => {
    assert.equal(can(user, 'read', 'spaceship', { studioRole: 'owner' }), false);
  });
});
