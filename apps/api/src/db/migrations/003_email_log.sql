-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- 003_email_log.sql — transactional email log

CREATE TABLE IF NOT EXISTS email_log (
    id          TEXT PRIMARY KEY,
    studio_id   TEXT REFERENCES studios(id) ON DELETE SET NULL,
    to_address  TEXT NOT NULL,
    subject     TEXT NOT NULL,
    template    TEXT,                      -- invite | gallery-ready | access-resend
    status      TEXT NOT NULL DEFAULT 'sent', -- sent | failed
    error       TEXT,                      -- error message if failed
    sent_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_log_studio ON email_log(studio_id);
