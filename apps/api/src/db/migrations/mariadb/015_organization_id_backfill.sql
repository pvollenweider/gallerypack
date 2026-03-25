-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 015: Backfill organization_id from studio_id
-- Safe because organizations.id = studios.id (same IDs, see 013).

UPDATE projects           SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE galleries          SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE users              SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE studio_memberships SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE studio_domains     SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE invitations        SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE build_jobs         SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
UPDATE email_log          SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

-- invites.organization_id: derive from scope_type/scope_id where scope_type = 'studio'
UPDATE invites SET organization_id = scope_id WHERE organization_id IS NULL AND scope_type = 'studio';

-- settings uses studio_id as PK — set organization_id = studio_id
UPDATE settings SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;
