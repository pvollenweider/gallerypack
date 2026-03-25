-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

CREATE TABLE IF NOT EXISTS viewer_tokens (
  id          TEXT NOT NULL PRIMARY KEY,
  gallery_id  TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  label       TEXT,                   -- optional human label, e.g. "Share with client"
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,                -- NULL = never expires
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_viewer_tokens_token ON viewer_tokens(token);
CREATE INDEX IF NOT EXISTS idx_viewer_tokens_gallery ON viewer_tokens(gallery_id);
