-- GalleryPack SaaS — initial schema
-- SQLite (better-sqlite3)
-- Migration: 001_initial_schema

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ── Studios (tenants) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studios (
    id          TEXT PRIMARY KEY,          -- ULID
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,      -- used in URLs: /s/<slug>/...
    plan        TEXT NOT NULL DEFAULT 'free',  -- free | pro | agency
    created_at  INTEGER NOT NULL,          -- Unix ms
    updated_at  INTEGER NOT NULL
);

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,          -- ULID
    studio_id   TEXT REFERENCES studios(id) ON DELETE CASCADE,
    email       TEXT NOT NULL UNIQUE,
    password_hash TEXT,                    -- bcrypt; NULL for OAuth users
    role        TEXT NOT NULL DEFAULT 'photographer',  -- admin | photographer
    name        TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_studio ON users(studio_id);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);

-- ── Sessions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,          -- opaque random token
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL,          -- Unix ms
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── Galleries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS galleries (
    id          TEXT PRIMARY KEY,          -- ULID (= slug for backwards compat)
    studio_id   TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    title       TEXT,
    subtitle    TEXT,
    author      TEXT,
    author_email TEXT,
    date        TEXT,                      -- ISO date string
    location    TEXT,
    locale      TEXT NOT NULL DEFAULT 'en',
    access      TEXT NOT NULL DEFAULT 'public',  -- public | private | password
    password    TEXT,                      -- plaintext password for .htpasswd generation
    private     INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
    standalone  INTEGER NOT NULL DEFAULT 0,
    allow_download_image   INTEGER NOT NULL DEFAULT 1,
    allow_download_gallery INTEGER NOT NULL DEFAULT 1,
    cover_photo TEXT,                      -- original filename of cover photo
    slideshow_interval INTEGER,
    copyright   TEXT,
    config_json TEXT,                      -- full gallery.config.json as JSON string
    build_status TEXT NOT NULL DEFAULT 'pending',  -- pending | building | done | error
    built_at    INTEGER,                   -- Unix ms of last successful build
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    UNIQUE(studio_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_galleries_studio ON galleries(studio_id);
CREATE INDEX IF NOT EXISTS idx_galleries_slug   ON galleries(slug);

-- ── Gallery ↔ Photographer link ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gallery_photographers (
    gallery_id      TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_upload      INTEGER NOT NULL DEFAULT 1,
    can_view_stats  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (gallery_id, user_id)
);

-- ── Invites (photographer upload links) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
    id          TEXT PRIMARY KEY,          -- ULID
    studio_id   TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    gallery_id  TEXT REFERENCES galleries(id) ON DELETE SET NULL,
    token       TEXT NOT NULL UNIQUE,      -- opaque URL token
    email       TEXT,                      -- pre-filled email for the photographer
    label       TEXT,                      -- human-readable label shown in admin
    used_at     INTEGER,                   -- NULL = not yet used
    expires_at  INTEGER,                   -- NULL = never expires
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_token   ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_studio  ON invites(studio_id);
CREATE INDEX IF NOT EXISTS idx_invites_gallery ON invites(gallery_id);

-- ── Build jobs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS build_jobs (
    id          TEXT PRIMARY KEY,          -- ULID
    gallery_id  TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    studio_id   TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | error
    triggered_by TEXT,                     -- user_id or 'system' or 'upload'
    force       INTEGER NOT NULL DEFAULT 0,
    started_at  INTEGER,
    finished_at INTEGER,
    error_msg   TEXT,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_gallery ON build_jobs(gallery_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON build_jobs(status);

-- ── Build events (streaming log) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS build_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,          -- monotonic sequence within the job
    type        TEXT NOT NULL DEFAULT 'log',  -- log | progress | done | error
    data        TEXT NOT NULL,             -- log line or JSON payload
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_job ON build_events(job_id, seq);

-- ── App settings (per studio) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    studio_id   TEXT PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
    smtp_host   TEXT,
    smtp_port   INTEGER,
    smtp_user   TEXT,
    smtp_pass   TEXT,
    smtp_from   TEXT,
    smtp_secure INTEGER NOT NULL DEFAULT 0,
    apache_path TEXT,                      -- GALLERY_APACHE_PATH equivalent
    base_url    TEXT,
    updated_at  INTEGER NOT NULL
);
