// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/db/helpers.js — reusable async query helpers (mysql2)
import { query, withTransaction } from './database.js';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual, scryptSync } from 'crypto';

/** SHA-256 hex digest of a raw token string. Used for all token storage. */
function sha256(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

// ── ID generation ─────────────────────────────────────────────────────────────

/** Generate a URL-safe random token of `bytes` entropy (hex-encoded). */
export function genToken(bytes = 24) {
  return randomBytes(bytes).toString('hex');
}

/** Generate a simple time-based ULID-like ID (not spec-compliant, good enough). */
export function genId() {
  return Date.now().toString(36) + randomBytes(6).toString('hex');
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function getUserByEmail(email) {
  const [rows] = await query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] ?? null;
}

export async function getUserById(id) {
  const [rows] = await query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function createUser({ studioId, organizationId, email, passwordHash, role = 'admin', name = '', platformRole = null }) {
  const orgId = organizationId || studioId;
  const id  = genId();
  const now = Date.now();
  await query(
    'INSERT INTO users (id, organization_id, email, password_hash, role, name, platform_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, orgId, email, passwordHash, role, name, platformRole, now, now]
  );
  return getUserById(id);
}

export async function updateUserLocale(userId, locale) {
  await query('UPDATE users SET locale = ?, updated_at = ? WHERE id = ?', [locale, Date.now(), userId]);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId) {
  const id  = genToken(32);
  const now = Date.now();
  await query(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [id, userId, now + SESSION_TTL_MS, now]
  );
  return id;
}

export async function getSession(id) {
  const [rows] = await query(
    'SELECT * FROM sessions WHERE id = ? AND expires_at > ?',
    [id, Date.now()]
  );
  return rows[0] ?? null;
}

export async function deleteSession(id) {
  await query('DELETE FROM sessions WHERE id = ?', [id]);
}

export async function pruneExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(orgId) {
  const [rows] = await query('SELECT * FROM settings WHERE organization_id = ?', [orgId]);
  return rows[0] ?? null;
}

export async function upsertSettings(orgId, fields) {
  const now     = Date.now();
  const allowed = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','base_url','site_title','default_author','default_author_email','default_locale','default_access','default_allow_download_image','default_allow_download_gallery','default_private','default_pwa_theme_color','default_pwa_bg_color'];
  const cols    = Object.keys(fields).filter(k => allowed.includes(k));
  if (!cols.length) return;

  const existing = await getSettings(orgId);
  if (!existing) {
    const allCols = ['organization_id', ...cols, 'updated_at'];
    const vals    = [orgId, ...cols.map(c => fields[c]), now];
    await query(
      `INSERT INTO settings (${allCols.join(',')}) VALUES (${allCols.map(() => '?').join(',')})`,
      vals
    );
  } else {
    const sets = [...cols.map(c => `${c} = ?`), 'updated_at = ?'].join(', ');
    const vals = [...cols.map(c => fields[c]), now, orgId];
    await query(`UPDATE settings SET ${sets} WHERE organization_id = ?`, vals);
  }
  return getSettings(orgId);
}

// ── Build jobs ────────────────────────────────────────────────────────────────

export async function createJob({ galleryId, studioId, organizationId, triggeredBy = 'admin', force = false }) {
  const orgId = organizationId || studioId;
  const id  = genId();
  const now = Date.now();
  await query(`
    INSERT INTO build_jobs (id, gallery_id, organization_id, status, triggered_by, \`force\`, created_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?)
  `, [id, galleryId, orgId, triggeredBy, force ? 1 : 0, now]);
  const [rows] = await query('SELECT * FROM build_jobs WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getJob(id) {
  const [rows] = await query('SELECT * FROM build_jobs WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function listJobs(galleryId) {
  const [rows] = await query(
    'SELECT * FROM build_jobs WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 20',
    [galleryId]
  );
  return rows;
}

export async function updateJobStatus(id, status, fields = {}) {
  const allowed  = { running: 'started_at', done: 'finished_at', error: 'finished_at' };
  const timeCol  = allowed[status];
  const now      = Date.now();
  if (timeCol && fields[timeCol] === undefined) fields[timeCol] = now;
  if (fields.error_msg !== undefined) {
    await query('UPDATE build_jobs SET status = ?, error_msg = ? WHERE id = ?', [status, fields.error_msg, id]);
  }
  if (timeCol) {
    await query(`UPDATE build_jobs SET status = ?, ${timeCol} = ? WHERE id = ?`, [status, fields[timeCol], id]);
  } else {
    await query('UPDATE build_jobs SET status = ? WHERE id = ?', [status, id]);
  }
}

export async function appendEvent(jobId, type, data) {
  // Use subquery for next seq to avoid race conditions
  const [seqRows] = await query(
    'SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM build_events WHERE job_id = ?',
    [jobId]
  );
  const seq = seqRows[0]?.next ?? 1;
  const now = Date.now();
  await query(
    'INSERT INTO build_events (job_id, seq, type, data, created_at) VALUES (?, ?, ?, ?, ?)',
    [jobId, seq, type, typeof data === 'string' ? data : JSON.stringify(data), now]
  );
  return seq;
}

export async function getEvents(jobId, afterSeq = 0) {
  const [rows] = await query(
    'SELECT * FROM build_events WHERE job_id = ? AND seq > ? ORDER BY seq ASC',
    [jobId, afterSeq]
  );
  return rows;
}

// ── Password hashing (scrypt, no native deps) ─────────────────────────────────

/**
 * Hash a password for storage.
 * Format: `$scrypt$<salt_hex>$<hash_hex>` (64-char salt, 128-char hash).
 *
 * scrypt parameters (Node.js defaults):
 *   N = 16384 (cost factor — minimum recommended; consider bumping to 32768 in future)
 *   r = 8     (block size)
 *   p = 1     (parallelisation factor)
 *   keylen = 64 bytes (512 bits)
 */
export function hashPassword(plain) {
  const salt = randomBytes(32).toString('hex'); // 64 hex chars
  const hash = scryptSync(plain, salt, 64).toString('hex'); // 128 hex chars
  return `$scrypt$${salt}$${hash}`;
}

/** Verify a plain password against a stored hash (timing-safe).
 *  Supports both `$scrypt$` (new) and `scrypt:` (old) formats.
 */
export function verifyPassword(plain, stored) {
  if (!stored) return false;

  let salt, hash;
  if (stored.startsWith('$scrypt$')) {
    const parts = stored.split('$'); // ['', 'scrypt', salt, hash]
    if (parts.length !== 4) return false;
    salt = parts[2];
    hash = parts[3];
  } else if (stored.startsWith('scrypt:')) {
    const [, s, h] = stored.split(':');
    salt = s;
    hash = h;
  } else {
    return false;
  }

  try {
    const candidate = scryptSync(plain, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  } catch { return false; }
}

// ── Viewer tokens (HMAC-signed, stateless) ────────────────────────────────────

const VIEWER_SECRET = process.env.VIEWER_TOKEN_SECRET || 'change-me-in-production';
const VIEWER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Create a signed viewer token for a gallery. Returns a `<payload>.<sig>` string. */
export function createViewerToken(galleryId) {
  const payload = Buffer.from(JSON.stringify({ g: galleryId, exp: Date.now() + VIEWER_TTL_MS })).toString('base64url');
  const sig     = createHmac('sha256', VIEWER_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verify and decode a viewer token. Returns galleryId or null if invalid/expired. */
export function verifyViewerToken(token) {
  if (!token) return null;
  const [payload, sig] = (token || '').split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', VIEWER_SECRET).update(payload).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.exp < Date.now()) return null;
  return data.g;
}

// ── Gallery invites (photographer upload links — uses gallery_invites table) ───

const INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvite({ studioId, organizationId, galleryId = null, email = null, label = null, expiresIn = INVITE_DEFAULT_TTL_MS, singleUse = false }) {
  const orgId     = organizationId || studioId;
  const id        = genId();
  const rawToken  = genToken(32); // 64-char hex — returned to caller, NEVER stored
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  const expiresAt = expiresIn ? now + expiresIn : null;
  await query(`
    INSERT INTO gallery_invites (id, organization_id, gallery_id, token, token_hash, email, label, single_use, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, orgId, galleryId, tokenHash, tokenHash, email, label, singleUse ? 1 : 0, expiresAt, now]);
  return { ...(await getInviteById(id)), token: rawToken };
}

export async function getInviteById(id) {
  const [rows] = await query('SELECT * FROM gallery_invites WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getInviteByToken(token) {
  const [rows] = await query('SELECT * FROM gallery_invites WHERE token_hash = ?', [sha256(token)]);
  return rows[0] ?? null;
}

export async function listInvites(orgId) {
  const [rows] = await query(
    'SELECT * FROM gallery_invites WHERE organization_id = ? ORDER BY created_at DESC',
    [orgId]
  );
  return rows;
}

export async function useInvite(id) {
  await query('UPDATE gallery_invites SET used_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function revokeInvite(id) {
  await query('UPDATE gallery_invites SET revoked_at = ? WHERE id = ?', [Date.now(), id]);
}

// ── Unified scoped invites (organization | project | gallery) ────────────────

const SCOPED_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const INVITE_SCOPE_TYPES = ['organization', 'project', 'gallery'];

export async function createScopedInvite(scopeType, scopeId, email, roleToGrant, createdByUserId = null, ttlMs = SCOPED_INVITE_TTL_MS) {
  const id        = randomUUID();
  const rawToken  = genToken(32);
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  const expiresAt = now + ttlMs;

  // Replace any pending (unused, non-revoked) invite for same email+scope
  await query(
    'DELETE FROM invites WHERE email = ? AND scope_type = ? AND scope_id = ? AND used_at IS NULL AND revoked_at IS NULL',
    [email, scopeType, scopeId]
  );

  await query(`
    INSERT INTO invites (id, email, scope_type, scope_id, role_to_grant, token_hash, expires_at, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, email, scopeType, scopeId, roleToGrant, tokenHash, expiresAt, createdByUserId, now]);

  const [rows] = await query('SELECT * FROM invites WHERE id = ?', [id]);
  return { ...rows[0], token: rawToken };
}

export async function getScopedInviteById(id) {
  const [rows] = await query('SELECT * FROM invites WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getScopedInviteByToken(rawToken) {
  const [rows] = await query('SELECT * FROM invites WHERE token_hash = ?', [sha256(rawToken)]);
  return rows[0] ?? null;
}

export async function listScopedInvites(scopeType, scopeId) {
  const [rows] = await query(
    'SELECT * FROM invites WHERE scope_type = ? AND scope_id = ? AND used_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC',
    [scopeType, scopeId]
  );
  return rows;
}

export async function revokeScopedInvite(id) {
  await query('UPDATE invites SET revoked_at = ? WHERE id = ?', [Date.now(), id]);
}

/**
 * Accept a scoped invite: resolve or create user, grant role, mark invite used.
 * Returns { user, sessionToken } on success.
 */
export async function acceptScopedInvite(rawToken, password = null) {
  return withTransaction(async (conn) => {
    const [invRows] = await conn.query(
      'SELECT * FROM invites WHERE token_hash = ?',
      [sha256(rawToken)]
    );
    const inv = invRows[0];
    if (!inv)         throw Object.assign(new Error('Invite not found'), { status: 404 });
    if (inv.revoked_at) throw Object.assign(new Error('Invite has been revoked'), { status: 410 });
    if (inv.used_at)    throw Object.assign(new Error('Invite has already been used'), { status: 410 });
    if (inv.expires_at < Date.now()) throw Object.assign(new Error('Invite has expired'), { status: 410 });

    // Resolve organization id from scope
    let orgId;
    if (inv.scope_type === 'organization') {
      orgId = inv.scope_id;
    } else if (inv.scope_type === 'project') {
      const [pRows] = await conn.query('SELECT organization_id FROM projects WHERE id = ?', [inv.scope_id]);
      if (!pRows[0]) throw Object.assign(new Error('Project not found'), { status: 404 });
      orgId = pRows[0].organization_id;
    } else if (inv.scope_type === 'gallery') {
      const [gRows] = await conn.query('SELECT organization_id FROM galleries WHERE id = ?', [inv.scope_id]);
      if (!gRows[0]) throw Object.assign(new Error('Gallery not found'), { status: 404 });
      orgId = gRows[0].organization_id;
    } else {
      throw Object.assign(new Error('Unknown scope type'), { status: 400 });
    }

    // Find or create user
    const [existingRows] = await conn.query('SELECT * FROM users WHERE email = ?', [inv.email]);
    let user = existingRows[0] ?? null;
    const now = Date.now();

    if (!user) {
      const userId       = genId();
      const passwordHash = password ? hashPassword(password) : null;
      await conn.query(
        'INSERT INTO users (id, organization_id, email, password_hash, role, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, orgId, inv.email, passwordHash, inv.role_to_grant, '', now, now]
      );
      const [newRows] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
      user = newRows[0];
    }

    // Ensure user has an organization membership (min: photographer)
    const [memRows] = await conn.query(
      'SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ?',
      [orgId, user.id]
    );
    if (!memRows[0]) {
      const minRole = inv.scope_type === 'organization' ? inv.role_to_grant : 'photographer';
      const memId = genId();
      await conn.query(
        'INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [memId, orgId, user.id, minRole, now]
      );
    } else if (inv.scope_type === 'organization') {
      // Update membership role if this is an organization-scoped invite
      await conn.query(
        'UPDATE organization_memberships SET role = ? WHERE organization_id = ? AND user_id = ?',
        [inv.role_to_grant, orgId, user.id]
      );
    }

    // Grant scope-specific role
    if (inv.scope_type === 'project') {
      const praId = randomUUID();
      await conn.query(
        'INSERT INTO project_role_assignments (id, project_id, user_id, role, granted_by_user_id, granted_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [praId, inv.scope_id, user.id, inv.role_to_grant, inv.created_by_user_id, now]
      );
    } else if (inv.scope_type === 'gallery') {
      const graId = randomUUID();
      await conn.query(
        'INSERT INTO gallery_role_assignments (id, gallery_id, user_id, role, granted_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [graId, inv.scope_id, user.id, inv.role_to_grant, inv.created_by_user_id, now]
      );
    }

    // Mark invite as used
    await conn.query('UPDATE invites SET used_at = ? WHERE id = ?', [now, inv.id]);

    return user;
  });
}

// ── Organization memberships ─────────────────────────────────────────────────

export const ROLE_HIERARCHY = ['photographer', 'collaborator', 'admin', 'owner'];

// ── Gallery role (reads from canonical gallery_role_assignments) ───────────────

/** Canonical gallery role lookup — reads gallery_role_assignments table. */
export async function getGalleryRole(userId, galleryId) {
  const row = await getGalleryRoleAssignment(userId, galleryId);
  return row ? row.role : null;
}

// ── Invitations (organization user invitations) ──────────────────────────────

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvitation(orgId, email, role, createdBy, { galleryId = null, galleryRole = null, name = '' } = {}) {
  // Replace any existing pending invitation for this email (re-invite / role change).
  const [existing] = await query(
    'SELECT * FROM invitations WHERE organization_id = ? AND email = ?',
    [orgId, email]
  );
  if (existing[0]) {
    if (existing[0].accepted_at) throw Object.assign(new Error('This user is already a member'), { status: 409 });
    await query('DELETE FROM invitations WHERE id = ?', [existing[0].id]);
  }

  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  const expiresAt = now + INVITATION_TTL_MS;

  await query(`
    INSERT INTO invitations (id, organization_id, email, name, role, token, token_hash, created_by, created_at, expires_at, gallery_id, gallery_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, orgId, email, name || '', role, tokenHash, tokenHash, createdBy, now, expiresAt, galleryId, galleryRole]);

  const [rows] = await query('SELECT * FROM invitations WHERE id = ?', [id]);
  return { ...rows[0], token: rawToken };
}

export async function getInvitationByToken(token) {
  const [rows] = await query(
    'SELECT * FROM invitations WHERE token_hash = ?',
    [sha256(token)]
  );
  return rows[0] ?? null;
}

export async function acceptInvitation(token, password) {
  return withTransaction(async (conn) => {
    const [invRows] = await conn.query(
      'SELECT * FROM invitations WHERE token_hash = ?',
      [sha256(token)]
    );
    const inv = invRows[0];
    if (!inv)          throw Object.assign(new Error('Invitation not found'), { status: 404 });
    if (inv.accepted_at) throw Object.assign(new Error('Invitation already accepted'), { status: 409 });
    if (inv.expires_at < Date.now()) throw Object.assign(new Error('Invitation has expired'), { status: 410 });

    const passwordHash = hashPassword(password);
    const userId       = genId();
    const now          = Date.now();
    const orgId        = inv.organization_id;

    await conn.query(
      'INSERT INTO users (id, organization_id, email, password_hash, role, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, orgId, inv.email, passwordHash, inv.role, inv.name || '', now, now]
    );

    const membershipId = genId();
    await conn.query(`
      INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE role = VALUES(role)
    `, [membershipId, orgId, userId, inv.role, now]);

    if (inv.gallery_id && inv.gallery_role) {
      const graId = randomUUID();
      await conn.query(`
        INSERT INTO gallery_role_assignments (id, gallery_id, user_id, role, granted_by_user_id, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)
        ON DUPLICATE KEY UPDATE role = VALUES(role)
      `, [graId, inv.gallery_id, userId, inv.gallery_role, now]);
    }

    await conn.query(
      'UPDATE invitations SET accepted_at = ? WHERE id = ?',
      [now, inv.id]
    );

    const [userRows] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
    return userRows[0];
  });
}

export async function listInvitations(orgId) {
  const [rows] = await query(
    'SELECT * FROM invitations WHERE organization_id = ? ORDER BY created_at DESC',
    [orgId]
  );
  return rows;
}

export async function deleteInvitation(id) {
  await query('DELETE FROM invitations WHERE id = ?', [id]);
}

// ── Password reset tokens ─────────────────────────────────────────────────────

const RESET_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function createPasswordResetToken(userId) {
  await query(
    'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
    [userId]
  );
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  await query(`
    INSERT INTO password_reset_tokens (id, user_id, token, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, userId, tokenHash, tokenHash, now, now + RESET_TTL_MS]);
  const [rows] = await query('SELECT * FROM password_reset_tokens WHERE id = ?', [id]);
  return { ...rows[0], token: rawToken };
}

export async function getPasswordResetToken(token) {
  const [rows] = await query(
    'SELECT * FROM password_reset_tokens WHERE token_hash = ?',
    [sha256(token)]
  );
  return rows[0] ?? null;
}

export async function usePasswordResetToken(token, newPassword) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = ?',
      [sha256(token)]
    );
    const row = rows[0];
    if (!row)        throw Object.assign(new Error('Lien invalide'), { status: 404 });
    if (row.used_at) throw Object.assign(new Error('Ce lien a déjà été utilisé'), { status: 409 });
    if (row.expires_at < Date.now()) throw Object.assign(new Error('Ce lien a expiré'), { status: 410 });

    await conn.query(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hashPassword(newPassword), Date.now(), row.user_id]
    );
    await conn.query(
      'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?',
      [Date.now(), row.id]
    );
    const [userRows] = await conn.query('SELECT * FROM users WHERE id = ?', [row.user_id]);
    return userRows[0];
  });
}

// ── Magic links (passwordless login, 5-min TTL) ───────────────────────────────

const MAGIC_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function createMagicLink(userId) {
  await query('DELETE FROM magic_links WHERE user_id = ? AND used_at IS NULL', [userId]);
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  await query(
    'INSERT INTO magic_links (id, user_id, token, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, tokenHash, tokenHash, now, now + MAGIC_TTL_MS]
  );
  const [rows] = await query('SELECT * FROM magic_links WHERE id = ?', [id]);
  return { ...rows[0], token: rawToken };
}

export async function useMagicLink(token) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT * FROM magic_links WHERE token_hash = ?',
      [sha256(token)]
    );
    const row = rows[0];
    if (!row)          throw Object.assign(new Error('Lien invalide'), { status: 404 });
    if (row.used_at)   throw Object.assign(new Error('Ce lien a déjà été utilisé'), { status: 409 });
    if (row.expires_at < Date.now()) throw Object.assign(new Error('Ce lien a expiré (5 min)'), { status: 410 });

    await conn.query(
      'UPDATE magic_links SET used_at = ? WHERE id = ?',
      [Date.now(), row.id]
    );
    const [userRows] = await conn.query('SELECT * FROM users WHERE id = ?', [row.user_id]);
    return userRows[0];
  });
}

