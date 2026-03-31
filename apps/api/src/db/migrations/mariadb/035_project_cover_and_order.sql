-- 035_project_cover_and_order.sql
-- Manual ordering and cover gallery per project; cover project per org
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_gallery_id VARCHAR(22) DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cover_project_id VARCHAR(22) DEFAULT NULL;
