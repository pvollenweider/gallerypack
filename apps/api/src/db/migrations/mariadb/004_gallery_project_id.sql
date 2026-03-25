-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 7 — add project_id + visibility to galleries
-- Attaches each gallery to a project. Initially nullable; migration 5 backfills, then enforces NOT NULL.

ALTER TABLE galleries
  ADD COLUMN project_id CHAR(36) AFTER studio_id,
  ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'restricted' AFTER access;

ALTER TABLE galleries
  ADD FOREIGN KEY fk_gallery_project (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

CREATE INDEX idx_galleries_project ON galleries(project_id)
