// apps/api/src/db/helpers.js — reusable query helpers
import { getDb } from './database.js';
import { randomBytes } from 'crypto';

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

export function upsertSettings(studioId, fields) {
  const now = Date.now();
  const allowed = ['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_secure','apache_path','base_url'];
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
