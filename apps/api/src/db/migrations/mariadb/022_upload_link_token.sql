-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 022: add raw token column to gallery_upload_links (Sprint 10 #91 QR code)
-- Upload links are shared URLs — storing the raw token allows reconstructing the
-- upload URL on-demand (e.g. for QR code display) without requiring it at creation time.
-- Pre-existing rows keep token = NULL; new links always populate the column.

ALTER TABLE gallery_upload_links
  ADD COLUMN IF NOT EXISTS token VARCHAR(64) NULL AFTER token_hash;

CREATE INDEX IF NOT EXISTS idx_upload_links_token ON gallery_upload_links(token);
