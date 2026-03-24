# GalleryPack SaaS — Getting Started

## Architecture overview

```
Browser
  │
  ▼
Caddy (proxy)  :80/:443
  ├── /api/*        → Express API   :4000  (auth, galleries, jobs, invites)
  ├── /admin/       → React SPA     (served as static from dist/admin/)
  └── /<slug>/      → Built galleries (static files served from ./dist/)

Builder Worker  (background process — polls DB, runs builds)
SQLite DB       ./data/gallerypack.db
Storage         ./src/  (source photos)   ./dist/  (built output)
```

The **API** and **worker** share the same SQLite database and storage volumes. The worker picks up queued build jobs every 2 seconds and writes live log events to the DB, which the API streams to the browser via SSE.

---

## Environment variables

Create a `.env` file at the project root (or export variables in your shell):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | **Yes** | — | Password for the admin account (created on first start) |
| `SESSION_SECRET` | **Yes** | — | Signs admin session cookies — use `openssl rand -hex 32` |
| `BASE_URL` | Prod | `http://localhost` | Public URL used in invite emails and gallery links |
| `VIEWER_TOKEN_SECRET` | Prod | `change-me-in-production` | Signs gallery viewer tokens — use `openssl rand -hex 32` |
| `PORT` | No | `4000` | Internal API listen port |
| `DATA_DIR` | No | `./data` | Directory for the SQLite database |
| `STORAGE_ROOT` | No | `./storage` | Root path for local storage |
| `STORAGE_DRIVER` | No | `local` | `local` or `s3` |
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

Located at `https://your-domain/admin/`.

### Gallery list

The gallery grid shows all galleries with their build status, photo count, disk size, and access badges. You can filter the list using the buttons at the top:

| Filter | Shows |
|--------|-------|
| All | Every gallery |
| Private | Galleries with `private: true` |
| Password | Galleries with `access: password` |
| Rebuild | Galleries flagged as needing a rebuild |

From the gallery list you can:

- **+ New gallery** — enter a title; the slug is auto-generated from the title
- Click a gallery card to open the detail page (tabs: Photos, Settings, Jobs)
- **Build** / **Force rebuild** — queue a build job

### Gallery detail — Photos tab

- Drag & drop photos or click to browse; folder upload is supported
- Per-file upload progress
- Photo grid with thumbnails (visible after the first build)
- Delete individual photos

### Gallery detail — Settings tab

Settings are divided into two sections.

**Basic settings:**

| Field | Description |
|-------|-------------|
| Title | Gallery display name |
| Subtitle | Short description shown in the gallery header |
| Description | Longer text displayed on the public listing |
| Author | Photographer name |

**Advanced settings:**

| Field | Description |
|-------|-------------|
| Date | `YYYY-MM-DD` or blank (resolved from EXIF date range) |
| Location | Overrides EXIF GPS reverse-geocoding |
| Locale | Gallery UI language: `fr`, `en`, `de` |
| Access | `public`, `private`, or `password` (see Access modes below) |
| Password | When access = `password` — stored as a hash, never in plain text |
| Cover photo | Select the cover image from the uploaded photos |
| Allow image download | Enable per-photo download button in the viewer |
| Allow gallery download | Enable full ZIP download button in the viewer |
| Private | Exclude from the public listing even if access = `public` |

**Danger Zone:**

- **Rename slug** — changes the gallery URL and moves the source/built folders on disk
- **Delete gallery** — permanently removes the gallery, its photos, and all build history

### Gallery detail — Jobs tab

History of all build jobs for the gallery, newest first. Click a row to open the live log.

---

## Global settings

Available from the admin navigation. The **locale** set here controls the admin UI language (fr / en / de). Default values for new galleries (author, access mode, download settings, private flag) can also be configured here.

---

## Public landing page

`https://your-domain/` shows a dark-themed listing of all galleries that are not marked private. Each card displays the cover photo, title, photo count, description, and date range.

---

## Access modes

| Mode | Behaviour |
|------|-----------|
| `public` | Anyone with the URL can view; listed on the public landing page |
| `private` | Not listed anywhere; URL is the only protection (no password prompt) |
| `password` | Gallery protected with an Apache `.htaccess` password file |

> Password protection is currently enforced server-side by Apache (`.htaccess`). Caddy-native enforcement is pending.

### Setting a gallery password

In the Settings tab, set **Access** to `password` and fill in the **Password** field. On save, the password is hashed and stored; the plain text is never persisted.

---

## Invite links

Invite links let photographers upload photos without admin access.

### Creating an invite

```
POST /api/invites
```

An invite has:
- **token** — 64-char hex string, used to construct the upload URL: `/invite/<token>`
- **galleryId** — optionally pre-assigns the invite to a specific gallery
- **email** — sends an invite email automatically if `EMAIL_PROVIDER=smtp`
- **expiresIn** — TTL in milliseconds (default: 7 days)
- **singleUse** — if true, invalidated after first use

### Invite flow

1. Admin creates invite via the API → copies the `/invite/<token>` URL
2. Photographer opens the URL and uploads photos
3. Admin sees the photos in the gallery's Photos tab
4. Admin triggers a build

### Revoking

```
POST /api/invites/:id/revoke
```

Revoked and expired invites return `410 Gone`.

---

## Build pipeline

1. Admin clicks **Build** → `POST /api/galleries/:id/build` is called
2. A build job is created with status `queued`
3. The worker picks it up within 2 seconds
4. The worker runs the build engine on the gallery's source photos
5. Log lines are written to the database as they arrive
6. The browser reads `GET /api/jobs/:jobId/stream` (SSE) to display the live log
7. On success, the gallery status is updated to `done` and a gallery-ready email is sent (if SMTP is configured)

### Limits

| Limit | Value |
|-------|-------|
| Max file size | 200 MB per photo |
| Max photos per gallery | 500 |
| Concurrent builds | 1 at a time |
| Upload rate limit | 100 requests/min per IP |

---

## Email notifications

Set `EMAIL_PROVIDER=smtp` and configure the `SMTP_*` variables.

| Template | Trigger | Recipient |
|----------|---------|-----------|
| `invite` | Invite created with an email address | Photographer |
| `gallery-ready` | Successful build, `author_email` set | Author |

With `EMAIL_PROVIDER=null` (default), emails are printed to the API console instead of sent.

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

Returns `200` when healthy, `503` when degraded.

---

## Monorepo structure

```
gallerypack/
├── apps/
│   ├── api/             # Express API server
│   └── web/             # React admin SPA
├── workers/
│   └── builder/         # Background build worker
├── server/              # v2 lightweight server (single-file fallback)
├── docs/
│   ├── architecture/    # ADRs (Architecture Decision Records)
│   └── saas/            # This guide
├── docker-compose.saas.yml
├── Dockerfile.api
├── Dockerfile.worker
└── Caddyfile
```
