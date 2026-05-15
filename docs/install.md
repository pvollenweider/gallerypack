# Installation

## Prerequisites checklist

Before you begin, ensure you have the following:

- [ ] **Docker 20+** and **Docker Compose v2** installed (`docker compose version`)
- [ ] A server or VM meeting the minimum system requirements (see below)
- [ ] A domain name with DNS access (for production with TLS)
- [ ] SMTP credentials (optional, for invitation and notification emails)

## System requirements

| Resource | Minimum | Recommended (production) |
|----------|---------|--------------------------|
| CPU | 2 cores | 4+ cores |
| RAM | 2 GB | 4+ GB |
| Disk | 20 GB | 50+ GB (depends on photo volume) |
| Docker | 20.10+ | Latest stable |
| Compose | v2.0+ | Latest stable |

The worker process is CPU-intensive during gallery builds (image resizing with Sharp/libvips). More cores and RAM improve build throughput, especially for galleries with many high-resolution photos.

---

## 1. Environment variables

Copy `.env.example` to `.env` and set at minimum:

```env
# Required
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=a-strong-password
SESSION_SECRET=run-openssl-rand-hex-32

# Public URL (used in invitation emails and gallery links)
BASE_URL=https://yourdomain.com

# Platform mode: single (default) or multi
PLATFORM_MODE=single
```

### Full variable reference

| Variable | Default | Description |
|---|---|---|
| `ADMIN_EMAIL` | `admin@localhost` | Bootstrap admin email |
| `ADMIN_PASSWORD` | — | Bootstrap admin password **(required)** |
| `SESSION_SECRET` | — | Signs session cookies — use `openssl rand -hex 32` **(required)** |
| `VIEWER_TOKEN_SECRET` | `change-me-in-production` | Signs viewer tokens for private galleries |
| `BASE_URL` | `http://localhost` | Public URL — used in emails and links |
| `PLATFORM_MODE` | `single` | `single` = one organization; `multi` = multiple organizations with domain routing |
| `BASE_DOMAIN` | — | Root domain for subdomain-based organization routing (multi mode) |
| `DB_HOST` | `127.0.0.1` | MariaDB host |
| `DB_PORT` | `3306` | MariaDB port |
| `DB_NAME` | `gallerypack` | Database name |
| `DB_USER` | `gallerypack` | Database user |
| `DB_PASS` | — | Database password **(required)** |
| `DB_ROOT_PASSWORD` | — | MariaDB root password (required by the `db` service in Docker Compose) |
| `LICENSE_FILE` | `/app/data/gallerypack.license` | Path to the license file inside the container |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `STORAGE_ROOT` | `/srv/gallerypack` | Root path for local storage (inside container) |
| `S3_BUCKET` | — | S3 / R2 / MinIO bucket name |
| `S3_REGION` | — | S3 region |
| `S3_ENDPOINT` | — | S3-compatible endpoint URL |
| `S3_ACCESS_KEY_ID` | — | S3 access key |
| `S3_SECRET_ACCESS_KEY` | — | S3 secret key |
| `EMAIL_PROVIDER` | `null` | `null` (log to console) or `smtp` |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | — | Sender address, e.g. `GalleryPack <noreply@example.com>` |
| `SMTP_SECURE` | `false` | `true` for port 465 (TLS) |
| `ANTHROPIC_API_KEY` | — | Enables AI photo description generation (optional) |

---

## 2. Run with Docker Compose

```bash
docker compose -f docker-compose.saas.yml up -d
```

This starts four services:
- **MariaDB** — database (migrations run automatically on API startup)
- **API** — Express server + admin SPA (React, pre-built into the image)
- **Worker** — background build job processor
- **Caddy** — reverse proxy + automatic TLS

On first boot the API creates the bootstrap admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## 3. Production with TLS

Set `DOMAIN=yourdomain.com` in `.env`. Caddy provisions a Let's Encrypt certificate automatically. Point your DNS A record to the server IP before starting.

For multi-organization with subdomains, also set `BASE_DOMAIN=yourdomain.com` and create a wildcard DNS record `*.yourdomain.com → server IP`.

---

## 4. S3-compatible storage

Set `STORAGE_DRIVER=s3` and the `S3_*` variables. Both source photos and built gallery files are stored in the bucket under `private/` and `public/` prefixes respectively.

Compatible with AWS S3, Cloudflare R2, MinIO, and any S3-compatible API.

---

## 5. Update

```bash
git pull
docker compose -f docker-compose.saas.yml build --no-cache
docker compose -f docker-compose.saas.yml up -d
```

Database migrations run automatically on startup.

---

## AI photo descriptions (optional)

GalleryPack can generate AI-powered descriptions for photos using Claude Vision (Anthropic). Generated descriptions are used as `alt` text and captions in built galleries.

To enable:

1. Create an account at [console.anthropic.com](https://console.anthropic.com/) and obtain an API key.
2. Add the key to your environment:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart the API server.

Once configured, a **Generate with AI** button appears in the photo editor. Descriptions are generated on demand per photo, stored in the database, and applied during the next gallery build.

If `ANTHROPIC_API_KEY` is not set, the feature is silently disabled — no errors, button is greyed out.
