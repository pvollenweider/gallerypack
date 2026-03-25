-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 004: add site_title to settings
ALTER TABLE settings ADD COLUMN site_title TEXT;
