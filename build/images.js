// build/images.js — photo listing, conversion, manifest management
import fs   from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const piexif  = require('piexifjs');

import { extractExif } from './exif.js';
import { buildName, MANIFEST_SCHEMA_VERSION } from './utils.js';

// Inline logging helpers (copied to avoid circular-dependency risk).
const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const fail = (m) => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);

// ── Supported source-image extensions ────────────────────────────────────────
export const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

// ── Grid layout ───────────────────────────────────────────────────────────────
// The gallery uses a repeating 12-photo cycle with two "big" tiles that span
// 2×2 grid cells.  Position 0 is big-left (columns 1-2) and position 8 is
// big-right (columns 2-3).  All other positions are standard 1×1 small tiles.
export const BIG_POSITIONS = new Set([0, 8]);

// ── Photo listing ─────────────────────────────────────────────────────────────

/**
 * Return a sorted list of all supported image files found in SRC_DIR.
 * Exits the process if the directory does not exist.
 *
 * @returns {{ file: string, full: string }[]} - Array of { file, full } descriptors.
 */
export function listPhotos(srcDir) {
  if (!fs.existsSync(srcDir)) { fail(`Dossier introuvable : ${srcDir}`); process.exit(1); }
  return fs.readdirSync(srcDir)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()))
    .sort()
    .map(f => ({ file: f, full: path.join(srcDir, f) }));
}

// ── Brightness analysis ───────────────────────────────────────────────────────

/**
 * Determine whether the bottom portion of a grid thumbnail is visually dark.
 * The result is used in the browser to choose between a light or dark text
 * colour for the overlay title that appears at the bottom of the lightbox.
 *
 * Strategy: extract the lower 35 % of the thumbnail, downscale to 24×8 px to
 * smooth out noise, then compute weighted luminance (Rec. 601 coefficients).
 * A mean luminance below 140 (out of 255) is considered dark.
 *
 * @param {string} gridPath - Absolute path to the already-written grid WebP.
 * @param {number} gridSize - Side length (px) of the square grid thumbnail.
 * @returns {Promise<boolean>} - true if the bottom strip is dark.
 */
export async function computeIsDark(gridPath, gridSize) {
  const cutY  = Math.round(gridSize * 0.65);  // top of the analysis strip
  const cutH  = gridSize - cutY;              // height of the analysis strip
  const stats = await sharp(gridPath)
    .extract({ left: 0, top: cutY, width: gridSize, height: cutH })
    .resize(24, 8)   // small enough to average colours without per-pixel noise
    .stats();
  // Rec. 601 luminance: Y = 0.299 R + 0.587 G + 0.114 B
  const lum = 0.299 * stats.channels[0].mean
            + 0.587 * stats.channels[1].mean
            + 0.114 * stats.channels[2].mean;
  return lum < 140;
}

// ── Image conversion ──────────────────────────────────────────────────────────

/**
 * Convert a single source photo to three output files:
 *   - dist/img/grid/<name>.webp  — square thumbnail (grid size depends on tile role)
 *   - dist/img/full/<name>.webp  — large WebP for the lightbox viewer
 *   - dist/originals/<name>.jpg  — full-quality JPEG for download
 *
 * When --force is not set and all three outputs already exist the conversion is
 * skipped; the cached isDark value from the manifest is reused to avoid
 * re-analysing the pixel data on every incremental build.
 *
 * @param {object}       photo        - { file, full } source photo descriptor.
 * @param {object}       cfg          - Merged project + build config.
 * @param {number}       idx          - Zero-based index in the photo list.
 * @param {boolean|null} cachedIsDark - Brightness flag from the manifest, or null to compute fresh.
 * @param {boolean}      FORCE        - Whether to force reconversion.
 * @returns {Promise<{name: string, width: number, height: number, isDark: boolean}>}
 */
