-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT NOT NULL PRIMARY KEY,
  studio_id   TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('owner','admin','editor','photographer')),
  token       TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,  -- Unix ms
  accepted_at INTEGER,           -- NULL = pending
  UNIQUE(studio_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_studio ON invitations(studio_id);
