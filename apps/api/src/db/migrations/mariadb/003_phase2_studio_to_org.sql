-- 003_phase2_studio_to_org.sql
-- Phase 2: complete the studio → organization rename in the database.
--
-- What this migration does:
--   1. Add storage quota columns to organizations (migrated from studios)
--   2. Backfill organization_id from studio_id wherever NULL (safety net for pre-Sprint 22 rows)
--   3. Rename studio_memberships → organization_memberships
--   4. Rename studio_domains     → organization_domains
--   5. Fix settings table: swap PK from studio_id to organization_id
--   6. Drop studio_id columns from all tables
--   7. Drop studios table
--
-- Prerequisites: organization_id columns already exist and are populated (dual-write since Sprint 22).
-- Safe to run on both upgraded databases (with old schema) and fresh installs (001 baseline already
-- has the final schema). All steps use PREPARE/EXECUTE guards keyed on information_schema checks.

-- ── 1. Add storage columns to organizations ───────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NULL     COMMENT 'NULL = unlimited',
  ADD COLUMN IF NOT EXISTS storage_used_bytes  BIGINT NOT NULL DEFAULT 0 COMMENT 'current usage in bytes';

-- Copy quota/usage from studios where IDs match (only if studios still exists)
SET @_t1 = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studios');
SET @_sql = IF(@_t1 > 0, 'UPDATE organizations o JOIN studios s ON s.id = o.id SET o.storage_quota_bytes = s.storage_quota_bytes, o.storage_used_bytes = s.storage_used_bytes WHERE s.storage_quota_bytes IS NOT NULL OR s.storage_used_bytes > 0', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- ── 2. Backfill organization_id from studio_id (safety net) ──────────────────
-- Each UPDATE is guarded by a check that the studio_id column still exists on that table.

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE users SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE projects SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'galleries' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE galleries SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'build_jobs' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE build_jobs SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invitations' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE invitations SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_log' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE email_log SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_log' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE audit_log SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE settings SET organization_id = studio_id WHERE organization_id IS NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_memberships' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE studio_memberships SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_domains' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'UPDATE studio_domains SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- ── 3. Rename studio_memberships → organization_memberships ───────────────────

SET @_t = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_memberships');
SET @_sql = IF(@_t > 0, 'RENAME TABLE studio_memberships TO organization_memberships', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- ── 4. Rename studio_domains → organization_domains ──────────────────────────

SET @_t = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'studio_domains');
SET @_sql = IF(@_t > 0, 'RENAME TABLE studio_domains TO organization_domains', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

-- ── 5. Fix settings table: studio_id is PK — swap to organization_id ─────────
-- Only runs when studio_id column still exists on the settings table.
-- First, drop any FK constraint on studio_id to allow column removal.

SET @_fk = (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME != 'fk_settings_org'
  LIMIT 1
);
SET @_sql = IF(@_fk IS NOT NULL, CONCAT('ALTER TABLE settings DROP FOREIGN KEY `', @_fk, '`'), 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'ALTER TABLE settings MODIFY organization_id VARCHAR(36) NOT NULL', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET FOREIGN_KEY_CHECKS = 0;

SET @_c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'studio_id');
SET @_sql = IF(@_c > 0, 'ALTER TABLE settings DROP PRIMARY KEY, ADD PRIMARY KEY (organization_id), ADD CONSTRAINT fk_settings_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE, DROP COLUMN studio_id', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET FOREIGN_KEY_CHECKS = 1;

-- ── 6. Drop studio_id columns from remaining tables ───────────────────────────

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE users                     DROP COLUMN IF EXISTS studio_id;
ALTER TABLE projects                  DROP COLUMN IF EXISTS studio_id;
ALTER TABLE galleries                 DROP COLUMN IF EXISTS studio_id;
ALTER TABLE build_jobs                DROP COLUMN IF EXISTS studio_id;
ALTER TABLE invitations               DROP COLUMN IF EXISTS studio_id;
ALTER TABLE email_log                 DROP COLUMN IF EXISTS studio_id;
ALTER TABLE audit_log                 DROP COLUMN IF EXISTS studio_id;
ALTER TABLE organization_memberships  DROP COLUMN IF EXISTS studio_id;
ALTER TABLE organization_domains      DROP COLUMN IF EXISTS studio_id;

SET @_t = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gallery_invites');
SET @_sql = IF(@_t > 0, 'ALTER TABLE gallery_invites DROP COLUMN IF EXISTS studio_id', 'SELECT 1');
PREPARE _s FROM @_sql;
EXECUTE _s;
DEALLOCATE PREPARE _s;

SET FOREIGN_KEY_CHECKS = 1;

-- ── 7. Drop studios table ─────────────────────────────────────────────────────

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS studios;
SET FOREIGN_KEY_CHECKS = 1;
