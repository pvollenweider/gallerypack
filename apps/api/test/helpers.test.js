// apps/api/test/helpers.test.js — unit tests for DB helpers
// Uses a temp SQLite file so migrations run cleanly without touching the real DB.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Point DB at a temp dir BEFORE any import that touches the database singleton
const tmpDir = mkdtempSync(join(tmpdir(), 'gallerypack-helpers-test-'));
process.env.DATA_DIR = tmpDir;
process.on('exit', () => { try { rmSync(tmpDir, { recursive: true }); } catch {} });

const { runMigrations }              = await import('../src/db/migrations/run.js');
const { getDb }                      = await import('../src/db/database.js');
const {
  genId,
  hashPassword, verifyPassword,
  createSession, getSession, deleteSession,
  getStudioRole, upsertStudioMembership, listStudioMembers,
  getGalleryRole, upsertGalleryMembership, removeGalleryMembership, listGalleryMembers,
  createInvitation, getInvitationByToken, acceptInvitation, listInvitations, deleteInvitation,
} = await import('../src/db/helpers.js');

runMigrations();

// ── Seed ─────────────────────────────────────────────────────────────────────

const STUDIO_ID = genId();
const OWNER_ID  = genId();
const EDITOR_ID = genId();
const PHOTO_ID  = genId();

