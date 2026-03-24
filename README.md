# GalleryPack

> Deliver photo galleries fast.

GalleryPack turns a folder of photos into a clean, ready-to-share static gallery — from a web admin panel or from the command line.

Your photos, your server, your rules.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![Live demo](https://img.shields.io/badge/Live%20demo-%E2%86%92%20View%20gallery-blue)](https://photos.vollenweider.org/gallerypack/)

**Live demo** — [photos.vollenweider.org/gallerypack/](https://photos.vollenweider.org/gallerypack/)

---

## Branches

| Branch | Description |
|--------|-------------|
| `v2` | **Primary branch** — full SaaS admin stack (React + Express + background worker + Caddy) |
| `main` | Stable CLI tool |

---

## v2 — SaaS / hosted stack

The `v2` branch is the primary branch. It runs a multi-service stack managed by Docker Compose. Galleries are created and managed from a React admin panel; builds run in a background worker; Caddy handles HTTPS and static file serving.

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
- **Multi-user team management** — studio members with a role hierarchy; manage the team from `/admin/#/team`
- **Studio roles** — `photographer` / `editor` / `admin` / `owner`, applied globally across the studio
- **Gallery roles** — `viewer` / `contributor` / `editor`, applied per-gallery for fine-grained access control
- **Invite system** — invite new members by email (automatic email if SMTP is configured, fallback invite link otherwise); invitees set their own password on acceptance
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

## CLI mode — build locally, deploy anywhere

The CLI tool runs on your machine, reads a `src/<gallery>/` folder, and produces a self-contained `dist/<gallery>/` folder of static HTML you can host anywhere — Apache, Nginx, GitHub Pages, S3, Netlify.

```
src/my-shoot/photos/*.jpg  →  npm run build  →  dist/my-shoot/  →  your server
```

### Quick start

```bash
# 1. Clone and install
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack
npm install

# 2. Create a gallery scaffold
npm run new-gallery my-shoot
# Drop your photos into src/my-shoot/photos/

# 3. Build
npm run build my-shoot

# 4. Preview locally
npm run serve
# → http://localhost:3000/my-shoot/

# 5a. Publish via rsync (requires publish.config.json)
npm run publish

# 5b. Or export dist/ for FTP / cPanel upload
npm run export -- --apache-path=/var/www/html/galleries
npm run export:zip       # same + creates dist-export.zip
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run build <name>` | Incremental build (skips existing WebP) |
| `npm run build:all` | Build all galleries + site index |
| `npm run build:force` | Force-reconvert all images |
| `npm run build:clean` | Wipe `dist/` and rebuild from scratch |
| `npm run new-gallery <slug>` | Create gallery scaffold |
| `npm run new-gallery:wizard` | Interactive wizard with all options |
| `npm run serve` | Local preview at http://localhost:3000 |
| `npm run export` | Build all + patch `.htaccess` for Apache deployment |
| `npm run export:zip` | Same + create `dist-export.zip` for FTP upload |
| `npm run publish` | Upload one gallery via rsync (interactive) |
| `npm run publish:all` | Upload all galleries via rsync |
| `npm run deploy` | Deploy `dist/` to GitHub Pages |
| `npm run test` | Run invariant tests |
| `npm run clean` | Wipe `dist/` |

### Configuration

`gallery.config.json` — full example:

```json
{
  "project": {
    "title":                "My Gallery",
    "subtitle":             "A brief description",
    "author":               "Jane Smith",
    "authorEmail":          "jane@example.com",
    "date":                 "2025-06-01",
    "location":             "Zürich, Switzerland",
    "locale":               "en",
    "access":               "public",
    "password":             "maple-cloud-42",
    "private":              false,
    "standalone":           false,
    "allowDownloadImage":   true,
    "allowDownloadGallery": true,
    "coverPhoto":           "DSC01234.jpg",
    "autoplay": {
      "slideshowInterval": 3
    },
    "legal": {
      "copyright": "© Jane Smith — All rights reserved"
    }
  }
}
```

See [docs/reference.md](docs/reference.md) for all fields.

### CLI documentation

| Page | Contents |
|------|----------|
| [docs/INSTALL.md](docs/INSTALL.md) | Full installation guide |
| [docs/USAGE.md](docs/USAGE.md) | Admin panel, invite links, photographer flow, i18n |
| [docs/reference.md](docs/reference.md) | All `gallery.config.json` fields |
| [docs/privacy-access.md](docs/privacy-access.md) | Public / private / password modes |
| [docs/output-structure.md](docs/output-structure.md) | What's in `dist/` and why |
| [docs/naming-convention.md](docs/naming-convention.md) | How output files are named |
| [docs/faq.md](docs/faq.md) | Common questions |

---

## Philosophy

> Your photos, your server, your rules.

GalleryPack prioritises **simplicity, predictability, and ownership** over features.
Smart enough that you never have to think. Transparent enough that you always understand what it did.

---

## License

MIT — [Philippe Vollenweider](https://github.com/pvollenweider)
