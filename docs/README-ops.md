# GalleryPack — Production Operations Guide

## Architecture overview

GalleryPack runs as five Docker services managed by `docker-compose.saas.yml`:

```
Internet
    |
  Caddy (proxy) — ports 80 / 443
    |                  |
    |          Static gallery files (data/public, read-only mount)
    |
   API  (127.0.0.1:4000, internal)
    |          |
    |        Worker (no external port)
    |          |
   MariaDB 11        Redis 7
```

| Service | Image | Role |
|---------|-------|------|
| `api` | `Dockerfile.api` | Express API + admin SPA; runs DB migrations on startup |
| `worker` | `Dockerfile.worker` | BullMQ gallery builder; processes build jobs from Redis queue |
| `db` | `mariadb:11` | Primary database; named volume `db_data` |
| `redis` | `redis:7-alpine` | Job queue (BullMQ); named volume `redis_data` |
| `proxy` | `caddy:2-alpine` | Reverse proxy; automatic TLS via Let's Encrypt; named volumes `caddy_data`, `caddy_config` |

The `worker` depends on `api` being healthy before it starts. The `api` depends on both `db` and `redis` being healthy.

---

## Required environment variables

Copy `.env.example` to `.env` on the server and fill in the values marked required.

### Secrets (required, no defaults)

| Variable | How to generate | Description |
|----------|----------------|-------------|
| `ADMIN_PASSWORD` | choose a strong password | Bootstrap admin account password |
| `SESSION_SECRET` | `openssl rand -hex 32` | Signs session cookies |
| `DB_PASS` | choose a strong password | MariaDB application user password |
| `DB_ROOT_PASSWORD` | choose a strong password | MariaDB root password |

### Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `VIEWER_TOKEN_SECRET` | `change-me-in-production` | Signs viewer tokens for private galleries — change this |
| `BASE_URL` | `http://localhost` | Public URL used in emails and gallery links |
| `ADMIN_EMAIL` | `admin@localhost` | Bootstrap admin email address |

### Full variable reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PLATFORM_MODE` | `single` | `single` = one organisation; `saas` = multi-tenant subdomain routing |
| `BASE_DOMAIN` | `gallerypack.app` | Root domain for subdomain routing (saas mode only) |
| `DB_NAME` | `gallerypack` | Database name |
| `DB_USER` | `gallerypack` | Database user |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL (set automatically inside Compose network) |
| `EMAIL_PROVIDER` | `null` | `null` = log to console; `smtp` = send via SMTP |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender address, e.g. `GalleryPack <noreply@example.com>` |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `UPLOAD_MAX_SIZE_MB` | `100` | Maximum upload size per file in MB |
| `GALLERY_MAX_PHOTOS` | `500` | Maximum photos per gallery |
| `THUMB_CONCURRENCY` | `4` | Thumbnail generation concurrency |
| `PRERENDER_CONCURRENCY` | `2` | Gallery prerender concurrency |
| `LICENSE_FILE` | `/app/data/gallerypack.license` | Path to license file inside the container |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `STORAGE_ROOT` | `/srv/gallerypack` | Root path for local storage inside the container |
| `S3_BUCKET` | — | S3 / R2 / MinIO bucket name |
| `S3_REGION` | — | S3 region |
| `S3_ENDPOINT` | — | S3-compatible endpoint URL |
| `S3_ACCESS_KEY_ID` | — | S3 access key ID |
| `S3_SECRET_ACCESS_KEY` | — | S3 secret access key |

---

## Deployment procedure

### First deployment

```bash
# 1. Clone the repository
git clone git@github.com:pvollenweider/gallerypack.git
cd gallerypack

# 2. Create environment file
cp .env.example .env
# Edit .env and fill in all required values (see above)

# 3. Build images
docker build --no-cache -f Dockerfile.api    -t gallerypack-saas-api    .
docker build --no-cache -f Dockerfile.worker -t gallerypack-saas-worker .

# 4. Start the stack
docker compose -f docker-compose.saas.yml up -d

# 5. Verify all services are healthy
docker compose -f docker-compose.saas.yml ps
```

