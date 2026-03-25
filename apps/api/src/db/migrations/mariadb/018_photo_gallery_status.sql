-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 018: photos table + gallery status lifecycle
-- Introduces DB-backed photo records with status tracking.
-- Files are still stored on disk — the DB row is the authoritative record.

-- ── photos table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id                  CHAR(36)      NOT NULL PRIMARY KEY,
  gallery_id          CHAR(36)      NOT NULL,
  filename            VARCHAR(255)  NOT NULL,
  original_name       VARCHAR(255)  NULL,
  size_bytes          BIGINT        NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  status              ENUM('uploaded','validated','published') NOT NULL DEFAULT 'validated',
  uploaded_by_user_id VARCHAR(32)   NULL,
  upload_link_id      CHAR(36)      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gallery_file (gallery_id, filename),
  FOREIGN KEY (gallery_id)    REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (upload_link_id) REFERENCES gallery_upload_links(id) ON DELETE SET NULL
);

CREATE INDEX idx_photos_gallery_status ON photos(gallery_id, status);
CREATE INDEX idx_photos_upload_link    ON photos(upload_link_id);

-- ── gallery status ────────────────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS workflow_status ENUM('draft','ready','published') NOT NULL DEFAULT 'draft'
  AFTER build_status;

-- Backfill gallery status from build_status
UPDATE galleries SET workflow_status = 'published' WHERE build_status = 'done';
UPDATE galleries SET workflow_status = 'draft'     WHERE build_status != 'done' OR build_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_workflow_status ON galleries(organization_id, workflow_status);
