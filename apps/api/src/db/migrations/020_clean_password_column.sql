-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- 020_clean_password_column.sql
-- Erase any residual plain-text passwords from the galleries.password column.
-- Context: before this fix, POST /galleries stored plain-text passwords in the
-- `password` column. The canonical field is `password_hash` (hashed via scrypt).
-- Any row that already has a password_hash doesn't need the plain column.
-- Rows with a plain-text password and no hash are irrecoverable at this point —
-- the gallery owner will need to reset the password via PATCH /galleries/:id.
--
-- After this migration the `password` column is always NULL.
-- The column is kept for now to avoid a breaking schema change; it will be dropped
-- in a future migration once all consumers have been updated.

UPDATE galleries SET password = NULL WHERE password IS NOT NULL;
