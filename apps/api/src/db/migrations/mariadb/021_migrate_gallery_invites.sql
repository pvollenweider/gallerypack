-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 021: migrate gallery_invites → gallery_upload_links (Sprint 10 #89)
-- gallery_invites (formerly 'invites') held photo upload tokens before migration 017.
-- This migration copies surviving records into the canonical gallery_upload_links table
-- so old tokens continue to work through the new unified upload endpoint.

-- Allow NULL creator for imported legacy records (original invites lacked a creator FK)
ALTER TABLE gallery_upload_links
  MODIFY COLUMN created_by_user_id VARCHAR(32) NULL;

-- Copy gallery_invites rows that are still active and have a gallery target.
-- Timestamps are stored as epoch-ms integers in gallery_invites; convert to DATETIME.
INSERT IGNORE INTO gallery_upload_links
  (id, gallery_id, token_hash, label, expires_at, revoked_at, created_by_user_id, created_at)
SELECT
  id,
  gallery_id,
  token_hash,
  LEFT(label, 255),                                              -- gallery_invites.label is VARCHAR(512)
  CASE WHEN expires_at IS NOT NULL THEN FROM_UNIXTIME(expires_at / 1000) ELSE NULL END,
  CASE WHEN revoked_at IS NOT NULL THEN FROM_UNIXTIME(revoked_at / 1000) ELSE NULL END,
  NULL,                                                          -- no creator available for legacy records
  FROM_UNIXTIME(created_at / 1000)
FROM gallery_invites
WHERE gallery_id IS NOT NULL;
