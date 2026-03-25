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

// ── Studios ───────────────────────────────────────────────────────────────────

export async function getStudio(id) {
  const [rows] = await query('SELECT * FROM studios WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function getStudioBySlug(slug) {
  const [rows] = await query('SELECT * FROM studios WHERE slug = ?', [slug]);
  return rows[0] ?? null;
}

export async function getDefaultStudio() {
  const [rows] = await query('SELECT * FROM studios WHERE is_default = 1 LIMIT 1');
  return rows[0] ?? null;
}

export async function listAllStudios() {
  const [rows] = await query(`
    SELECT s.*,
      (SELECT COUNT(*) FROM studio_memberships sm WHERE sm.studio_id = s.id) AS member_count,
      (SELECT COUNT(*) FROM galleries g WHERE g.studio_id = s.id) AS gallery_count
    FROM studios s ORDER BY s.created_at ASC
  `);
  return rows;
}

export async function updateStudio(id, { name, slug, plan }) {
  const sets = [];
  const vals = [];
  if (name  !== undefined) { sets.push('name = ?');  vals.push(name); }
  if (slug  !== undefined) { sets.push('slug = ?');  vals.push(slug); }
  if (plan  !== undefined) { sets.push('plan = ?');  vals.push(plan); }
  if (!sets.length) return getStudio(id);
  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(id);
  await query(`UPDATE studios SET ${sets.join(', ')} WHERE id = ?`, vals);
  return getStudio(id);
}

export async function deleteStudio(id) {
  await query('DELETE FROM studios WHERE id = ?', [id]);
}

export async function createStudio({ name, slug, plan = 'free', isDefault = false }) {
  const id  = genId();
  const now = Date.now();
  await query(
    'INSERT INTO studios (id, name, slug, plan, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, slug, plan, isDefault ? 1 : 0, now, now]
  );
  return getStudio(id);
}

// ── Studio domains ────────────────────────────────────────────────────────────

export async function getStudioByDomain(domain) {
  const [rows] = await query(`
    SELECT s.* FROM studios s
    JOIN studio_domains sd ON sd.studio_id = s.id
    WHERE sd.domain = ?
  `, [domain]);
  return rows[0] ?? null;
}

export async function addStudioDomain(studioId, domain, isPrimary = false) {
  const id  = genId();
  const now = Date.now();
  await query(
    'INSERT INTO studio_domains (id, studio_id, domain, is_primary, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, studioId, domain, isPrimary ? 1 : 0, now]
  );
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

export async function createUser({ studioId, email, passwordHash, role = 'admin', name = '', platformRole = null }) {
  const id  = genId();
  const now = Date.now();
  await query(
    'INSERT INTO users (id, studio_id, email, password_hash, role, name, platform_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, studioId, email, passwordHash, role, name, platformRole, now, now]
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

export async function getSettings(studioId) {
  const [rows] = await query('SELECT * FROM settings WHERE studio_id = ?', [studioId]);
  return rows[0] ?? null;
}

export async function upsertSettings(studioId, fields) {
  const now     = Date.now();
  const allowed = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','apache_path','base_url','site_title','default_author','default_author_email','default_locale','default_access','default_allow_download_image','default_allow_download_gallery','default_private'];
  const cols    = Object.keys(fields).filter(k => allowed.includes(k));
  if (!cols.length) return;

  const existing = await getSettings(studioId);
  if (!existing) {
    const allCols = ['studio_id', ...cols, 'updated_at'];
    const vals    = [studioId, ...cols.map(c => fields[c]), now];
    await query(
      `INSERT INTO settings (${allCols.join(',')}) VALUES (${allCols.map(() => '?').join(',')})`,
      vals
    );
  } else {
    const sets = [...cols.map(c => `${c} = ?`), 'updated_at = ?'].join(', ');
    const vals = [...cols.map(c => fields[c]), now, studioId];
    await query(`UPDATE settings SET ${sets} WHERE studio_id = ?`, vals);
  }
  return getSettings(studioId);
}

// ── Build jobs ────────────────────────────────────────────────────────────────

export async function createJob({ galleryId, studioId, triggeredBy = 'admin', force = false }) {
  const id  = genId();
  const now = Date.now();
  await query(`
    INSERT INTO build_jobs (id, gallery_id, studio_id, status, triggered_by, \`force\`, created_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?)
  `, [id, galleryId, studioId, triggeredBy, force ? 1 : 0, now]);
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

export async function createInvite({ studioId, galleryId = null, email = null, label = null, expiresIn = INVITE_DEFAULT_TTL_MS, singleUse = false }) {
  const id        = genId();
  const rawToken  = genToken(32); // 64-char hex — returned to caller, NEVER stored
  const tokenHash = sha256(rawToken);
  const now       = Date.now();
  const expiresAt = expiresIn ? now + expiresIn : null;
  await query(`
    INSERT INTO gallery_invites (id, studio_id, gallery_id, token, token_hash, email, label, single_use, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, studioId, galleryId, tokenHash, tokenHash, email, label, singleUse ? 1 : 0, expiresAt, now]);
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

export async function listInvites(studioId) {
  const [rows] = await query(
    'SELECT * FROM gallery_invites WHERE studio_id = ? ORDER BY created_at DESC',
    [studioId]
  );
  return rows;
}

export async function useInvite(id) {
  await query('UPDATE gallery_invites SET used_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function revokeInvite(id) {
  await query('UPDATE gallery_invites SET revoked_at = ? WHERE id = ?', [Date.now(), id]);
}

// ── Unified scoped invites (studio | project | gallery) ───────────────────────

const SCOPED_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const INVITE_SCOPE_TYPES = ['studio', 'project', 'gallery'];

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

    // Resolve studio id from scope
    let studioId;
    if (inv.scope_type === 'studio') {
      studioId = inv.scope_id;
    } else if (inv.scope_type === 'project') {
      const [pRows] = await conn.query('SELECT studio_id FROM projects WHERE id = ?', [inv.scope_id]);
      if (!pRows[0]) throw Object.assign(new Error('Project not found'), { status: 404 });
      studioId = pRows[0].studio_id;
    } else if (inv.scope_type === 'gallery') {
      const [gRows] = await conn.query('SELECT studio_id FROM galleries WHERE id = ?', [inv.scope_id]);
      if (!gRows[0]) throw Object.assign(new Error('Gallery not found'), { status: 404 });
      studioId = gRows[0].studio_id;
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
        'INSERT INTO users (id, studio_id, email, password_hash, role, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, studioId, inv.email, passwordHash, inv.role_to_grant, '', now, now]
      );
      const [newRows] = await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
      user = newRows[0];
    }

    // Ensure user has a studio membership (min: photographer)
    const [memRows] = await conn.query(
      'SELECT id FROM studio_memberships WHERE studio_id = ? AND user_id = ?',
      [studioId, user.id]
    );
    if (!memRows[0]) {
      const minRole = inv.scope_type === 'studio' ? inv.role_to_grant : 'photographer';
      const memId = genId();
      await conn.query(
        'INSERT INTO studio_memberships (id, studio_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [memId, studioId, user.id, minRole, now]
      );
    } else if (inv.scope_type === 'studio') {
      // Update studio membership role if this is a studio-scoped invite
      await conn.query(
        'UPDATE studio_memberships SET role = ? WHERE studio_id = ? AND user_id = ?',
        [inv.role_to_grant, studioId, user.id]
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

// ── Studio memberships ────────────────────────────────────────────────────────

export const ROLE_HIERARCHY = ['photographer', 'collaborator', 'admin', 'owner'];

export async function getStudioMembership(userId, studioId) {
  const [rows] = await query(
    'SELECT * FROM studio_memberships WHERE user_id = ? AND studio_id = ?',
    [userId, studioId]
  );
  return rows[0] ?? null;
}

export async function getStudioRole(userId, studioId) {
  const row = await getStudioMembership(userId, studioId);
  return row ? row.role : null;
}

export async function upsertStudioMembership(studioId, userId, role) {
  const id  = genId();
  const now = Date.now();
  await query(`
    INSERT INTO studio_memberships (id, studio_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE role = VALUES(role)
  `, [id, studioId, userId, role, now]);
  return getStudioMembership(userId, studioId);
}

export async function removeStudioMembership(studioId, userId) {
  await query(
    'DELETE FROM studio_memberships WHERE studio_id = ? AND user_id = ?',
    [studioId, userId]
  );
}

export async function listStudioMembers(studioId) {
  const [memberRows] = await query(`
    SELECT sm.role, u.id, u.email, u.name, u.role AS user_role, u.created_at
    FROM studio_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.studio_id = ?
    ORDER BY sm.created_at ASC
  `, [studioId]);

  const [galleryAccess] = await query(`
    SELECT gm.user_id, gm.role AS gallery_role, g.id AS gallery_id, g.title AS gallery_title
    FROM gallery_memberships gm
    JOIN galleries g ON g.id = gm.gallery_id
    WHERE g.studio_id = ?
    ORDER BY g.title ASC
  `, [studioId]);

  const accessByUser = {};
  for (const a of galleryAccess) {
    if (!accessByUser[a.user_id]) accessByUser[a.user_id] = [];
    accessByUser[a.user_id].push({ galleryId: a.gallery_id, galleryTitle: a.gallery_title, role: a.gallery_role });
  }

  return memberRows.map(r => ({
    role: r.role,
    user: { id: r.id, email: r.email, name: r.name, role: r.user_role, createdAt: r.created_at },
    galleries: accessByUser[r.id] || [],
  }));
}

// ── Gallery role (reads from canonical gallery_role_assignments) ───────────────

export const GALLERY_ROLE_HIERARCHY = ['viewer', 'contributor', 'editor'];

/** Canonical gallery role lookup — reads gallery_role_assignments table. */
export async function getGalleryRole(userId, galleryId) {
  const row = await getGalleryRoleAssignment(userId, galleryId);
  return row ? row.role : null;
}

// ── Invitations (studio user invitations) ────────────────────────────────────

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvitation(studioId, email, role, createdBy, { galleryId = null, galleryRole = null } = {}) {
  // Replace any existing pending invitation for this email (re-invite / role change).
  const [existing] = await query(
    'SELECT * FROM invitations WHERE studio_id = ? AND email = ?',
    [studioId, email]
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
    INSERT INTO invitations (id, studio_id, email, role, token, token_hash, created_by, created_at, expires_at, gallery_id, gallery_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, studioId, email, role, tokenHash, tokenHash, createdBy, now, expiresAt, galleryId, galleryRole]);

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

    await conn.query(
      'INSERT INTO users (id, studio_id, email, password_hash, role, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, inv.studio_id, inv.email, passwordHash, inv.role, '', now, now]
    );

    const membershipId = genId();
    await conn.query(`
      INSERT INTO studio_memberships (id, studio_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE role = VALUES(role)
    `, [membershipId, inv.studio_id, userId, inv.role, now]);

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

export async function listInvitations(studioId) {
  const [rows] = await query(
    'SELECT * FROM invitations WHERE studio_id = ? ORDER BY created_at DESC',
    [studioId]
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

export async function getProjectBySlug(studioId, slug) {
  const [rows] = await query('SELECT * FROM projects WHERE studio_id = ? AND slug = ?', [studioId, slug]);
  return rows[0] ?? null;
}

export async function listProjectsByStudio(studioId) {
  const [rows] = await query(
    "SELECT * FROM projects WHERE studio_id = ? AND status != 'archived' ORDER BY name ASC",
    [studioId]
  );
  return rows;
}

export async function createProject(studioId, { slug, name, description = null, visibility = 'restricted', startsAt = null, endsAt = null }) {
  const id  = randomUUID();
  const now = Date.now();
  await query(`
    INSERT INTO projects (id, studio_id, slug, name, description, visibility, starts_at, ends_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, [id, studioId, slug, name, description, visibility, startsAt, endsAt, now, now]);
  return getProject(id);
}

export async function updateProject(id, fields) {
  const allowed = ['slug', 'name', 'description', 'visibility', 'starts_at', 'ends_at', 'status'];
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

export const GALLERY_ROLE_HIERARCHY_V2 = ['viewer', 'contributor', 'editor'];

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

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function audit(studioId, userId, action, targetType, targetId, meta = {}) {
  await query(`
    INSERT INTO audit_log (id, studio_id, user_id, action, target_type, target_id, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [randomUUID(), studioId, userId, action, targetType, targetId, JSON.stringify(meta), Date.now()]);
}
