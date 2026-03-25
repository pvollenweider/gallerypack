-- GalleryPack — MariaDB baseline schema
-- Consolidates all 21 SQLite migrations (001–021) into one clean MariaDB-compatible file.
-- Applied to fresh installs only. Existing SQLite data must be migrated separately.

-- ── Studios (tenants) ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS studios (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(128) NOT NULL UNIQUE,
  plan        VARCHAR(32)  NOT NULL DEFAULT 'free',   -- free | pro | agency
  is_default  TINYINT(1)   NOT NULL DEFAULT 0,        -- single-tenant fallback flag
  created_at  BIGINT       NOT NULL,
  updated_at  BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Studio domains (multi-tenant routing) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_domains (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  studio_id   VARCHAR(32)  NOT NULL,
  domain      VARCHAR(255) NOT NULL UNIQUE,          -- e.g. "photos.example.com"
  is_primary  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  BIGINT       NOT NULL,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_studio_domains_studio ON studio_domains(studio_id);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(32)  NOT NULL PRIMARY KEY,
  studio_id     VARCHAR(32),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,                                -- $scrypt$… ; NULL for OAuth users
  role          VARCHAR(32)  NOT NULL DEFAULT 'photographer',  -- owner | admin | collaborator | photographer
  name          VARCHAR(255),
  locale        VARCHAR(16),                         -- user's preferred locale, e.g. 'fr', 'en'
  created_at    BIGINT       NOT NULL,
  updated_at    BIGINT       NOT NULL,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_studio ON users(studio_id);
CREATE INDEX idx_users_email  ON users(email);

-- ── Sessions ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,     -- genToken(32) = 64 hex chars
  user_id     VARCHAR(32)  NOT NULL,
  expires_at  BIGINT       NOT NULL,
  created_at  BIGINT       NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ── Galleries ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS galleries (
  id                     VARCHAR(32)  NOT NULL PRIMARY KEY,
  studio_id              VARCHAR(32)  NOT NULL,
  slug                   VARCHAR(255) NOT NULL,
  title                  VARCHAR(512),
  subtitle               VARCHAR(512),
  author                 VARCHAR(255),
  author_email           VARCHAR(255),
  date                   VARCHAR(32),               -- ISO date string
  location               VARCHAR(512),
  locale                 VARCHAR(16)  NOT NULL DEFAULT 'en',
  access                 VARCHAR(32)  NOT NULL DEFAULT 'public',  -- public | private | password | link
  password               TEXT,                      -- deprecated, always NULL after migration 020
  password_hash          TEXT,                      -- scrypt hash for password-protected galleries
  private                TINYINT(1)   NOT NULL DEFAULT 0,  -- derived from access, kept for compat
  standalone             TINYINT(1)   NOT NULL DEFAULT 0,
  allow_download_image   TINYINT(1)   NOT NULL DEFAULT 1,
  allow_download_gallery TINYINT(1)   NOT NULL DEFAULT 1,
  cover_photo            VARCHAR(512),
  slideshow_interval     INT,
  copyright              VARCHAR(512),
  description            TEXT,
  config_json            MEDIUMTEXT,                -- full gallery.config.json as JSON
  build_status           VARCHAR(32)  NOT NULL DEFAULT 'pending',  -- pending | building | done | error
  needs_rebuild          TINYINT(1)   NOT NULL DEFAULT 0,
  photo_order            MEDIUMTEXT,                -- JSON array of filenames; NULL = alphabetical
  built_at               BIGINT,
  created_at             BIGINT       NOT NULL,
  updated_at             BIGINT       NOT NULL,
  UNIQUE (studio_id, slug),
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_galleries_studio        ON galleries(studio_id);
CREATE INDEX idx_galleries_slug          ON galleries(slug);
CREATE INDEX idx_galleries_studio_status ON galleries(studio_id, build_status);
CREATE INDEX idx_galleries_studio_access ON galleries(studio_id, access);
CREATE INDEX idx_galleries_studio_updated ON galleries(studio_id, updated_at);

-- ── Gallery ↔ Photographer link ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gallery_photographers (
  gallery_id     VARCHAR(32) NOT NULL,
  user_id        VARCHAR(32) NOT NULL,
  can_upload     TINYINT(1)  NOT NULL DEFAULT 1,
  can_view_stats TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (gallery_id, user_id),
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Invites (photographer upload links) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS invites (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  studio_id   VARCHAR(32)  NOT NULL,
  gallery_id  VARCHAR(32),
  token       VARCHAR(64)  NOT NULL UNIQUE,          -- SHA-256 hex of raw token (post-migration 019)
  token_hash  VARCHAR(64)  NOT NULL UNIQUE,          -- canonical lookup column
  email       VARCHAR(255),
  label       VARCHAR(512),
  single_use  TINYINT(1)   NOT NULL DEFAULT 0,
  used_at     BIGINT,
  revoked_at  BIGINT,
  expires_at  BIGINT,
  created_at  BIGINT       NOT NULL,
  FOREIGN KEY (studio_id)  REFERENCES studios(id)   ON DELETE CASCADE,
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invites_studio    ON invites(studio_id);
CREATE INDEX idx_invites_gallery   ON invites(gallery_id);
CREATE INDEX idx_invites_token_hash ON invites(token_hash);

-- ── Build jobs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS build_jobs (
  id           VARCHAR(32)  NOT NULL PRIMARY KEY,
  gallery_id   VARCHAR(32)  NOT NULL,
  studio_id    VARCHAR(32)  NOT NULL,
  status       VARCHAR(32)  NOT NULL DEFAULT 'queued',  -- queued | running | done | error
  triggered_by VARCHAR(255),                            -- user_id or 'system' or 'upload'
  `force`      TINYINT(1)   NOT NULL DEFAULT 0,
  started_at   BIGINT,
  finished_at  BIGINT,
  error_msg    TEXT,
  created_at   BIGINT       NOT NULL,
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id)  REFERENCES studios(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_jobs_gallery      ON build_jobs(gallery_id);
CREATE INDEX idx_jobs_status       ON build_jobs(status);
CREATE INDEX idx_jobs_studio       ON build_jobs(studio_id);
CREATE INDEX idx_jobs_studio_status ON build_jobs(studio_id, status);

-- ── Build events (streaming log) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS build_events (
  id         BIGINT       NOT NULL PRIMARY KEY AUTO_INCREMENT,
  job_id     VARCHAR(32)  NOT NULL,
  seq        INT          NOT NULL,
  type       VARCHAR(32)  NOT NULL DEFAULT 'log',     -- log | progress | done | error
  data       TEXT         NOT NULL,
  created_at BIGINT       NOT NULL,
  FOREIGN KEY (job_id) REFERENCES build_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_events_job ON build_events(job_id, seq);

-- ── App settings (per studio) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  studio_id                     VARCHAR(32)  NOT NULL PRIMARY KEY,
  smtp_host                     VARCHAR(255),
  smtp_port                     INT,
  smtp_user                     VARCHAR(255),
  smtp_pass                     TEXT,
  smtp_from                     VARCHAR(255),
  smtp_secure                   TINYINT(1)   NOT NULL DEFAULT 0,
  apache_path                   TEXT,
  base_url                      TEXT,
  site_title                    VARCHAR(512),
  default_author                VARCHAR(255),
  default_author_email          VARCHAR(255),
  default_locale                VARCHAR(16)  NOT NULL DEFAULT 'fr',
  default_access                VARCHAR(32)  NOT NULL DEFAULT 'public',
  default_allow_download_image  TINYINT(1)   NOT NULL DEFAULT 1,
  default_allow_download_gallery TINYINT(1)  NOT NULL DEFAULT 0,
  default_private               TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at                    BIGINT       NOT NULL,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Email log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_log (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  studio_id  VARCHAR(32),
  to_address VARCHAR(255) NOT NULL,
  subject    VARCHAR(512) NOT NULL,
  template   VARCHAR(64),                            -- invite | gallery-ready | access-resend
  status     VARCHAR(32)  NOT NULL DEFAULT 'sent',   -- sent | failed
  error      TEXT,
  sent_at    BIGINT       NOT NULL,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_email_log_studio ON email_log(studio_id);

-- ── Studio memberships ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_memberships (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  studio_id  VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  role       VARCHAR(32) NOT NULL DEFAULT 'collaborator',  -- owner | admin | collaborator | photographer
  created_at BIGINT      NOT NULL,
  UNIQUE (studio_id, user_id),
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_studio_memberships_studio ON studio_memberships(studio_id);
CREATE INDEX idx_studio_memberships_user   ON studio_memberships(user_id);

-- ── Gallery memberships ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gallery_memberships (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  gallery_id VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32) NOT NULL,
  role       VARCHAR(32) NOT NULL DEFAULT 'viewer',  -- viewer | contributor | editor
  created_at BIGINT      NOT NULL,
  UNIQUE (gallery_id, user_id),
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_gallery_memberships_gallery ON gallery_memberships(gallery_id);
CREATE INDEX idx_gallery_memberships_user    ON gallery_memberships(user_id);

-- ── Invitations (studio user invitations) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS invitations (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,    -- UUID
  studio_id    VARCHAR(32)  NOT NULL,
  email        VARCHAR(255) NOT NULL,
  role         VARCHAR(32)  NOT NULL DEFAULT 'photographer',  -- owner | admin | collaborator | photographer
  token        VARCHAR(64)  NOT NULL UNIQUE,          -- SHA-256 hex (post-migration 019)
  token_hash   VARCHAR(64)  NOT NULL UNIQUE,          -- canonical lookup column
  created_by   VARCHAR(36)  NOT NULL,
  created_at   BIGINT       NOT NULL,
  expires_at   BIGINT       NOT NULL,
  accepted_at  BIGINT,
  gallery_id   VARCHAR(32),
  gallery_role VARCHAR(32),
  UNIQUE (studio_id, email),
  FOREIGN KEY (studio_id)  REFERENCES studios(id)   ON DELETE CASCADE,
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);
CREATE INDEX idx_invitations_studio     ON invitations(studio_id);

-- ── Viewer tokens (share links) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS viewer_tokens (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,    -- UUID
  gallery_id   VARCHAR(32)  NOT NULL,
  token        VARCHAR(64)  NOT NULL UNIQUE,          -- SHA-256 hex (post-migration 019)
  token_hash   VARCHAR(64)  NOT NULL UNIQUE,          -- canonical lookup column
  label        VARCHAR(512),
  created_by   VARCHAR(36)  NOT NULL,
  created_at   BIGINT       NOT NULL,
  expires_at   BIGINT,
  last_used_at BIGINT,
  FOREIGN KEY (gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_viewer_tokens_token_hash ON viewer_tokens(token_hash);
CREATE INDEX idx_viewer_tokens_gallery    ON viewer_tokens(gallery_id);

-- ── Audit log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          VARCHAR(36)  NOT NULL PRIMARY KEY,     -- UUID
  studio_id   VARCHAR(32),
  user_id     VARCHAR(32),
  action      VARCHAR(128) NOT NULL,                  -- e.g. 'gallery.create', 'photo.upload'
  target_type VARCHAR(64),                            -- e.g. 'gallery', 'user', 'invitation'
  target_id   VARCHAR(36),
  meta        TEXT,                                   -- JSON blob
  created_at  BIGINT       NOT NULL,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_log_studio ON audit_log(studio_id, created_at);
CREATE INDEX idx_audit_log_user   ON audit_log(user_id, created_at);

-- ── Password reset tokens ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,      -- UUID
  user_id    VARCHAR(32)  NOT NULL,
  token      VARCHAR(64)  NOT NULL UNIQUE,            -- SHA-256 hex
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  created_at BIGINT       NOT NULL,
  expires_at BIGINT       NOT NULL,
  used_at    BIGINT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);

-- ── Magic links (passwordless login) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS magic_links (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,      -- UUID
  user_id    VARCHAR(32)  NOT NULL,
  token      VARCHAR(64)  NOT NULL UNIQUE,            -- SHA-256 hex
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  created_at BIGINT       NOT NULL,
  expires_at BIGINT       NOT NULL,
  used_at    BIGINT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
