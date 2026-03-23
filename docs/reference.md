# SSGG — Configuration reference

> Complete reference for all configuration fields. For quick start, see [README.md](../README.md).

---

## gallery.config.json

Created by `npm run new-gallery` or `npm run new-gallery -- --wizard`.
Located at `src/<gallery-name>/gallery.config.json`.

```json
{
  "project": {
    "name":        "my-shoot",
    "title":       "Summer in Zürich — Portraits & Landscapes",
    "subtitle":    "Documentary series, spring 2025",
    "author":      "Léa Müller-Girard",
    "authorEmail": "lea.muller@example.com",
    "date":        "2025-04-15",
    "location":    "Zürich, Enge District",
    "description": "A cross-perspective look at neighbourhood life.",
    "locale":      "en",
    "access":      "public",
    "private":     false,
    "standalone":  false,
    "allowDownloadImage":   true,
    "allowDownloadGallery": true,
    "autoplay": {
      "slideshowInterval": 3
    }
  }
}
```

### All fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | slugified title | URL slug for the dist folder (e.g. `"my-shoot"`) |
| `title` | string | derived from folder | Gallery title shown in the UI and footer |
| `subtitle` | string | — | Optional subtitle |
| `author` | string | — | Photographer name — shown in footer and legal notice |
| `authorEmail` | string | — | Contact email — shown in legal notice |
| `date` | string | `"auto"` | Shoot date (`YYYY-MM-DD`) or `"auto"` to derive from EXIF |
| `location` | string | — | Location label — fallback if GPS is absent |
| `description` | string | — | Gallery description (not shown in UI, used in legal notice) |
| `locale` | string | `"fr"` | UI language: `fr` / `en` / `de` / `es` / `it` / `pt` |
| `access` | string | `"public"` | Access mode: `"public"` or `"password"` |
| `password` | string | auto-generated | Manual password for `access: "password"` mode |
| `private` | boolean | `false` | Use a hashed (unguessable) URL — hides gallery from index |
| `standalone` | boolean | `false` | Bundle vendor assets into the gallery folder |
| `allowDownloadImage` | boolean | `true` | Allow individual photo download |
| `allowDownloadGallery` | boolean | `true` | Allow full gallery ZIP download |
| `autoplay.slideshowInterval` | number | `3` | Slideshow auto-advance interval in seconds |

### Zero-config builds

`gallery.config.json` is optional. If absent, SSGG applies smart defaults:
- `title` → derived from folder name (`my-shoot` → `My Shoot`)
- `date` → `"auto"` (earliest EXIF date, or today if none)
- `locale` → `"fr"`

A hint is printed suggesting `npm run new-gallery <name>` to create a proper config.

---

## build.config.json

Global build settings. Located at the project root.

