// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/personalTokenService.js
// Generate, hash, validate, and scope-check personal upload tokens (gp_ prefix).

import { randomBytes, createHash } from 'node:crypto';
import { randomUUID }              from 'node:crypto';
import { query }                   from '../db/database.js';

const TOKEN_PREFIX = 'gp_';

/**
 * Generate a new raw token: gp_ + 40 hex characters (20 bytes = 160-bit entropy).
 * The prefix (first 8 chars after gp_) is stored for display purposes.
 * @returns {{ raw: string, hash: string, prefix: string }}
 */
export function generateToken() {
  const body = randomBytes(20).toString('hex'); // 40 hex chars
  const raw  = TOKEN_PREFIX + body;
  const hash = hashToken(raw);
  const prefix = body.slice(0, 8);
  return { raw, hash, prefix };
}

/** SHA-256 hex of raw token string */
export function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Create and persist a personal token.
 * @returns {{ id, name, prefix, scopeType, scopeId, expiresAt, raw }}
 *   `raw` is the plaintext token — caller must show it once and discard.
 */
export async function createToken(userId, name, scopeType, scopeId, expiresAt = null) {
  const { raw, hash, prefix } = generateToken();
  const id = randomUUID();

  await query(
    `INSERT INTO personal_tokens (id, user_id, name, token_hash, prefix, scope_type, scope_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, name, hash, prefix, scopeType, scopeId,
     expiresAt ? new Date(expiresAt) : null]
  );

  return { id, name, prefix, scopeType, scopeId, expiresAt, raw };
}

/**
 * List all tokens for a user (never returns the hash or raw value).
 */
export async function listTokens(userId) {
  const [rows] = await query(
    `SELECT id, name, prefix, scope_type AS scopeType, scope_id AS scopeId,
            created_at AS createdAt, last_used_at AS lastUsedAt,
            expires_at AS expiresAt, revoked_at AS revokedAt
     FROM personal_tokens
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Revoke a token. Only the owning user may revoke it.
 * @returns {boolean} true if a row was updated
 */
export async function revokeToken(userId, tokenId) {
  const [result] = await query(
    `UPDATE personal_tokens SET revoked_at = NOW()
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    [tokenId, userId]
  );
  return result.affectedRows > 0;
}

/**
 * Validate a raw token string from an Authorization header.
 * Updates last_used_at on success.
 * @returns {object|null} token record (with scopeType, scopeId, userId) or null
 */
export async function validateToken(raw) {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const hash = hashToken(raw);

  const [rows] = await query(
    `SELECT id, user_id AS userId, name, scope_type AS scopeType, scope_id AS scopeId,
            expires_at AS expiresAt, revoked_at AS revokedAt
     FROM personal_tokens
     WHERE token_hash = ?
     LIMIT 1`,
    [hash]
  );

  const token = rows[0];
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return null;

  // Touch last_used_at (fire-and-forget)
  query('UPDATE personal_tokens SET last_used_at = NOW() WHERE id = ?', [token.id]).catch(() => {});

  return token;
}

/**
 * Check that a validated token's scope covers the requested gallery.
 * For gallery-scoped tokens: scope_id must equal galleryId.
 * For project-scoped tokens: the gallery must belong to the project.
 * @returns {boolean}
 */
export async function tokenCoversGallery(token, galleryId) {
  if (token.scopeType === 'gallery') {
    return token.scopeId === galleryId;
  }
  if (token.scopeType === 'project') {
    const [rows] = await query(
      'SELECT id FROM galleries WHERE id = ? AND project_id = ? LIMIT 1',
      [galleryId, token.scopeId]
    );
    return rows.length > 0;
  }
  return false;
}
