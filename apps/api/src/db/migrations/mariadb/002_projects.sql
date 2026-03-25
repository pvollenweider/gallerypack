-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 5 — projects
-- A Project is the grouping level between Studio and Gallery.
-- Every gallery belongs to one project; projects belong to one studio.

CREATE TABLE IF NOT EXISTS projects (
  id          CHAR(36)     NOT NULL PRIMARY KEY,          -- UUID
  studio_id   CHAR(36)     NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  visibility  VARCHAR(20)  NOT NULL DEFAULT 'restricted', -- public | restricted | link | password
  starts_at   BIGINT,
  ends_at     BIGINT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',     -- active | archived
  created_at  BIGINT       NOT NULL,
  updated_at  BIGINT       NOT NULL,
  UNIQUE KEY uq_project_slug (studio_id, slug),
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_projects_studio ON projects(studio_id)