export async function convertOne(photo, cfg, idx, cachedIsDark = null, paths, cachedName = null, FORCE = false) {
  const name     = buildName(cfg.project, idx);
  const isBig    = BIG_POSITIONS.has(idx % 12);   // big tile → larger thumbnail
  const gridOut   = path.join(paths.distImg, 'grid',    `${name}.webp`);
  const gridSmOut = path.join(paths.distImg, 'grid-sm', `${name}.webp`);
  const fullOut   = path.join(paths.distImg, 'full',    `${name}.webp`);
  const origOut   = path.join(paths.distOri, `${name}.jpg`);
  const { gridSizeSmall, gridSizeBig,
          gridSizeMobileSmall = 400, gridSizeMobileBig = 600,
          fullSize, quality } = cfg.build;
  const gridSize    = isBig ? gridSizeBig    : gridSizeSmall;
  const gridSizeMob = isBig ? gridSizeMobileBig : gridSizeMobileSmall;
  // Originals are skipped when neither image nor gallery download is allowed.
  const skipOriginals = cfg.project.allowDownloadImage === false
                     && cfg.project.allowDownloadGallery === false;

  // Skip conversion if all outputs exist, --force was not requested,
  // AND this photo hasn't moved to a different position (cover change reorders photos).
  const origReady = skipOriginals || fs.existsSync(origOut);
  const positionUnchanged = cachedName === null || cachedName === name;
  if (!FORCE && positionUnchanged && fs.existsSync(gridOut) && fs.existsSync(gridSmOut) && fs.existsSync(fullOut) && origReady) {
    ok(`${name} (skip)`);
    // Reuse cached isDark when available; fall back to computing it from disk.
    const [meta, isDark] = await Promise.all([
      sharp(photo.full).metadata(),
      cachedIsDark !== null ? Promise.resolve(cachedIsDark) : computeIsDark(gridOut, gridSize),
    ]);
    return { name, width: meta.width, height: meta.height, isDark };
  }

  info(`${photo.file}  →  ${name}  [${isBig ? 'big' : 'small'}]`);

  // Grid thumbnail: square crop centred on the image.
  await sharp(photo.full)
    .rotate()   // honour EXIF orientation
    .resize(gridSize, gridSize, { fit: 'cover', position: 'centre' })
    .webp({ quality: quality.grid })
    .toFile(gridOut);
  ok(`grid  ${gridSize}×${gridSize}`);

  // Mobile grid thumbnail: size depends on tile role (big tiles need more pixels).
  await sharp(photo.full)
    .rotate()
    .resize(gridSizeMob, gridSizeMob, { fit: 'cover', position: 'centre' })
    .webp({ quality: quality.grid })
    .toFile(gridSmOut);
  ok(`grid-sm  ${gridSizeMob}×${gridSizeMob}`);

  // Full-size WebP: fit inside fullSize×fullSize, never enlarge smaller originals.
  await sharp(photo.full)
    .rotate()
    .resize(fullSize, fullSize, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: quality.full })
    .toFile(fullOut);
  ok(`full  ≤${fullSize}px`);

  // Original: copy native JPEGs as-is; re-encode everything else to JPEG 95.
  // Skipped entirely when both image and gallery downloads are disabled.
  if (!skipOriginals) {
    const ext = path.extname(photo.file).toLowerCase();
    if (['.jpg','.jpeg'].includes(ext)) {
      fs.copyFileSync(photo.full, origOut);
    } else {
      await sharp(photo.full).rotate().jpeg({ quality: 95 }).toFile(origOut);
    }
    ok(`orig  → originals/${name}.jpg`);

    // Embed the original source filename in the JPEG EXIF (DocumentName field).
    try {
      const buf  = fs.readFileSync(origOut);
      const str  = buf.toString('binary');
      let   exifData = {};
      try { exifData = piexif.load(str); } catch (_) {}
      if (!exifData['0th']) exifData['0th'] = {};
      exifData['0th'][piexif.ImageIFD.DocumentName] = photo.file;
      fs.writeFileSync(origOut, Buffer.from(piexif.insert(piexif.dump(exifData), str), 'binary'));
    } catch (_) {}
  }

  // Read final dimensions and brightness in parallel after conversion.
  const [meta, isDark] = await Promise.all([
    sharp(photo.full).rotate().metadata(),
    computeIsDark(gridOut, gridSize),
  ]);
  return { name, width: meta.width, height: meta.height, isDark };
}

// ── Manifest (photos.json) ────────────────────────────────────────────────────

/**
 * Load the existing dist/photos.json manifest, or return a blank structure.
 * The manifest caches EXIF data and isDark flags so incremental builds do not
 * re-parse and re-analyse every photo on each run.
 *
 * @returns {{ photos: object, [generated]: string, [project]: object }}
 */
export function loadManifest(manifestPath) {
  if (fs.existsSync(manifestPath)) {
    try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch(_) {}
  }
  return { photos: {} };
}

/**
 * Process all source photos: convert images, extract EXIF, and write the
 * updated manifest back to dist/photos.json.
 * Stale manifest entries (photos removed from src/) are pruned automatically.
 *
 * @param {{ file: string, full: string }[]} photos - Sorted source photo list.
 * @param {object} cfg - Merged project + build config.
 * @param {object} paths - Gallery path descriptors from galleryPaths().
 * @param {boolean} FORCE - Whether to force reconversion.
 * @returns {Promise<Array<{name, width, height, isDark, exif}>>} - Processed photo metadata.
 */
export async function processPhotos(photos, cfg, paths, FORCE = false) {
  const manifest = loadManifest(paths.manifest);
  if (!manifest.photos) manifest.photos = {};

  const results = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    try {
      // Pull cached values from the manifest to avoid redundant I/O.
      const cached     = manifest.photos[photo.file];
      const cachedExif = cached?.exif;
      const cachedDark = cached?.isDark ?? null;
      const cachedName = cached?.name   ?? null;

      // Run image conversion and EXIF extraction in parallel when EXIF is cached.
      const [dims, exif] = await Promise.all([
        convertOne(photo, cfg, i, cachedDark, paths, cachedName, FORCE),
        cachedExif ? Promise.resolve(cachedExif) : extractExif(photo.full),
      ]);
      // Attach source filename and file size (human-readable) to the EXIF record.
      const srcBytes   = fs.statSync(photo.full).size;
      const srcSizeMB  = srcBytes / (1024 * 1024);
      const fileSizeStr = srcSizeMB >= 1
        ? srcSizeMB.toFixed(1) + ' MB'
        : Math.round(srcBytes / 1024) + ' KB';
      const exifFull = { ...(exif || {}), originalFile: photo.file, fileSize: fileSizeStr };
      manifest.photos[photo.file] = {
        name:   dims.name,
        index:  i + 1,
        role:   BIG_POSITIONS.has(i % 12) ? 'big' : 'small',
        isDark: dims.isDark,
        exif:   exifFull,
      };
      results.push({ ...dims, exif: exifFull });
    } catch (e) {
      fail(`Erreur sur ${photo.file} : ${e.message}`);
    }
  }

  // Remove manifest entries for photos that are no longer in the source folder.
  const current = new Set(photos.map(p => p.file));
  for (const k of Object.keys(manifest.photos)) {
    if (!current.has(k)) delete manifest.photos[k];
  }

  manifest.schemaVersion = MANIFEST_SCHEMA_VERSION;
  manifest.generated = new Date().toISOString();
  manifest.project   = cfg.project;
  fs.writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2), 'utf8');
  ok('photos.json → dist/');

  return results;
}
