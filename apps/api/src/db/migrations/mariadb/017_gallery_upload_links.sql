-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 017: gallery_upload_links — canonical photographer upload access
-- Replaces gallery_invites as the single mechanism for unauthenticated photo upload.
-- gallery_invites is retained for backward compat but no longer written to.

CREATE TABLE IF NOT EXISTS gallery_upload_links (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  gallery_id          CHAR(36)     NOT NULL,
  token_hash          CHAR(64)     NOT NULL,
  label               VARCHAR(255) NULL,
  expires_at          DATETIME     NULL,
  revoked_at          DATETIME     NULL,
  created_by_user_id  VARCHAR(32)  NOT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_upload_link_token (token_hash),
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_upload_links_gallery ON gallery_upload_links(gallery_id);
