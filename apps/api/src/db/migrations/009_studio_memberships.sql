-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- GalleryPack — studio memberships
-- Migration: 009_studio_memberships

CREATE TABLE IF NOT EXISTS studio_memberships (
  id          TEXT NOT NULL PRIMARY KEY,
  studio_id   TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('owner','admin','editor','photographer')),
  created_at  INTEGER NOT NULL,
  UNIQUE(studio_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_memberships_studio ON studio_memberships(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_memberships_user ON studio_memberships(user_id);
