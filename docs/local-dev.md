# Local Development Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose)
- `make` (pre-installed on macOS/Linux)
- Git

Node.js is **not** required on the host — everything runs inside containers.

---

## First-time setup

```bash
git clone git@github.com:pvollenweider/gallerypack.git
cd gallerypack
cp .env.example .env
make dev
```

The stack starts on **http://localhost:4001**.

Default admin credentials (from `.env`):
- Email: `admin@localhost`
- Password: value of `ADMIN_PASSWORD` in your `.env`

---

## Available commands

| Command | Description |
|---------|-------------|
| `make dev` | Start all services (api, worker, proxy, db) |
| `make rebuild` | Rebuild images without cache, then start |
| `make logs` | Tail logs for all services |
| `make ps` | Show running containers and their status |
| `make reset` | Stop everything, remove volumes, start fresh |
| `make test` | Run the integration test suite |
| `make build-api` | Build only the API image |
| `make build-worker` | Build only the worker image |
| `make build-web` | Build only the web admin SPA image |

---

## Stack

| Service | Port | Description |
|---------|------|-------------|
| `proxy` | `4001` | Caddy — routes traffic and serves built galleries |
| `api` | `4000` (internal) | Express API + admin SPA |
| `worker` | — | Gallery builder (no external port) |
| `db` | — | MariaDB 11 (no external port) |

---

## Storage layout

Data is persisted under `./data/` on your host:

```
data/
  public/     ← built galleries (HTML/CSS/JS + images) — served by Caddy
  internal/   ← admin thumbnails, previews             — backend only
  private/    ← original uploads                       — backend only
  db/         ← MariaDB data directory
  app/        ← license file, misc server state
```

Inside containers this maps to `/srv/gallerypack/{public,internal,private}`.

---

## Hot-reload

The API source (`apps/api/src/`) is bind-mounted into the container. If you use a Node.js process manager inside the container (e.g., `nodemon`), API changes will be picked up automatically. For a full restart: `make rebuild`.

---

## Resetting to a clean state

```bash
make reset
```

This stops all containers, removes named volumes, and starts fresh. **All data under `./data/` is preserved** — only Docker volumes (Caddy TLS state) are removed. To also wipe local storage data: `rm -rf ./data && make dev`.

---

## Troubleshooting

**Port 4001 already in use:** Stop whatever is using port 4001, or change the `proxy` port in `docker-compose.dev.yml`.

**Database fails to start:** Run `make reset` to wipe the DB volume and reinitialise.

**Build fails (npm ci errors):** Run `make rebuild` to force a clean image build.
