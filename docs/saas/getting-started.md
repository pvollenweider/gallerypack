# GalleryPack SaaS — Getting Started

## Architecture overview

```
Browser
  │
  ▼
Caddy (proxy)  :80/:443
  ├── /api/*        → Express API   :4000  (auth, galleries, jobs, invites)
  ├── /admin        → React SPA     (served as static from dist/admin/)
  └── /<slug>/      → Built galleries (static files in ./storage/dist/)

Builder Worker  (background process — polls DB, runs builds)
SQLite DB       ./data/gallerypack.db
Storage         ./storage/  (local) or S3-compatible (cloud)
```

The **API** and **worker** share the same SQLite database and storage volume. The worker picks up queued build jobs every 2 seconds and writes live log events to the DB, which the API streams to the browser via SSE.

---

## Environment variables

Create a `.env` file at the project root (or export variables in your shell):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | **Yes** | — | Password for the first admin account (created on first start) |
| `SESSION_SECRET` | **Yes** | — | Signs admin session cookies — use `openssl rand -hex 32` |
| `DOMAIN` | Prod | `localhost` | Domain for the Caddy proxy (TLS is automatic via Let's Encrypt) |
| `BASE_URL` | Prod | `http://localhost` | Public URL used in invite emails and gallery links |
| `VIEWER_TOKEN_SECRET` | Prod | `change-me-in-production` | Signs gallery viewer tokens — use `openssl rand -hex 32` |
| `PORT` | No | `4000` | Internal API listen port |
| `DB_PATH` | No | `./data/gallerypack.db` | SQLite database file path |
| `STORAGE_DRIVER` | No | `local` | `local` or `s3` |
| `STORAGE_ROOT` | No | `./storage` | Root path for local storage |
| `S3_BUCKET` | S3 only | — | S3 / R2 / MinIO bucket name |
| `S3_REGION` | S3 only | — | AWS region or `auto` (Cloudflare R2) |
| `S3_ENDPOINT` | S3 only | — | Custom endpoint URL (R2, MinIO) |
| `S3_ACCESS_KEY_ID` | S3 only | — | Access key |
| `S3_SECRET_ACCESS_KEY` | S3 only | — | Secret key |
| `EMAIL_PROVIDER` | No | `null` | `smtp` or `null` (logs to console) |
| `SMTP_HOST` | SMTP | — | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | SMTP | `587` | `587` (STARTTLS) or `465` (SSL) |
| `SMTP_SECURE` | SMTP | `false` | `true` for port 465 |
| `SMTP_USER` | SMTP | — | SMTP login |
| `SMTP_PASS` | SMTP | — | SMTP password |
| `SMTP_FROM` | SMTP | — | From address, e.g. `GalleryPack <noreply@example.com>` |

---

## Admin panel

Located at `/admin` (or `https://your-domain/admin` in production).

### Galleries

The gallery list shows all galleries for your studio with their build status. From here you can:

- **+ New gallery** — create a gallery by entering a slug
- Click a gallery card → open the detail page (3 tabs: Photos, Settings, Jobs)
- **▶ Build** / **↺ Force rebuild** — queue a build
- **Delete** — remove the gallery (irreversible)

### Gallery detail — Photos tab

- Drag & drop photos or click to browse
- Per-file upload progress
- Photo grid with thumbnails (after first build)
- Delete individual photos

### Gallery detail — Settings tab

| Field | Description |
|-------|-------------|
| Title / Subtitle | Display names |
| Author / Author email | Photographer info — email used for gallery-ready notification |
| Date | `YYYY-MM-DD` or blank (resolved from EXIF) |
| Location | Overrides EXIF GPS reverse-geocoding |
| Locale | Gallery UI language: `fr`, `en`, `de`, `es`, `it`, `pt` |
| Access | `public`, `private`, or `password` |
| Password | When access = `password` — stored as scrypt hash, never in plain text |
| Cover photo | Filename of the cover image |
| Allow image download | Per-photo download button in the viewer |
| Allow gallery download | Full ZIP download button in the viewer |

### Gallery detail — Jobs tab

History of all builds for this gallery. Click a job row to open the live log.

---

## Invite links

Invite links let photographers upload photos without admin access.

### Creating an invite

```
Admin panel  →  (not yet a dedicated page — use the API or plan for Phase 7 UI)
POST /api/invites
```

An invite has:
- **token** — 64-char hex string, part of the upload URL: `/invite/<token>`
- **galleryId** — optionally pre-assigns the invite to an existing gallery
- **email** — sends an invite email automatically (requires SMTP)
- **expiresIn** — TTL in milliseconds (default: 7 days)
- **singleUse** — if true, invalidated after first use

### Invite flow

1. Admin creates invite → copies `/invite/<token>` URL
2. Photographer opens the URL → uploads photos
3. Admin sees the photos in the gallery's Photos tab
4. Admin triggers a build

### Revoking

```
POST /api/invites/:id/revoke
```

Revoked and expired invites return `410 Gone`.

---

## Access control

### Gallery access modes

| Mode | Behaviour |
|------|-----------|
| `public` | Anyone with the URL can view — no authentication required |
| `private` | Not listed anywhere; URL is the only protection (no password prompt) |
| `password` | Viewer prompted for a password; a 24h signed viewer cookie is issued |

### Setting a gallery password

In the Settings tab, set **Access** to `password` and fill in the **Password** field. On save, the password is hashed (scrypt) and stored. The plain text is never persisted.

### Viewer authentication flow

```
GET /api/galleries/:id/view
  → 401 { requiresPassword: true }   (if password required and no cookie)

POST /api/galleries/:id/verify-password  { password: "..." }
  → 200 + sets viewer_<id> HTTP-only cookie (24h)

GET /api/galleries/:id/view
  → 200 { gallery data }
```

---

## Email notifications

Set `EMAIL_PROVIDER=smtp` and configure `SMTP_*` variables.

| Template | Trigger | Recipient |
|----------|---------|-----------|
| `invite` | Invite created with an email address | Photographer |
| `gallery-ready` | Successful build, `author_email` set | Author |
| `access-resend` | Manually triggered via API | Photographer |

With `EMAIL_PROVIDER=null` (default), emails are printed to the API console — useful for development.

---

## Build pipeline

1. Admin (or worker) calls `POST /api/galleries/:id/build`
2. A `build_jobs` row is created with status `queued`
3. The worker picks it up within 2 seconds
4. The worker calls `buildGallery()` from `@gallerypack/engine`
5. Stdout is intercepted → written to `build_events` table
6. The browser polls `GET /api/jobs/:jobId/stream` (SSE) to display the live log
7. On success, `galleries.build_status` is set to `done` and a gallery-ready email is sent

### Limits

| Limit | Value |
|-------|-------|
| Max file size | 200 MB per photo |
| Max photos per gallery | 500 |
| Concurrent builds per studio | 1 |
| Upload rate limit | 100 requests/min per IP |

---

## Healthcheck

```
GET /api/health
```

Response:

```json
{
  "ok": true,
  "version": "0.0.1",
  "db": "connected",
  "storage": "ok",
  "worker": "idle"
}
```

Returns `503` if `ok: false` (DB or storage check fails).

---

## Monorepo structure

```
gallerypack/
├── packages/
│   ├── engine/          # Build pipeline (Sharp, EXIF, HTML gen) — @gallerypack/engine
│   └── shared/          # Storage adapters, shared types — @gallerypack/shared
├── apps/
│   ├── api/             # Express API server — @gallerypack/api
│   └── web/             # React admin SPA — @gallerypack/web
├── workers/
│   └── builder/         # Background build worker — @gallerypack/worker-builder
├── docs/
│   ├── architecture/    # ADRs (Architecture Decision Records)
│   └── saas/            # This guide
├── docker-compose.saas.yml
├── Dockerfile.api
├── Dockerfile.worker
└── Caddyfile
```
