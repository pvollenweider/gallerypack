-- 011_video_creator_modes.sql
ALTER TABLE videos MODIFY COLUMN transcode_mode 
  ENUM('auto','force_abr','creator_1080p','creator_720p') NOT NULL DEFAULT 'auto';
