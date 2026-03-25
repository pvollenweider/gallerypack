-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 023: user notification preferences (Sprint 13 #104)
-- Two opt-out columns on users so studio members can silence specific notifications.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_on_upload  TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Email when a photographer uploads photos to the inbox',
  ADD COLUMN IF NOT EXISTS notify_on_publish TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Email when a gallery is published with new photos';
