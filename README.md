# GalleryPack

> Deliver photo galleries fast.

GalleryPack turns a folder of photos into a clean, ready-to-share static gallery — from the command line or from a web interface.

No accounts. No platform. Just your files, your hosting, your rules.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![Live demo](https://img.shields.io/badge/Live%20demo-%E2%86%92%20View%20gallery-blue)](https://photos.vollenweider.org/gallerypack/)

**Live demo** — [photos.vollenweider.org/gallerypack/](https://photos.vollenweider.org/gallerypack/)

| Gallery | Access |
|---------|--------|
| [Summer in Zürich](https://photos.vollenweider.org/gallerypack/summer-zurich-2025/) | public |
| [Quelques spectacles et live](https://photos.vollenweider.org/gallerypack/quelques-spectacles-et-live/) | public |
| [Insectes](https://photos.vollenweider.org/gallerypack/insectes/) | 🔒 password — user: `gallery` / pwd: `bzz-bzz` |

---

## Branches

| Branch | Description |
|--------|-------------|
| `main` / `v2` | Stable CLI tool + lightweight hosted server (`server/app.js`) |
| `saas` | Full SaaS stack — React admin UI, REST API, job queue, invite system, S3 storage |

---

## Two ways to use GalleryPack

### CLI mode — build locally, deploy anywhere

You run the build tool on your machine. It produces a `dist/` folder of static files you can host anywhere.

```
src/my-shoot/photos/*.jpg  →  npm run build  →  dist/my-shoot/  →  your server
```

### SaaS mode — multi-tenant hosted stack (`saas` branch)

Run the full SaaS stack with Docker Compose. Photographers upload via invite links, you manage galleries from a React admin panel, builds run in a background worker.

```
git checkout saas
cp .env.saas.example .env   # edit ADMIN_PASSWORD + SESSION_SECRET
docker compose -f docker-compose.saas.yml up -d
# → https://your-domain/admin
```

See [docs/saas/quick-install.md](docs/saas/quick-install.md) for the full 5-minute guide.

### Hosted mode (v2) — lightweight single-tenant server

You run the GalleryPack server (Docker recommended). Photographers upload from a browser, you manage everything from an admin panel, builds happen automatically.

```
Photographer → /upload/token → admin panel → build → dist/ → galleries served
```

---

## Quick start — CLI

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

The `dist/my-shoot/` folder is self-contained static HTML — deploy on Apache, Nginx, GitHub Pages, S3, Netlify, anywhere.

---

## Quick start — Hosted (Docker)

```bash
git clone https://github.com/pvollenweider/gallerypack.git
cd gallerypack

# Development (Node.js serves everything on :3000)
cp docker-compose.yml  # edit ADMIN_PASSWORD and SESSION_SECRET
docker compose up -d
# → http://localhost:3000/admin

# Production (Apache serves dist/ statically, Node.js handles admin/api)
cp deploy/.env.example deploy/.env   # edit all values
docker compose -f deploy/docker-compose.prod.yml up -d
# → configure Apache with deploy/apache-vhost.conf
```

See [docs/INSTALL.md](docs/INSTALL.md) for the full installation guide.

---

## What you get

- **Responsive grid** — 3-column layout with big/small tiles, square-cropped thumbnails
- **Full-screen lightbox** — keyboard navigation, touch swipe, fullscreen
- **Slideshow** — auto-advance with configurable interval
- **EXIF overlay** — camera, lens, aperture, shutter, ISO, GPS location
- **Download** — individual photo or full gallery ZIP (configurable per gallery)
- **Legal notice** — auto-generated in your locale (fr / en / de / es / it / pt)
- **Delivery message** — `DELIVERY.md` ready to copy-paste and send to your client
- **Multilingual UI** — 6 languages (fr / en / de / es / it / pt), auto-detected

---

## Access modes

| Mode | How | When to use |
|------|-----|-------------|
| **Public** | Standard URL, listed in site index | Open portfolio, event photos |
| **Private link** | Hashed unguessable URL, hidden from index | Draft preview, personal sharing |
| **Password** | Apache Basic Auth via `.htaccess` | Client delivery, confidential work |

> Password protection is enforced server-side by Apache (`.htaccess`). It works out of the box with Apache deployments. See [docs/privacy-access.md](docs/privacy-access.md).

---

## Configuration

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

Common scenarios:

```json
// Client delivery with password and full download
{ "project": { "access": "password", "allowDownloadGallery": true } }

// Public portfolio, no download
{ "project": { "access": "public", "allowDownloadImage": false, "allowDownloadGallery": false } }

// Private preview link (no password prompt, hidden from index)
{ "project": { "private": true } }

// Set a specific cover photo (shown in gallery list)
{ "project": { "coverPhoto": "DSC08753.jpg" } }
```

See [docs/reference.md](docs/reference.md) for all fields.

---

## Commands

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
| `npm run dev` | Start hosted server (dev mode, port 3000) |

---

## Documentation

| Page | Contents |
|------|----------|
| [docs/INSTALL.md](docs/INSTALL.md) | Full installation guide — CLI, Docker dev, Apache+Docker prod, Nginx |
| [docs/USAGE.md](docs/USAGE.md) | Admin panel, invite links, photographer flow, i18n |
| [docs/reference.md](docs/reference.md) | All `gallery.config.json` fields |
| [docs/privacy-access.md](docs/privacy-access.md) | Public / private / password modes |
| [docs/output-structure.md](docs/output-structure.md) | What's in `dist/` and why |
| [docs/naming-convention.md](docs/naming-convention.md) | How output files are named |
| [docs/faq.md](docs/faq.md) | Common questions |
| [deploy/DEPLOY.md](deploy/DEPLOY.md) | Apache + Docker production deployment |

**SaaS branch (`saas`):**

| Page | Contents |
|------|----------|
| [docs/saas/quick-install.md](docs/saas/quick-install.md) | 5-minute install with Docker Compose |
| [docs/saas/getting-started.md](docs/saas/getting-started.md) | Architecture, env vars, admin panel, access control, email |
| [docs/saas/api-reference.md](docs/saas/api-reference.md) | All REST API endpoints |

---

## Philosophy

> Your photos, your server, your rules.

GalleryPack prioritises **simplicity, predictability, and ownership** over features.
Smart enough that you never have to think. Transparent enough that you always understand what it did.

---

## License

MIT — [Philippe Vollenweider](https://github.com/pvollenweider)