On first boot the API automatically runs database migrations and creates the bootstrap admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

For production with TLS, set `DOMAIN=yourdomain.com` in `.env` and ensure a DNS A record points to the server IP before starting. Caddy provisions a Let's Encrypt certificate automatically.

For multi-tenant (saas) mode, also set `BASE_DOMAIN=yourdomain.com` and add a wildcard DNS record `*.yourdomain.com` pointing to the server IP.

### Updating to a new version

```bash
# 1. Pull latest source
git pull

# 2. Rebuild images without cache
docker build --no-cache -f Dockerfile.api    -t gallerypack-saas-api    .
docker build --no-cache -f Dockerfile.worker -t gallerypack-saas-worker .

# 3. Restart the stack (migrations run automatically on API startup)
docker compose -f docker-compose.saas.yml up -d
```

---

## Health check

```bash
docker compose -f docker-compose.saas.yml ps
```

All services should show `healthy` or `running (healthy)`. The API and worker both expose Docker healthchecks:

- **api** — polls `GET http://localhost:4000/api/health` every 30 s
- **worker** — checks that `/tmp/worker.alive` was updated within the last 120 s, every 60 s
- **db** — runs `healthcheck.sh --connect --innodb_initialized` every 10 s
- **redis** — runs `redis-cli ping` every 10 s

---

## Backup

Run from the repository root on the host:

```bash
./backup.sh
```

The script:
1. Dumps the database to `backups/TIMESTAMP/db.sql.gz`
2. Archives original uploaded photos to `backups/TIMESTAMP/photos_private.tar.gz`
3. Archives app state (license file, etc.) to `backups/TIMESTAMP/app.tar.gz`
4. Retains the 10 most recent backup sets and removes older ones

Backup sets are stored under `./backups/YYYYMMDD_HHMMSS/`.

---

## Restore procedures

### Restore the database

```bash
gunzip -c backups/TIMESTAMP/db.sql.gz | \
  docker compose -f docker-compose.saas.yml exec -T db \
    mariadb -ugallerypack -p<DB_PASS> gallerypack
```

Replace `TIMESTAMP` with the backup directory name (e.g. `20260101_120000`) and `<DB_PASS>` with the value from `.env`.

### Restore original photos

```bash
tar -xzf backups/TIMESTAMP/photos_private.tar.gz -C ./data
```

### Restore app data (license file, etc.)

```bash
tar -xzf backups/TIMESTAMP/app.tar.gz -C ./data
```

After restoring files, restart the stack:

```bash
docker compose -f docker-compose.saas.yml restart api worker
```

---

## Docker disk management

Docker build caches and stopped containers accumulate over time. To reclaim disk space:

```bash
# Remove stopped containers, dangling images, build cache, unused networks
docker system prune -f

# Also remove unused images (more aggressive — only run if you are sure)
docker system prune -af
```

Check current Docker disk usage:

```bash
docker system df
```

Named volumes (`db_data`, `redis_data`, `caddy_data`, `caddy_config`) are **not** removed by `docker system prune`. To remove a volume you must explicitly run `docker volume rm <name>` — only do this if you intend to wipe that data.

---

## Useful commands

### Logs

```bash
# Tail all services
docker compose -f docker-compose.saas.yml logs -f

# Tail a single service
docker compose -f docker-compose.saas.yml logs -f api
docker compose -f docker-compose.saas.yml logs -f worker
```

### Restart a service

```bash
docker compose -f docker-compose.saas.yml restart api
docker compose -f docker-compose.saas.yml restart worker
```

### Stop and start

```bash
docker compose -f docker-compose.saas.yml down
docker compose -f docker-compose.saas.yml up -d
```

### Connect to the database

```bash
docker compose -f docker-compose.saas.yml exec db mariadb -ugallerypack -p gallerypack
```

### Run a one-off API command inside the container

```bash
docker compose -f docker-compose.saas.yml exec api node -e "console.log('ok')"
```

### Check the API health endpoint directly

```bash
curl -s http://localhost:4000/api/health
```
