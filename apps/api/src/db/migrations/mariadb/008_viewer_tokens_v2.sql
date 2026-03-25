-- Migration 12: viewer tokens v2 — project | gallery scope
-- Renames old gallery-only table to viewer_tokens_legacy, creates new scoped
-- table, and backfills existing gallery tokens.

RENAME TABLE viewer_tokens TO viewer_tokens_legacy;

CREATE TABLE IF NOT EXISTS viewer_tokens (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  scope_type          VARCHAR(20)  NOT NULL,   -- project | gallery
  scope_id            CHAR(64)     NOT NULL,
  email               VARCHAR(255),
  label               VARCHAR(255),
  token_hash          CHAR(64)     NOT NULL UNIQUE,
  expires_at          BIGINT,
  revoked_at          BIGINT,
  last_used_at        BIGINT,
  created_by_user_id  VARCHAR(32),
  created_at          BIGINT       NOT NULL,
  CONSTRAINT fk_vt_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_viewer_tokens_scope ON viewer_tokens(scope_type, scope_id);

-- Backfill existing gallery viewer tokens into the new table
INSERT IGNORE INTO viewer_tokens
  (id, scope_type, scope_id, email, label, token_hash, expires_at, revoked_at, last_used_at, created_by_user_id, created_at)
SELECT
  id, 'gallery', gallery_id, NULL, label, token_hash, expires_at, NULL, last_used_at, created_by, created_at
FROM viewer_tokens_legacy;
