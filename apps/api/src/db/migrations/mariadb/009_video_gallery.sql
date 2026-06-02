-- 009_video_gallery.sql
-- Add video gallery support: videos table, view events, access requests, and type enum for galleries

ALTER TABLE galleries ADD COLUMN type ENUM('photo','video') NOT NULL DEFAULT 'photo';

CREATE TABLE IF NOT EXISTS videos (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  gallery_id      CHAR(36)     NOT NULL,
  title           VARCHAR(255) NULL,
  slug            VARCHAR(100) NOT NULL,
  original_path   VARCHAR(500) NULL,
  hls_path        VARCHAR(500) NULL,
  transcode_mode  ENUM('auto','force_abr') NOT NULL DEFAULT 'auto',
  source_codec    VARCHAR(50)  NULL,
  status          ENUM('pending','transcoding','ready','error','cancelled') NOT NULL DEFAULT 'pending',
  error_message   TEXT         NULL,
  duration_sec    INT          NULL,
  sort_order      INT          NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_video_gallery_slug (gallery_id, slug),
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_view_events (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  video_id     CHAR(36)     NOT NULL,
  token_id     CHAR(36)     NULL,
  event_type   ENUM('play','pause','seek','heartbeat','ended') NOT NULL,
  position_sec INT          NOT NULL DEFAULT 0,
  ua_hash      CHAR(16)     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vve_video (video_id),
  INDEX idx_vve_token (token_id),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS access_requests (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  gallery_id    CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  token_id      CHAR(36)     NULL,
  status        ENUM('pending','confirmed','revoked') NOT NULL DEFAULT 'pending',
  confirm_token CHAR(64)     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at  DATETIME     NULL,
  INDEX idx_ar_gallery (gallery_id),
  INDEX idx_ar_confirm (confirm_token),
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