```json
{
  "gridSizeSmall":       800,
  "gridSizeBig":         1400,
  "gridSizeMobileSmall": 400,
  "gridSizeMobileBig":   600,
  "fullSize":            3840,
  "quality": {
    "grid": 78,
    "full": 90
  },
  "autoplay": {
    "slideEffect": "fade",
    "slideSpeed":  400
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `gridSizeSmall` | 800 | Width of small grid thumbnails (px) |
| `gridSizeBig` | 1400 | Width of large (2×2) grid thumbnails (px) |
| `gridSizeMobileSmall` | 400 | Mobile small thumbnail width (px) |
| `gridSizeMobileBig` | 600 | Mobile large thumbnail width (px) |
| `fullSize` | 3840 | Max width of full-size lightbox images (px) |
| `quality.grid` | 78 | WebP quality for grid thumbnails (1–100) |
| `quality.full` | 90 | WebP quality for full-size images (1–100) |
| `autoplay.slideEffect` | `"fade"` | Lightbox transition: `"fade"` or `"slide"` |
| `autoplay.slideSpeed` | 400 | Transition duration in ms |

---

## publish.config.json

Optional. Required for `npm run publish`. Copy from `publish.config.example.json`.

```json
{
  "remote":     "user@yourserver.com",
  "remotePath": "/var/www/html/galleries",
  "baseUrl":    "https://yourdomain.com/galleries",
  "rsyncFlags": "-az --delete --progress"
}
```

> **Security:** `publish.config.json` contains server credentials — it is gitignored by default.

---

## Access modes

### Public (default)
Gallery listed in site index, accessible at a predictable URL. No access control.

### Private link (`private: true`)
Output folder becomes a 16-char SHA-256 hash. Hidden from index. Anyone with the URL can view.
Same config always produces the same hash — deterministic.

**Honest disclaimer:** security through obscurity. Hard to guess, not cryptographically enforced.

### Password (`access: "password"`)
Generates `.htaccess` + `.htpasswd` with a memorable auto-generated password.
Password shown in terminal during build and included in `build-summary.json` and `DELIVERY.md`.

```json
{ "project": { "access": "password" } }
```

Or with a manual password:
```json
{ "project": { "access": "password", "password": "my-custom-pass" } }
```

The `.htaccess` `AuthUserFile` path is automatically patched to the correct absolute server path when `npm run publish` is run.

> **Important:** protection covers all assets (HTML, JS, JSON, WebP, ZIP). Protecting only the HTML while leaving images accessible defeats the purpose.

---

## File naming convention

Photo files follow the pattern: `author_projectSlug_date_NNN.webp`

```
philippeVollenweider_quelquesSpectaclesEtLive_20230425_001.webp
leaMullerGirard_summerInZurichPortraitsLandscapes_20250415_012.webp
```

- **author** — camelCase from `project.author`, diacritics stripped
- **projectSlug** — camelCase from `project.title`
- **date** — `project.date` digits only (YYYYMMDD)
- **NNN** — zero-padded index (001, 002, …)
- Source photos are sorted alphabetically before indexing

---

## EXIF metadata

Extracted automatically at build time:

| Field | Source |
|-------|--------|
| Camera | Make + Model |
| Lens | LensModel |
| Date taken | DateTimeOriginal / CreateDate |
| Shutter | ExposureTime (formatted as 1/Ns) |
| Aperture | FNumber (formatted as ƒ/N) |
| ISO | ISO |
| Focal length | FocalLength + FocalLengthIn35mmFormat |
| Location | GPS → reverse-geocoded via Nominatim (no API key, cached in photos.json) |
| Copyright | Copyright tag |

GPS coordinates are resolved to a place name at build time (e.g. `Neuchâtel, Suisse` for locale `fr`).
Results are cached in `photos.json` — subsequent builds are fully offline.
A Google Maps link (📍) is shown next to the location in the EXIF panel.

---

## Output files

After `npm run build my-shoot`:

```
dist/my-shoot/
├── index.html          Gallery page
├── data.js             Build-time constants (PHOTOS array + PROJECT config)
├── gallery.js          Browser-side UI logic
├── photos.json         Manifest: EXIF cache + build metadata
├── build-summary.json  Build stats: photos, size, duration, locale, URL after publish
├── DELIVERY.md         Ready-to-send delivery message (locale-aware)
├── LEGAL.md            Auto-generated legal notice
├── .htaccess           Only when access: "password"
├── .htpasswd           Only when access: "password"
├── img/
│   ├── grid/           WebP grid thumbnails
│   ├── grid-sm/        WebP mobile thumbnails
│   └── full/           WebP full-size images
└── originals/          Source copies (when allowDownloadImage: true)
```

Shared assets live at `dist/vendor/` and `dist/fonts/` (or inside the gallery for standalone mode).

---

## Build commands

| Command | Description |
|---------|-------------|
| `npm run build <name>` | Incremental build (skips existing WebP) |
| `npm run build:all` | Build all galleries + site index |
| `npm run build:clean` | Wipe dist/ and full rebuild |
| `npm run build:force` | Force-reconvert all images |
| `npm run build:webp` | Reconvert WebP only (no HTML) |
| `npm run new-gallery <slug>` | Create gallery scaffold |
| `npm run new-gallery -- --wizard` | Interactive wizard (all options) |
| `npm run serve` | Local preview at http://localhost:3000 |
| `npm run publish <name>` | Upload gallery to remote via rsync |
| `npm run publish -- --all` | Upload all galleries |
| `npm run deploy` | Deploy dist/ to GitHub Pages (safe worktree) |

---

## Keyboard shortcuts (lightbox)

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next photo |
| `Space` | Toggle slideshow |
| `F` | Toggle fullscreen |
| `I` | Toggle EXIF panel |
| `D` | Download current photo |
| `Esc` | Close lightbox (or exit fullscreen first) |

---

## Slideshow

- Default interval: 3 seconds (`autoplay.slideshowInterval`)
- Animated progress bar shows time remaining
- Swipe resets the countdown
- Loops indefinitely
- Pause/resume with Space

---

## Legal notice

Auto-generated at build time in the gallery's locale. Templates in `build/legal-templates/`.
Supports custom templates: add `legal.html` or `legal.txt` in `src/<gallery>/`.
Available tokens: `{{AUTHOR}}`, `{{YEAR}}`, `{{TITLE}}`, `{{EMAIL}}`, `{{DATE}}`.
