-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 8 — create default "Legacy Import" projects for existing galleries
-- One project per studio that has galleries without a project_id.
-- The INSERT ... SELECT with GROUP BY ensures one row per studio, not one per gallery.

INSERT INTO projects (id, studio_id, slug, name, description, visibility, status, created_at, updated_at)
SELECT UUID(), g.studio_id, 'legacy-import', 'Legacy Import',
       'Auto-created project for galleries migrated from the single-studio model.',
       'restricted', 'active',
       UNIX_TIMESTAMP() * 1000, UNIX_TIMESTAMP() * 1000
FROM galleries g
WHERE g.project_id IS NULL
GROUP BY g.studio_id;

-- Migration 9 — backfill galleries.project_id from the legacy-import project
UPDATE galleries g
JOIN projects p ON p.studio_id = g.studio_id AND p.slug = 'legacy-import'
SET g.project_id = p.id
WHERE g.project_id IS NULL;

-- Enforce NOT NULL now that every gallery has a project
ALTER TABLE galleries MODIFY COLUMN project_id CHAR(36) NOT NULL
