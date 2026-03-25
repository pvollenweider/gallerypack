-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 6 — project_role_assignments
-- Per-project role grants for studio members.
-- Roles: manager | editor | contributor

CREATE TABLE IF NOT EXISTS project_role_assignments (
  id                 CHAR(36)    NOT NULL PRIMARY KEY,
  project_id         CHAR(36)    NOT NULL,
  user_id            CHAR(36)    NOT NULL,
  role               VARCHAR(50) NOT NULL,               -- manager | editor | contributor
  granted_by_user_id CHAR(36),
  created_at         BIGINT      NOT NULL,
  UNIQUE KEY uq_project_role (project_id, user_id),
  FOREIGN KEY (project_id)         REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)            REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_project_role_user ON project_role_assignments(user_id)
