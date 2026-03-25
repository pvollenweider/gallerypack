-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- GalleryPack — gallery memberships
-- Grants a user explicit access to a specific gallery
-- Roles: viewer (read-only), contributor (can upload), editor (can edit metadata)

CREATE TABLE IF NOT EXISTS gallery_memberships (
  id          TEXT NOT NULL PRIMARY KEY,
  gallery_id  TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer','contributor','editor')),
  created_at  INTEGER NOT NULL,
  UNIQUE(gallery_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_memberships_gallery ON gallery_memberships(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_memberships_user ON gallery_memberships(user_id);
