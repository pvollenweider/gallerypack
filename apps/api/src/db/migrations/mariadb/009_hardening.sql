-- Migration 14: hardening — drop legacy tables and columns
-- Prerequisites: all previous migrations (001–008) must be applied.
-- This migration removes tables/columns that were kept during the multi-studio
-- migration for backward compatibility and are now dead code.

-- Drop legacy invite tables (replaced by unified invites table in migration 007)
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS gallery_invites;

-- Drop legacy gallery memberships table (replaced by gallery_role_assignments)
DROP TABLE IF EXISTS gallery_memberships;

-- Drop legacy viewer tokens backup table (replaced in migration 008)
DROP TABLE IF EXISTS viewer_tokens_legacy;

-- Drop redundant legacy columns from galleries
-- galleries.private: redundant with galleries.access ('public' vs other values)
ALTER TABLE galleries DROP COLUMN IF EXISTS private;

-- galleries.password: only password_hash should be stored (never raw password)
ALTER TABLE galleries DROP COLUMN IF EXISTS password;

-- ── Index additions for MariaDB query patterns ────────────────────────────────

-- Galleries: common filter by studio + project
ALTER TABLE galleries ADD INDEX IF NOT EXISTS idx_galleries_studio  (studio_id);
ALTER TABLE galleries ADD INDEX IF NOT EXISTS idx_galleries_project (project_id);

-- Studio memberships: user → studio lookup (used by getStudioRole on every request)
ALTER TABLE studio_memberships ADD INDEX IF NOT EXISTS idx_sm_user_studio (user_id, studio_id);

-- Project role assignments: user → project lookup
ALTER TABLE project_role_assignments ADD INDEX IF NOT EXISTS idx_pra_user_project (user_id, project_id);

-- Gallery role assignments: user → gallery lookup
ALTER TABLE gallery_role_assignments ADD INDEX IF NOT EXISTS idx_gra_user_gallery (user_id, gallery_id);

-- Audit log: lookups by target and by actor
ALTER TABLE audit_log ADD INDEX IF NOT EXISTS idx_audit_target (target_type, target_id);
ALTER TABLE audit_log ADD INDEX IF NOT EXISTS idx_audit_user   (user_id);
