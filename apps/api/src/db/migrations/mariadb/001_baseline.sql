-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- GalleryPack — MariaDB baseline schema (consolidated, fresh-install only)
-- Represents the fully-evolved schema after all incremental migrations.
-- Applied once on first boot; the migration runner records it and stops.

-- ── Organizations (canonical tenant model) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id               VARCHAR(36)  NOT NULL PRIMARY KEY,
  slug             VARCHAR(128) NOT NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT         NULL,
  locale           VARCHAR(10)  NULL,
  country          VARCHAR(4)   NULL,
  is_default       TINYINT(1)   NOT NULL DEFAULT 0,
  storage_quota_bytes BIGINT NULL     COMMENT 'NULL = unlimited',
  storage_used_bytes  BIGINT NOT NULL DEFAULT 0 COMMENT 'current usage in bytes',
  cover_project_id VARCHAR(22)  DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Organization domains (multi-tenant routing) ──────────────────────────────

CREATE TABLE IF NOT EXISTS organization_domains (
  id              VARCHAR(32)  NOT NULL PRIMARY KEY,
  organization_id VARCHAR(36)  NOT NULL,
  domain          VARCHAR(255) NOT NULL UNIQUE,
  is_primary      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      BIGINT       NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_domains_org ON organization_domains(organization_id);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                VARCHAR(32)  NOT NULL PRIMARY KEY,
  organization_id   VARCHAR(36)  NULL DEFAULT NULL,
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     TEXT,
  role              VARCHAR(32)  NOT NULL DEFAULT 'photographer',
  name              VARCHAR(255),
  bio               TEXT         NULL DEFAULT NULL,
  locale            VARCHAR(16),
  platform_role     VARCHAR(32)  DEFAULT NULL,
  notify_on_upload  TINYINT(1)   NOT NULL DEFAULT 1,
  is_photographer   TINYINT(1)   NOT NULL DEFAULT 0,
  notify_on_publish TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        BIGINT       NOT NULL,
  updated_at        BIGINT       NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_org           ON users(organization_id);
CREATE INDEX idx_users_email         ON users(email);
CREATE INDEX idx_users_platform_role ON users(platform_role);

-- ── Sessions ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(32)  NOT NULL,
  expires_at  BIGINT       NOT NULL,
  created_at  BIGINT       NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ── Projects ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  organization_id   VARCHAR(36)  NOT NULL,
  slug              VARCHAR(100) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  visibility        VARCHAR(20)  NOT NULL DEFAULT 'restricted',
  starts_at         BIGINT,
  ends_at           BIGINT,
  status            VARCHAR(20)  NOT NULL DEFAULT 'active',
  standalone_default TINYINT(1)  NOT NULL DEFAULT 0,
  sort_order        INT          NOT NULL DEFAULT 0,
  cover_gallery_id  VARCHAR(22)  DEFAULT NULL,
  created_at        BIGINT       NOT NULL,
  updated_at        BIGINT       NOT NULL,
  UNIQUE KEY uq_project_slug (organization_id, slug),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_projects_org ON projects(organization_id);

-- ── Project role assignments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_role_assignments (
  id                 CHAR(36)    NOT NULL PRIMARY KEY,
  project_id         CHAR(36)    NOT NULL,
  user_id            CHAR(36)    NOT NULL,
  role               VARCHAR(50) NOT NULL,
  granted_by_user_id CHAR(36),
  created_at         BIGINT      NOT NULL,
  UNIQUE KEY uq_project_role (project_id, user_id),
  FOREIGN KEY (project_id)         REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)            REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_project_role_user ON project_role_assignments(user_id);
CREATE INDEX idx_pra_user_project  ON project_role_assignments(user_id, project_id);

-- ── Galleries ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS galleries (
  id                        VARCHAR(32)  NOT NULL PRIMARY KEY,
  organization_id           VARCHAR(36)  NOT NULL,
  project_id                CHAR(36)     NOT NULL,
  slug                      VARCHAR(255) NOT NULL,
  title                     VARCHAR(512),
  subtitle                  VARCHAR(512),
  author                    VARCHAR(255),
  author_email              VARCHAR(255),
  primary_photographer_id   VARCHAR(32)  NULL DEFAULT NULL,
  date                      VARCHAR(32),
  location                  VARCHAR(512),
  locale                    VARCHAR(16)  NOT NULL DEFAULT 'en',
  access                    VARCHAR(32)  NOT NULL DEFAULT 'public',
  visibility                VARCHAR(20)  NOT NULL DEFAULT 'restricted',
  password_hash             TEXT,
  standalone                TINYINT(1)   NOT NULL DEFAULT 0,
  allow_download_image      TINYINT(1)   NOT NULL DEFAULT 1,
  allow_download_gallery    TINYINT(1)   NOT NULL DEFAULT 1,
  allow_download_original   TINYINT(1)   NOT NULL DEFAULT 0,
  download_mode             ENUM('none','display','original') NOT NULL DEFAULT 'display',
  apache_protection         TINYINT(1)   NOT NULL DEFAULT 0,
  cover_photo               VARCHAR(512),
  slideshow_interval        INT,
  copyright                 VARCHAR(512),
  description               TEXT,
  description_md            TEXT         NULL DEFAULT NULL,
  config_json               MEDIUMTEXT,
  build_status              VARCHAR(32)  NOT NULL DEFAULT 'pending',
  workflow_status            ENUM('draft','ready','published') NOT NULL DEFAULT 'draft',
  active                    TINYINT(1)   NOT NULL DEFAULT 1,
  needs_rebuild             TINYINT(1)   NOT NULL DEFAULT 0,
  photo_order               MEDIUMTEXT,
  dist_name                 VARCHAR(255) NULL DEFAULT NULL COMMENT 'Actual dist directory name used in the last successful build (hash for password galleries)',
  sort_order                INT          NOT NULL DEFAULT 0,
  built_at                  BIGINT,
  created_at                BIGINT       NOT NULL,
  updated_at                BIGINT       NOT NULL,
  UNIQUE (organization_id, slug),
  FOREIGN KEY (organization_id)            REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id)                 REFERENCES projects(id)      ON DELETE RESTRICT,
  CONSTRAINT fk_galleries_primary_photographer_user
    FOREIGN KEY (primary_photographer_id)  REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_galleries_org             ON galleries(organization_id);
CREATE INDEX idx_galleries_project         ON galleries(project_id);
CREATE INDEX idx_galleries_slug            ON galleries(slug);
CREATE INDEX idx_galleries_workflow_status ON galleries(organization_id, workflow_status);

-- ── Gallery role assignments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gallery_role_assignments (
  id                 CHAR(36)    NOT NULL PRIMARY KEY,
  gallery_id         CHAR(36)    NOT NULL,
  user_id            CHAR(36)    NOT NULL,
  role               VARCHAR(50) NOT NULL,
  granted_by_user_id CHAR(36),
  created_at         BIGINT      NOT NULL,
  UNIQUE KEY uq_gallery_role (gallery_id, user_id),
  FOREIGN KEY (gallery_id)         REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)            REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (granted_by_user_id) REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_gallery_role_user ON gallery_role_assignments(user_id);
CREATE INDEX idx_gra_user_gallery  ON gallery_role_assignments(user_id, gallery_id);

-- ── Unified scoped invites ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invites (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  email               VARCHAR(255) NOT NULL,
  scope_type          VARCHAR(20)  NOT NULL,
  scope_id            CHAR(64)     NOT NULL,
  role_to_grant       VARCHAR(50)  NOT NULL,
  organization_id     VARCHAR(36)  NULL,
  token_hash          CHAR(64)     NOT NULL UNIQUE,
  expires_at          BIGINT       NOT NULL,
  used_at             BIGINT,
  revoked_at          BIGINT,
  created_by_user_id  VARCHAR(32),
  created_at          BIGINT       NOT NULL,
  CONSTRAINT fk_invites_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invites_scope ON invites(scope_type, scope_id);
CREATE INDEX idx_invites_email ON invites(email);

-- ── Viewer tokens v2 (scoped) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS viewer_tokens (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  scope_type          VARCHAR(20)  NOT NULL,
  scope_id            CHAR(64)     NOT NULL,
  email               VARCHAR(255),
  label               VARCHAR(255),
  token_hash          CHAR(64)     NOT NULL UNIQUE,
  expires_at          BIGINT,
  revoked_at          BIGINT,
  last_used_at        BIGINT,
  created_by_user_id  VARCHAR(32),
  created_at          BIGINT       NOT NULL,
  CONSTRAINT fk_vt_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_viewer_tokens_scope ON viewer_tokens(scope_type, scope_id);

-- ── Build jobs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS build_jobs (
  id              VARCHAR(32)  NOT NULL PRIMARY KEY,
  gallery_id      VARCHAR(32)  NOT NULL,
  organization_id VARCHAR(36)  NOT NULL,
  status          VARCHAR(32)  NOT NULL DEFAULT 'queued',
  triggered_by    VARCHAR(255),
  `force`         TINYINT(1)   NOT NULL DEFAULT 0,
  started_at      BIGINT,
  finished_at     BIGINT,
  updated_at      BIGINT,
  error_msg       TEXT,
  created_at      BIGINT       NOT NULL,
  FOREIGN KEY (gallery_id)      REFERENCES galleries(id)     ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_jobs_gallery   ON build_jobs(gallery_id);
CREATE INDEX idx_jobs_status    ON build_jobs(status);
CREATE INDEX idx_build_jobs_org ON build_jobs(organization_id);

-- ── Build events (streaming log) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS build_events (
  id         BIGINT      NOT NULL PRIMARY KEY AUTO_INCREMENT,
  job_id     VARCHAR(32) NOT NULL,
  seq        INT         NOT NULL,
  type       VARCHAR(32) NOT NULL DEFAULT 'log',
  data       TEXT        NOT NULL,
  created_at BIGINT      NOT NULL,
  FOREIGN KEY (job_id) REFERENCES build_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_events_job ON build_events(job_id, seq);

-- ── App settings (per organization) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  organization_id                VARCHAR(36)  NOT NULL,
  smtp_host                      VARCHAR(255),
  smtp_port                      INT,
  smtp_user                      VARCHAR(255),
  smtp_pass                      TEXT,
  smtp_from                      VARCHAR(255),
  smtp_secure                    TINYINT(1)   NOT NULL DEFAULT 0,
  base_url                       TEXT,
  site_title                     VARCHAR(512),
  default_author                 VARCHAR(255),
  default_author_email           VARCHAR(255),
  default_locale                 VARCHAR(16)  NOT NULL DEFAULT 'fr',
  default_access                 VARCHAR(32)  NOT NULL DEFAULT 'public',
  default_allow_download_image   TINYINT(1)   NOT NULL DEFAULT 1,
  default_allow_download_gallery TINYINT(1)   NOT NULL DEFAULT 0,
  default_allow_download_original TINYINT(1)  NOT NULL DEFAULT 0,
  default_download_mode          ENUM('none','display','original') NOT NULL DEFAULT 'display',
  default_private                TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at                     BIGINT       NOT NULL,
  PRIMARY KEY (organization_id),
  CONSTRAINT fk_settings_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Email log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_log (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  organization_id VARCHAR(36)  NOT NULL,
  to_address      VARCHAR(255) NOT NULL,
  subject         VARCHAR(512) NOT NULL,
  template        VARCHAR(64),
  status          VARCHAR(32)  NOT NULL DEFAULT 'sent',
  error           TEXT,
  sent_at         BIGINT       NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_email_log_org ON email_log(organization_id);

-- ── Organization memberships ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_memberships (
  id              VARCHAR(32) NOT NULL PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  user_id         VARCHAR(32) NOT NULL,
  role            VARCHAR(32) NOT NULL DEFAULT 'collaborator',
  created_at      BIGINT      NOT NULL,
  UNIQUE (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_org_memberships_user ON organization_memberships(user_id);
CREATE INDEX idx_memberships_org      ON organization_memberships(organization_id);

-- ── Organization invitations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invitations (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  organization_id VARCHAR(36)  NOT NULL,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255) NOT NULL DEFAULT '',
  role            VARCHAR(32)  NOT NULL,
  token           VARCHAR(64)  NOT NULL,
  token_hash      VARCHAR(64)  NOT NULL UNIQUE,
  created_by      VARCHAR(32),
  created_at      BIGINT       NOT NULL,
  expires_at      BIGINT       NOT NULL,
  accepted_at     BIGINT       DEFAULT NULL,
  gallery_id      VARCHAR(32)  DEFAULT NULL,
  gallery_role    VARCHAR(32)  DEFAULT NULL,
  CONSTRAINT fk_invitations_org     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_invitations_gallery FOREIGN KEY (gallery_id)      REFERENCES galleries(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_org   ON invitations(organization_id);

-- ── Gallery upload links (photographer upload access) ─────────────────────────

CREATE TABLE IF NOT EXISTS gallery_upload_links (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  gallery_id          CHAR(36)     NOT NULL,
  token_hash          CHAR(64)     NOT NULL,
  token               VARCHAR(64)  NULL,
  label               VARCHAR(255) NULL,
  expires_at          DATETIME     NULL,
  revoked_at          DATETIME     NULL,
  created_by_user_id  VARCHAR(32)  NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_upload_link_token (token_hash),
  FOREIGN KEY (gallery_id)         REFERENCES galleries(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_upload_links_gallery ON gallery_upload_links(gallery_id);
CREATE INDEX idx_upload_links_token   ON gallery_upload_links(token);

-- ── Photographers (named entities for photo attribution) ──────────────────────

CREATE TABLE IF NOT EXISTS photographers (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  gallery_id      VARCHAR(36)  NOT NULL,
  organization_id VARCHAR(36)  NULL DEFAULT NULL,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NULL,
  bio             TEXT         NULL,
  upload_link_id  VARCHAR(36)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photographer_gallery FOREIGN KEY (gallery_id)     REFERENCES galleries(id)            ON DELETE CASCADE,
  CONSTRAINT fk_photographer_link    FOREIGN KEY (upload_link_id) REFERENCES gallery_upload_links(id)  ON DELETE SET NULL,
  INDEX idx_photographer_gallery (gallery_id),
  INDEX idx_photographer_link    (upload_link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Personal upload tokens (gp_ prefix, SHA-256 hash, gallery/project scope) ──

CREATE TABLE IF NOT EXISTS personal_tokens (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  user_id       VARCHAR(32)   NOT NULL,
  name          VARCHAR(128)  NOT NULL,
  token_hash    CHAR(64)      NOT NULL UNIQUE,
  prefix        VARCHAR(12)   NOT NULL,
  scope_type    ENUM('gallery','project') NOT NULL,
  scope_id      CHAR(36)      NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME      NULL,
  expires_at    DATETIME      NULL,
  revoked_at    DATETIME      NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_personal_tokens_user  ON personal_tokens(user_id);
CREATE INDEX idx_personal_tokens_scope ON personal_tokens(scope_type, scope_id);

-- ── Photos ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS photos (
  id                  CHAR(36)     NOT NULL PRIMARY KEY,
  gallery_id          CHAR(36)     NOT NULL,
  filename            VARCHAR(255) NOT NULL,
  original_name       VARCHAR(255) NULL,
  content_hash        CHAR(64)     NULL,
  size_bytes          BIGINT       NULL,
  sort_order          INT          NOT NULL DEFAULT 0,
  status              ENUM('uploaded','validated','published') NOT NULL DEFAULT 'validated',
  uploaded_by_user_id VARCHAR(32)  NULL,
  upload_link_id      CHAR(36)     NULL,
  photographer_id     VARCHAR(32)  NULL DEFAULT NULL,
  exif                JSON         NULL DEFAULT NULL,
  personal_token_id   CHAR(36)     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_gallery_file (gallery_id, filename),
  UNIQUE KEY uq_photos_gallery_original_name (gallery_id, original_name),
  INDEX idx_photos_content_hash (gallery_id, content_hash),
  FOREIGN KEY (gallery_id)         REFERENCES galleries(id)            ON DELETE CASCADE,
  FOREIGN KEY (upload_link_id)     REFERENCES gallery_upload_links(id) ON DELETE SET NULL,
  CONSTRAINT fk_photos_photographer_user
    FOREIGN KEY (photographer_id)  REFERENCES users(id)                ON DELETE SET NULL,
  FOREIGN KEY (personal_token_id)  REFERENCES personal_tokens(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_photos_gallery_status ON photos(gallery_id, status);
CREATE INDEX idx_photos_upload_link    ON photos(upload_link_id);
CREATE INDEX idx_photos_personal_token ON photos(personal_token_id);

-- ── Inspector audit log ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inspector_audit_log (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  actor_id     VARCHAR(32)  NOT NULL,
  action       VARCHAR(64)  NOT NULL,
  target_type  VARCHAR(32)  NOT NULL,
  target_id    VARCHAR(64)  NOT NULL,
  before_state JSON         NULL,
  after_state  JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ial_target  (target_type, target_id),
  INDEX idx_ial_actor   (actor_id),
  INDEX idx_ial_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Audit log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  organization_id VARCHAR(36)  NOT NULL,
  user_id         VARCHAR(32),
  action          VARCHAR(128) NOT NULL,
  target_type     VARCHAR(64),
  target_id       VARCHAR(36),
  meta            TEXT,
  created_at      BIGINT       NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_audit_log_user   ON audit_log(user_id, created_at);
CREATE INDEX idx_audit_target     ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_user       ON audit_log(user_id);
CREATE INDEX idx_audit_log_org    ON audit_log(organization_id, created_at);

-- ── Password reset tokens ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  token      VARCHAR(64)  NOT NULL UNIQUE,
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  created_at BIGINT       NOT NULL,
  expires_at BIGINT       NOT NULL,
  used_at    BIGINT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);

-- ── Magic links (passwordless login) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS magic_links (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  token      VARCHAR(64)  NOT NULL UNIQUE,
  token_hash VARCHAR(64)  NOT NULL UNIQUE,
  created_at BIGINT       NOT NULL,
  expires_at BIGINT       NOT NULL,
  used_at    BIGINT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
