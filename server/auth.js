/**
 * GalleryPack v2 — server/auth.js
 * Admin authentication via HMAC-signed bearer tokens.
 * No external dependencies — uses Node's built-in crypto module.
 *
 * Token format:  <rand_hex>.<ts_hex>.<hmac_hex>
 *   rand_hex  = 24 random bytes as hex
 *   ts_hex    = Date.now() as hex (milliseconds)
 *   hmac_hex  = HMAC-SHA256(rand_hex + '.' + ts_hex, SESSION_SECRET)
 *
 * Tokens expire after TOKEN_TTL_MS (default 30 days).
 */

import crypto from 'crypto';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const SESSION_SECRET  = process.env.SESSION_SECRET  ||
  (() => {
    console.warn('  ⚠  SESSION_SECRET not set — admin sessions will not survive restarts.');
    return crypto.randomBytes(32).toString('hex');
  })();

if (!ADMIN_PASSWORD) {
  console.warn('  ⚠  ADMIN_PASSWORD not set — admin login is disabled.');
}

/** Compare submitted password against ADMIN_PASSWORD. */
export function checkPassword(pw) {
  if (!ADMIN_PASSWORD) return false;
  try {
    const a = Buffer.from(String(pw));
    const b = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== b.length) {
      // Still run timingSafeEqual on equal-length buffers to avoid timing leak
      crypto.timingSafeEqual(b, b);
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/** Create a signed session token. */
export function createSessionToken() {
  const rand = crypto.randomBytes(24).toString('hex');
  const ts   = Date.now().toString(16);
  const sig  = crypto.createHmac('sha256', SESSION_SECRET)
    .update(`${rand}.${ts}`)
    .digest('hex');
  return `${rand}.${ts}.${sig}`;
}

/** Verify a session token. Returns true if valid and not expired. */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [rand, ts, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET)
    .update(`${rand}.${ts}`)
    .digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return false;
    }
  } catch { return false; }
  // Check expiry
  const issuedAt = parseInt(ts, 16);
  return (Date.now() - issuedAt) < TOKEN_TTL_MS;
}

/** Express middleware — checks Authorization: Bearer <token> header. */
export function requireAdmin(req, res, next) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (verifySessionToken(token)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
