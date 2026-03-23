# GalleryPack — Roadmap & scope

> This document records **what v1 is**, what it deliberately is not, and what comes next.
> It is the single source of truth for scope decisions.

---

## v1 scope (current — stable)

These features are shipped, stable, and covered by tests or real-world use.

### Core pipeline
- Build a static gallery from a folder of photos (`src/<name>/photos/`)
- WebP conversion at multiple resolutions (grid, grid-sm, full)
- EXIF extraction (camera, lens, aperture, shutter, ISO, focal, GPS)
- GPS reverse-geocoding via Nominatim — cached in `photos.json`, no API key
- Incremental builds (skip already-converted images)
- Force-rebuild mode (`--force`)

### Output contract
- Self-contained `dist/<name>/` folder: HTML + JS + WebP — no backend required
- Stable, documented output structure — see [output-structure.md](output-structure.md)
- `photos.json` manifest with `schemaVersion` for forward compatibility
- `build-summary.json` with build metadata (photos, size, duration, URL after publish)
- `DELIVERY.md` — locale-aware ready-to-send delivery message
- `LEGAL.md` — auto-generated legal notice (6 locales)

### Gallery UI
- Responsive editorial grid (3-column, big/small tiles, square-cropped)
- Full-screen lightbox with keyboard navigation, touch swipe, fullscreen
- Slideshow with progress bar and configurable interval
- EXIF overlay panel with Google Maps link for GPS
- Individual photo download + full gallery ZIP (both configurable)

### Access & sharing
- Public (default) — predictable URL, listed in site index
- Private link (`private: true`) — 16-char SHA-256 hash, hidden from index
- Password protection (`access: "password"`) — Apache basic auth, `.htaccess` + `.htpasswd`
- Lock icon on password-protected gallery cards in site index
- Cover thumbnail exposed outside protected zone (`dist/covers/`) for site index display

### Multi-gallery
- Site index page (`dist/index.html`) listing all public galleries
- Date and location resolved from EXIF if not set in config

### CLI & workflow
- `npm run new-gallery <slug>` — scaffold with pre-filled config
- `npm run new-gallery:wizard` — interactive wizard
- `npm run build <name>` / `build:all` / `build:clean` / `build:force`
- `npm run serve` — local preview server
- `npm run publish -- <name>` / `-- --all` — rsync upload, `.htaccess` path patching
- `npm run deploy` — GitHub Pages via safe isolated git worktree
- `npm run test` — pure-function invariant tests (46 cases)

### Configuration
- Zero-config build (smart defaults applied if `gallery.config.json` absent)
- Full config: title, author, date, location, locale, access, password, download flags, autoplay interval
- Config validation with human-readable warnings (unknown fields, bad date format, invalid locale/access)

---

## Explicit non-goals for v1

These are **not bugs** — they are deliberate scope decisions.

- No web upload interface or admin panel
- No video support — still images only
- No comments, ratings, or client proofing workflow
- No database or server-side logic at runtime
- No multi-user or role management
- No built-in CDN or hosting — you provide the server
- No SaaS — no accounts, no subscriptions, no tracking
- No password rotation command — change the field, rebuild, re-publish
- No expiration or time-limited access
- No `.htaccess` support on GitHub Pages / Netlify / Vercel (CDN hosts ignore it — use `private: true` there)

---

## Canonical workflow (recommended path)

If you want to use GalleryPack normally, this is the path:

```bash
# 1. Create
npm run new-gallery my-shoot

# 2. Add photos
#    → drop files into src/my-shoot/photos/

# 3. Build
npm run build my-shoot

# 4. Preview locally
npm run serve

# 5. Publish (requires publish.config.json)
npm run publish -- my-shoot

# 6. Send to client
#    → copy-paste DELIVERY.md
```

Everything else (`build:all`, `build:clean`, `--force`, `--wizard`, `--all`) is a variation of this path for specific situations.

---

## Known debt (next priorities)

These are not bugs but structural improvements that will reduce future risk.

### Code
- **`index.js` is a monolith** — the build pipeline, HTML generation, EXIF logic, and publish helpers are all in one file. Splitting into `build/gallery.js`, `build/html.js`, `build/exif.js` would reduce cognitive load and make each part independently testable.
- **Config resolution is implicit** — the distinction between input config (from `gallery.config.json`), resolved config (date/location derived from EXIF), and derived build state (distName, paths) happens inline throughout `buildGallery()`. Formalising this as three explicit steps would prevent coherence bugs.
- **Test coverage gap** — the 46 tests cover all pure functions in `utils.js`. What is not covered: config resolution, EXIF derivation in `collectBuiltGalleries()`, cover copy logic, and the HTML generation output.

### Documentation
- `docs/quick-start.md` — a shorter, more direct entry point for first-time users
- `docs/troubleshooting.md` — common errors and how to fix them

### Features (when real usage shows the need)
- Password rotation command (`npm run rotate-password <name>`)
- Manifest migration helper for schema version bumps
- Explicit build config versioning / migration strategy

---

## Not planned (unless real usage changes the picture)

- Web frontend / SaaS layer
- Video support
- Comment system
- Multi-user upload interface
- Expiration / time-limited access

---

*Last updated: 2026-03-23 — v1.1.2*
