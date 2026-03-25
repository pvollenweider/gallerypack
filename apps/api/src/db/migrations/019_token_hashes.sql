-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- 019_token_hashes.sql
-- Replace plaintext tokens with SHA-256 hashes in all token tables.
-- Rationale: a DB leak should not expose usable tokens.
-- Strategy:
--   1. Add token_hash column (nullable, will be NOT NULL for all rows after this migration)
--   2. Backfill existing rows: token_hash = sha256_hex(token)
--   3. Overwrite token column with the hash (so raw token no longer lives in DB)
--   4. Create unique indexes on token_hash
--
-- After this migration:
--   - token  column: stores sha256 hash (NOT the raw token)
--   - token_hash column: stores sha256 hash (same value, canonical lookup column)
--   - raw token: only ever in the URL / email at creation time, never persisted

-- ── invitations ───────────────────────────────────────────────────────────────
ALTER TABLE invitations ADD COLUMN token_hash TEXT;
UPDATE invitations SET token_hash = sha256_hex(token) WHERE token_hash IS NULL;
UPDATE invitations SET token      = token_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations(token_hash);

-- ── invites (photographer invite links) ──────────────────────────────────────
ALTER TABLE invites ADD COLUMN token_hash TEXT;
UPDATE invites SET token_hash = sha256_hex(token) WHERE token_hash IS NULL;
UPDATE invites SET token      = token_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_token_hash ON invites(token_hash);

-- ── password_reset_tokens ─────────────────────────────────────────────────────
ALTER TABLE password_reset_tokens ADD COLUMN token_hash TEXT;
UPDATE password_reset_tokens SET token_hash = sha256_hex(token) WHERE token_hash IS NULL;
UPDATE password_reset_tokens SET token      = token_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash);

-- ── magic_links ───────────────────────────────────────────────────────────────
ALTER TABLE magic_links ADD COLUMN token_hash TEXT;
UPDATE magic_links SET token_hash = sha256_hex(token) WHERE token_hash IS NULL;
UPDATE magic_links SET token      = token_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash);

-- ── viewer_tokens ─────────────────────────────────────────────────────────────
ALTER TABLE viewer_tokens ADD COLUMN token_hash TEXT;
UPDATE viewer_tokens SET token_hash = sha256_hex(token) WHERE token_hash IS NULL;
UPDATE viewer_tokens SET token      = token_hash;
CREATE UNIQUE INDEX IF NOT EXISTS idx_viewer_tokens_token_hash ON viewer_tokens(token_hash);
