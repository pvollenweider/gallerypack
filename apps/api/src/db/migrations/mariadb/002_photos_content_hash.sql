-- 002_photos_content_hash.sql
-- Add content_hash column to photos for content-based deduplication.
-- Replaces the name-only dedup (UNIQUE KEY uq_photos_gallery_original_name stays for display).
-- NULL for photos uploaded before this migration (backfill not required).

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS content_hash CHAR(64) NULL AFTER original_name;

SET @_i = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'photos' AND INDEX_NAME = 'idx_photos_content_hash');
SET @_sql = IF(@_i = 0, 'CREATE INDEX idx_photos_content_hash ON photos (gallery_id, content_hash)', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;
