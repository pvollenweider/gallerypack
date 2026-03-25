-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 020: Photo attribution — photographers table + photos.photographer_id
-- A photographer is a named entity (no system account needed) attached to a gallery.
-- One photographer can be linked to one upload link — photos uploaded via that link
-- are auto-attributed to the linked photographer.

-- ── 1. photographers table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photographers (
  id              VARCHAR(36)   NOT NULL PRIMARY KEY,
  gallery_id      VARCHAR(36)   NOT NULL,
  organization_id VARCHAR(36)   NULL,
  name            VARCHAR(255)  NOT NULL,
  email           VARCHAR(255)  NULL,
  bio             TEXT          NULL,
  upload_link_id  VARCHAR(36)   NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photographer_gallery FOREIGN KEY (gallery_id)     REFERENCES galleries(id)            ON DELETE CASCADE,
  CONSTRAINT fk_photographer_link    FOREIGN KEY (upload_link_id) REFERENCES gallery_upload_links(id)  ON DELETE SET NULL,
  INDEX idx_photographer_gallery     (gallery_id),
  INDEX idx_photographer_link        (upload_link_id)
);

-- ── 2. photos.photographer_id ─────────────────────────────────────────────────
ALTER TABLE photos ADD COLUMN IF NOT EXISTS photographer_id VARCHAR(36) NULL;
ALTER TABLE photos ADD CONSTRAINT fk_photo_photographer
  FOREIGN KEY (photographer_id) REFERENCES photographers(id) ON DELETE SET NULL;
