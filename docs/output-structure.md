# Output structure

> **TL;DR** — Everything GalleryPack produces goes into `dist/`. This folder is the deploy contract — its structure is stable across versions. Never commit it; deploy it with `npm run publish` or `npm run deploy`.

---

## Single gallery

After `npm run build my-shoot`:

```
dist/my-shoot/
├── index.html            Gallery page (self-contained HTML)
├── data.js               Build-time constants: PHOTOS array + PROJECT config
├── gallery.js            Browser-side UI (lightbox, slideshow, EXIF panel, ZIP)
├── photos.json           Manifest: EXIF cache + GPS resolved locations
├── build-summary.json    Build metadata (see below)
├── DELIVERY.md           Ready-to-send delivery message
├── LEGAL.md              Auto-generated legal notice (Markdown)
├── .htaccess             ← only when access: "password"
├── .htpasswd             ← only when access: "password"
├── img/
│   ├── grid/             WebP grid thumbnails (800px or 1400px wide)
│   ├── grid-sm/          WebP mobile thumbnails (400px or 600px wide)
│   └── full/             WebP full-size images (up to 3840px)
└── originals/            ← only when allowDownloadImage: true
    └── *.jpg / *.heic    Source copies for download
```

Shared assets (vendor JS/CSS, fonts) live at the `dist/` root and are shared across galleries:
```
dist/
├── index.html    Site index listing all public galleries
├── vendor/       GLightbox, tiny-slider, JSZip
├── fonts/        Poppins (subset, self-hosted)
└── covers/       Cover thumbnails for password-protected galleries (outside auth zone)
```

The `covers/` directory contains one `.webp` per password-protected gallery, copied outside the `.htaccess` zone so the site index can display cover images without an auth prompt.

---

## Standalone gallery

When `standalone: true`, vendor and font assets are copied into the gallery folder itself.
The gallery folder becomes self-contained and can be zipped and distributed independently.

```
dist/my-shoot/
├── index.html
├── ...
├── vendor/       ← copied from dist/vendor/
└── fonts/        ← copied from dist/fonts/
```

---

## build-summary.json

Written at the end of every build. Used by `npm run publish` to track the live URL.

```json
{
  "version": "1.1.2",
  "gallery": "Summer in Zürich — Portraits & Landscapes",
  "srcName": "example-gallery",
  "distName": "summer-zurich-2025",
  "dist": "/Users/pol/Desktop/ssgg/dist/summer-zurich-2025",
  "photos": 15,
  "sourceSizeMB": 1.7,
  "locale": "en",
  "date": "2025-04-15",
  "access": "public",
  "builtAt": "2026-03-23T10:00:00.000Z",
  "durationSec": 7.5,
  "url": "https://galleries.example.com/summer-zurich-2025/",
  "publishedAt": "2026-03-23T10:05:00.000Z"
}
```

The `url` and `publishedAt` fields are added by `npm run publish`.
The `authUser` and `authPassword` fields are added when `access: "password"`.

---

## photos.json (manifest)

Caches EXIF data, GPS-resolved locations, and image dimensions so incremental builds skip re-processing. Contains a `schemaVersion` field for forward-compatibility detection.

```json
{
  "schemaVersion": "1.2",
  "photos": {
    "IMG_0715.jpeg": {
      "name": "philippeVollenweider_insectes_20260117_001",
      "index": 1,
      "role": "big",
      "isDark": false,
      "exif": {
        "camera": "Apple iPhone 15 Pro",
        "date": "2026-01-17T14:09:05.000Z",
        "location": "Neuchâtel, Suisse",
        "gps": { "lat": 46.99, "lng": 6.93 },
        "originalFile": "IMG_0715.jpeg",
        "fileSize": "4.2 MB"
      }
    }
  },
  "generated": "2026-03-23T10:00:00.000Z",
  "project": { ... }
}
```

---

## Rules

- `dist/` is **gitignored** — never committed to the main branch
- `dist/` content is deployed to GitHub Pages via `npm run deploy` (safe worktree)
- `dist/` content is uploaded to your server via `npm run publish` (rsync)
- Incremental builds skip images whose output files already exist in `dist/`
- `npm run build:clean` wipes `dist/` entirely before rebuilding
- Stale manifest entries (photos removed from `src/`) are pruned automatically
