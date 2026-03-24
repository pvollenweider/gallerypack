# GalleryPack SaaS — Quick Install

> From zero to running in under 5 minutes.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- A domain pointing to your server (or `localhost` for local use)

---

## 1. Clone and switch to the SaaS branch

```bash
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack
git checkout saas
```

---

## 2. Create your `.env` file

```bash
cp .env.saas.example .env
```

Edit `.env` — the only required values:

```env
ADMIN_PASSWORD=your-secure-password
SESSION_SECRET=<output of: openssl rand -hex 32>
DOMAIN=photos.example.com          # or localhost for local use
```

For production, also set:

```env
BASE_URL=https://photos.example.com
VIEWER_TOKEN_SECRET=<output of: openssl rand -hex 32>
```

---

## 3. Start the stack

```bash
docker compose -f docker-compose.saas.yml up -d
```

This starts three containers:

| Container | Role |
|-----------|------|
| `api` | Express API server (port 4000, localhost only) |
| `worker` | Builder — processes photo builds in the background |
| `proxy` | Caddy — handles HTTPS, serves galleries as static files |

---

## 4. Open the admin panel

```
http://localhost/admin        (local)
https://photos.example.com/admin  (production)
```

Log in with the `ADMIN_PASSWORD` you set.

---

## 5. Create your first gallery

1. Click **+ New gallery** — enter a slug (e.g. `summer-2025`)
2. Go to the gallery → **Photos** tab → drag & drop photos
3. Click **Build** — watch the live log
4. Gallery is live at `https://photos.example.com/summer-2025/`

---

## Data and backups

All persistent data lives in two directories on the host:

| Directory | Contents |
|-----------|----------|
| `./data/` | SQLite database (`gallerypack.db`) |
| `./storage/` | Source photos + built galleries |

Backup:

```bash
tar czf backup-$(date +%Y%m%d).tar.gz data/ storage/
```

---

## Updating

```bash
git pull
docker compose -f docker-compose.saas.yml up -d --build
```

---

## Stopping

```bash
docker compose -f docker-compose.saas.yml down
```

---

## Next steps

- [Getting started guide](getting-started.md) — full configuration, invites, email
- [API reference](api-reference.md) — all endpoints
- [Environment variables reference](getting-started.md#environment-variables)
