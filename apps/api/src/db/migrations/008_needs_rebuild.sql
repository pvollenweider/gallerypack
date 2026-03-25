-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

ALTER TABLE galleries ADD COLUMN needs_rebuild INTEGER NOT NULL DEFAULT 0;
