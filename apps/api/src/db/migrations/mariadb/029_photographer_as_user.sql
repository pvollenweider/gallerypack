-- Migration 029: Photographer-as-user refactor
--
-- photos.photographer_id and galleries.primary_photographer_id now reference
-- users.id instead of photographers.id. A new is_photographer boolean on users
-- controls which members appear in attribution dropdowns.

-- ── 1. Clear stale photographer references ────────────────────────────────────
UPDATE photos    SET photographer_id         = NULL WHERE photographer_id         IS NOT NULL;
UPDATE galleries SET primary_photographer_id = NULL WHERE primary_photographer_id IS NOT NULL;

-- ── 2. Drop the auto-named FK on photos.photographer_id then rewire ───────────
-- The baseline CREATE TABLE defines 4 unnamed FKs; photographer_id is the 3rd.
-- MariaDB auto-names it photos_ibfk_3 on fresh installs.
ALTER TABLE photos DROP FOREIGN KEY IF EXISTS photos_ibfk_3;

ALTER TABLE photos DROP COLUMN photographer_id;
ALTER TABLE photos ADD COLUMN photographer_id VARCHAR(32) NULL DEFAULT NULL AFTER upload_link_id;

-- ── 3. Drop named FK on galleries.primary_photographer_id (migration 028) ──────
ALTER TABLE galleries DROP FOREIGN KEY IF EXISTS fk_galleries_primary_photographer;
ALTER TABLE galleries DROP FOREIGN KEY IF EXISTS fk_galleries_primary_photographer_user;
ALTER TABLE galleries MODIFY COLUMN primary_photographer_id VARCHAR(32) NULL DEFAULT NULL;

-- ── 4. Add is_photographer flag on users ──────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_photographer TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_on_upload;

-- ── 5. Add new FK constraints pointing to users ───────────────────────────────
ALTER TABLE photos
  ADD CONSTRAINT fk_photos_photographer_user
    FOREIGN KEY (photographer_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE galleries
  ADD CONSTRAINT fk_galleries_primary_photographer_user
    FOREIGN KEY (primary_photographer_id) REFERENCES users(id) ON DELETE SET NULL;
