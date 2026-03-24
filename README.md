# GalleryPack

> Deliver photo galleries fast.

GalleryPack turns a folder of photos into a clean, ready-to-share static gallery — from a web admin panel or from the command line.

Your photos, your server, your rules.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![Live demo](https://img.shields.io/badge/Live%20demo-%E2%86%92%20View%20gallery-blue)](https://photos.vollenweider.org/gallerypack/)

**Live demo** — [photos.vollenweider.org/gallerypack/](https://photos.vollenweider.org/gallerypack/)

> **Architecture** — All new code goes in `apps/`, `workers/`, or `packages/`. No exceptions.

---

## SaaS / hosted stack

`main` is the primary branch. It runs a multi-service stack managed by Docker Compose. Galleries are created and managed from a React admin panel; builds run in a background worker; Caddy handles HTTPS and static file serving.

### Stack

| Component | Description |
|-----------|-------------|
| `apps/web` | React SPA — admin panel |
| `apps/api` | Express REST API (port 4000, internal) |
| `workers/builder` | Background worker — processes photo builds from a queue |
| `proxy` | Caddy — HTTPS termination, static gallery serving |

### Quick start

```bash
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack
cp .env.saas.example .env    # edit ADMIN_PASSWORD and SESSION_SECRET
docker compose -f docker-compose.saas.yml up -d
```

- Admin panel: `https://localhost/admin/`
- Public gallery listing: `https://localhost/`

### Features

- **Gallery management** — create, rename, delete galleries from the admin panel
- **Photo upload** — drag & drop files or upload an entire folder; per-file progress
- **EXIF date ranges** — date ranges extracted automatically from photo EXIF metadata
- **Cover photo picker** — select the cover image from the uploaded photos
- **i18n** — admin UI and gallery viewer in French, English, and German (fr / en / de)
- **Private and password gallery indicators** — badges in the admin gallery grid
- **Disk usage display** — per-gallery storage size shown in the gallery list
- **Background builds** — build jobs queued and processed by the worker; live log streamed to the browser via SSE
- **Multi-user team management** — studio members with a role hierarchy; manage the team from `/admin/team`
- **Studio roles** — `photographer` / `collaborator` / `admin` / `owner`; collaborators, admins and owners have implicit access to all galleries
- **Gallery roles** — `contributor` / `editor`, assigned per-gallery to photographers only; determines what a photographer can do in a specific gallery
- **Invite system** — photographers are invited directly from the gallery access panel (auto-assigned); collaborators and admins are invited from the Team page; invitees set their own password on acceptance
- **SMTP configuration in the admin UI** — configure SMTP from the Settings page without restarting; env vars still supported as fallback
- **Upload-done notification** — after uploading, photographers can notify gallery editors and admins with one click
- **Profile page** — photographers and editors can update their display name and view their gallery accesses
- **Viewer tokens** — share private galleries with time-limited, revocable links (no account required)
- **Public landing page** — dark-themed index listing all non-private galleries

### Access modes

| Mode | Behaviour | When to use |
|------|-----------|-------------|
| **Public** | Anyone with the URL can view; listed on the public landing page | Open portfolio, event photos |
| **Private** | Not listed anywhere; URL is the only protection (no password prompt) | Draft preview, personal sharing |
| **Password** | Gallery protected with an Apache `.htaccess` password file | Client delivery, confidential work |

> Password protection is enforced server-side by Apache (`.htaccess`). It is currently Apache-only. Caddy-native enforcement is pending.

### Documentation

| Page | Contents |
|------|----------|
| [docs/saas/quick-install.md](docs/saas/quick-install.md) | 5-minute install with Docker Compose |
| [docs/saas/getting-started.md](docs/saas/getting-started.md) | Admin panel, roles, team management, settings, access control |
| [docs/saas/api-reference.md](docs/saas/api-reference.md) | All REST API endpoints |

---

## Philosophy

> Your photos, your server, your rules.

GalleryPack prioritises **simplicity, predictability, and ownership** over features.
Smart enough that you never have to think. Transparent enough that you always understand what it did.

---

## License

MIT — [Philippe Vollenweider](https://github.com/pvollenweider)
