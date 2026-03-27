-- Migration 014: Personal upload tokens
-- Users can create named API tokens (gp_ prefix) scoped to a gallery or project.
-- Raw tokens are shown once and never stored — only the SHA-256 hash is kept.

CREATE TABLE IF NOT EXISTS personal_tokens (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  user_id       VARCHAR(32)   NOT NULL,
  name          VARCHAR(128)  NOT NULL,
  token_hash    CHAR(64)      NOT NULL UNIQUE,  -- SHA-256 hex of raw token
  prefix        VARCHAR(12)   NOT NULL,          -- first 8 chars after 'gp_', for display
  scope_type    ENUM('gallery','project') NOT NULL,
  scope_id      CHAR(36)      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME      NULL,
  expires_at    DATETIME      NULL,
  revoked_at    DATETIME      NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_personal_tokens_user   ON personal_tokens(user_id);
CREATE INDEX idx_personal_tokens_scope  ON personal_tokens(scope_type, scope_id);

-- Track which photos were uploaded via personal token
ALTER TABLE photos
  ADD COLUMN personal_token_id CHAR(36) NULL AFTER upload_link_id,
  ADD FOREIGN KEY (personal_token_id) REFERENCES personal_tokens(id) ON DELETE SET NULL;

CREATE INDEX idx_photos_personal_token ON photos(personal_token_id);
