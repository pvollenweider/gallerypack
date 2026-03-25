-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

CREATE TABLE IF NOT EXISTS invitations (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,
  studio_id   VARCHAR(32)  NOT NULL,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(32)  NOT NULL,
  token       VARCHAR(64)  NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE,
  created_by  VARCHAR(32),
  created_at  BIGINT       NOT NULL,
  expires_at  BIGINT       NOT NULL,
  accepted_at BIGINT       DEFAULT NULL,
  gallery_id  VARCHAR(32)  DEFAULT NULL,
  gallery_role VARCHAR(32) DEFAULT NULL,
  CONSTRAINT fk_invitations_studio  FOREIGN KEY (studio_id)  REFERENCES studios(id)  ON DELETE CASCADE,
  CONSTRAINT fk_invitations_gallery FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_invitations_studio ON invitations(studio_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email  ON invitations(email);
