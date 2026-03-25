-- Migration 010: add platform_role to users for superadmin designation
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role VARCHAR(32) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_platform_role ON users(platform_role);
