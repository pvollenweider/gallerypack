-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 11: unified scoped invites table
-- Renames old invites (photographer upload links) to gallery_invites to free
-- up the name, then creates the new unified invites table.

RENAME TABLE invites TO gallery_invites;

CREATE TABLE IF NOT EXISTS invites (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  email               VARCHAR(255) NOT NULL,
  scope_type          VARCHAR(20)  NOT NULL,   -- studio | project | gallery
  scope_id            CHAR(64)     NOT NULL,
  role_to_grant       VARCHAR(50)  NOT NULL,
  token_hash          CHAR(64)     NOT NULL UNIQUE,
  expires_at          BIGINT       NOT NULL,
  used_at             BIGINT,
  revoked_at          BIGINT,
  created_by_user_id  VARCHAR(32),
  created_at          BIGINT       NOT NULL,
  CONSTRAINT fk_invites_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invites_scope ON invites(scope_type, scope_id);
CREATE INDEX idx_invites_email ON invites(email);
