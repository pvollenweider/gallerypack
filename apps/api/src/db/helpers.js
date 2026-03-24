// apps/api/src/db/helpers.js — reusable query helpers
import { getDb } from './database.js';
import { randomBytes, createHmac, timingSafeEqual, scryptSync } from 'crypto';

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

/** Hash a password for storage. Returns `scrypt:<salt>:<hash>` (all hex). */
export function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/** Verify a plain password against a stored hash (timing-safe). */
export function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, salt, hash] = stored.split(':');
  const candidate = scryptSync(plain, salt, 64).toString('hex');
  try {
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
  const id    = genId();
  const token = genToken(32); // 64-char hex, sent in URL
  const now   = Date.now();
  const expiresAt = expiresIn ? now + expiresIn : null;
  getDb().prepare(`
    INSERT INTO invites (id, studio_id, gallery_id, token, email, label, single_use, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, studioId, galleryId, token, email, label, singleUse ? 1 : 0, expiresAt, now);
  return getInviteById(id);
}

export function getInviteById(id) {
  return getDb().prepare('SELECT * FROM invites WHERE id = ?').get(id);
}

export function getInviteByToken(token) {
  return getDb().prepare('SELECT * FROM invites WHERE token = ?').get(token);
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
