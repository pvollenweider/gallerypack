# GalleryPack — Quick Install

> From zero to running in under 5 minutes.

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- A domain pointing to your server (or `localhost` for local use)

---

## 1. Clone and switch to the v2 branch

```bash
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack
git checkout v2
```

---

## 2. Create your `.env` file

```bash
cp .env.saas.example .env
```

Edit `.env`. Required values:

```env
ADMIN_PASSWORD=your-secure-password
SESSION_SECRET=<output of: openssl rand -hex 32>
```

For production, also set:

```env
BASE_URL=https://photos.example.com
VIEWER_TOKEN_SECRET=<output of: openssl rand -hex 32>
```

All supported variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | Yes | — | Password for the admin account (created on first start) |
| `SESSION_SECRET` | Yes | — | Signs admin session cookies — use `openssl rand -hex 32` |
| `BASE_URL` | Production | `http://localhost` | Public URL used in invite emails and gallery links |
| `VIEWER_TOKEN_SECRET` | Production | `change-me-in-production` | Signs gallery viewer tokens — use `openssl rand -hex 32` |

---

## 3. Start the stack

```bash
docker compose -f docker-compose.saas.yml up -d
```

This starts three containers:

| Container | Role |
|-----------|------|
| `api` | Express API server (port 4000, internal only) |
| `worker` | Builder — processes photo builds in the background |
| `proxy` | Caddy — handles HTTPS, serves galleries as static files on ports 80/443 |

---

## 4. Open the admin panel

```
https://localhost/admin/
```

Log in with the `ADMIN_PASSWORD` you set.

---

## 5. Create your first gallery

1. Click **+ New gallery**
2. Enter a title — the slug is generated automatically from the title
3. Go to the gallery's **Photos** tab and drag & drop your photos
4. Click **Build** — the live log appears while the worker processes the photos
5. The gallery is live at `https://localhost/<slug>/`

---

## Data and backups

All persistent data lives in two directories on the host:

| Directory | Contents |
|-----------|----------|
| `./data/` | SQLite database (`gallerypack.db`) |
| `./src/` | Source photos |
| `./dist/` | Built gallery output served by Caddy |

Backup:

```bash
tar czf backup-$(date +%Y%m%d).tar.gz data/ src/ dist/
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

- [Getting started guide](getting-started.md) — full configuration, gallery settings, invites
- [API reference](api-reference.md) — all endpoints
