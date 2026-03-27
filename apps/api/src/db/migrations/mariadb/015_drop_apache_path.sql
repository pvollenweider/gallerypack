-- Sprint: Platform Transition — drop Apache-specific column from settings
ALTER TABLE settings DROP COLUMN IF EXISTS apache_path;
