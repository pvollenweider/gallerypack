-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 013: Introduce organizations table
-- Strategy: organizations is the new canonical model. studios becomes a UX alias.
-- Both tables coexist during the transitional phase (Sprint 22).
-- studio_id columns are NOT removed here — that happens in Sprint 23.

-- ── 1. organizations table (mirrors studios exactly) ──────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          VARCHAR(36)   NOT NULL PRIMARY KEY,
  slug        VARCHAR(128)  NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  locale      VARCHAR(10)   NULL,
  country     VARCHAR(4)    NULL,
  is_default  TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_slug (slug)
);

-- ── 2. Copy all studios into organizations (same IDs) ─────────────────────────
-- Using the same ID means studio_id values in child tables already equal
-- the correct organization_id — backfill in 014 is a direct assignment.
INSERT INTO organizations (id, slug, name, locale, country, is_default, created_at, updated_at)
SELECT
  id,
  slug,
  name,
  locale,
  country,
  COALESCE(is_default, 0),
  CASE WHEN created_at IS NULL THEN NOW() ELSE FROM_UNIXTIME(created_at / 1000) END,
  CASE WHEN updated_at IS NULL THEN NOW() ELSE FROM_UNIXTIME(updated_at / 1000) END
FROM studios
ON DUPLICATE KEY UPDATE
  slug       = VALUES(slug),
  name       = VALUES(name),
  locale     = VALUES(locale),
  country    = VALUES(country),
  is_default = VALUES(is_default);
