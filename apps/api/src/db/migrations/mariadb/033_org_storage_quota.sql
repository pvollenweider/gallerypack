-- Migration 033: per-studio storage quota
-- storage_quota_bytes NULL = unlimited
-- storage_used_bytes   tracks current usage (updated on upload + delete)
ALTER TABLE studios
  ADD COLUMN storage_quota_bytes BIGINT NULL     COMMENT 'NULL = unlimited',
  ADD COLUMN storage_used_bytes  BIGINT NOT NULL DEFAULT 0 COMMENT 'current usage in bytes';
