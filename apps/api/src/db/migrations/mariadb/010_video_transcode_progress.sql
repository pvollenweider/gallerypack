-- 010_video_transcode_progress.sql
ALTER TABLE videos ADD COLUMN transcode_progress FLOAT NOT NULL DEFAULT 0;
ALTER TABLE videos ADD COLUMN transcode_eta_sec INT NULL DEFAULT NULL;
