-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT NOT NULL PRIMARY KEY,
  studio_id   TEXT REFERENCES studios(id) ON DELETE SET NULL,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,  -- e.g. 'gallery.create', 'gallery.delete', 'photo.upload', 'member.invite'
  target_type TEXT,           -- e.g. 'gallery', 'user', 'invitation'
  target_id   TEXT,           -- the ID of the affected resource
  meta        TEXT,           -- JSON blob for extra context (e.g. { slug, email })
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_studio ON audit_log(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user   ON audit_log(user_id, created_at DESC);
