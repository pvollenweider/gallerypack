// apps/api/src/db/helpers.js — reusable query helpers
import { getDb } from './database.js';
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

// ── Studios ───────────────────────────────────────────────────────────────────

export function getStudio(id) {
  return getDb().prepare('SELECT * FROM studios WHERE id = ?').get(id);
}

export function getStudioBySlug(slug) {
  return getDb().prepare('SELECT * FROM studios WHERE slug = ?').get(slug);
}

export function createStudio({ name, slug, plan = 'free' }) {
  const id = genId();
  const now = Date.now();
  getDb().prepare(
    'INSERT INTO studios (id, name, slug, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, slug, plan, now, now);
  return getStudio(id);
}

// ── Users ─────────────────────────────────────────────────────────────────────

export function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function createUser({ studioId, email, passwordHash, role = 'admin', name = '' }) {
  const id = genId();
  const now = Date.now();
  getDb().prepare(
    'INSERT INTO users (id, studio_id, email, password_hash, role, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, studioId, email, passwordHash, role, name, now, now);
  return getUserById(id);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(userId) {
  const id = genToken(32);
  const now = Date.now();
  getDb().prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId, now + SESSION_TTL_MS, now);
  return id;
}

export function getSession(id) {
  return getDb().prepare(
    'SELECT * FROM sessions WHERE id = ? AND expires_at > ?'
  ).get(id, Date.now());
}

export function deleteSession(id) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function pruneExpiredSessions() {
  getDb().prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSettings(studioId) {
  return getDb().prepare('SELECT * FROM settings WHERE studio_id = ?').get(studioId);
}

// ── Build jobs ────────────────────────────────────────────────────────────────

export function createJob({ galleryId, studioId, triggeredBy = 'admin', force = false }) {
  const id  = genId();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO build_jobs (id, gallery_id, studio_id, status, triggered_by, force, created_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?)
  `).run(id, galleryId, studioId, triggeredBy, force ? 1 : 0, now);
  return getDb().prepare('SELECT * FROM build_jobs WHERE id = ?').get(id);
}

export function getJob(id) {
  return getDb().prepare('SELECT * FROM build_jobs WHERE id = ?').get(id);
}

export function listJobs(galleryId) {
  return getDb()
    .prepare('SELECT * FROM build_jobs WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(galleryId);
}

export function updateJobStatus(id, status, fields = {}) {
  const allowed = { running: 'started_at', done: 'finished_at', error: 'finished_at' };
  const timeCol = allowed[status];
  const now = Date.now();
  if (timeCol && fields[timeCol] === undefined) fields[timeCol] = now;
  if (fields.error_msg !== undefined) {
    getDb().prepare('UPDATE build_jobs SET status = ?, error_msg = ? WHERE id = ?')
      .run(status, fields.error_msg, id);
  }
  if (timeCol) {
    getDb().prepare(`UPDATE build_jobs SET status = ?, ${timeCol} = ? WHERE id = ?`)
      .run(status, fields[timeCol], id);
  } else {
    getDb().prepare('UPDATE build_jobs SET status = ? WHERE id = ?').run(status, id);
  }
}

export function appendEvent(jobId, type, data) {
  const db  = getDb();
  const seq = (db.prepare('SELECT COALESCE(MAX(seq),0)+1 as next FROM build_events WHERE job_id = ?').get(jobId)?.next) || 1;
  const now = Date.now();
  db.prepare('INSERT INTO build_events (job_id, seq, type, data, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(jobId, seq, type, typeof data === 'string' ? data : JSON.stringify(data), now);
  return seq;
}

export function getEvents(jobId, afterSeq = 0) {
  return getDb()
    .prepare('SELECT * FROM build_events WHERE job_id = ? AND seq > ? ORDER BY seq ASC')
    .all(jobId, afterSeq);
}

// ── Password hashing (scrypt, no native deps) ─────────────────────────────────

/**
 * Hash a password for storage.
 * New format: `$scrypt$<salt_hex>$<hash_hex>` (64-char salt, 64-char hash).
 * Also handles legacy `scrypt:<salt>:<hash>` format for verification.
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
    // New format: $scrypt$<salt>$<hash>
    const parts = stored.split('$'); // ['', 'scrypt', salt, hash]
    if (parts.length !== 4) return false;
    salt = parts[2];
    hash = parts[3];
  } else if (stored.startsWith('scrypt:')) {
    // Old format: scrypt:<salt>:<hash>
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

// ── Viewer tokens (HMAC-signed, no DB needed) ─────────────────────────────────

const VIEWER_SECRET = process.env.VIEWER_TOKEN_SECRET || 'change-me-in-production';
const VIEWER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Create a signed viewer token for a gallery. Returns a `<payload>.<sig>` string. */
export function createViewerToken(galleryId) {
  const payload = Buffer.from(JSON.stringify({ g: galleryId, exp: Date.now() + VIEWER_TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', VIEWER_SECRET).update(payload).digest('base64url');
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

// ── Invites ────────────────────────────────────────────────────────────────────

const INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create an invite.
 * @param {{ studioId, galleryId?, email?, label?, expiresIn?, singleUse? }} opts
 */
export function createInvite({ studioId, galleryId = null, email = null, label = null, expiresIn = INVITE_DEFAULT_TTL_MS, singleUse = false }) {
  const id         = genId();
  const rawToken   = genToken(32); // 64-char hex — returned to caller, NEVER stored
  const tokenHash  = sha256(rawToken);
  const now        = Date.now();
  const expiresAt  = expiresIn ? now + expiresIn : null;
  getDb().prepare(`
    INSERT INTO invites (id, studio_id, gallery_id, token, token_hash, email, label, single_use, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, studioId, galleryId, tokenHash, tokenHash, email, label, singleUse ? 1 : 0, expiresAt, now);
  // Return row with rawToken injected — raw token is NOT in the DB
  return { ...getInviteById(id), token: rawToken };
}

export function getInviteById(id) {
  return getDb().prepare('SELECT * FROM invites WHERE id = ?').get(id);
}

export function getInviteByToken(token) {
  return getDb().prepare('SELECT * FROM invites WHERE token_hash = ?').get(sha256(token));
}

export function listInvites(studioId) {
  return getDb().prepare('SELECT * FROM invites WHERE studio_id = ? ORDER BY created_at DESC').all(studioId);
}

export function useInvite(id) {
  getDb().prepare('UPDATE invites SET used_at = ? WHERE id = ?').run(Date.now(), id);
}

export function revokeInvite(id) {
  getDb().prepare('UPDATE invites SET revoked_at = ? WHERE id = ?').run(Date.now(), id);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function upsertSettings(studioId, fields) {
  const now = Date.now();
  const allowed = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','apache_path','base_url','site_title','default_author','default_author_email','default_locale','default_access','default_allow_download_image','default_allow_download_gallery','default_private'];
  const cols = Object.keys(fields).filter(k => allowed.includes(k));
  if (!cols.length) return;
  const existing = getSettings(studioId);
  if (!existing) {
    const allCols = ['studio_id', ...cols, 'updated_at'];
    const vals = [studioId, ...cols.map(c => fields[c]), now];
    getDb().prepare(
      `INSERT INTO settings (${allCols.join(',')}) VALUES (${allCols.map(() => '?').join(',')})`
    ).run(...vals);
  } else {
    const sets = [...cols.map(c => `${c} = ?`), 'updated_at = ?'].join(', ');
    const vals = [...cols.map(c => fields[c]), now, studioId];
    getDb().prepare(`UPDATE settings SET ${sets} WHERE studio_id = ?`).run(...vals);
  }
  return getSettings(studioId);
}

// ── Studio memberships ────────────────────────────────────────────────────────

/**
 * Role hierarchy: owner > admin > editor > photographer
 */
export const ROLE_HIERARCHY = ['photographer', 'editor', 'admin', 'owner'];

/** Returns the membership row for a user in a studio, or null. */
export function getStudioMembership(userId, studioId) {
  return getDb()
    .prepare('SELECT * FROM studio_memberships WHERE user_id = ? AND studio_id = ?')
    .get(userId, studioId) || null;
}

/** Returns the role string for a user in a studio, or null if not a member. */
export function getStudioRole(userId, studioId) {
  const row = getStudioMembership(userId, studioId);
  return row ? row.role : null;
}

/** Insert or update a studio membership. */
export function upsertStudioMembership(studioId, userId, role) {
  const id  = genId();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO studio_memberships (id, studio_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(studio_id, user_id) DO UPDATE SET role = excluded.role
  `).run(id, studioId, userId, role, now);
  return getStudioMembership(userId, studioId);
}

/** Remove a user from a studio. */
export function removeStudioMembership(studioId, userId) {
  getDb()
    .prepare('DELETE FROM studio_memberships WHERE studio_id = ? AND user_id = ?')
    .run(studioId, userId);
}

/**
 * List all members of a studio.
 * Returns array of { user: {...}, role } objects.
 */
export function listStudioMembers(studioId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT sm.role, u.id, u.email, u.name, u.role as user_role, u.created_at
    FROM studio_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.studio_id = ?
    ORDER BY sm.created_at ASC
  `).all(studioId);

  // Attach per-gallery roles for each member
  const galleryAccess = db.prepare(`
    SELECT gm.user_id, gm.role as gallery_role, g.id as gallery_id, g.title as gallery_title
    FROM gallery_memberships gm
    JOIN galleries g ON g.id = gm.gallery_id
    WHERE g.studio_id = ?
    ORDER BY g.title ASC
  `).all(studioId);

  const accessByUser = {};
  for (const a of galleryAccess) {
    if (!accessByUser[a.user_id]) accessByUser[a.user_id] = [];
    accessByUser[a.user_id].push({ galleryId: a.gallery_id, galleryTitle: a.gallery_title, role: a.gallery_role });
  }

  return rows.map(r => ({
    role: r.role,
    user: { id: r.id, email: r.email, name: r.name, role: r.user_role, createdAt: r.created_at },
    galleries: accessByUser[r.id] || [],
  }));
}

// ── Gallery memberships ───────────────────────────────────────────────────────

/**
 * Gallery role hierarchy: viewer < contributor < editor
 */
export const GALLERY_ROLE_HIERARCHY = ['viewer', 'contributor', 'editor'];

/** Returns the gallery membership row for a user in a gallery, or null. */
export function getGalleryMembership(userId, galleryId) {
  return getDb()
    .prepare('SELECT * FROM gallery_memberships WHERE user_id = ? AND gallery_id = ?')
    .get(userId, galleryId) || null;
}

/** Returns the role string for a user in a gallery, or null if not a member. */
export function getGalleryRole(userId, galleryId) {
  const row = getGalleryMembership(userId, galleryId);
  return row ? row.role : null;
}

/** Insert or update a gallery membership. */
export function upsertGalleryMembership(galleryId, userId, role) {
  const id  = genId();
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO gallery_memberships (id, gallery_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(gallery_id, user_id) DO UPDATE SET role = excluded.role
  `).run(id, galleryId, userId, role, now);
  return getGalleryMembership(userId, galleryId);
}

/** Remove a user from a gallery. */
export function removeGalleryMembership(galleryId, userId) {
  getDb()
    .prepare('DELETE FROM gallery_memberships WHERE gallery_id = ? AND user_id = ?')
    .run(galleryId, userId);
}

/**
 * List all members of a gallery.
 * Returns array of { user_id, email, role, created_at } objects.
 */
export function listGalleryMembers(galleryId) {
  return getDb().prepare(`
    SELECT gm.user_id, u.email, gm.role, gm.created_at
    FROM gallery_memberships gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.gallery_id = ?
    ORDER BY u.email ASC
  `).all(galleryId);
}

// ── Invitations (studio user invitations) ────────────────────────────────────

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create an invitation for a new user to join a studio.
 * @param {string} studioId
 * @param {string} email
 * @param {string} role  - one of: owner, admin, editor, photographer
 * @param {string} createdBy - user ID of the inviting admin
 * @returns {object} invitation row
 */
export function createInvitation(studioId, email, role, createdBy, { galleryId = null, galleryRole = null } = {}) {
  const db = getDb();
  // Replace any existing pending invitation for this email (re-invite / role change).
  // Refuse if the invitation was already accepted (user is already a member).
  const existing = db.prepare('SELECT * FROM invitations WHERE studio_id = ? AND email = ?').get(studioId, email);
  if (existing) {
    if (existing.accepted_at) throw Object.assign(new Error('This user is already a member'), { status: 409 });
    db.prepare('DELETE FROM invitations WHERE id = ?').run(existing.id);
  }
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  const expiresAt = now + INVITATION_TTL_MS;
  db.prepare(`
    INSERT INTO invitations (id, studio_id, email, role, token, token_hash, created_by, created_at, expires_at, gallery_id, gallery_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, studioId, email, role, tokenHash, tokenHash, createdBy, now, expiresAt, galleryId, galleryRole);
  // Return row with rawToken injected — raw token is NOT in the DB
  return { ...db.prepare('SELECT * FROM invitations WHERE id = ?').get(id), token: rawToken };
}

/** Returns an invitation row by token, or null. */
export function getInvitationByToken(token) {
  return getDb().prepare('SELECT * FROM invitations WHERE token_hash = ?').get(sha256(token)) || null;
}

/**
 * Accept an invitation: create user, grant membership, mark accepted.
 * Runs in a transaction. Returns the new user.
 * @param {string} token
 * @param {string} password - plain-text password for the new account
 * @returns {object} new user row
 */
export function acceptInvitation(token, password) {
  const db = getDb();
  return db.transaction(() => {
    const inv = db.prepare('SELECT * FROM invitations WHERE token_hash = ?').get(sha256(token));
    if (!inv) throw Object.assign(new Error('Invitation not found'), { status: 404 });
    if (inv.accepted_at) throw Object.assign(new Error('Invitation already accepted'), { status: 409 });
    if (inv.expires_at < Date.now()) throw Object.assign(new Error('Invitation has expired'), { status: 410 });

    const passwordHash = hashPassword(password);
    const user = createUser({ studioId: inv.studio_id, email: inv.email, passwordHash, role: inv.role });
    upsertStudioMembership(inv.studio_id, user.id, inv.role);
    if (inv.gallery_id && inv.gallery_role) {
      upsertGalleryMembership(inv.gallery_id, user.id, inv.gallery_role);
    }
    db.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ?').run(Date.now(), inv.id);
    return user;
  })();
}

/** List all invitations for a studio, newest first. */
export function listInvitations(studioId) {
  return getDb()
    .prepare('SELECT * FROM invitations WHERE studio_id = ? ORDER BY created_at DESC')
    .all(studioId);
}

/** Delete an invitation by id. */
export function deleteInvitation(id) {
  getDb().prepare('DELETE FROM invitations WHERE id = ?').run(id);
}

// ── Password reset tokens ─────────────────────────────────────────────────────

const RESET_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function createPasswordResetToken(userId) {
  const db = getDb();
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL').run(userId);
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, tokenHash, tokenHash, now, now + RESET_TTL_MS);
  return { ...db.prepare('SELECT * FROM password_reset_tokens WHERE id = ?').get(id), token: rawToken };
}

export function getPasswordResetToken(token) {
  return getDb().prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(sha256(token)) || null;
}

export function usePasswordResetToken(token, newPassword) {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(sha256(token));
    if (!row)      throw Object.assign(new Error('Lien invalide'), { status: 404 });
    if (row.used_at) throw Object.assign(new Error('Ce lien a déjà été utilisé'), { status: 409 });
    if (row.expires_at < Date.now()) throw Object.assign(new Error('Ce lien a expiré'), { status: 410 });
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(newPassword), Date.now(), row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
    return getUserById(row.user_id);
  })();
}

// ── Magic links (passwordless login, 5-min TTL) ───────────────────────────────

const MAGIC_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createMagicLink(userId) {
  const db = getDb();
  db.prepare('DELETE FROM magic_links WHERE user_id = ? AND used_at IS NULL').run(userId);
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  db.prepare('INSERT INTO magic_links (id, user_id, token, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, tokenHash, tokenHash, now, now + MAGIC_TTL_MS);
  return { ...db.prepare('SELECT * FROM magic_links WHERE id = ?').get(id), token: rawToken };
}

export function useMagicLink(token) {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM magic_links WHERE token_hash = ?').get(sha256(token));
    if (!row)          throw Object.assign(new Error('Lien invalide'), { status: 404 });
    if (row.used_at)   throw Object.assign(new Error('Ce lien a déjà été utilisé'), { status: 409 });
    if (row.expires_at < Date.now()) throw Object.assign(new Error('Ce lien a expiré (5 min)'), { status: 410 });
    db.prepare('UPDATE magic_links SET used_at = ? WHERE id = ?').run(Date.now(), row.id);
    return getUserById(row.user_id);
  })();
}

// ── Viewer tokens (DB-backed, per-gallery share links) ────────────────────────

/**
 * Create a viewer token for a gallery.
 * @param {string} galleryId
 * @param {string} createdBy  - user ID of the creator
 * @param {{ label?: string, expiresAt?: number }} [opts]
 * @returns {object} new viewer_tokens row
 */
export function createViewerTokenDb(galleryId, createdBy, { label = null, expiresAt = null } = {}) {
  const id        = randomUUID();
  const rawToken  = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  getDb().prepare(`
    INSERT INTO viewer_tokens (id, gallery_id, token, token_hash, label, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, galleryId, tokenHash, tokenHash, label, createdBy, now, expiresAt ?? null);
  return { ...getDb().prepare('SELECT * FROM viewer_tokens WHERE id = ?').get(id), token: rawToken };
}

/**
 * Look up a viewer token by its raw token string (looked up by sha256 hash).
 * Returns the row or null. Deletes and returns null if expired.
 * @param {string} token
 * @returns {object|null}
 */
export function getViewerToken(token) {
  const row = getDb().prepare('SELECT * FROM viewer_tokens WHERE token_hash = ?').get(sha256(token));
  if (!row) return null;
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    getDb().prepare('DELETE FROM viewer_tokens WHERE id = ?').run(row.id);
    return null;
  }
  return row;
}

/**
 * Update last_used_at for a viewer token (fire-and-forget).
 * @param {string} id  - viewer_tokens.id
 */
export function touchViewerToken(id) {
  getDb().prepare('UPDATE viewer_tokens SET last_used_at = ? WHERE id = ?').run(Date.now(), id);
}

/**
 * List all viewer tokens for a gallery.
 * @param {string} galleryId
 * @returns {object[]}
 */
export function listViewerTokens(galleryId) {
  return getDb()
    .prepare('SELECT * FROM viewer_tokens WHERE gallery_id = ? ORDER BY created_at DESC')
    .all(galleryId);
}

/**
 * Delete a viewer token by its id.
 * @param {string} id
 */
export function deleteViewerToken(id) {
  getDb().prepare('DELETE FROM viewer_tokens WHERE id = ?').run(id);
}

// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * Insert an audit log entry.
 * @param {string|null} studioId
 * @param {string|null} userId
 * @param {string} action     - e.g. 'gallery.create', 'photo.upload'
 * @param {string|null} targetType - e.g. 'gallery', 'invitation'
 * @param {string|null} targetId
 * @param {object} [meta]     - extra context serialised as JSON
 */
export function audit(studioId, userId, action, targetType, targetId, meta = {}) {
  getDb().prepare(`
    INSERT INTO audit_log (id, studio_id, user_id, action, target_type, target_id, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), studioId, userId, action, targetType, targetId, JSON.stringify(meta), Date.now());
}
