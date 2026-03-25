-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 014: Add organization_id columns to all child tables
-- Columns are nullable initially — backfill happens in 015.
-- studio_id columns are retained (Sprint 22 transitional phase).

ALTER TABLE projects          ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE galleries         ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE users             ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE studio_memberships ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE studio_domains    ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE invites            ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL;
ALTER TABLE invitations        ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE build_jobs         ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
ALTER TABLE settings           ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL;
ALTER TABLE email_log          ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL AFTER studio_id;
