# GalleryPack — Developer Onboarding Guide

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 20 | Required for running outside Docker and for IDE tooling |
| Docker Desktop | latest stable | Provides Docker Engine + Compose |
| Git | any recent | — |

---

## Repository structure

GalleryPack is an npm workspaces monorepo. The top-level `package.json` declares three workspace roots:

```
gallerypack/
  apps/
    api/          Express API server + admin SPA served as static files
    web/          React admin SPA (built into the API image at build time)
  workers/
    builder/      Background gallery builder (BullMQ worker)
  packages/
    engine/       Core gallery-build logic, image processing (shared by api + worker)
    shared/       Storage abstraction, common utilities
  docker-compose.saas.yml   Production / staging Compose file
  Dockerfile.api            Two-stage build: React SPA then Node API
  Dockerfile.worker         Node worker image
  .env.example              All supported environment variables with documentation
  backup.sh                 Database + file backup script
  docs/                     Additional documentation
```

---

## Local development setup

### 1. Clone and install dependencies

```bash
git clone git@github.com:pvollenweider/gallerypack.git
cd gallerypack
npm install
```

`npm install` at the repo root installs dependencies for all workspaces in one pass.

### 2. Environment variables

Copy `.env.example` to `.env` and set at minimum the required values:

```bash
cp .env.example .env
```

Edit `.env` — the variables you must change before first boot:

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | Yes | Password for the bootstrap admin account |
| `SESSION_SECRET` | Yes | Signs session cookies — generate with `openssl rand -hex 32` |
| `DB_PASS` | Yes | MariaDB password for the application user |
| `DB_ROOT_PASSWORD` | Yes | MariaDB root password |
| `VIEWER_TOKEN_SECRET` | Recommended | Signs viewer tokens for private galleries |
| `BASE_URL` | Recommended | Public URL, e.g. `http://localhost` |

All other variables have sensible defaults. See `.env.example` for the full list with inline documentation.

### 3. Running services

There is no standalone native dev server that wires up MariaDB and Redis. Use Docker for the full stack.

For quick iteration on the API or worker without rebuilding images, the root `package.json` exposes direct-run scripts (assumes a database and Redis are already available):

```bash
npm run dev:api      # node apps/api/src/server.js
npm run dev:worker   # node workers/builder/src/index.js
```

Optional: set `ANTHROPIC_API_KEY` in `.env` to enable AI photo description generation during local development.

Running the test suite:

```bash
npm test             # node --test apps/api/test/
```

---

## Running the full stack with Docker

### Build images

```bash
# Build the API image (includes the React admin SPA)
docker build --no-cache -f Dockerfile.api -t gallerypack-saas-api .

# Build the worker image
docker build --no-cache -f Dockerfile.worker -t gallerypack-saas-worker .
```

The API Dockerfile is a two-stage build:
1. **Stage 1 (`web-build`)** — builds `apps/web` (React) using `node:20-alpine`; output lands in `/app/apps/web/dist/`.
2. **Stage 2** — builds the production API on `node:20-bookworm-slim`, copies source from `packages/` and `apps/api/`, then copies the SPA dist from stage 1 into `/app/admin-dist`.

### Start the stack

```bash
docker compose -f docker-compose.saas.yml up -d
```

Or combine build + start in one step:

```bash
docker build --no-cache -f Dockerfile.api -t gallerypack-saas-api . && \
docker compose -f docker-compose.saas.yml up -d
```

The stack is healthy when `docker compose -f docker-compose.saas.yml ps` shows all services as `healthy` or `running`.

The admin panel is available at **http://localhost/admin** (via Caddy on port 80). The API binds internally on `127.0.0.1:4000`.

Default admin credentials:
- Email: value of `ADMIN_EMAIL` in `.env` (default `admin@localhost`)
- Password: value of `ADMIN_PASSWORD` in `.env`

---

## Data directories

All persistent data lives under `./data/` on the host and is bind-mounted into containers:

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `./data/private` | `/srv/gallerypack/private` | Original uploaded photos — read and written by the engine |
| `./data/public` | `/srv/gallerypack/public` | Built gallery output (HTML/CSS/JS + images) — served by Caddy |
| `./data/internal` | `/srv/gallerypack/internal` | Admin thumbnails and previews — backend only |
| `./data/app` | `/app/data` | License file and misc server state |

These directories are created automatically inside containers on first start. On the host they appear after the first `docker compose up`.

---

## Backup

```bash
./backup.sh
```

Creates a timestamped backup under `./backups/YYYYMMDD_HHMMSS/` containing:
- `db.sql.gz` — full database dump
- `photos_private.tar.gz` — original uploaded photos
- `app.tar.gz` — license file and app state

The script retains the 10 most recent backups and removes older ones automatically.

---

## Key environment variables reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | API listen port (inside container) |
| `NODE_ENV` | `production` | Node environment |
| `PLATFORM_MODE` | `single` | `single` = one organisation; `saas` = multi-tenant subdomain routing |
| `BASE_DOMAIN` | `gallerypack.app` | Root domain for subdomain routing (saas mode) |
| `BASE_URL` | `http://localhost` | Public URL used in emails and gallery links |
| `ADMIN_EMAIL` | `admin@localhost` | Bootstrap admin email |
| `ADMIN_PASSWORD` | — | Bootstrap admin password **(required)** |
| `SESSION_SECRET` | — | Session cookie signing key **(required)** |
| `VIEWER_TOKEN_SECRET` | `change-me-in-production` | Gallery viewer token signing key |
| `DB_HOST` | `db` | MariaDB host (service name inside Compose network) |
| `DB_NAME` | `gallerypack` | Database name |
| `DB_USER` | `gallerypack` | Database user |
| `DB_PASS` | — | Database password **(required)** |
| `DB_ROOT_PASSWORD` | — | MariaDB root password **(required)** |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `EMAIL_PROVIDER` | `null` | `null` logs to console; `smtp` sends via SMTP |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender address |
| `LOG_LEVEL` | `info` | Pino log level |
| `UPLOAD_MAX_SIZE_MB` | `100` | Maximum upload size in MB |
| `GALLERY_MAX_PHOTOS` | `500` | Maximum photos per gallery |
| `THUMB_CONCURRENCY` | `4` | Thumbnail worker concurrency |
| `PRERENDER_CONCURRENCY` | `2` | Prerender worker concurrency |
| `LICENSE_FILE` | `/app/data/gallerypack.license` | Path to the license file inside the container |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
