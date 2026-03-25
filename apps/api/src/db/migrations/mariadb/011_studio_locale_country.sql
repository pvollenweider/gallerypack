-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

ALTER TABLE studios ADD COLUMN IF NOT EXISTS locale  VARCHAR(8)  DEFAULT NULL;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS country VARCHAR(8)  DEFAULT NULL;