// ── Viewer tokens v2 (project | gallery scope) ────────────────────────────────

/**
 * Create a scoped viewer token.
 * @param {string} scopeType - 'project' | 'gallery'
 * @param {string} scopeId
 * @param {string} createdByUserId
 * @param {{ email?, label?, expiresAt? }} opts
 * @returns token row + raw token (shown once)
 */
export async function createViewerTokenDb(scopeType, scopeId, createdByUserId, { email = null, label = null, expiresAt = null } = {}) {
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  await query(`
    INSERT INTO viewer_tokens (id, scope_type, scope_id, email, label, token_hash, expires_at, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, scopeType, scopeId, email, label, tokenHash, expiresAt ?? null, createdByUserId ?? null, now]);
  const [rows] = await query('SELECT * FROM viewer_tokens WHERE id = ?', [id]);
  return { ...rows[0], token: rawToken };
}

/** Lookup viewer token by raw value. Returns null if not found, expired, or revoked. */
export async function getViewerToken(rawToken) {
  const [rows] = await query(
    'SELECT * FROM viewer_tokens WHERE token_hash = ?',
    [sha256(rawToken)]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    await query('UPDATE viewer_tokens SET revoked_at = ? WHERE id = ?', [Date.now(), row.id]);
    return null;
  }
  return row;
}

export async function touchViewerToken(id) {
  await query('UPDATE viewer_tokens SET last_used_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function listViewerTokens(scopeType, scopeId) {
  const [rows] = await query(
    'SELECT * FROM viewer_tokens WHERE scope_type = ? AND scope_id = ? AND revoked_at IS NULL ORDER BY created_at DESC',
    [scopeType, scopeId]
  );
  return rows;
}

export async function deleteViewerToken(id) {
  await query('UPDATE viewer_tokens SET revoked_at = ? WHERE id = ?', [Date.now(), id]);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export const PROJECT_ROLE_HIERARCHY = ['contributor', 'editor', 'manager'];

export async function getProject(id) {
  const [rows] = await query('SELECT * FROM projects WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getProjectBySlug(orgId, slug) {
  const [rows] = await query('SELECT * FROM projects WHERE organization_id = ? AND slug = ?', [orgId, slug]);
  return rows[0] ?? null;
}

export async function listProjectsByOrg(orgId) {
  const [rows] = await query(
    "SELECT * FROM projects WHERE organization_id = ? AND status != 'archived' ORDER BY sort_order ASC, name ASC",
    [orgId]
  );
  return rows;
}

/** @deprecated Use listProjectsByOrg */
export const listProjectsByStudio = listProjectsByOrg;

export async function createProject(orgId, { slug, name, description = null, visibility = 'restricted', startsAt = null, endsAt = null }) {
  const id  = randomUUID();
  const now = Date.now();
  await query(`
    INSERT INTO projects (id, organization_id, slug, name, description, visibility, starts_at, ends_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, [id, orgId, slug, name, description, visibility, startsAt, endsAt, now, now]);
  return getProject(id);
}

export async function updateProject(id, fields) {
  const allowed = ['slug', 'name', 'description', 'visibility', 'starts_at', 'ends_at', 'status', 'sort_order', 'cover_gallery_id'];
  const cols    = Object.keys(fields).filter(k => allowed.includes(k));
  if (!cols.length) return getProject(id);
  const sets = [...cols.map(c => `${c} = ?`), 'updated_at = ?'].join(', ');
  const vals = [...cols.map(c => fields[c]), Date.now(), id];
  await query(`UPDATE projects SET ${sets} WHERE id = ?`, vals);
  return getProject(id);
}

export async function archiveProject(id) {
  await query("UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?", [Date.now(), id]);
}

// ── Project role assignments ───────────────────────────────────────────────────

export async function getProjectRole(userId, projectId) {
  const [rows] = await query(
    'SELECT role FROM project_role_assignments WHERE user_id = ? AND project_id = ?',
    [userId, projectId]
  );
  return rows[0]?.role ?? null;
}

export async function upsertProjectRole(projectId, userId, role, grantedByUserId = null) {
  const id  = randomUUID();
  const now = Date.now();
  await query(`
    INSERT INTO project_role_assignments (id, project_id, user_id, role, granted_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE role = VALUES(role), granted_by_user_id = VALUES(granted_by_user_id)
  `, [id, projectId, userId, role, grantedByUserId, now]);
  const [rows] = await query(
    'SELECT * FROM project_role_assignments WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  return rows[0] ?? null;
}

export async function removeProjectRole(projectId, userId) {
  await query(
    'DELETE FROM project_role_assignments WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
}

export async function listProjectMembers(projectId) {
  const [rows] = await query(`
    SELECT pra.role, pra.created_at AS granted_at,
           u.id, u.email, u.name
    FROM project_role_assignments pra
    JOIN users u ON u.id = pra.user_id
    WHERE pra.project_id = ?
    ORDER BY u.email ASC
  `, [projectId]);
  return rows.map(r => ({
    role:      r.role,
    grantedAt: r.granted_at,
    user:      { id: r.id, email: r.email, name: r.name },
  }));
}

// ── Gallery role assignments (canonical, replaces gallery_memberships) ─────────

export const GALLERY_ROLE_HIERARCHY = ['viewer', 'contributor', 'editor'];

export async function getGalleryRoleAssignment(userId, galleryId) {
  const [rows] = await query(
    'SELECT * FROM gallery_role_assignments WHERE user_id = ? AND gallery_id = ?',
    [userId, galleryId]
  );
  return rows[0] ?? null;
}

export async function upsertGalleryRoleAssignment(galleryId, userId, role, grantedByUserId = null) {
  const id  = randomUUID();
  const now = Date.now();
  await query(`
    INSERT INTO gallery_role_assignments (id, gallery_id, user_id, role, granted_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE role = VALUES(role), granted_by_user_id = VALUES(granted_by_user_id)
  `, [id, galleryId, userId, role, grantedByUserId, now]);
  return getGalleryRoleAssignment(userId, galleryId);
}

export async function removeGalleryRoleAssignment(galleryId, userId) {
  await query(
    'DELETE FROM gallery_role_assignments WHERE gallery_id = ? AND user_id = ?',
    [galleryId, userId]
  );
}

export async function listGalleryRoleAssignments(galleryId) {
  const [rows] = await query(`
    SELECT gra.role, gra.created_at AS granted_at,
           u.id, u.email, u.name
    FROM gallery_role_assignments gra
    JOIN users u ON u.id = gra.user_id
    WHERE gra.gallery_id = ?
    ORDER BY u.email ASC
  `, [galleryId]);
  return rows.map(r => ({
    role:      r.role,
    grantedAt: r.granted_at,
    user:      { id: r.id, email: r.email, name: r.name },
  }));
}

// ── Gallery upload links ───────────────────────────────────────────────────────

/**
 * Create a new upload link for a gallery.
 * Returns { id, token, tokenHash, galleryId, label, expiresAt, createdAt }
 * The raw token is returned once — only the hash is stored.
 */
export async function createUploadLink(galleryId, createdByUserId, { label = null, expiresAt = null } = {}) {
  const id         = randomUUID();
  const rawToken   = genToken(32);
  const tokenHash  = sha256(rawToken);
  const expiresVal = expiresAt ? new Date(expiresAt) : null;
  await query(
    `INSERT INTO gallery_upload_links (id, gallery_id, token_hash, token, label, expires_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, galleryId, tokenHash, rawToken, label, expiresVal, createdByUserId]
  );
  return { id, token: rawToken, tokenHash, galleryId, label, expiresAt: expiresVal, createdAt: new Date() };
}

/** Look up an upload link by raw token. Returns null if not found, expired, or revoked. */
export async function getUploadLinkByToken(rawToken) {
  const tokenHash = sha256(rawToken);
  const [rows] = await query(
    `SELECT ul.*, g.organization_id, g.slug AS gallery_slug, g.title AS gallery_title
     FROM gallery_upload_links ul
     JOIN galleries g ON g.id = ul.gallery_id
     WHERE ul.token_hash = ?
       AND ul.revoked_at IS NULL
       AND (ul.expires_at IS NULL OR ul.expires_at > NOW())`,
    [tokenHash]
  );
  return rows[0] || null;
}

/** Get all upload links for a gallery, including the raw token for URL reconstruction. */
export async function listUploadLinks(galleryId) {
  const [rows] = await query(
    `SELECT id, gallery_id, token, label, expires_at, revoked_at, created_by_user_id, created_at,
            (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS active
     FROM gallery_upload_links WHERE gallery_id = ? ORDER BY created_at DESC`,
    [galleryId]
  );
  return rows;
}

/** Revoke an upload link by ID. */
export async function revokeUploadLink(id) {
  await query(`UPDATE gallery_upload_links SET revoked_at = NOW() WHERE id = ?`, [id]);
}

// ── Photo status helpers ───────────────────────────────────────────────────────

/** Set photo status (uploaded | validated | published). */
export async function setPhotoStatus(photoId, status) {
  await query(`UPDATE photos SET status = ? WHERE id = ?`, [status, photoId]);
}

/** Bulk validate or reject photos. action = 'validate' | 'reject' */
export async function bulkSetPhotoStatus(photoIds, status) {
  if (!photoIds.length) return 0;
  const placeholders = photoIds.map(() => '?').join(',');
  const [result] = await query(
    `UPDATE photos SET status = ? WHERE id IN (${placeholders})`,
    [status, ...photoIds]
  );
  return result.affectedRows;
}

/** List photos for a gallery, optionally filtered by status. */
export async function listPhotosByStatus(galleryId, status = null) {
  const where = status ? 'AND p.status = ?' : '';
  const params = status ? [galleryId, status] : [galleryId];
  const [rows] = await query(
    `SELECT p.*, ul.label AS upload_link_label
     FROM photos p
     LEFT JOIN gallery_upload_links ul ON ul.id = p.upload_link_id
     WHERE p.gallery_id = ? ${where}
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    params
  );
  return rows;
}

/** Get photo counts by status for a gallery. */
export async function getPhotoStatusCounts(galleryId) {
  const [rows] = await query(
    `SELECT status, COUNT(*) AS cnt FROM photos WHERE gallery_id = ? GROUP BY status`,
    [galleryId]
  );
  const counts = { uploaded: 0, validated: 0, published: 0 };
  for (const r of rows) counts[r.status] = Number(r.cnt);
  return counts;
}

/** Update gallery workflow status (draft | ready | published). */
export async function setGalleryStatus(galleryId, status) {
  await query(`UPDATE galleries SET workflow_status = ? WHERE id = ?`, [status, galleryId]);
}

// ── Photographer helpers (issue #133) ─────────────────────────────────────────

export async function createPhotographer(galleryId, { name, email = null, bio = null, uploadLinkId = null, organizationId = null }) {
  const id  = genId();
  const now = new Date();
  await query(
    `INSERT INTO photographers (id, gallery_id, organization_id, name, email, bio, upload_link_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, galleryId, organizationId, name, email, bio, uploadLinkId, now]
  );
  return getPhotographer(id);
}

export async function getPhotographer(id) {
  const [rows] = await query('SELECT * FROM photographers WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getPhotographerByUploadLink(uploadLinkId) {
  const [rows] = await query(
    'SELECT * FROM photographers WHERE upload_link_id = ? LIMIT 1',
    [uploadLinkId]
  );
  return rows[0] ?? null;
}

export async function listPhotographers(galleryId) {
  const [rows] = await query(`
    SELECT p.*,
      (SELECT COUNT(*) FROM photos ph WHERE ph.photographer_id = p.id) AS photo_count
    FROM photographers p
    WHERE p.gallery_id = ?
    ORDER BY p.created_at ASC
  `, [galleryId]);
  return rows;
}

export async function updatePhotographer(id, { name, email, bio }) {
  const sets = [];
  const vals = [];
  if (name  !== undefined) { sets.push('name = ?');  vals.push(name); }
  if (email !== undefined) { sets.push('email = ?'); vals.push(email); }
  if (bio   !== undefined) { sets.push('bio = ?');   vals.push(bio); }
  if (!sets.length) return getPhotographer(id);
  vals.push(id);
  await query(`UPDATE photographers SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getPhotographer(id);
}

export async function deletePhotographer(id) {
  await query('DELETE FROM photographers WHERE id = ?', [id]);
}

export async function setPhotoPhotographer(photoId, photographerId) {
  await query('UPDATE photos SET photographer_id = ? WHERE id = ?', [photographerId ?? null, photoId]);
}

export async function bulkSetPhotoPhotographer(photoIds, photographerId) {
  if (!photoIds.length) return 0;
  const placeholders = photoIds.map(() => '?').join(',');
  const [result] = await query(
    `UPDATE photos SET photographer_id = ? WHERE id IN (${placeholders})`,
    [photographerId ?? null, ...photoIds]
  );
  return result.affectedRows;
}

// ── Organization role lookup ─────────────────────────────────────────────────

/**
 * Look up a user's role in an organization (via organization_memberships).
 */
export async function getOrgRole(userId, orgId) {
  const [rows] = await query(
    `SELECT role FROM organization_memberships
     WHERE user_id = ? AND organization_id = ?
     LIMIT 1`,
    [userId, orgId]
  );
  return rows[0]?.role ?? null;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function audit(orgId, userId, action, targetType, targetId, meta = {}) {
  await query(`
    INSERT INTO audit_log (id, organization_id, user_id, action, target_type, target_id, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [randomUUID(), orgId, userId, action, targetType, targetId, JSON.stringify(meta), Date.now()]);
}
