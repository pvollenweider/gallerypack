# SSGG — Simple Static Gallery Generator

> A Node.js build tool that turns a folder of photos into a **self-contained static photo gallery** ready to share, deploy, or archive — with no server, no cloud service, and no runtime dependencies.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![Live demo](https://img.shields.io/badge/Live%20demo-%E2%86%92%20View%20gallery-blue)](https://pvollenweider.github.io/ssgg/)

---

## What is SSGG?

SSGG started as a personal tool — a way to share photo shoots with clients and friends without surrendering images to a cloud platform, without recurring subscription costs, and without the bloat of a full CMS. Over time it grew into something more polished, and here it is.

The philosophy is simple: **your photos, your server, your rules.** You keep full control of the files, the design, and the URL. Nothing is tracked, nothing expires, nothing breaks when a third-party service changes its terms.

You drop your photos into a folder, run a single command, and get a polished, self-contained gallery folder that you can:

- **Put on any web server** (Apache, Nginx, GitHub Pages, Netlify, Vercel, S3…)
- **Send as a ZIP** to a client or colleague
- **Copy to a USB drive** and open directly in a browser
- **Archive** alongside your original files

The output is plain HTML + CSS + JavaScript + images. No framework, no database, no backend. Once built, the gallery works entirely offline.

---

## Table of Contents

- [Features](#features)
- [Who is this for?](#who-is-this-for)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
  - [Gallery config](#srcgallerygalleryconfigjson--gallery-metadata)
  - [Build config](#buildconfigjson--global-build-settings)
- [Build commands](#build-commands)
- [Output structure](#output-structure)
- [Deploying to a server](#deploying-to-a-server)
- [Multiple galleries](#multiple-galleries--index-page)
- [File naming convention](#file-naming-convention)
- [Grid layout](#grid-layout)
- [Keyboard shortcuts](#keyboard-shortcuts-lightbox)
- [Slideshow](#slideshow)
- [Legal notice & templates](#legal-notice)
- [ZIP download](#zip-download)
- [Front-end stack](#front-end-stack)
- [Contributing](#contributing)

---

## Features

- **Smart WebP conversion** via Sharp — 4K-aware sizing based on grid position
- **Editorial grid** — 3-column layout with alternating 2×2 / 1×1 tiles, all square-cropped
- **Full-screen lightbox** — keyboard navigation (← →), multi-level ESC, touch swipe on mobile, fullscreen on Android & desktop
- **Slideshow mode** — auto-advance with configurable interval, fullscreen, animated progress bar, pause/resume, loops, swipe resets the countdown
- **iOS PWA support** — `apple-mobile-web-app-capable` meta tag: add to Home Screen for a true fullscreen experience on iPhone/iPad
- **EXIF metadata overlay** — camera, lens, aperture, shutter speed, ISO, focal length
- **Thumbnail filmstrip** — scrollable strip synced with the active slide
- **Adaptive title colour** — light or dark text computed from image brightness at build time
- **Download originals** — per-image button (Web Share API on iOS → saves directly to Photos) + one-click ZIP of all originals (client-side, no server)
- **Configurable download permissions** — `allowDownloadImage` / `allowDownloadGallery` flags to disable buttons per gallery
- **Multilingual legal notice** — popup auto-translated to the visitor's browser language (EN · FR · DE · IT · ES · PT), with customisable per-gallery templates
- **Poppins font served locally** — fully offline, no external font requests at runtime
- **Consistent file naming** — source files are renamed at build time using an `author_title_date_NNN` convention
- **Multiple galleries** — each `src/<name>/` subfolder builds an independent gallery; an index page lists all public ones
- **Private galleries** — SHA-256-hashed output folder name makes the URL unguessable
- **Standalone mode** — vendor and font assets copied directly into the gallery folder for fully portable distribution
- **Incremental builds** — skips already-converted images; `--force` to reconvert all

---

## Who is this for?

| Profile | Typical use |
|---------|-------------|
| **Photographer** | Share a shoot with a client, publish a portfolio series, archive a project with its legal notice |
| **Developer** | Embed in a larger site, customise the templates, automate builds in CI |
| **Archivist / editor** | Bundle photos + metadata + copyright notice in a single portable folder |

You don't need to be a developer to use SSGG — but you do need Node.js installed and comfortable running a couple of terminal commands.

---

## Installation

### 1 — Install Node.js

SSGG requires **Node.js 18 or later** and **npm 9 or later**.

- **macOS / Linux**: use [nvm](https://github.com/nvm-sh/nvm) (recommended) or download from [nodejs.org](https://nodejs.org/en/download)
  ```bash
  # With nvm (installs both node and npm):
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  nvm install 20
  nvm use 20
  ```
- **Windows**: download the LTS installer from [nodejs.org](https://nodejs.org/en/download) — it installs both Node.js and npm automatically.
- **Verify the installation**:
  ```bash
  node --version   # should print v18.x or higher
  npm --version    # should print 9.x or higher
  ```

> Full Node.js installation guide: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm

### 2 — Clone the repository and install dependencies

```bash
git clone https://github.com/pvollenweider/ssgg
cd ssgg
npm install
```

`npm install` downloads Sharp, exifr, and piexifjs into `node_modules/`. This is a one-time step. The vendor JS files used by the gallery (GLightbox, JSZip, tiny-slider) are downloaded separately at first build.

### 3 — (Optional) Generate example photos

```bash
npm run setup:example
```

This creates 15 placeholder JPEGs with realistic EXIF data in `src/example-gallery/photos/` so you can preview the gallery immediately without needing real photos.

---

## Quick start

```bash
# After installation:
npm run build:all   # build all galleries in src/
npm run serve       # preview at http://localhost:3000
```

Or to work with your own photos:

1. Create `src/my-gallery/` and add a `gallery.config.json` (see [Configuration](#configuration) below)
2. Drop your photos into `src/my-gallery/photos/` (JPG, PNG, HEIC, TIFF, AVIF…)
3. `npm run build my-gallery` — or `npm run build:all`
4. Preview with `npm run serve`, or open `dist/my-gallery/index.html` directly

---

## Configuration

### `src/<gallery>/gallery.config.json` — gallery metadata

Create one config file per gallery. All fields are optional — sensible defaults are used for anything omitted.

```json
{
  "project": {
    "name":               "summer-zurich-2025",
    "title":              "Summer in Zürich — Portraits & Landscapes",
    "subtitle":           "Documentary series, spring 2025",
    "author":             "Jane Smith",
    "authorEmail":        "jane@example.com",
    "date":               "2025-04-15",
    "location":           "Zürich, Enge District",
    "description":        "A cross-perspective look at neighbourhood life.",
    "locale":             "en",
    "private":            false,
    "standalone":         false,
    "allowDownloadImage":   true,
    "allowDownloadGallery": true,
    "autoplay": {
      "slideshowInterval": 3
    }
  }
}
```

| Field                  | Default | Description |
|------------------------|---------|-------------|
| `title`                | `"My Gallery"` | Gallery title — shown in the header and used to derive the output folder name |
| `author`               | `"Unknown"` | Photographer name — shown in the copyright label and legal notice |
| `name`                 | _(slug from title)_ | URL-friendly output folder name under `dist/` (overrides the auto-derived slug) |
| `subtitle`             | — | Short subtitle displayed under the title |
| `authorEmail`          | — | Contact email shown in the legal notice popup and in the ZIP |
| `date`                 | _(build date)_ | Shoot date `YYYY-MM-DD` — used in the header and as the copyright year. Set to `"auto"` to derive the date automatically from EXIF (`DateTimeOriginal` of the earliest photo) |
| `location`             | — | Shooting location shown in the header |
| `description`          | — | Free-text description — also injected as `<meta name="description">` for SEO |
| `locale`               | `"en"` | Force the UI language and HTML `lang` attribute: `en`, `fr`, `de`, `it`, `es`, `pt`. The legal notice popup additionally respects the visitor's browser language. |
| `private`              | `false` | `true` → output folder gets a SHA-256 hash name (unguessable URL); gallery is excluded from the index |
| `standalone`           | `false` | `true` → vendor JS/CSS and fonts are embedded in the gallery folder (fully self-contained, no shared assets needed) |
| `allowDownloadImage`   | `true` | `false` → hides the per-photo download button. When both download flags are `false`, the `originals/` folder is not generated at build time. |
| `allowDownloadGallery` | `true` | `false` → hides the "Download all" ZIP button |
| `autoplay.slideshowInterval` | `3` | Slideshow auto-advance interval in seconds |

#### How the output folder name is chosen

| Condition | Output folder |
|-----------|---------------|
| `name` field set | value of `name` (used verbatim) |
| No `name`, `private: false` | slug derived from `title` (lowercase, ASCII, hyphens) |
| `private: true` | 16-char SHA-256 hex hash based on author + title + date |

---

### `build.config.json` — global build settings

This file sits at the project root and applies to all galleries. Sensible defaults are used if the file is absent.

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

| Field                  | Default  | Description |
|------------------------|----------|-------------|
| `gridSizeSmall`        | `800`    | WebP width (px) for 1×1 grid tiles — covers iPad Pro 13" retina at full resolution |
| `gridSizeBig`          | `1400`   | WebP width (px) for 2×2 grid tiles — covers iPad Pro 13" retina pixel-perfect |
| `gridSizeMobileSmall`  | `400`    | WebP width (px) for the `img/grid-sm/` mobile variant of 1×1 tiles — served via `srcset` to phones, cutting ~70% of bandwidth on slow connections |
| `gridSizeMobileBig`    | `600`    | WebP width (px) for the `img/grid-sm/` mobile variant of 2×2 tiles |
| `fullSize`             | `3840`   | Max dimension for the full-resolution WebP shown in the lightbox — covers 4K displays |
| `quality.grid`         | `78`     | WebP compression quality for thumbnails (0–100). 78 is visually identical to 85 at these sizes, ~25% lighter. |
| `quality.full`         | `90`     | WebP compression quality for lightbox images (0–100) |
| `preloadCount`         | `6`      | Number of grid thumbnails preloaded in `<head>` via `<link rel="preload">` for fastest LCP |
| `autoplay.slideEffect` | `"fade"` | Lightbox transition animation: `slide`, `fade`, `zoom`, or `none` |
| `autoplay.slideSpeed`  | `400`    | Transition duration in milliseconds (50–2000) |

> **Changing grid sizes requires `--force`** to reconvert existing images: `node build/index.js my-gallery --force`

---

## Build commands

### Creating a new gallery

```bash
# Quick — creates src/<slug>/ with a minimal config and an empty photos/ folder:
npm run new-gallery my-project

# Wizard — interactive prompts for every field (title, author, date, locale…):
npm run new-gallery:wizard
```

After running either command, follow the printed instructions: edit the generated `gallery.config.json` and drop your photos into the `photos/` subfolder.

### Building and previewing

| Command                         | Description |
|---------------------------------|-------------|
| `npm run build`                 | Incremental build — prompts to pick a gallery when several exist |
| `npm run build:all`             | Build every gallery found in `src/` |
| `npm run build:force`           | Reconvert all images from scratch for all galleries (keeps downloaded vendors/fonts) |
| `npm run build:clean`           | Wipe `dist/` entirely, then rebuild everything |
| `npm run clean`                 | Delete `dist/` without rebuilding |
| `npm run serve`                 | Start a local HTTP server at `http://localhost:3000` |
| `npm run new-gallery <slug>`    | Scaffold a new gallery folder with a minimal config |
| `npm run new-gallery:wizard`    | Interactive wizard to create a fully configured gallery |
| `npm run setup:example`         | Generate 15 sample photos + config for the example gallery (skip existing) |
| `npm run setup:example:force`   | Regenerate all 15 sample photos, overwriting existing ones |

You can also target a specific gallery or pass flags directly:

```bash
node build/index.js my-gallery            # build one gallery by folder name
node build/index.js my-gallery --force    # force-reconvert all its images
node build/index.js --all                 # build every gallery
```

> **When to use `build:clean`** — whenever you rename, add, or remove source photos. Incremental builds skip images that are already converted, so deletions are not automatically reflected in `dist/`.

---

## Output structure

SSGG produces a `dist/` folder. Its exact layout depends on whether galleries use standalone mode.

### Standard layout (`standalone: false` — the default)

Vendor assets (JS libraries, fonts) live in a shared folder at the `dist/` root, referenced by all galleries. This is the most efficient setup when you are hosting multiple galleries on the same domain.

```
dist/
├── index.html              ← index page — cards linking to all public galleries
├── vendor/                 ← shared: GLightbox, tiny-slider, JSZip
├── fonts/                  ← shared: Poppins woff2 files
│
├── summer-zurich-2025/
│   ├── index.html          ← the gallery page
│   ├── gallery.js          ← UI logic (lightbox, grid, ZIP, legal notice)
│   ├── data.js             ← photo manifest (names, EXIF, brightness flags)
│   ├── LEGAL.md            ← plain-text copyright notice
│   ├── photos.json         ← build manifest (used for incremental builds)
│   ├── img/
│   │   ├── grid/           ← square-cropped WebP thumbnails (desktop)
│   │   ├── grid-sm/        ← smaller WebP thumbnails for mobile srcset
│   │   └── full/           ← full-resolution WebP for the lightbox
│   └── originals/          ← JPEG copies for per-image download (omitted when both download flags are false)
│
└── another-gallery/
    └── …
```

**To deploy:** copy the **entire `dist/` folder** to your server. All paths are relative — the folder can sit at the root or in a subdirectory.

### Standalone layout (`standalone: true`)

Each gallery folder is fully self-contained. Vendor and font assets are copied inside it. Use this when you want to distribute or archive a single gallery independently — as a ZIP attachment, on a USB drive, or on a page that is unrelated to other galleries.

```
dist/
└── summer-zurich-2025/
    ├── index.html
    ├── gallery.js
    ├── data.js
    ├── LEGAL.md
    ├── photos.json
    ├── vendor/             ← copy of dist/vendor/
    ├── fonts/              ← copy of dist/fonts/
    ├── img/
    │   ├── grid/
    │   ├── grid-sm/
    │   └── full/
    └── originals/
```

**To deploy a standalone gallery:** copy only the `dist/<gallery-name>/` folder. It works anywhere without needing its siblings.

---

## Deploying to a server

### Option A — Static hosting (simplest)

Any service that serves static files works out of the box:

| Service | How |
|---------|-----|
| **GitHub Pages** | Push `dist/` to a `gh-pages` branch, or configure Pages to serve from `/docs` |
| **Netlify** | Drag and drop `dist/` in the Netlify dashboard, or connect the repo and set publish directory to `dist` |
| **Vercel** | `vercel --prod` from the repo root (set output directory to `dist`) |
| **Amazon S3** | Sync with `aws s3 sync dist/ s3://your-bucket --delete`, enable static website hosting |
| **Any VPS / shared host** | Upload the `dist/` contents via FTP/SFTP to `public_html/` or `www/` |

### Option B — Local server (development / LAN sharing)

```bash
npm run serve          # http://localhost:3000
npm run serve -- 8080  # custom port
```

> **Important:** the ZIP download feature uses `fetch()`, which browsers block on `file://` URLs. Always use a local HTTP server (or deploy to a web host) when you want the ZIP button to work.

### Option C — Offline / portable

Set `"standalone": true` in the gallery config, build, then copy or zip the gallery folder. It opens directly from disk in any modern browser (except for the ZIP feature, which requires HTTP).

### What goes on the server

For a **standard** (non-standalone) deployment, upload the full `dist/` tree — including `vendor/` and `fonts/`. Missing these folders will break the gallery.

For a **standalone** deployment, you only need the individual `dist/<gallery-name>/` folder.

There is no server-side code, no database, and no build step required on the server. Any host that can serve static files is sufficient.

---

## Multiple galleries & index page

Create one subfolder per gallery under `src/`:

```
src/
├── portraits-paris-2024/
│   ├── gallery.config.json
│   └── photos/
├── reportage-berne-2025/
│   ├── gallery.config.json
│   └── photos/
└── private-event/
    ├── gallery.config.json   ← "private": true
    └── photos/
```

After `npm run build:all`, SSGG generates `dist/index.html` — an overview page showing all **public** galleries as clickable cards (the first photo of each gallery is used as the card background).

Galleries marked `"private": true` are excluded from the index and their output folder name is replaced with a 16-character SHA-256 hash, making the URL unguessable without sharing it deliberately.

---

## File naming convention

**Source filenames are discarded.** All output files are renamed at build time using a deterministic convention based on the gallery metadata:

```
{author}_{title}_{date}_{NNN}
```

**Example:** a photo from a gallery by Jane Smith, titled "Summer in Zürich", dated 2025-04-15, will become:

```
janeSmith_summerInZurich_20250415_001.webp   ← grid thumbnail
janeSmith_summerInZurich_20250415_001.webp   ← full lightbox image (same base name)
janeSmith_summerInZurich_20250415_001.jpg    ← original JPEG copy
```

**Why rename?** Camera files (`DSC_0042.JPG`, `IMG_3891.HEIC`) carry no meaningful information for a viewer or archivist. The convention creates a stable, human-readable identity for each image that remains consistent across builds.

**Rules applied to each segment:**

| Rule | Example |
|------|---------|
| camelCase — first word lowercase, subsequent words capitalised | `janeSmith`, `summerInZurich` |
| Accents stripped | `é` → `e`, `ü` → `u`, `ç` → `c` |
| Special characters removed | `-`, `(`, `'`, `&` etc. are discarded |
| Sequential index — 3-digit zero-padded | `001`, `002` … `999` |
| Photos are sorted by original filename before numbering | alphabetical / chronological if named by camera |

The same base name is used for the grid WebP, the full WebP, and the original JPEG copy — only the extension differs.

> **Incremental builds preserve numbering.** If you add new photos, run `build:clean` to renumber from scratch and keep the sequence consistent.

---

## Grid layout

Photos are arranged in a repeating **12-photo / 6-row** pattern across 3 equal columns. Two "big" tiles (2×2) create visual rhythm; the remaining 10 are standard 1×1 tiles. All tiles are square-cropped.

```
+----------------+-------+   rows 1–2
|                |  1×1  |
|   2×2 (big)    +-------+
|                |  1×1  |
+-------+--------+-------+   row 3
|  1×1  |  1×1   |  1×1  |
+-------+--------+-------+   rows 4–5
|  1×1  |                |
+-------+   2×2 (big)    |
|  1×1  |                |
+-------+-------+--------+   row 6
|  1×1  |  1×1  |  1×1   |
+-------+-------+--------+
```

The pattern repeats every 12 photos. Galleries with fewer than 12 photos show a partial first cycle.

---

## Keyboard shortcuts (lightbox)

| Key / control | Action |
|---------------|--------|
| `←` / `→` | Previous / next photo |
| `Escape` | EXIF overlay open → close EXIF; otherwise → close lightbox |
| `i` button | Toggle EXIF metadata overlay (camera, lens, aperture, shutter, ISO…) |
| `↓` button | Download current photo — on iOS 15+ opens the native share sheet (tap **Save to Photos**); on other platforms saves the JPEG directly |
| `⤢` button | Toggle fullscreen — available on Android and desktop (the Fullscreen API is not supported by iOS Safari; use "Add to Home Screen" for a fullscreen-like PWA experience) |
| `▶` / `⏸` button | Start / pause the slideshow — auto-advances every `slideshowInterval` seconds, enters fullscreen automatically, loops back to the first photo |
| Swipe left/right | Previous / next photo (touch devices); also resets the slideshow countdown when the slideshow is active |

---

## Slideshow

Press the **▶** button in the lightbox toolbar (or the **⏸** overlay button while playing) to start and pause the slideshow. While running:

- The gallery **automatically advances** at the interval set by `autoplay.slideshowInterval` (per-gallery, default 3 s) — you can also change it live with the interval selector in the toolbar (2 s / 3 s / 5 s / 8 s / 10 s)
- The lightbox **enters fullscreen** automatically
- The slideshow **loops back** to the first photo after the last one
- **Swipe left/right** on touch devices jumps to the next/previous photo and resets the countdown
- **Controls auto-hide** after 2.5 seconds of inactivity (cursor, overlay buttons, title) — move the mouse or tap to reveal them again

The transition style (`fade` by default) and speed can be changed globally in `build.config.json` via `autoplay.slideEffect` and `autoplay.slideSpeed`.

> **iOS note:** The Fullscreen API is not available in iOS Safari. Add the gallery to your Home Screen ("Add to Home Screen" in the share sheet) for a fullscreen-like PWA experience — `apple-mobile-web-app-capable` is already set.

---

## Legal notice

Each gallery includes a **Legal notice** link in the footer that opens a popup with a copyright notice. The notice is designed around **Swiss copyright law (CopA / LDA / URG)** but the templates are fully customisable.

### Language selection

The notice language is determined in this order:

1. `locale` field in `gallery.config.json` (forces a specific language for all visitors)
2. Visitor's browser language (`navigator.language`)
3. Falls back to English

Supported languages out of the box: **EN · FR · DE · IT · ES · PT**

### Customising the legal notice

Place one or both template files in the gallery source folder to override the built-in notice:

```
src/<gallery>/
├── legal.html    ← HTML shown in the popup
└── legal.txt     ← plain text included in the ZIP download
```

If no custom file is found, the build automatically loads the corresponding locale template from `build/legal-templates/legal.<locale>.html`, falling back to `legal.en.html`.

### Token substitution

Both `legal.html` and `legal.txt` support placeholders that are resolved at build time:

| Token | Value |
|-------|-------|
| `{{title}}` | Gallery title |
| `{{subtitle}}` | Gallery subtitle |
| `{{author}}` | Photographer name |
| `{{authorEmail}}` | Contact email |
| `{{year}}` | Copyright year (derived from `date`, or current year) |
| `{{date}}` | Full ISO date |
| `{{location}}` | Shooting location |
| `{{description}}` | Free-text description |

Conditional blocks are also supported — the block is rendered only when the field has a value:

```html
{{#if location}}<p>Taken in {{location}}.</p>{{/if}}
{{#if authorEmail}}<a href="mailto:{{authorEmail}}">{{authorEmail}}</a>{{/if}}
```

### ZIP legal notice

The **Download all** ZIP includes a `LEGAL_NOTICE.txt` file in the gallery's locale (English fallback if the locale is not among the 6 supported languages).

---

## ZIP download

The **Download all** button (top right of the gallery) creates a ZIP archive entirely in the browser — no server request is needed. JSZip is loaded on-demand only when the button is clicked (not at page load). The ZIP contains:

- All original JPEG files (full resolution)
- `LEGAL_NOTICE.txt` — the copyright notice in the gallery's locale

Both download buttons can be disabled per gallery via `allowDownloadImage` and `allowDownloadGallery` in the config.

> **Note:** `fetch()` is blocked by browsers on `file://` URLs. Use `npm run serve` or any local HTTP server to test ZIP downloads locally.

---

## Front-end stack

All libraries are downloaded once at first build and stored locally in `dist/vendor/` and `dist/fonts/`. No CDN or internet access is required at runtime.

| Library     | Version | Purpose |
|-------------|---------|---------|
| [Sharp](https://sharp.pixelplumbing.com/) | 0.33 | Image conversion, resizing, brightness analysis |
| [exifr](https://github.com/MikeKovarik/exifr) | 7.1 | EXIF metadata extraction |
| [piexifjs](https://github.com/hMatoba/piexifjs) | 1.0 | EXIF embedding in generated sample images |
| [GLightbox](https://github.com/biati-digital/glightbox) | 3.3.0 | Full-screen lightbox with touch support |
| [tiny-slider](https://github.com/ganlanyuan/tiny-slider) | 2.9.4 | Thumbnail filmstrip |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | Client-side ZIP generation |
| Poppins | — | Typography (woff2 files, served locally) |

---

## Contributing

Pull requests are welcome. For major changes please open an issue first to discuss what you would like to change.

To get started:

```bash
git clone https://github.com/pvollenweider/ssgg
cd ssgg
npm install
npm run setup:example   # generate sample photos
npm run build:all       # build the example gallery
npm run serve           # open http://localhost:3000 to preview
```

If you use SSGG for a project — commercial or personal — a mention or a link back is always appreciated, though never required. And if something doesn't work the way you expect, open an issue. Feedback from real-world use is how this tool gets better.

---

## License

[MIT](LICENSE) — free to use, modify and distribute.

Copyright © Philippe Vollenweider