{
  const db  = getDb();
  const now = Date.now();
  db.prepare('INSERT INTO studios (id, name, slug, created_at, updated_at) VALUES (?,?,?,?,?)').run(STUDIO_ID, 'Test Studio', 'test-studio', now, now);
  for (const [id, email, role] of [
    [OWNER_ID,  'owner@t.com',  'admin'],
    [EDITOR_ID, 'editor@t.com', 'user'],
    [PHOTO_ID,  'photo@t.com',  'user'],
  ]) {
    db.prepare(
      'INSERT INTO users (id, email, password_hash, role, studio_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run(id, email, hashPassword('test'), role, STUDIO_ID, now, now);
  }
  upsertStudioMembership(STUDIO_ID, OWNER_ID,  'owner');
  upsertStudioMembership(STUDIO_ID, EDITOR_ID, 'editor');
  upsertStudioMembership(STUDIO_ID, PHOTO_ID,  'photographer');
}

// ── Password hashing ──────────────────────────────────────────────────────────

describe('hashPassword / verifyPassword', () => {
  test('correct password verifies', () => {
    assert.equal(verifyPassword('secret', hashPassword('secret')), true);
  });

  test('wrong password fails', () => {
    assert.equal(verifyPassword('wrong', hashPassword('correct')), false);
  });

  test('same password produces different hashes (random salt)', () => {
    assert.notEqual(hashPassword('same'), hashPassword('same'));
  });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

describe('sessions', () => {
  test('createSession returns a token and getSession finds it', () => {
    const token = createSession(OWNER_ID);
    assert.ok(typeof token === 'string' && token.length > 20);
    assert.equal(getSession(token)?.user_id, OWNER_ID);
  });

  test('getSession returns nullish for unknown token', () => {
    assert.ok(!getSession('no-such-token'));
  });

  test('deleteSession removes the session', () => {
    const token = createSession(EDITOR_ID);
    assert.ok(getSession(token));
    deleteSession(token);
    assert.ok(!getSession(token));
  });
});

// ── Studio membership ─────────────────────────────────────────────────────────

describe('studio membership', () => {
  test('getStudioRole returns correct roles', () => {
    assert.equal(getStudioRole(OWNER_ID,  STUDIO_ID), 'owner');
    assert.equal(getStudioRole(EDITOR_ID, STUDIO_ID), 'editor');
    assert.equal(getStudioRole(PHOTO_ID,  STUDIO_ID), 'photographer');
  });

  test('getStudioRole returns null for non-member', () => {
    assert.equal(getStudioRole(genId(), STUDIO_ID), null);
  });

  test('listStudioMembers returns all 3 seeded members', () => {
    const members = listStudioMembers(STUDIO_ID);
    assert.equal(members.length, 3);
    assert.deepEqual(members.map(m => m.role).sort(), ['editor', 'owner', 'photographer']);
  });

  test('listStudioMembers includes user email', () => {
    assert.ok(listStudioMembers(STUDIO_ID).every(m => m.user?.email));
  });

  test('listStudioMembers includes empty galleries array when no gallery memberships', () => {
    const members = listStudioMembers(STUDIO_ID);
    assert.ok(members.every(m => Array.isArray(m.galleries) && m.galleries.length === 0));
  });

  test('upsertStudioMembership updates role', () => {
    upsertStudioMembership(STUDIO_ID, EDITOR_ID, 'admin');
    assert.equal(getStudioRole(EDITOR_ID, STUDIO_ID), 'admin');
    upsertStudioMembership(STUDIO_ID, EDITOR_ID, 'editor'); // restore
  });
});

// ── Gallery membership ────────────────────────────────────────────────────────

const GALLERY_ID = genId();
{
  const now = Date.now();
  getDb().prepare(
    'INSERT INTO galleries (id, studio_id, slug, title, created_at, updated_at) VALUES (?,?,?,?,?,?)'
  ).run(GALLERY_ID, STUDIO_ID, 'g1', 'Gallery One', now, now);
}

describe('gallery membership', () => {
  test('upsertGalleryMembership adds a member', () => {
    upsertGalleryMembership(GALLERY_ID, PHOTO_ID, 'contributor');
    assert.equal(getGalleryRole(PHOTO_ID, GALLERY_ID), 'contributor');
  });

  test('upsertGalleryMembership updates existing role (upsert)', () => {
    upsertGalleryMembership(GALLERY_ID, PHOTO_ID, 'editor');
    assert.equal(getGalleryRole(PHOTO_ID, GALLERY_ID), 'editor');
    upsertGalleryMembership(GALLERY_ID, PHOTO_ID, 'contributor'); // restore
  });

  test('listGalleryMembers returns members sorted by email', () => {
    upsertGalleryMembership(GALLERY_ID, EDITOR_ID, 'viewer');
    const members = listGalleryMembers(GALLERY_ID);
    assert.ok(members.length >= 2);
    const emails = members.map(m => m.email);
    assert.deepEqual(emails, [...emails].sort());
  });

  test('removeGalleryMembership removes the member', () => {
    upsertGalleryMembership(GALLERY_ID, EDITOR_ID, 'viewer');
    removeGalleryMembership(GALLERY_ID, EDITOR_ID);
    assert.equal(getGalleryRole(EDITOR_ID, GALLERY_ID), null);
  });

  test('getGalleryRole returns null for non-member', () => {
    assert.equal(getGalleryRole(genId(), GALLERY_ID), null);
  });

  test('listStudioMembers shows gallery roles after assignment', () => {
    upsertGalleryMembership(GALLERY_ID, PHOTO_ID, 'contributor');
    const photographer = listStudioMembers(STUDIO_ID).find(m => m.user.id === PHOTO_ID);
    const g = photographer.galleries.find(g => g.galleryId === GALLERY_ID);
    assert.equal(g?.role, 'contributor');
    assert.equal(g?.galleryTitle, 'Gallery One');
  });
});

// ── Invitations ───────────────────────────────────────────────────────────────

describe('invitations', () => {
  test('createInvitation returns invitation with 64-char token', () => {
    const inv = createInvitation(STUDIO_ID, 'new@t.com', 'photographer', OWNER_ID);
    assert.equal(inv.token.length, 64);
    assert.equal(inv.email, 'new@t.com');
    assert.equal(inv.role, 'photographer');
  });

  test('getInvitationByToken finds the invitation', () => {
    const inv = createInvitation(STUDIO_ID, 'find@t.com', 'editor', OWNER_ID);
    assert.equal(getInvitationByToken(inv.token)?.email, 'find@t.com');
  });

  test('getInvitationByToken returns null for unknown token', () => {
    assert.equal(getInvitationByToken('00'.repeat(32)), null);
  });

  test('listInvitations includes pending invitations', () => {
    const inv = createInvitation(STUDIO_ID, 'list@t.com', 'editor', OWNER_ID);
    // createInvitation returns { token: rawToken, token_hash: sha256(rawToken), ... }
    // listInvitations returns DB rows where token === token_hash (after migration 019)
    // so we compare by token_hash
    assert.ok(listInvitations(STUDIO_ID).some(i => i.token_hash === inv.token_hash));
  });

  test('createInvitation replaces existing pending invitation for same email', () => {
    createInvitation(STUDIO_ID, 're@t.com', 'photographer', OWNER_ID);
    const inv2 = createInvitation(STUDIO_ID, 're@t.com', 'editor', OWNER_ID);
    assert.equal(inv2.role, 'editor');
    assert.equal(listInvitations(STUDIO_ID).filter(i => i.email === 're@t.com').length, 1);
  });

  test('acceptInvitation creates user, adds to studio, marks accepted', () => {
    const inv = createInvitation(STUDIO_ID, 'accept@t.com', 'photographer', OWNER_ID);
    const u = acceptInvitation(inv.token, 'newpassword123');
    assert.equal(u.email, 'accept@t.com');
    assert.equal(getStudioRole(u.id, STUDIO_ID), 'photographer');
    assert.ok(getInvitationByToken(inv.token)?.accepted_at);
  });

  test('acceptInvitation throws on expired token', () => {
    const inv = createInvitation(STUDIO_ID, 'exp@t.com', 'photographer', OWNER_ID);
    getDb().prepare('UPDATE invitations SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, inv.id);
    assert.throws(() => acceptInvitation(inv.token, 'pass'), /expired/i);
  });

  test('acceptInvitation throws on already-accepted token', () => {
    const inv = createInvitation(STUDIO_ID, 'double@t.com', 'photographer', OWNER_ID);
    acceptInvitation(inv.token, 'pass1');
    assert.throws(() => acceptInvitation(inv.token, 'pass2'));
  });

  test('deleteInvitation removes it', () => {
    const inv = createInvitation(STUDIO_ID, 'del@t.com', 'editor', OWNER_ID);
    deleteInvitation(inv.id);
    assert.ok(!listInvitations(STUDIO_ID).some(i => i.id === inv.id));
  });
});
