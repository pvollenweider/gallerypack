-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Additional indexes for performance with large datasets
CREATE INDEX IF NOT EXISTS idx_galleries_studio_status  ON galleries(studio_id, build_status);
CREATE INDEX IF NOT EXISTS idx_galleries_studio_private ON galleries(studio_id, private);
CREATE INDEX IF NOT EXISTS idx_galleries_studio_access  ON galleries(studio_id, access);
CREATE INDEX IF NOT EXISTS idx_galleries_studio_updated ON galleries(studio_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_jobs_studio              ON build_jobs(studio_id);
CREATE INDEX IF NOT EXISTS idx_jobs_studio_status       ON build_jobs(studio_id, status);
CREATE INDEX IF NOT EXISTS idx_invites_single_use       ON invites(studio_id, used_at, revoked_at);
