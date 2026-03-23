# Output structure

> See [docs/reference.md](reference.md) for the full reference.

After `npm run build my-shoot`, the `dist/my-shoot/` folder contains:

```
dist/my-shoot/
├── index.html          # Gallery page (self-contained)
├── data.js             # Build-time constants: PHOTOS array + PROJECT config
├── gallery.js          # Browser-side UI logic
├── photos.json         # Manifest: EXIF cache + build metadata
├── build-summary.json  # Build summary: count, size, duration, locale
├── LEGAL.md            # Auto-generated legal notice
├── img/
│   ├── grid/           # WebP grid thumbnails (800 or 1400px)
│   ├── grid-sm/        # WebP mobile thumbnails (400 or 600px)
│   └── full/           # WebP full-size images (up to 3840px)
└── originals/          # Source copies (only if allowDownloadImage: true)
```

Shared assets (vendor JS/CSS, fonts) live at `dist/vendor/` and `dist/fonts/`
and are shared across all non-standalone galleries.

For **standalone** galleries (`standalone: true`), vendor and font assets are
copied into the gallery folder itself so it can be distributed independently.
