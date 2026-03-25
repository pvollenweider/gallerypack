-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 005: default gallery settings
ALTER TABLE settings ADD COLUMN default_author TEXT;
ALTER TABLE settings ADD COLUMN default_author_email TEXT;
ALTER TABLE settings ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE settings ADD COLUMN default_access TEXT NOT NULL DEFAULT 'public';
ALTER TABLE settings ADD COLUMN default_allow_download_image INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN default_allow_download_gallery INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN default_private INTEGER NOT NULL DEFAULT 0;
