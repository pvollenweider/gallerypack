# SSGG — Simple Static Gallery Generator

> Turn a folder of photos into a polished, self-contained static gallery — in one command.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Live demo](https://img.shields.io/badge/Live%20demo-%E2%86%92%20View%20gallery-blue)](https://pvollenweider.github.io/ssgg/)

No cloud. No subscription. No backend. Your photos, your server, your rules.

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/pvollenweider/ssgg.git
cd ssgg
npm install

# 2. Create a gallery
npm run new-gallery my-shoot
# → creates src/my-shoot/photos/ and a pre-filled gallery.config.json

# 3. Drop your photos into src/my-shoot/photos/

# 4. Build
npm run build my-shoot

# 5. Preview
npm run serve
# → open http://localhost:3000/my-shoot/
```

The output in `dist/my-shoot/` is ready to deploy anywhere.

---

## What you get

- **Editorial grid** — 3-column layout with big/small tiles, all square-cropped
- **Full-screen lightbox** — keyboard navigation, touch swipe, fullscreen on mobile and desktop
- **Slideshow** — auto-advance with progress bar, configurable interval (default 3s)
- **EXIF overlay** — camera, lens, aperture, shutter, ISO, GPS location (reverse-geocoded, no API key)
- **Google Maps pin** — clickable link from GPS coordinates in the EXIF panel
- **Password protection** — generates `.htaccess` + `.htpasswd` for Apache basic auth
- **Build summary** — photo count, source size, duration → `build-summary.json`
- **Delivery message** — `DELIVERY.md` with URL, credentials, and copy-paste instructions
- **Download** — individual photo or full gallery ZIP (configurable)
- **Legal notice** — auto-generated in your locale (fr / en / de / es / it / pt)
- **Zero runtime dependencies** — plain HTML + CSS + JS + WebP images, works offline

---

## Zero-config build

No `gallery.config.json`? No problem:

```bash
mkdir -p src/my-shoot/photos
# drop photos in src/my-shoot/photos/
npm run build my-shoot
```

Defaults applied automatically:
- Title → derived from folder name (`my-shoot` → `My Shoot`)
- Date → earliest EXIF date, or today if none
- Locale → `fr`

---

## Protect a gallery

```json
{ "project": { "access": "password" } }
```

A memorable password is auto-generated (`ruby-coral-30`), shown during build, and included in `DELIVERY.md`. See [docs/privacy-access.md](docs/privacy-access.md).

---

## Publish

```bash
# Build all galleries + site index
npm run build:all

# Upload to your server via rsync (reads publish.config.json)
npm run publish my-shoot
# → patches .htaccess, uploads, updates DELIVERY.md with live URL

# Deploy to GitHub Pages (safe git worktree)
npm run deploy
```

---

## Build commands

| Command | Description |
|---------|-------------|
| `npm run build <name>` | Incremental build (skips existing images) |
| `npm run build:all` | Build all galleries + site index |
| `npm run build:clean` | Wipe `dist/` and rebuild from scratch |
| `npm run build:force` | Force-reconvert all images |
| `npm run new-gallery <slug>` | Create gallery scaffold (quick) |
| `npm run new-gallery -- --wizard` | Interactive wizard with all options |
| `npm run serve` | Local preview server |
| `npm run publish <name>` | Upload gallery to remote server via rsync |
| `npm run deploy` | Deploy `dist/` to GitHub Pages |

---

## Docs

| Page | Contents |
|------|----------|
| [docs/reference.md](docs/reference.md) | Full configuration reference — all fields, all options |
| [docs/what-is-ssgg.md](docs/what-is-ssgg.md) | What SSGG is, what it is not, when to use it |
| [docs/output-structure.md](docs/output-structure.md) | What's in `dist/` and why |
| [docs/naming-convention.md](docs/naming-convention.md) | Photo file naming logic |
| [docs/privacy-access.md](docs/privacy-access.md) | Public / private-link / password modes |
| [docs/faq.md](docs/faq.md) | Common questions |

---

## License

MIT — [Philippe Vollenweider](https://github.com/pvollenweider)
