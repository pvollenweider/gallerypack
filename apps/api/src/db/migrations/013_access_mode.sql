-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Backfill access column from private flag where access is NULL
UPDATE galleries SET access = 'private' WHERE access IS NULL AND private = 1;
UPDATE galleries SET access = 'public'  WHERE access IS NULL AND private = 0;
UPDATE galleries SET access = 'public'  WHERE access IS NULL;

-- Note: private column kept for backward compat but access is canonical
