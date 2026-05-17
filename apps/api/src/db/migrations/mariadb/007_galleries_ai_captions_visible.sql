-- 007_galleries_ai_captions_visible.sql
ALTER TABLE galleries ADD COLUMN ai_captions_visible TINYINT(1) NOT NULL DEFAULT 0;
