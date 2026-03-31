-- Migration 036: Complete studio → organization rename at DB layer
-- Ensures organization_id exists on all tables that have studio_id,
-- backfills organization_id = studio_id where NULL,
-- and creates indexes where needed.
--
-- Idempotent: uses IF NOT EXISTS / IGNORE patterns.
-- Does NOT drop studios table or studio_id columns yet (safety).

-- ── users ────────────────────────────────────────────────────────────────────
-- users.organization_id already exists in baseline; add if missing for safety
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE users SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- ── projects ─────────────────────────────────────────────────────────────────
-- already has organization_id in baseline
ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE projects SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

-- idx_projects_org already exists in baseline

-- ── galleries ────────────────────────────────────────────────────────────────
-- already has organization_id in baseline
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE galleries SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

-- idx_galleries_org already exists in baseline

-- ── build_jobs ───────────────────────────────────────────────────────────────
-- already has organization_id in baseline
ALTER TABLE build_jobs ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE build_jobs SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

-- idx_build_jobs_org already exists in baseline

-- ── settings ─────────────────────────────────────────────────────────────────
-- settings PK is studio_id; add organization_id as a mirror column
ALTER TABLE settings ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE settings SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_settings_org ON settings(organization_id);

-- ── email_log ────────────────────────────────────────────────────────────────
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE email_log SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_org ON email_log(organization_id);

-- ── audit_log ────────────────────────────────────────────────────────────────
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE audit_log SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id, created_at);

-- ── gallery_invites (legacy photographer upload invites) ─────────────────────
-- This table may or may not exist depending on install history
ALTER TABLE gallery_invites ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE gallery_invites SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_invites_org ON gallery_invites(organization_id);

-- ── invitations ──────────────────────────────────────────────────────────────
-- already has organization_id in baseline
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE invitations SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);

-- ── studio_memberships ───────────────────────────────────────────────────────
-- already has organization_id in baseline
ALTER TABLE studio_memberships ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE studio_memberships SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

-- idx_memberships_org already exists in baseline

-- ── studio_domains ───────────────────────────────────────────────────────────
-- already has organization_id in baseline
ALTER TABLE studio_domains ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36) NULL DEFAULT NULL AFTER studio_id;

UPDATE IGNORE studio_domains SET organization_id = studio_id WHERE organization_id IS NULL AND studio_id IS NOT NULL;

-- idx_domains_org already exists in baseline

-- ── invites (scoped invites table) ───────────────────────────────────────────
-- The invites table does not have studio_id / organization_id (it uses scope_type + scope_id).
-- No changes needed.
