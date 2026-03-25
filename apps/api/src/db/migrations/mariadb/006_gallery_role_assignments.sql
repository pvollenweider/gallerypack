-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 10 — gallery_role_assignments (new canonical table)
-- Replaces gallery_memberships. gallery_memberships is kept until Sprint 9 clean-up (#78).
-- Roles: editor | contributor | viewer

CREATE TABLE IF NOT EXISTS gallery_role_assignments (
  id                 CHAR(36)    NOT NULL PRIMARY KEY,
  gallery_id         CHAR(36)    NOT NULL,
  user_id            CHAR(36)    NOT NULL,
  role               VARCHAR(50) NOT NULL,               -- editor | contributor | viewer
  granted_by_user_id CHAR(36),
  created_at         BIGINT      NOT NULL,
  UNIQUE KEY uq_gallery_role (gallery_id, user_id),
  FOREIGN KEY (gallery_id)         REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)            REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_gallery_role_user ON gallery_role_assignments(user_id);

-- Backfill: copy existing gallery_memberships into gallery_role_assignments
INSERT IGNORE INTO gallery_role_assignments (id, gallery_id, user_id, role, granted_by_user_id, created_at)
SELECT UUID(), gallery_id, user_id, role, NULL, created_at
FROM gallery_memberships
