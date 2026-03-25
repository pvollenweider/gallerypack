-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 019: Inspector — gallery.active flag + audit log

-- ── galleries.active ──────────────────────────────────────────────────────────
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1
  AFTER workflow_status;

-- ── inspector_audit_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspector_audit_log (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  actor_id     VARCHAR(32)  NOT NULL,
  action       VARCHAR(64)  NOT NULL,
  target_type  VARCHAR(32)  NOT NULL,
  target_id    VARCHAR(64)  NOT NULL,
  before_state JSON         NULL,
  after_state  JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ial_target (target_type, target_id),
  INDEX idx_ial_actor  (actor_id),
  INDEX idx_ial_created (created_at)
);
