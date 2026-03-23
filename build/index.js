#!/usr/bin/env node
/**
 * SSGG — Simple Static Gallery Generator
 * Build pipeline: converts source photos into a self-contained static gallery.
 *
 * Usage:
 *   npm run build          — incremental build (skips existing images)
 *   npm run build:force    — reconvert all images
 *   npm run build:clean    — wipe dist/ and rebuild from scratch
 *   npm run build:webp     — reconvert WebP only
 *
 * @author  Philippe Vollenweider <author@example.com>
 * @license MIT
 * @see     https://github.com/pvollenweider/ssgg
 */

// ── Node built-ins ────────────────────────────────────────────────────────────
import fs   from 'fs';
import path from 'path';
import https from 'https';
import http  from 'http';
import { createWriteStream } from 'fs';
import { fileURLToPath }     from 'url';
import crypto from 'crypto';

// ── Third-party dependencies ──────────────────────────────────────────────────
import sharp from 'sharp';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const piexif  = require('piexifjs');

// ── Local modules ─────────────────────────────────────────────────────────────
import { extractExif } from './exif.js';

// ── CLI flags ─────────────────────────────────────────────────────────────────
const WEBP_ONLY  = process.argv.includes('--webp-only');
const FORCE      = process.argv.includes('--force');
const BUILD_ALL  = process.argv.includes('--all');
// First positional argument (not a flag) is the gallery name.
const GALLERY_ARG = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

// ── Path constants ────────────────────────────────────────────────────────────
const __DIR   = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__DIR, '..');
const SRC_ROOT       = path.join(ROOT, 'src');
const BUILD_CFG_PATH = path.join(ROOT, 'build.config.json');
const DIST_ROOT      = path.join(ROOT, 'dist');
const DIST_VEN       = path.join(DIST_ROOT, 'vendor');
const DIST_FONTS     = path.join(DIST_ROOT, 'fonts');

// Read the package version once at startup — injected into every gallery footer.
const { version: VERSION } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/**
 * Return all gallery names discovered in src/ (subdirs with a gallery.config.json).
 */
function discoverGalleries() {
  if (!fs.existsSync(SRC_ROOT)) return [];
  return fs.readdirSync(SRC_ROOT)
    .filter(name => {
      const cfgPath = path.join(SRC_ROOT, name, 'gallery.config.json');
      return fs.statSync(path.join(SRC_ROOT, name)).isDirectory() && fs.existsSync(cfgPath);
    });
}

/**
 * Resolve per-gallery paths for a given source name and (optional) dist name.
 * For private galleries the dist name is a content hash rather than the src name.
 *
 * @param {string} srcName  - Gallery folder name under src/.
 * @param {string} [distName] - Output folder name under dist/ (defaults to srcName).
 */
function galleryPaths(srcName, distName) {
  const outName = distName || srcName;
  const srcDir  = path.join(SRC_ROOT, srcName, 'photos');
  const cfgPath = path.join(SRC_ROOT, srcName, 'gallery.config.json');
  const dist    = path.join(DIST_ROOT, outName);
  return {
    srcName,
    distName: outName,
    srcDir,
    cfgPath,
    dist,
    distImg:  path.join(dist, 'img'),
    distOri:  path.join(dist, 'originals'),
    manifest: path.join(dist, 'photos.json'),
  };
}

/**
 * Convert an arbitrary string to a URL-safe slug.
 * Strips diacritics, lowercases, replaces non-alphanumeric runs with hyphens.
 *
 * @param {string} str - Input string (title, name, etc.).
 * @returns {string}   - Lowercase hyphenated slug (e.g. "ete-a-zurich-2025").
 */
function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric runs → single hyphen
    .replace(/^-+|-+$/g, '');      // trim leading / trailing hyphens
}

/**
 * Compute the dist folder name for a gallery.
 *
 * Priority (public galleries):
 *   1. project.name  — explicit slug set in gallery.config.json
 *   2. project.title — auto-slugified (e.g. "Été à Zürich" → "ete-a-zurich")
 *   3. srcName       — source folder name as last resort
 *
 * Private galleries always use a 16-char SHA-256 hash of author|title|date,
 * making the URL unguessable. The hash is deterministic: same config = same folder.
 *
 * @param {object} project - Gallery project config.
 * @param {string} srcName - Source folder name under src/.
 * @returns {string}       - Folder name to use under dist/.
 */
function galleryDistName(project, srcName) {
  if (project.private) {
    const seed = [project.author || '', project.title || '', project.date || ''].join('|');
    return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  }
  const slug = slugify(project.name || project.title || '');
  return slug || srcName;
}

// ── Supported source-image extensions ────────────────────────────────────────
const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

// ── Vendor assets (CDN URLs → dist/vendor/) ───────────────────────────────────
// Each entry is downloaded once and cached locally so the gallery works offline.
const VENDORS = [
  {
    name: 'GLightbox CSS',
    url : 'https://cdn.jsdelivr.net/npm/glightbox@3.3.0/dist/css/glightbox.min.css',
    file: 'glightbox.min.css',
  },
  {
    name: 'GLightbox JS',
    url : 'https://cdn.jsdelivr.net/npm/glightbox@3.3.0/dist/js/glightbox.min.js',
    file: 'glightbox.min.js',
  },
  {
    name: 'tiny-slider CSS',
    url : 'https://cdn.jsdelivr.net/npm/tiny-slider@2.9.4/dist/tiny-slider.css',
    file: 'tiny-slider.css',
  },
  {
    name: 'tiny-slider JS',
    url : 'https://cdn.jsdelivr.net/npm/tiny-slider@2.9.4/dist/min/tiny-slider.js',
    file: 'tiny-slider.js',
  },
  {
    name: 'JSZip',
    url : 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    file: 'jszip.min.js',
  },
];

// ── Logging helpers ───────────────────────────────────────────────────────────
// Coloured one-liners that avoid mixing with stderr.
const log  = (m) => process.stdout.write(m + '\n');
const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const warn = (m) => process.stdout.write(`  \x1b[33m!\x1b[0m  ${m}\n`);
const fail = (m) => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Load and merge gallery.config.json (project metadata) and
 * build.config.json (image dimensions / quality settings).
 * Aborts the process if either file is missing.
 *
 * @returns {{ project: object, build: object }}
 */
function readConfig(cfgPath) {
  if (!fs.existsSync(cfgPath))        { fail(`gallery.config.json introuvable`);  process.exit(1); }
  if (!fs.existsSync(BUILD_CFG_PATH)) { fail(`build.config.json introuvable`);    process.exit(1); }
  const { project } = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const build       = JSON.parse(fs.readFileSync(BUILD_CFG_PATH, 'utf8'));
  return { project, build };
}

// ── Network helpers ───────────────────────────────────────────────────────────

/**
 * Download a remote URL to a local file, transparently following HTTP redirects.
 * The destination file is deleted on error to avoid leaving partial downloads.
 *
 * @param {string} url  - Remote URL (http or https).
 * @param {string} dest - Absolute path to the output file.
 * @returns {Promise<void>}
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const get  = url.startsWith('https') ? https : http;
    get.get(url, (res) => {
      // Follow 3xx redirects by recursing with the Location header value.
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (e) => { fs.unlinkSync(dest); reject(e); });
  });
}

/**
 * Fetch the text body of a URL (GET), following redirects.
 * An optional User-Agent header is accepted to work around UA-restricted APIs
 * such as Google Fonts.
 *
 * @param {string} url       - Remote URL.
 * @param {string} [userAgent] - Optional User-Agent string.
 * @returns {Promise<string>} - Response body as UTF-8 text.
 */
function fetchText(url, userAgent) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod    = url.startsWith('https') ? https : http;
    mod.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search,
              headers: userAgent ? { 'User-Agent': userAgent } : {} }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchText(res.headers.location, userAgent).then(resolve).catch(reject);
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Font download ─────────────────────────────────────────────────────────────

/**
 * Chrome-like UA sent to Google Fonts so the API returns WOFF2 URLs
 * (instead of legacy TTF/EOT variants returned for older clients).
 */
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Download the latin subset of the Poppins typeface from Google Fonts and
 * store each weight/style as a WOFF2 file under dist/fonts/.
 *
 * The function parses the CSS returned by the Fonts API and retains only the
 * /* latin * / blocks, discarding devanagari, latin-ext, etc.
 * It returns a string of inlinable @font-face declarations pointing to the
 * locally saved files so the built gallery works without internet access.
 *
 * @returns {Promise<string>} - CSS @font-face block(s) for embedding, or '' on failure.
 */
async function downloadFonts() {
  const FONTS_DIR = DIST_FONTS;
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  log('\n\x1b[1m🔤  Fonts (Poppins)\x1b[0m');

  const apiUrl = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap';
  let css;
  try {
    css = await fetchText(apiUrl, CHROME_UA);
  } catch (e) {
    warn(`Poppins unavailable (${e.message}) — falling back to system fonts`);
    return '';
  }

  // Parse each @font-face block; the CSS comment before each block names the
  // character subset (e.g. "latin", "latin-ext", "devanagari").
  const localFaces = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[1] !== 'latin') continue;   // keep only the basic latin subset
    const block = m[2];
    const urlM  = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/.exec(block);
    const wghtM = /font-weight:\s*(\d+)/.exec(block);
    const stylM = /font-style:\s*(\w+)/.exec(block);
    if (!urlM) continue;
    const weight = wghtM ? wghtM[1] : '400';
    const style  = stylM ? stylM[1] : 'normal';
    const fname  = `poppins-${weight}${style === 'italic' ? 'i' : ''}.woff2`;
    const dest   = path.join(FONTS_DIR, fname);
    if (fs.existsSync(dest)) { ok(`${fname} (already present)`); }
    else {
      info(`Downloading ${fname}…`);
      try { await download(urlM[1], dest); ok(fname); }
      catch (e) { warn(`${fname}: ${e.message}`); continue; }
    }
    localFaces.push(`@font-face{font-family:'Poppins';font-style:${style};font-weight:${weight};font-display:optional;src:url('../fonts/${fname}') format('woff2')}`);
  }
  return localFaces.join('\n');
}

// ── Vendor download ───────────────────────────────────────────────────────────

/**
 * Download all entries from the VENDORS list into dist/vendor/.
 * Already-present files are skipped to speed up incremental builds.
 *
 * @returns {Promise<void>}
 */
async function downloadVendors() {
  fs.mkdirSync(DIST_VEN, { recursive: true });
  log('\n\x1b[1m📦  Vendors\x1b[0m');
  for (const v of VENDORS) {
    const dest = path.join(DIST_VEN, v.file);
    if (fs.existsSync(dest)) {
      ok(`${v.name} (already present)`);
      continue;
    }
    info(`Downloading ${v.name}…`);
    try {
      await download(v.url, dest);
      ok(v.name);
    } catch (e) {
      warn(`${v.name} → FAILED (${e.message})`);
      warn(`  Download manually: ${v.url}`);
      warn(`  → dist/vendor/${v.file}`);
    }
  }
}

// ── File naming ───────────────────────────────────────────────────────────────
// Output files follow the convention: author_title_date_NNN
// where each segment is camelCase and NNN is a zero-padded sequence number.

/**
 * Convert an arbitrary string to camelCase, stripping diacritics and
 * replacing non-alphanumeric characters with spaces.
 *
 * @param {string} str - Input string (e.g. a name or title with accents).
 * @returns {string}   - camelCase identifier safe for use in file names.
 */
function toCamelCase(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accent marks
    .replace(/[^a-zA-Z0-9 ]/g, ' ')                    // special chars → space
    .trim().split(/\s+/).filter(Boolean)
    .map((w, i) => i === 0
      ? w[0].toLowerCase() + w.slice(1)
      : w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/**
 * Build the output base-name for photo number idx (0-based).
 * Format: `<titleCamel>_<dateYYYYMMDD>_<NNN>`
 * All segments are optional except NNN; missing fields are simply omitted.
 * Dates are stripped of all non-digit characters to support any input format.
 *
 * @param {object} cfg - Merged project + build config.
 * @param {number} idx - Zero-based index of the photo in the sorted source list.
 * @returns {string}   - Base filename without extension.
 */
function buildName(cfg, idx) {
  const { author = '', title = '', date = '' } = cfg.project;
  const buildDate = new Date().toISOString().slice(0, 10);          // YYYY-MM-DD
  const num       = String(idx + 1).padStart(3, '0');
  const authorKey = toCamelCase(author);
  const titleKey  = toCamelCase(title);
  // Strip every non-digit character so any date format (YYYY-MM-DD, YYYY/MM/DD, etc.) works.
  const dateKey   = (date || buildDate).replace(/[^0-9]/g, '');
  return [authorKey, titleKey, dateKey, num].filter(Boolean).join('_');
}

// ── Grid layout ───────────────────────────────────────────────────────────────
// The gallery uses a repeating 12-photo cycle with two "big" tiles that span
// 2×2 grid cells.  Position 0 is big-left (columns 1-2) and position 8 is
// big-right (columns 2-3).  All other positions are standard 1×1 small tiles.
const BIG_POSITIONS = new Set([0, 8]);

// ── Photo listing ─────────────────────────────────────────────────────────────

/**
 * Return a sorted list of all supported image files found in SRC_DIR.
 * Exits the process if the directory does not exist.
 *
 * @returns {{ file: string, full: string }[]} - Array of { file, full } descriptors.
 */
function listPhotos(srcDir) {
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
async function computeIsDark(gridPath, gridSize) {
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
 * @returns {Promise<{name: string, width: number, height: number, isDark: boolean}>}
 */
async function convertOne(photo, cfg, idx, cachedIsDark = null, paths) {
  const name     = buildName(cfg, idx);
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

  // Skip conversion if all outputs exist and --force was not requested.
  const origReady = skipOriginals || fs.existsSync(origOut);
  if (!FORCE && fs.existsSync(gridOut) && fs.existsSync(gridSmOut) && fs.existsSync(fullOut) && origReady) {
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

// ── Reverse geocoding ─────────────────────────────────────────────────────────

/**
 * Convert GPS decimal coordinates to a human-readable place name using the
 * Nominatim reverse geocoding API (OpenStreetMap, no API key required).
 *
 * Returns "City, Country" (or the best available approximation), or null on
 * failure. Nominatim asks for a maximum of 1 request per second.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
async function reverseGeocode(lat, lng, locale = 'en') {
  try {
    const lang = locale.slice(0, 2).toLowerCase();
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': `SSGG/${VERSION} (https://github.com/pvollenweider/ssgg)`,
        'Accept-Language': `${lang},en;q=0.8`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '';
    // Use Intl.DisplayNames to get the country name in the gallery's locale.
    // This avoids multilingual names like "Schweiz/Suisse/Svizzera/Svizra" that
    // Nominatim sometimes returns for countries with multiple official languages.
    const cc = (a.country_code || '').toUpperCase();
    let country = a.country || '';
    if (cc) {
      try { country = new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(cc) || country; }
      catch (_) {}
    }
    return [city, country].filter(Boolean).join(', ') || null;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve GPS coordinates in photo EXIF to human-readable place names.
 *
 * Photos whose exif.location is already a string (resolved in a previous build
 * and cached in photos.json) are skipped entirely — no network calls.
 * Unique coordinates are deduplicated and looked up one-by-one, respecting the
 * Nominatim 1 req/s rate limit.  Results are saved back into the manifest so
 * subsequent builds are fully offline.
 *
 * @param {Array}  results      - Photo metadata array (mutated in place).
 * @param {string} manifestPath - Path to dist/photos.json.
 * @param {string} locale       - Gallery locale (e.g. 'fr', 'en') for place name language.
 */
async function resolveGpsLocations(results, manifestPath, locale = 'en') {
  const toResolve = results.filter(p => p.exif?.location && typeof p.exif.location === 'object');
  if (!toResolve.length) return;

  log('\n\x1b[1m🌍  Reverse geocoding\x1b[0m');

  // Deduplicate by rounded coords (~1 km precision) to avoid redundant calls.
  const cache = new Map();

  for (const photo of toResolve) {
    // Ensure lat/lng are actual numbers regardless of how they were stored.
    const lat = Number(photo.exif.location.lat);
    const lng = Number(photo.exif.location.lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;

    if (!cache.has(key)) {
      if (cache.size > 0) await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit
      const place = await reverseGeocode(lat, lng, locale);
      // Fall back to plain decimal coords if the API call fails.
      cache.set(key, place ?? `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`);
      ok(`GPS (${key}) → ${cache.get(key)}`);
    }

    // Keep raw coords in exif.gps so the frontend can generate a Maps link.
    photo.exif.gps = { lat, lng };
    photo.exif.location = cache.get(key);
  }

  // Persist resolved strings back into the manifest so next builds skip the API.
  const manifest = loadManifest(manifestPath);
  for (const photo of toResolve) {
    if (manifest.photos[photo.exif.originalFile]) {
      manifest.photos[photo.exif.originalFile].exif.gps      = photo.exif.gps;
      manifest.photos[photo.exif.originalFile].exif.location = photo.exif.location;
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

// ── Manifest (photos.json) ────────────────────────────────────────────────────

/**
 * Load the existing dist/photos.json manifest, or return a blank structure.
 * The manifest caches EXIF data and isDark flags so incremental builds do not
 * re-parse and re-analyse every photo on each run.
 *
 * @returns {{ photos: object, [generated]: string, [project]: object }}
 */
function loadManifest(manifestPath) {
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
 * @returns {Promise<Array<{name, width, height, isDark, exif}>>} - Processed photo metadata.
 */
async function processPhotos(photos, cfg, paths) {
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

      // Run image conversion and EXIF extraction in parallel when EXIF is cached.
      const [dims, exif] = await Promise.all([
        convertOne(photo, cfg, i, cachedDark, paths),
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

  manifest.generated = new Date().toISOString();
  manifest.project   = cfg.project;
  fs.writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2), 'utf8');
  ok('photos.json → dist/');

  return results;
}

// ── HTML / JS generation ──────────────────────────────────────────────────────

/**
 * Generate the three output text files that form the gallery front-end:
 *   - index.html  — self-contained page with inlined CSS and local asset references
 *   - data.js     — build-time constants: PHOTOS array + PROJECT object
 *   - gallery.js  — browser-side UI logic (GLightbox, thumbnail strip, EXIF overlay…)
 *
 * The HTML and CSS strings are intentionally kept minified/compact to avoid
 * unnecessary byte overhead in the distributed gallery.
 *
 * @param {object} cfg       - Merged project + build config.
 * @param {Array}  photos    - Processed photo metadata from processPhotos().
 * @param {string} [fontCss] - Inlinable @font-face CSS produced by downloadFonts().
 * @returns {{ html: string, dataJs: string, galleryJs: string }}
 */
/**
 * Replace {{token}} placeholders in a legal notice template string.
 * Unknown tokens are left as-is so partial templates still render safely.
 *
 * Available tokens:
 *   {{title}}        Gallery title
 *   {{subtitle}}     Gallery subtitle
 *   {{author}}       Author full name
 *   {{authorEmail}}  Author e-mail address
 *   {{year}}         Year extracted from project.date (or current year)
 *   {{date}}         Full date string from project.date
 *   {{location}}     Shooting location
 *   {{description}}  Gallery description
 *
 * @param {string} tpl     - Template string with {{token}} placeholders.
 * @param {object} project - Gallery project config.
 * @returns {string}       - Template with all known tokens replaced.
 */
function applyLegalTokens(tpl, project) {
  const year = project.date ? project.date.slice(0, 4) : String(new Date().getFullYear());
  const map  = {
    title:       project.title       || '',
    subtitle:    project.subtitle    || '',
    author:      project.author      || '',
    authorEmail: project.authorEmail || '',
    year,
    date:        project.date        || '',
    location:    project.location    || '',
    description: project.description || '',
  };
  // Process {{#if field}}...{{/if}} conditional blocks first.
  // If the field value is non-empty the block content is kept; otherwise removed.
  let out = tpl.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
    return (map[key] || '').trim() ? inner : '';
  });
  // Then replace remaining {{token}} placeholders.
  return out.replace(/\{\{(\w+)\}\}/g, (_, key) => key in map ? map[key] : `{{${key}}}`);
}

function buildHTML(cfg, photos, fontCss = '', standalone = false, customLegal = {}, distName = '') {
  const { project } = cfg;
  // Asset path prefix: standalone galleries embed vendor/fonts locally;
  // shared galleries reference the common dist/vendor/ and dist/fonts/ dirs.
  const vp = standalone ? 'vendor/' : '../vendor/';

  // Lightbox transition settings from build.config.json.
  const VALID_EFFECTS = new Set(['slide', 'fade', 'zoom', 'none']);
  const autoplayCfg = cfg.build.autoplay || {};
  const slideEffect = VALID_EFFECTS.has(autoplayCfg.slideEffect) ? autoplayCfg.slideEffect : 'fade';
  const slideSpeed  = Math.max(50, Math.min(2000, Number(autoplayCfg.slideSpeed) || 400));

  // Mobile srcset sizes — injected into the JS template so the browser gets
  // the correct width descriptor for each tile role.
  const gridMobSmall = cfg.build.gridSizeMobileSmall || 400;
  const gridMobBig   = cfg.build.gridSizeMobileBig   || 600;
  // Font path prefix (mirrors vp but for the fonts/ directory).
  const fp = standalone ? 'fonts/' : '../fonts/';

  // Embed optional custom legal templates as PROJECT properties so the browser
  // can use them directly without any multilingual fallback logic.
  const projectWithLegal = { ...project };
  if (customLegal.html) projectWithLegal.legalHtml = customLegal.html;
  if (customLegal.txt)  projectWithLegal.legalTxt  = customLegal.txt;

  const photosJson  = JSON.stringify(photos.map((p, i) => ({ name: p.name, role: BIG_POSITIONS.has(i % 12) ? 'big' : 'small', isDark: p.isDark, exif: p.exif })));
  const projectJson = JSON.stringify(projectWithLegal);

  // Preload links for the first N grid thumbnails — browser fetches them
  // immediately during HTML parsing, before any JS executes (best LCP).
  // imagesrcset/imagesizes mirror the srcset/sizes on the <img> so browsers
  // select the right source during preload (mobile gets grid-sm, desktop gets grid).
  const PRELOAD_COUNT = (cfg.build && cfg.build.preloadCount) || 6;
  const preloadLinks = photos.slice(0, PRELOAD_COUNT).map((p, i) => {
    const isBig    = BIG_POSITIONS.has(i % 12);
    const mobSz    = isBig ? gridMobBig : gridMobSmall;
    const deskSz   = isBig ? 1400 : 800;
    const srcset   = `img/grid-sm/${p.name}.webp ${mobSz}w, img/grid/${p.name}.webp ${deskSz}w`;
    const sizes    = isBig ? '(max-width: 767px) 66vw, 1400px' : '(max-width: 767px) 33vw, 800px';
    const priority = i === 0 ? ' fetchpriority="high"' : '';
    return `<link rel="preload" as="image" href="img/grid/${p.name}.webp" imagesrcset="${srcset}" imagesizes="${sizes}"${priority}>`;
  }).join('\n');

  const htmlLang = (project.locale || 'en').slice(0, 2).toLowerCase();

  // "Generated by" label, localized to match the gallery's declared UI language.
  const CREDIT_I18N = {
    en: 'Generated by', fr: 'G\u00e9n\u00e9r\u00e9 par', de: 'Erstellt mit',
    it: 'Generato con',  es: 'Generado con',              pt: 'Gerado com',
  };
  const generatedBy = CREDIT_I18N[htmlLang] || CREDIT_I18N.en;

  const html = `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${escHtml(project.title)}</title>
${project.description ? `<meta name="description" content="${escHtml(project.description)}">` : ''}
<script>const _p=location.pathname;const _s=_p.slice(_p.lastIndexOf('/')+1);if(!_p.endsWith('/')&&_s.indexOf('.')<0)location.replace(_p+'/'+location.search+location.hash)</script>
${preloadLinks}
<link rel="preload" as="font" href="${fp}poppins-400.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="${fp}poppins-600.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="${fp}poppins-500.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="style" href="${vp}glightbox.min.css" onload="this.rel='stylesheet'">
<link rel="preload" as="style" href="${vp}tiny-slider.css" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${vp}glightbox.min.css"><link rel="stylesheet" href="${vp}tiny-slider.css"></noscript>
<style>
${fontCss}
/* ── Reset ──────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#1c1c1c;
  --ink:#e8e4dd;
  --muted:#706860;
  --accent:#c8a96e;
  --gap:4px;
  --bar:56px;
}

html,body{height:100%;background:var(--bg);color:var(--ink);overscroll-behavior:none}

/* ── Toolbar ────────────────────────────────────────── */
.bar{
  position:fixed;top:0;left:0;right:0;height:var(--bar);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 22px;
  background:rgba(0,0,0,.85);
  backdrop-filter:blur(18px) saturate(120%);
  -webkit-backdrop-filter:blur(18px) saturate(120%);
  border-bottom:1px solid rgba(255,255,255,.07);
  z-index:90;user-select:none
}
.bar-title{
  font-family:'Poppins',sans-serif;
  font-size:15px;font-weight:600;letter-spacing:-.01em
}
.bar-meta{
  font-family:'Poppins',sans-serif;
  font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-top:2px
}
.bar-right{display:flex;align-items:center;gap:16px}
.bar-count{
  font-family:'Poppins',sans-serif;font-size:11px;color:var(--muted)
}
#dl-all-btn{
  display:inline-flex;align-items:center;gap:6px;
  font-family:'Poppins',sans-serif;font-size:11px;font-weight:400;
  color:rgba(255,255,255,.35);
  background:none;border:1px solid rgba(255,255,255,.12);
  border-radius:4px;padding:5px 10px;cursor:pointer;
  transition:color .15s,border-color .15s;white-space:nowrap
}
#dl-all-btn:hover{color:rgba(255,255,255,.75);border-color:rgba(255,255,255,.3)}
#dl-all-btn:disabled{opacity:.4;cursor:wait}

/* ── Grid ───────────────────────────────────────────── */
.wrap{padding-top:var(--bar)}
.grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  grid-auto-rows:calc((100vw - 2 * var(--gap)) / 3);
  gap:var(--gap)
}

.tile{
  position:relative;overflow:hidden;
  background:#111;cursor:pointer;
  -webkit-tap-highlight-color:transparent
}

.tile img{
  width:100%;height:100%;
  object-fit:cover;display:block;
  transition:transform .4s cubic-bezier(.25,.46,.45,.94);
  will-change:transform
}
.tile:hover img{transform:scale(1.04)}
.tile:active img{transform:scale(.97)}

/* Skeleton shimmer — GPU-composited via transform (no background-position) */
.tile::before{
  content:'';position:absolute;inset:0;z-index:1;
  background:#111;
  transition:opacity .3s
}
.tile::after{
  content:'';position:absolute;inset:0;z-index:2;
  background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.06) 50%,transparent 100%);
  transform:translateX(-100%);
  animation:shim 1.6s infinite;
  transition:opacity .3s;pointer-events:none
}
.tile.ready::before,.tile.ready::after{opacity:0;pointer-events:none}
@keyframes shim{to{transform:translateX(200%)}}

/* Index numérique au survol */
.tile-n{
  position:absolute;bottom:6px;right:8px;z-index:3;
  font-family:'Poppins',sans-serif;font-size:10px;font-weight:500;
  color:rgba(255,255,255,.55);letter-spacing:.04em;
  text-shadow:0 1px 3px rgba(0,0,0,.4);
  opacity:0;transition:opacity .2s
}
.tile:hover .tile-n{opacity:1}

/* ── GLightbox transition speed ─────────────────────── */
/* GLightbox applies the .animated class during slide transitions;
   overriding animation-duration here controls all effect speeds. */
.glightbox-container .gslide.animated{animation-duration:${slideSpeed}ms}

/* ── GLightbox overrides ────────────────────────────── */
/* Description panel = panneau EXIF + download */
.glightbox-clean .gdesc-inner{
  padding:14px 18px 18px;
  background:rgba(12,10,8,.88);
  backdrop-filter:blur(20px)
}
.glightbox-clean .gslide-description{
  background:transparent
}

/* Description custom */
.gl-desc{
  display:flex;align-items:center;gap:10px;
  font-family:'Poppins',sans-serif
}
.gl-proj{
  flex:1;
  font-family:'Poppins',sans-serif;
  font-size:11px;color:rgba(255,255,255,.35);line-height:1.6
}
.gl-proj strong{color:rgba(255,255,255,.55);font-weight:500}

.gl-dl{
  display:inline-flex;align-items:center;gap:6px;
  font-family:'Poppins',sans-serif;
  font-size:12px;font-weight:500;
  color:rgba(255,255,255,.7);
  text-decoration:none;
  border:1px solid rgba(255,255,255,.18);
  border-radius:4px;padding:6px 14px;
  transition:background .15s,color .15s;
  white-space:nowrap;flex-shrink:0
}
.gl-dl:hover{background:rgba(255,255,255,.1);color:#fff}
.gl-dl svg{flex-shrink:0}

/* EXIF (i) button — fixed bottom-right overlay */
#gl-info-btn{
  position:fixed;z-index:1000000;
  bottom:76px;right:24px;
  width:28px;height:28px;border-radius:50%;
  border:1px solid rgba(255,255,255,.25);
  background:transparent;
  color:rgba(255,255,255,.65);
  font-family:'Poppins',sans-serif;
  font-size:13px;font-style:italic;font-weight:500;
  cursor:pointer;
  display:none;align-items:center;justify-content:center;
  transition:background .15s,color .15s,border-color .15s,opacity .4s
}
/* GLightbox adds .glightbox-open on <body> → drives button visibility */
body.glightbox-open #gl-info-btn{display:flex}
#gl-info-btn:hover,#gl-info-btn.active{
  background:rgba(255,255,255,.12);
  color:#fff;border-color:rgba(255,255,255,.5)
}

/* Fullscreen button (all screen sizes — JS removes it if API unavailable) */
#gl-fs-btn{
  position:fixed;z-index:1000000;
  top:70px;right:16px;
  width:36px;height:36px;
  display:none;align-items:center;justify-content:center;
  background:rgba(0,0,0,.5);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.18);
  border-radius:6px;
  color:rgba(255,255,255,.7);
  cursor:pointer;
  transition:background .15s,color .15s,opacity .4s
}
#gl-fs-btn:hover{background:rgba(255,255,255,.15);color:#fff}
body.glightbox-open #gl-fs-btn{display:inline-flex}

/* Slideshow interval selector */
#sw-interval{
  height:32px;padding:0 6px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  border-radius:6px;
  color:rgba(255,255,255,.55);
  font-size:11px;font-family:'Poppins',sans-serif;
  cursor:pointer;
  appearance:none;-webkit-appearance:none;
  text-align:center;
  transition:background .15s,color .15s,opacity .4s
}
#sw-interval:hover{background:rgba(255,255,255,.1);color:#fff}
#sw-interval option{background:#2a2520;color:#e8e4dd}

/* Slideshow button (toolbar) */
#slideshow-btn{
  display:flex;align-items:center;gap:6px;
  padding:0 10px;height:32px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  border-radius:6px;
  color:rgba(255,255,255,.65);
  font-size:11px;font-family:'Poppins',sans-serif;font-weight:500;
  cursor:pointer;
  transition:background .15s,color .15s,opacity .4s;
  white-space:nowrap
}
#slideshow-btn:hover{background:rgba(255,255,255,.12);color:#fff}
#slideshow-btn.active{
  background:rgba(200,169,110,.15);
  border-color:rgba(200,169,110,.35);
  color:var(--accent)
}
/* Slideshow pause/resume button inside the lightbox overlay */
#gl-sw-btn{
  position:fixed;z-index:1000000;
  top:70px;right:60px;
  width:36px;height:36px;
  display:none;align-items:center;justify-content:center;
  background:rgba(0,0,0,.5);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid rgba(200,169,110,.35);
  border-radius:6px;
  color:var(--accent);
  cursor:pointer;
  transition:background .15s,color .15s,opacity .4s
}
#gl-sw-btn:hover{background:rgba(200,169,110,.15)}


/* Per-photo download button (lightbox overlay, bottom-right) */
#gl-dl-btn{
  position:fixed;z-index:1000000;
  bottom:76px;right:60px;
  width:28px;height:28px;
  display:none;align-items:center;justify-content:center;
  color:rgba(255,255,255,.65);text-decoration:none;
  background:transparent;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.25);
  border-radius:50%;
  transition:background .15s,color .15s,opacity .4s
}
body.glightbox-open #gl-dl-btn{display:flex}
#gl-dl-btn:hover{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)}

/* EXIF metadata overlay (photo bottom-left) */
#gl-exif-overlay{
  position:fixed;z-index:1000000;
  bottom:160px;left:24px;
  width:min(320px, calc(100vw - 48px));
  background:rgba(0,0,0,.78);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  border:1px solid rgba(255,255,255,.1);
  border-radius:8px;
  padding:16px 20px;
  font-family:'Poppins',sans-serif
}

.gl-exif-title{
  font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--accent);margin-bottom:8px
}
.gl-exif-rows{display:flex;flex-direction:column;gap:3px}
.gl-exif-row{
  display:flex;justify-content:space-between;gap:8px;
  font-size:11px;padding:3px 0;
  border-bottom:1px solid rgba(255,255,255,.06)
}
.gl-exif-row:last-child{border:none}
.gl-exif-k{color:rgba(255,255,255,.4);white-space:nowrap;flex-shrink:0}
.gl-exif-v{color:rgba(255,255,255,.8);text-align:right;display:flex;align-items:center;justify-content:flex-end;gap:4px}
.gl-exif-maps{color:rgba(255,255,255,.45);line-height:0;flex-shrink:0;transition:color .2s}
.gl-exif-maps:hover{color:rgba(255,255,255,.9)}
.gl-none{color:rgba(255,255,255,.3);font-size:11px}

/* ── tiny-slider thumbnail strip ────────────────────── */
/* Le strip est injecté dans le footer de GLightbox */
#gl-thumbs{
  position:fixed;bottom:0;left:0;right:0;
  height:70px;z-index:9999;
  background:rgba(0,0,0,.72);
  backdrop-filter:blur(10px);
  border-top:1px solid rgba(255,255,255,.07);
  overflow:hidden
}
#gl-thumbs-inner{height:70px}

.tns-thumb-item{
  height:70px;cursor:pointer;
  outline:none;
  opacity:.45;
  transition:opacity .2s
}
.tns-thumb-item img{
  width:100%;height:100%;
  object-fit:cover;display:block
}
.tns-thumb-item.active,
.tns-thumb-item:hover{opacity:1}
.tns-thumb-item.active{
  box-shadow:inset 0 0 0 2px rgba(184,150,80,.9)
}

/* Masquer les contrôles tiny-slider natifs */
.tns-controls{display:none}
.tns-nav{display:none}

/* ── GLightbox : photo plein écran ──────────────────── */
.gslide-media{
  flex:1 1 auto !important;
  max-height:calc(100vh - 70px) !important
}
.gslide-image img{
  max-height:calc(100vh - 70px) !important;
  width:auto !important;max-width:100vw !important
}
/* ── Fullscreen: image fills the entire screen, no gaps ─────────────
   :fullscreen targets the standard API; :-webkit-full-screen covers
   older Android/Chrome.  dvh (dynamic viewport height) accounts for
   Android's gesture bar which 100vh sometimes ignores. */
:fullscreen .gslide-media,
:-webkit-full-screen .gslide-media{
  max-height:100vh !important;
  max-height:100dvh !important;
  box-shadow:none !important;
  margin:0 !important
}
:fullscreen .gslide-image img,
:-webkit-full-screen .gslide-image img{
  max-height:100vh !important;
  max-height:100dvh !important;
  max-width:100vw !important;
  width:auto !important;
  height:auto !important;
  object-fit:contain !important
}
:fullscreen .ginner-container,
:-webkit-full-screen .ginner-container{
  width:100vw !important;
  height:100vh !important;
  height:100dvh !important;
  max-width:100vw !important;
  padding:0 !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important
}
/* Landscape: explicitly swap constraints so height is the binding dimension */
@media (orientation:landscape){
  :fullscreen .gslide-image img,
  :-webkit-full-screen .gslide-image img{
    max-height:100vh !important;
    max-height:100dvh !important;
    max-width:100vw !important;
    width:auto !important;
    height:100vh !important;
    height:100dvh !important
  }
  :fullscreen .gslide-media,
  :-webkit-full-screen .gslide-media{
    width:100vw !important;
    height:100vh !important;
    height:100dvh !important;
    max-height:100dvh !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important
  }
}
/* Panel description GLightbox masqué — on gère tout via overlays fixes */
.glightbox-clean .gslide-description{display:none !important}

/* Title overlay — bottom-left, visible on hover, always readable */
#gl-title{
  position:fixed;z-index:1000001;
  bottom:76px;left:24px;
  font-family:'Poppins',sans-serif;
  font-size:11px;font-weight:300;letter-spacing:.06em;
  color:rgba(255,255,255,.82);
  background:rgba(0,0,0,.38);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.10);
  border-radius:4px;
  padding:3px 9px;
  opacity:0;
  transition:opacity .35s;
  pointer-events:none;
  max-width:calc(100vw - 140px);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
body.glightbox-open:hover #gl-title{opacity:1}
/* During active slideshow: title visible (not just on hover) */
body.glightbox-open.sw-playing #gl-title{opacity:1}

/* ── Slideshow idle: auto-hide all controls ──────────── */
#gl-thumbs{transition:opacity .4s}
/* Fade out overlays + arrows + thumbnail strip + cursor after inactivity */
body.sw-idle #gl-sw-btn,
body.sw-idle #gl-fs-btn,
body.sw-idle #gl-dl-btn,
body.sw-idle #gl-info-btn,
body.sw-idle #gl-title,
body.sw-idle #gl-thumbs,
body.sw-idle #sw-interval,
body.sw-idle #slideshow-btn,
body.sw-idle .gnext,
body.sw-idle .gprev{opacity:0 !important;pointer-events:none !important}
body.sw-idle.glightbox-open{cursor:none}

/* ── Footer mentions légales ─────────────────────── */
.gallery-footer{
  text-align:center;padding:28px 0 44px;
}
#legal-btn{
  font-family:'Poppins',sans-serif;
  font-size:10px;font-weight:400;
  color:rgba(255,255,255,.2);
  background:none;border:none;cursor:pointer;
  letter-spacing:.12em;text-transform:uppercase;
  transition:color .2s;padding:0
}
#legal-btn:hover{color:rgba(255,255,255,.5)}
.footer-sep{
  font-family:'Poppins',sans-serif;
  font-size:10px;color:rgba(255,255,255,.1);
  margin:0 10px
}
.footer-credit{
  font-family:'Poppins',sans-serif;
  font-size:10px;font-weight:400;
  color:rgba(255,255,255,.15);
  text-decoration:none;
  letter-spacing:.12em;text-transform:uppercase;
  transition:color .2s
}
.footer-credit:hover{color:rgba(255,255,255,.45)}

/* ── Modale mentions légales ─────────────────────── */
#legal-overlay{
  position:fixed;inset:0;z-index:200000;
  background:rgba(0,0,0,.8);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  display:none;align-items:center;justify-content:center;
  padding:20px
}
#legal-box{
  background:#0d0d0d;
  border:1px solid rgba(255,255,255,.1);
  border-radius:10px;
  max-width:620px;width:100%;
  max-height:82vh;overflow-y:auto;
  padding:32px 36px 36px;
  position:relative;
  font-family:'Poppins',sans-serif
}
#legal-close{
  position:absolute;top:14px;right:16px;
  background:none;border:none;
  color:rgba(255,255,255,.35);
  font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;
  font-family:'Poppins',sans-serif;
  transition:color .15s
}
#legal-close:hover{color:#fff}
#legal-body h1{font-size:14px;font-weight:600;margin:0 0 18px;color:#fff;letter-spacing:.02em}
#legal-body h2{font-size:10px;font-weight:500;margin:22px 0 8px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.1em}
#legal-body p{font-size:12px;font-weight:300;color:rgba(255,255,255,.55);line-height:1.85;margin:0 0 10px}
#legal-body ul{padding-left:18px;margin:0 0 12px}
#legal-body li{font-size:12px;font-weight:300;color:rgba(255,255,255,.55);line-height:1.85;margin:0 0 4px}
#legal-body strong{color:rgba(255,255,255,.8);font-weight:500}
#legal-body a{color:rgba(200,169,110,.8);text-decoration:none}
#legal-body a:hover{text-decoration:underline}
#legal-body hr{border:none;border-top:1px solid rgba(255,255,255,.08);margin:22px 0}
</style>
</head>
<body>

<div class="bar">
  <div>
    <div class="bar-title" id="bTitle"></div>
    <div class="bar-meta"  id="bMeta"></div>
  </div>
  <div class="bar-right">
    <span class="bar-count" id="bCount"></span>
    <select id="sw-interval" title="Slideshow interval" aria-label="Slideshow interval">
${[2,3,5,8,10].map(s => {
  const def = (project.autoplay && project.autoplay.slideshowInterval) || 3;
  return `      <option value="${s}"${s === def ? ' selected' : ''}>${s}s</option>`;
}).join('\n')}
    </select>
    <button id="slideshow-btn" title="Start slideshow" aria-label="Start slideshow">
      <svg id="sw-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none">
        <polygon points="3,1 15,8 3,15"/>
      </svg>
    </button>
    <button id="dl-all-btn" title="Télécharger tous les originaux">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
      </svg>
      <span id="dl-all-label">Download all</span>
    </button>
  </div>
</div>


<main class="wrap">
  <div class="grid" id="grid"></div>
  <footer class="gallery-footer">
    <button id="legal-btn">Legal notice</button>
    <span class="footer-sep">·</span>
    <a class="footer-credit" href="https://github.com/pvollenweider/ssgg" target="_blank" rel="noopener">${generatedBy} SSGG v${VERSION}</a>
  </footer>
</main>

<!-- Thumbnail strip (GLightbox footer) -->
<div id="gl-thumbs" style="display:none">
  <div id="gl-thumbs-inner"></div>
</div>

<!-- GLightbox items (liens cachés) -->
<div id="gl-items" style="display:none"></div>

<!-- Title overlay (bottom-left) -->
<div id="gl-title"></div>

<!-- Modale mentions légales -->
<div id="legal-overlay">
  <div id="legal-box">
    <button id="legal-close" title="Fermer">×</button>
    <div id="legal-body"></div>
  </div>
</div>

<!-- Lightbox overlays (visibility driven by CSS / JS) -->
<button id="gl-sw-btn" title="Pause slideshow" aria-label="Pause slideshow">
  <svg id="gl-sw-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none">
    <rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/>
  </svg>
</button>
<button id="gl-fs-btn" title="Fullscreen" aria-label="Fullscreen">
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 6V2h4M10 2h4v4M15 10v4h-4M6 14H2v-4"/>
  </svg>
</button>
<button id="gl-dl-btn" title="Download photo" aria-label="Download photo">
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
  </svg>
</button>
<button id="gl-info-btn" title="EXIF Metadata"><i>i</i></button>
<div id="gl-exif-overlay" style="display:none">
  <div id="gl-exif-inner"></div>
</div>

<script src="${vp}glightbox.min.js"></script>
<script src="data.js"></script>
<script src="gallery.js"></script>
</body>
</html>`;

  // data.js — injected at build time; contains PHOTOS array and PROJECT object.
  const dataJs = `/* generated — do not edit manually */
const PHOTOS  = ${photosJson};
const PROJECT = ${projectJson};
`;

  // gallery.js — browser-side UI logic; uses PHOTOS and PROJECT from data.js.
  const galleryJs = `/* ── Initialise toolbar (title, metadata, photo count) ── */
const dateFmt = PROJECT.date
  ? new Date(PROJECT.date).toLocaleDateString('fr-FR',{year:'numeric',month:'long',day:'numeric'})
  : '';
document.getElementById('bTitle').textContent = PROJECT.title || '';
document.getElementById('bMeta').textContent  = [PROJECT.location, dateFmt].filter(Boolean).join(' \u00b7 ');
document.getElementById('bCount').textContent = PHOTOS.length + ' photo' + (PHOTOS.length>1?'s':'');

/* ── EXIF localisation strings ──────────────────────── */
const EXIF_I18N = {
  fr:{ label:'Métadonnées', camera:'Appareil',    lens:'Objectif',   date:'Date prise de vue', location:'Lieu',    shutter:'Vitesse',   aperture:'Ouverture', iso:'Sensibilité', focal:'Focale',      focal35:'Éq. 35mm',    width:'Largeur px',  height:'Hauteur px',  fileSize:'Taille fichier', copyright:'Copyright', originalFile:'Fichier source', noData:'Aucune donnée EXIF' },
  en:{ label:'Metadata',    camera:'Camera',      lens:'Lens',       date:'Date taken',        location:'Location', shutter:'Shutter',   aperture:'Aperture',  iso:'ISO',         focal:'Focal',       focal35:'35mm equiv.',  width:'Width px',    height:'Height px',   fileSize:'File size',      copyright:'Copyright', originalFile:'Source file',    noData:'No EXIF data' },
  de:{ label:'Metadaten',   camera:'Kamera',      lens:'Objektiv',   date:'Aufnahmedatum',     location:'Ort',      shutter:'Belichtung',aperture:'Blende',    iso:'ISO',         focal:'Brennweite',  focal35:'KB-Äquiv.',    width:'Breite px',   height:'Höhe px',     fileSize:'Dateigrösse',    copyright:'Copyright', originalFile:'Quelldatei',     noData:'Keine EXIF-Daten' },
  es:{ label:'Metadatos',   camera:'Cámara',      lens:'Objetivo',   date:'Fecha de toma',     location:'Lugar',    shutter:'Velocidad', aperture:'Apertura',  iso:'ISO',         focal:'Focal',       focal35:'Equiv. 35mm',  width:'Anchura px',  height:'Altura px',   fileSize:'Tamaño archivo', copyright:'Copyright', originalFile:'Archivo origen', noData:'Sin datos EXIF' },
  it:{ label:'Metadati',    camera:'Fotocamera',  lens:'Obiettivo',  date:'Data scatto',       location:'Luogo',    shutter:'Otturatore',aperture:'Apertura',  iso:'ISO',         focal:'Focale',      focal35:'Equiv. 35mm',  width:'Larghezza px',height:'Altezza px',  fileSize:'Dimensione',     copyright:'Copyright', originalFile:'File sorgente',  noData:'Nessun dato EXIF' },
  pt:{ label:'Metadados',   camera:'Câmera',      lens:'Lente',      date:'Data da foto',      location:'Local',    shutter:'Velocidade',aperture:'Abertura',  iso:'ISO',         focal:'Focal',       focal35:'Equiv. 35mm',  width:'Largura px',  height:'Altura px',   fileSize:'Tamanho',        copyright:'Copyright', originalFile:'Ficheiro fonte', noData:'Sem dados EXIF' },
};
const EXIF_KEYS = ['camera','lens','date','location','shutter','aperture','iso','focal','focal35','width','height','fileSize','copyright','originalFile'];
// Locale priority: forced in config → browser preference → English fallback.
const lang = (PROJECT.locale || navigator.language || 'en').slice(0,2).toLowerCase();
const L = EXIF_I18N[lang] || EXIF_I18N.en;

function exifHTML(exif) {
  // Merge EXIF location (GPS) with project location as fallback.
  const merged = { ...exif };
  if (merged.location === undefined && PROJECT.location) merged.location = PROJECT.location;

  const rows = EXIF_KEYS
    .filter(k => merged[k] !== undefined)
    .map(k => {
      let v = merged[k];
      // Format date taken as a human-readable local string.
      if (k === 'date') { try { v = new Date(v).toLocaleString(); } catch(_){} }
      // location: resolved to a plain string at build time.
      // GPS object fallback: stale manifest — format as decimal coords.
      if (k === 'location' && v && typeof v === 'object') {
        const { lat, lng } = v;
        v = \`\${Math.abs(lat).toFixed(4)}°\${lat >= 0 ? 'N' : 'S'}, \${Math.abs(lng).toFixed(4)}°\${lng >= 0 ? 'E' : 'W'}\`;
      }
      // If GPS coords are available, append a Google Maps link next to the label.
      if (k === 'location' && merged.gps && typeof merged.gps === 'object') {
        const { lat, lng } = merged.gps;
        const mapsUrl = \`https://www.google.com/maps?q=\${lat.toFixed(6)},\${lng.toFixed(6)}\`;
        v = \`\${v}\u2002<a class="gl-exif-maps" href="\${mapsUrl}" target="_blank" rel="noopener" title="Voir sur Google Maps"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2C4.24 2 2 4.24 2 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"/><circle cx="7" cy="7" r="1.5"/></svg></a>\`;
      }
      return \`<div class="gl-exif-row"><span class="gl-exif-k">\${L[k]}</span><span class="gl-exif-v">\${v}</span></div>\`;
    });
  if (!rows.length) return \`<span class="gl-none">\${L.noData}</span>\`;
  return \`<div class="gl-exif-title">\${L.label}</div><div class="gl-exif-rows">\${rows.join('')}</div>\`;
}

/* ── Title overlay ───────────────────────────────────── */
/* Pill with frosted-glass backdrop — always legible regardless of what is
   behind it (photo or black letterbox bars). */
const glTitle = document.getElementById('gl-title');
function updateTitleColor(idx) {
  const exif = PHOTOS[idx]?.exif || {};
  const photoDate = exif.date
    ? new Date(exif.date).toLocaleDateString(PROJECT.locale || 'fr-FR', {year:'numeric', month:'long', day:'numeric'})
    : dateFmt;
  const photoLoc = exif.location || PROJECT.location || '';
  const titleParts = [
    PROJECT.title  || '',
    PROJECT.author ? '\u00a9\u00a0' + PROJECT.author : '',
    photoDate,
    photoLoc,
  ].filter(Boolean);
  glTitle.textContent = titleParts.join('\u2002\u00b7\u2002');
}

/* ── Build GLightbox anchor elements ────────────────── */
/* Hidden <a> elements are the data source for GLightbox; the grid tiles
   call lb.openAt(idx) directly rather than relying on href clicks. */
const glItems = document.getElementById('gl-items');
PHOTOS.forEach((p, i) => {
  const a = document.createElement('a');
  a.href         = 'img/full/' + p.name + '.webp';
  a.className    = 'glightbox';
  a.dataset.type    = 'image';
  a.dataset.gallery = 'main';
  // Title and description are handled by fixed overlays (#gl-title, #gl-info-btn)
  glItems.appendChild(a);
});

/* ── Build editorial grid (12-photo repeating pattern) ─ */
/*
  Each cycle of 12 photos spans 6 rows in a 3-column CSS grid.
  Two "big" tiles occupy 2×2 cells to create visual rhythm:
    pos 0  → big-left  (col 1-2, rows 1-2)
    pos 8  → big-right (col 2-3, rows 4-5)
  All other positions are standard 1×1 small tiles.

  Detailed layout per cycle (r = first row of the cycle):
  Bloc A  r+0,r+1 : [big col1-2 rows 0-1] [small col3 row 0] / [big cont.] [small col3 row 1]
          r+2     : [small] [small] [small]
  Bloc B  r+3,r+4 : [small col1] [big col2-3 rows 3-4] / [small col1] [big cont.]
          r+5     : [small] [small] [small]
*/
const grid = document.getElementById('grid');

function makeTile(photo, idx) {
  const tile = document.createElement('div');
  tile.className    = 'tile';
  tile.dataset.idx  = idx;

  const isBig = photo.role === 'big';
  const img = document.createElement('img');
  img.src     = 'img/grid/' + photo.name + '.webp';
  img.srcset  = 'img/grid-sm/' + photo.name + '.webp ' + (isBig ? ${gridMobBig} : ${gridMobSmall}) + 'w, img/grid/' + photo.name + '.webp ' + (isBig ? '1400' : '800') + 'w';
  img.sizes   = isBig
    ? '(max-width: 767px) 66vw, 1400px'
    : '(max-width: 767px) 33vw, 800px';
  img.alt     = photo.name;
  img.loading = idx < 20 ? 'eager' : 'lazy';
  img.decoding= idx < 20 ? 'sync'  : 'async';
  if (idx === 0) img.fetchPriority = 'high';
  img.addEventListener('load', () => tile.classList.add('ready'));

  const num = document.createElement('span');
  num.className   = 'tile-n';
  num.textContent = idx + 1;

  tile.appendChild(img);
  tile.appendChild(num);
  tile.addEventListener('click', () => {
    lb.openAt(idx);
  });
  return tile;
}

/*
  tilePos returns the CSS grid-column and grid-row values for photo index i.
  The 12-position cycle maps directly to absolute row numbers so every cycle
  stacks cleanly below the previous one.
*/
function tilePos(i) {
  const cycle   = Math.floor(i / 12);
  const pos     = i % 12;
  const r       = cycle * 6 + 1; // first CSS grid row of this cycle (1-based)
  return [
    { col:'1 / span 2', row:\`\${r} / span 2\`,     big:true  }, // 0  big-left
    { col:'3',          row:\`\${r}\`,               big:false }, // 1
    { col:'3',          row:\`\${r + 1}\`,           big:false }, // 2
    { col:'1',          row:\`\${r + 2}\`,           big:false }, // 3
    { col:'2',          row:\`\${r + 2}\`,           big:false }, // 4
    { col:'3',          row:\`\${r + 2}\`,           big:false }, // 5
    { col:'1',          row:\`\${r + 3}\`,           big:false }, // 6
    { col:'1',          row:\`\${r + 4}\`,           big:false }, // 7
    { col:'2 / span 2', row:\`\${r + 3} / span 2\`, big:true  }, // 8  big-right
    { col:'1',          row:\`\${r + 5}\`,           big:false }, // 9
    { col:'2',          row:\`\${r + 5}\`,           big:false }, // 10
    { col:'3',          row:\`\${r + 5}\`,           big:false }, // 11
  ][pos];
}

for (let i = 0; i < PHOTOS.length; i++) {
  const tile = makeTile(PHOTOS[i], i);
  const pos  = tilePos(i);
  tile.style.gridColumn = pos.col;
  tile.style.gridRow    = pos.row;
  grid.appendChild(tile);
}

/* ── GLightbox configuration ─────────────────────────── */
const lb = GLightbox({
  selector:        '.glightbox',
  touchNavigation: true,
  keyboardNavigation: true,
  zoomable:        false,
  draggable:       true,
  loop:            true,
  skin:            'clean',
  descPosition:    'bottom',
  openEffect:      'fade',
  closeEffect:     'fade',
  slideEffect:     '${slideEffect}',
  plyr: {},
});

/* ── Thumbnail strip (tiny-slider) ──────────────────── */
/* The strip is built lazily on first lightbox open to avoid blocking
   the initial page render with DOM creation for potentially hundreds of items. */
let thumbSlider = null;
let thumbsReady = false;

async function buildThumbs() {
  if (thumbsReady) return;
  thumbsReady = true;

  // Load tiny-slider on demand — keeps it out of the critical path.
  if (typeof tns === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '${vp}tiny-slider.js'; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const inner = document.getElementById('gl-thumbs-inner');
  inner.innerHTML = '';
  PHOTOS.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'tns-thumb-item';
    item.dataset.i = i;
    const img = document.createElement('img');
    img.src    = 'img/grid/' + p.name + '.webp';
    img.alt    = '';
    img.loading= 'lazy';
    item.appendChild(img);
    item.addEventListener('click', () => lb.openAt(i));
    inner.appendChild(item);
  });

  thumbSlider = tns({
    container:     '#gl-thumbs-inner',
    items:         Math.min(PHOTOS.length, 10),
    gutter:        2,
    mouseDrag:     true,
    swipeAngle:    false,
    speed:         300,
    nav:           false,
    controls:      false,
    responsive: {
      0:   { items: 5 },
      480: { items: 7 },
      768: { items: 9 },
      1024:{ items: 11 },
      1440:{ items: 13 },
    },
  });
}

function syncThumb(idx) {
  if (!thumbsReady) return;
  document.querySelectorAll('.tns-thumb-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  // Scroll the strip so the active thumbnail is centred in view.
  if (thumbSlider) {
    const info  = thumbSlider.getInfo();
    const items = info.items;
    const start = Math.max(0, idx - Math.floor(items / 2));
    thumbSlider.goTo(start);
  }
}

/* ── Download permissions ────────────────────────────── */
const CAN_DL_IMAGE   = PROJECT.allowDownloadImage   !== false;
const CAN_DL_GALLERY = PROJECT.allowDownloadGallery !== false;

/* ── Overlay buttons: EXIF, Download, Fullscreen ─────── */
const exifOverlay = document.getElementById('gl-exif-overlay');
const exifInner   = document.getElementById('gl-exif-inner');
const dlBtn       = document.getElementById('gl-dl-btn');
const fsBtn       = document.getElementById('gl-fs-btn');
const infoBtn     = document.getElementById('gl-info-btn');
let exifOpen = false;
let dlCurrentPath = '';
let dlCurrentName = '';

// Hide download buttons if disabled in config.
if (!CAN_DL_IMAGE   && dlBtn)                                 dlBtn.remove();
if (!CAN_DL_GALLERY) document.getElementById('dl-all-btn')?.remove();

/* ── Per-photo download (Web Share API on iOS → Photos; fallback to <a> download) */
if (CAN_DL_IMAGE && dlBtn) {
  dlBtn.addEventListener('click', async () => {
    dlBtn.blur();
    // Web Share API with files — supported on iOS 15+ / Safari 15+ / Android Chrome.
    // On iOS this opens the native share sheet which offers "Save to Photos".
    if (navigator.share && navigator.canShare) {
      try {
        const res  = await fetch(dlCurrentPath);
        const blob = await res.blob();
        const file = new File([blob], dlCurrentName, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: dlCurrentName });
          return;
        }
      } catch (_) { /* fall through to link download on error */ }
    }
    // Fallback: create a temporary <a download> and click it.
    const a = document.createElement('a');
    a.href = dlCurrentPath; a.download = dlCurrentName; a.click();
  });
}

/* Fullscreen toggle — visibility driven by CSS (body.glightbox-open rule).
   The button is removed entirely if the Fullscreen API is unavailable so it
   never shows as an inert element. */
if (fsBtn) {
  if (!document.fullscreenEnabled) {
    fsBtn.remove();   // API not available — drop the button from the DOM
  } else {
    fsBtn.addEventListener('click', () => {
      fsBtn.blur();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        fsBtn.setAttribute('title', 'Exit fullscreen');
      } else {
        document.exitFullscreen();
        fsBtn.setAttribute('title', 'Fullscreen');
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const icon = document.fullscreenElement
        ? \`<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H2v3M14 6V2h-3M11 15h3v-3M2 10v4h3"/></svg>\`
        : \`<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6V2h4M10 2h4v4M15 10v4h-4M6 14H2v-4"/></svg>\`;
      fsBtn.innerHTML = icon;
    });
  }
}

function syncOverlays(idx) {
  const p = PHOTOS[idx];
  dlCurrentPath = 'originals/' + p.name + '.jpg';
  dlCurrentName = p.name + '.jpg';
  if (exifOpen) exifInner.innerHTML = exifHTML(p.exif || {});
}

function showExif(idx) {
  exifInner.innerHTML = exifHTML(PHOTOS[idx].exif || {});
  exifOverlay.style.display = '';
  exifOpen = true;
  infoBtn.classList.add('active');
}

function hideExif() {
  exifOverlay.style.display = 'none';
  exifOpen = false;
  infoBtn.classList.remove('active');
}

/* ── Slideshow ───────────────────────────────────────── */
const SW_IDLE_DELAY  = 2500;   // ms of inactivity before hiding controls
const swBtn          = document.getElementById('slideshow-btn');
const swIntervalSel  = document.getElementById('sw-interval');
// Interval is read live from the selector so the user can change it mid-show.
const swGetInterval  = () => (parseInt(swIntervalSel.value, 10) || 3) * 1000;
const swIcon       = document.getElementById('sw-icon');
const glSwBtn      = document.getElementById('gl-sw-btn');
const glSwIcon     = document.getElementById('gl-sw-icon');

let   swActive     = false;
let   swTimer      = null;
let   idleTimer    = null;
let   lbOpen       = false;

const SW_ICON_PLAY  = \`<polygon points="3,1 15,8 3,15"/>\`;
const SW_ICON_PAUSE = \`<rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/>\`;

function swSetIcon(playing) {
  // Toolbar button
  swIcon.innerHTML = playing ? SW_ICON_PAUSE : SW_ICON_PLAY;
  swBtn.classList.toggle('active', playing);
  swBtn.title = playing ? 'Pause slideshow' : 'Start slideshow';
  swBtn.setAttribute('aria-label', swBtn.title);
  // Lightbox overlay button — visible only while slideshow is running
  glSwIcon.innerHTML = playing ? SW_ICON_PAUSE : SW_ICON_PLAY;
  glSwBtn.style.display = playing ? 'flex' : 'none';
  glSwBtn.title = playing ? 'Pause slideshow' : 'Resume slideshow';
  glSwBtn.setAttribute('aria-label', glSwBtn.title);
}

glSwBtn.addEventListener('click', () => {
  glSwBtn.blur();
  if (swActive) swPause(); else swStart(lb.getActiveSlideIndex());
});

/* ── Idle auto-hide ──────────────────────────────────── */
function swIdleReset() {
  document.body.classList.remove('sw-idle');
  clearTimeout(idleTimer);
  if (!swActive) return;
  idleTimer = setTimeout(() => {
    if (swActive) document.body.classList.add('sw-idle');
  }, SW_IDLE_DELAY);
}

function swIdleStop() {
  clearTimeout(idleTimer);
  idleTimer = null;
  document.body.classList.remove('sw-idle');
}

// Any activity resets the hide timer while slideshow is running.
['mousemove', 'mousedown', 'touchstart', 'touchmove', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => { if (swActive) swIdleReset(); }, { passive: true });
});

function swScheduleNext() {
  clearTimeout(swTimer);
  swTimer = setTimeout(() => {
    if (!swActive) return;
    const idx = lb.getActiveSlideIndex();
    if (idx >= PHOTOS.length - 1) { lb.openAt(0); } else { lb.nextSlide(); }
    // slide_changed event will call swScheduleNext() to keep the chain going.
  }, swGetInterval());
}

function swStart(startIdx) {
  swActive = true;
  document.body.classList.add('sw-playing');
  swSetIcon(true);
  if (!lbOpen) lb.openAt(startIdx ?? 0);
  // Try native fullscreen (silently ignored on iOS Safari).
  if (document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  swScheduleNext();
  swIdleReset();
}

function swPause() {
  swActive = false;
  document.body.classList.remove('sw-playing');
  clearTimeout(swTimer);
  swTimer = null;
  swSetIcon(false);
  swIdleStop();
}

function swStop() {
  swPause();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

swBtn.addEventListener('click', () => {
  if (swActive) swPause();
  else swStart(lbOpen ? lb.getActiveSlideIndex() : 0);
});

/* ── GLightbox event handlers ────────────────────────── */
// Overlay buttons live outside the GLightbox dialog; GLightbox sets
// aria-hidden="true" on them when the lightbox opens or navigates.
// If any of these buttons has focus at that moment the browser logs an
// accessibility warning.  blurOverlays() is called before every such event
// AND on each button's own click handler so focus is never retained.
const OVERLAY_BTNS = [glSwBtn, fsBtn, dlBtn, infoBtn].filter(Boolean);
function blurOverlays() {
  OVERLAY_BTNS.forEach(b => { if (document.activeElement === b) b.blur(); });
}

lb.on('open', () => {
  lbOpen = true;
  blurOverlays();
  buildThumbs();
  const idx = lb.getActiveSlideIndex();
  document.getElementById('gl-thumbs').style.display = 'block';
  if (CAN_DL_IMAGE && dlBtn) dlBtn.style.display = 'flex';
  infoBtn.style.display = 'flex';
  syncOverlays(idx);
  syncThumb(idx);
  updateTitleColor(idx);
});

lb.on('slide_changed', ({ current }) => {
  blurOverlays();
  const idx = current.index;
  syncOverlays(idx);
  syncThumb(idx);
  updateTitleColor(idx);
  if (exifOpen) showExif(idx);
  if (swActive) swScheduleNext();  // reset countdown on every slide (swipe or auto)
});

lb.on('close', () => {
  lbOpen = false;
  document.getElementById('gl-thumbs').style.display = 'none';
  if (CAN_DL_IMAGE && dlBtn) dlBtn.style.display = 'none';
  infoBtn.style.display = 'none';
  hideExif();
  swStop();
});

/* (i) button toggles the EXIF overlay for the currently displayed photo */
infoBtn.addEventListener('click', () => {
  infoBtn.blur();
  if (exifOpen) hideExif();
  else showExif(lb.getActiveSlideIndex());
});

/* ── Multilingual legal notice ───────────────────────── */
const legalOverlay = document.getElementById('legal-overlay');
const legalBody    = document.getElementById('legal-body');

/** Close the legal overlay — one helper so there is no repetition. */
function closeLegalOverlay() { legalOverlay.style.display = 'none'; }

const LEGAL_I18N = {
  en: {
    btn:   "Legal notice",
    title: "Protected Photographs \u2013 Legal Information",
    intro: (a,yr) => \`The images in this folder are original works by <strong>\${a}</strong> (\u00a9\u00a0\${yr}). They are protected by Swiss copyright law. Any unauthorised use is strictly prohibited.\`,
    h1:    "Usage rights",
    p1:    "Under the <strong>Federal Act on Copyright and Related Rights (CopA)</strong>, all exclusive rights to these photographs belong to their author. This includes:",
    b1:    ["The right to decide on the use of their works (Art.\u00a010 CopA)", "Automatic recognition of the author as rights holder (Art.\u00a02 CopA)"],
    law:   "Copyright Act \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en",
    h2:    "Conditions of use",
    p2:    "Access to these photographs is limited to <strong>private use</strong> (cf.\u00a0Art.\u00a019 CopA). This means you may:",
    b2:    ["View them", "Copy or print them <strong>for personal use only</strong>"],
    p2b:   "Any other use (publication, reproduction, distribution, adaptation, etc.) is strictly prohibited without <strong>written authorisation</strong> from the author.",
    h3:    "Permission requests",
    p3:    "To use one or more photographs for other purposes (publication, artistic project, website, exhibition, etc.), please contact the author:",
    footer:"Thank you for respecting these conditions and supporting the protection of artistic creation.",
    work:  "Work",
    anon:  "Anonymous",
  },
  fr: {
    btn:   "Mentions l\u00e9gales",
    title: "Photographies prot\u00e9g\u00e9es \u2013 Informations l\u00e9gales",
    intro: (a,yr) => \`Les images contenues dans ce dossier sont des \u0153uvres originales de <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Elles sont prot\u00e9g\u00e9es par la l\u00e9gislation suisse en mati\u00e8re de droit d\u2019auteur. Toute utilisation non autoris\u00e9e est interdite.\`,
    h1:    "Droits d\u2019utilisation",
    p1:    "En vertu de la <strong>Loi f\u00e9d\u00e9rale sur le droit d\u2019auteur et les droits voisins (LDA)</strong>, les droits exclusifs appartiennent \u00e0 leur auteur\u00a0:",
    b1:    ["Le droit de d\u00e9cider de l\u2019utilisation de ses \u0153uvres (art.\u00a010 LDA)", "La reconnaissance automatique de l\u2019auteur comme titulaire des droits (art.\u00a02 LDA)"],
    law:   "Loi sur le droit d\u2019auteur \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr",
    h2:    "Conditions d\u2019utilisation",
    p2:    "L\u2019acc\u00e8s aux photographies est limit\u00e9 \u00e0 un <strong>usage priv\u00e9</strong> (cf.\u00a0art.\u00a019 LDA). Cela signifie que vous pouvez\u00a0:",
    b2:    ["Les visualiser", "Les copier ou les imprimer <strong>pour un usage personnel uniquement</strong>"],
    p2b:   "Toute autre utilisation (publication, reproduction, diffusion, adaptation, etc.) est strictement interdite sans une <strong>autorisation \u00e9crite</strong> de l\u2019auteur.",
    h3:    "Demande d\u2019autorisation",
    p3:    "Pour utiliser une ou plusieurs photographies dans un autre cadre, merci de contacter l\u2019auteur\u00a0:",
    footer:"Merci de respecter ces conditions et de contribuer \u00e0 la protection de la cr\u00e9ation artistique.",
    work:  "\u0152uvre",
    anon:  "Anonyme",
  },
  de: {
    btn:   "Rechtliche Hinweise",
    title: "Urheberrechtlich gesch\u00fctzte Fotografien \u2013 Rechtliche Informationen",
    intro: (a,yr) => \`Die in diesem Ordner enthaltenen Bilder sind Originalwerke von <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Sie sind durch das schweizerische Urheberrecht gesch\u00fctzt. Jede unbefugte Nutzung ist untersagt.\`,
    h1:    "Nutzungsrechte",
    p1:    "Gem\u00e4\u00df dem <strong>Bundesgesetz \u00fcber das Urheberrecht und verwandte Schutzrechte (URG)</strong> liegen die ausschlie\u00dflichen Rechte beim Autor:",
    b1:    ["Das Recht, \u00fcber die Verwendung seiner Werke zu entscheiden (Art.\u00a010 URG)", "Die automatische Anerkennung des Autors als Rechteinhaber (Art.\u00a02 URG)"],
    law:   "Urheberrechtsgesetz \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/de",
    h2:    "Nutzungsbedingungen",
    p2:    "Der Zugang zu den Fotografien ist auf den <strong>privaten Gebrauch</strong> beschr\u00e4nkt (vgl.\u00a0Art.\u00a019 URG). Das bedeutet:",
    b2:    ["Sie d\u00fcrfen sie ansehen", "Sie d\u00fcrfen sie <strong>ausschlie\u00dflich f\u00fcr den pers\u00f6nlichen Gebrauch</strong> kopieren oder drucken"],
    p2b:   "Jede andere Verwendung (Ver\u00f6ffentlichung, Vervielf\u00e4ltigung, Verbreitung, Bearbeitung usw.) ist ohne <strong>schriftliche Genehmigung</strong> des Autors verboten.",
    h3:    "Genehmigungsanfragen",
    p3:    "F\u00fcr die Nutzung einer oder mehrerer Fotografien zu anderen Zwecken wenden Sie sich bitte an den Autor:",
    footer:"Vielen Dank, dass Sie diese Bedingungen einhalten und zum Schutz k\u00fcnstlerischer Werke beitragen.",
    work:  "Werk",
    anon:  "Anonym",
  },
  it: {
    btn:   "Note legali",
    title: "Fotografie protette \u2013 Informazioni legali",
    intro: (a,yr) => \`Le immagini contenute in questa cartella sono opere originali di <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Sono protette dalla legislazione svizzera sul diritto d\u2019autore. Qualsiasi utilizzo non autorizzato \u00e8 vietato.\`,
    h1:    "Diritti d\u2019uso",
    p1:    "Ai sensi della <strong>Legge federale sul diritto d\u2019autore e sui diritti affini (LDA)</strong>, i diritti esclusivi appartengono al loro autore:",
    b1:    ["Il diritto di decidere l\u2019utilizzo delle proprie opere (art.\u00a010 LDA)", "Il riconoscimento automatico dell\u2019autore come titolare dei diritti (art.\u00a02 LDA)"],
    law:   "Legge sul diritto d\u2019autore \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/it",
    h2:    "Condizioni d\u2019uso",
    p2:    "L\u2019accesso alle fotografie \u00e8 limitato all\u2019<strong>uso privato</strong> (cfr.\u00a0art.\u00a019 LDA). Ci\u00f2 significa che \u00e8 possibile:",
    b2:    ["Visualizzarle", "Copiarle o stamparle <strong>esclusivamente per uso personale</strong>"],
    p2b:   "Qualsiasi altro utilizzo (\u00e8 vietato senza <strong>autorizzazione scritta</strong> dell\u2019autore.",
    h3:    "Richieste di autorizzazione",
    p3:    "Per utilizzare una o pi\u00f9 fotografie per altri scopi, la preghiamo di contattare l\u2019autore:",
    footer:"Grazie per aver rispettato queste condizioni e per contribuire alla tutela della creazione artistica.",
    work:  "Opera",
    anon:  "Anonimo",
  },
  es: {
    btn:   "Aviso legal",
    title: "Fotograf\u00edas protegidas \u2013 Informaci\u00f3n legal",
    intro: (a,yr) => \`Las im\u00e1genes contenidas en esta carpeta son obras originales de <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Est\u00e1n protegidas por la legislaci\u00f3n suiza sobre derechos de autor. Cualquier uso no autorizado est\u00e1 prohibido.\`,
    h1:    "Derechos de uso",
    p1:    "En virtud de la <strong>Ley Federal sobre Derechos de Autor y Derechos Afines (LDA)</strong>, los derechos exclusivos pertenecen a su autor:",
    b1:    ["El derecho a decidir el uso de sus obras (art.\u00a010 LDA)", "El reconocimiento autom\u00e1tico del autor como titular de los derechos (art.\u00a02 LDA)"],
    law:   "Ley de derechos de autor \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr",
    h2:    "Condiciones de uso",
    p2:    "El acceso a las fotograf\u00edas est\u00e1 limitado al <strong>uso privado</strong> (cf.\u00a0art.\u00a019 LDA). Esto significa que puede:",
    b2:    ["Visualizarlas", "Copiarlas o imprimirlas <strong>\u00fanicamente para uso personal</strong>"],
    p2b:   "Cualquier otro uso est\u00e1 estrictamente prohibido sin <strong>autorizaci\u00f3n escrita</strong> del autor.",
    h3:    "Solicitudes de autorizaci\u00f3n",
    p3:    "Para utilizar una o m\u00e1s fotograf\u00edas para otros fines, p\u00f3ngase en contacto con el autor:",
    footer:"Gracias por respetar estas condiciones y contribuir a la protecci\u00f3n de la creaci\u00f3n art\u00edstica.",
    work:  "Obra",
    anon:  "An\u00f3nimo",
  },
  pt: {
    btn:   "Aviso legal",
    title: "Fotografias protegidas \u2013 Informa\u00e7\u00f5es legais",
    intro: (a,yr) => \`As imagens contidas nesta pasta s\u00e3o obras originais de <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Est\u00e3o protegidas pela legisla\u00e7\u00e3o su\u00ed\u00e7a de direitos de autor. Qualquer utiliza\u00e7\u00e3o n\u00e3o autorizada \u00e9 proibida.\`,
    h1:    "Direitos de utiliza\u00e7\u00e3o",
    p1:    "Nos termos da <strong>Lei Federal sobre Direito de Autor e Direitos Conexos (LDA)</strong>, os direitos exclusivos pertencem ao seu autor:",
    b1:    ["O direito de decidir sobre a utiliza\u00e7\u00e3o das suas obras (art.\u00a010 LDA)", "O reconhecimento autom\u00e1tico do autor como titular dos direitos (art.\u00a02 LDA)"],
    law:   "Lei de direitos de autor \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr",
    h2:    "Condi\u00e7\u00f5es de utiliza\u00e7\u00e3o",
    p2:    "O acesso \u00e0s fotografias est\u00e1 limitado ao <strong>uso privado</strong> (cf.\u00a0art.\u00a019 LDA). Isso significa que pode:",
    b2:    ["Visualiz\u00e1-las", "Copi\u00e1-las ou imprimi-las <strong>apenas para uso pessoal</strong>"],
    p2b:   "Qualquer outro uso \u00e9 estritamente proibido sem <strong>autoriza\u00e7\u00e3o escrita</strong> do autor.",
    h3:    "Pedidos de autoriza\u00e7\u00e3o",
    p3:    "Para utilizar uma ou mais fotografias para outros fins, por favor contacte o autor:",
    footer:"Obrigado por respeitar estas condi\u00e7\u00f5es e contribuir para a prote\u00e7\u00e3o da cria\u00e7\u00e3o art\u00edstica.",
    work:  "Obra",
    anon:  "An\u00f4nimo",
  },
};

function buildLegalHTML(l) {
  // Custom template takes full priority over the built-in multilingual strings.
  if (PROJECT.legalHtml) return PROJECT.legalHtml;
  const T  = LEGAL_I18N[l] || LEGAL_I18N.en;
  const a  = PROJECT.author || T.anon;
  const yr = PROJECT.date ? PROJECT.date.slice(0,4) : new Date().getFullYear();
  const em = PROJECT.authorEmail
    ? \`<a href="mailto:\${PROJECT.authorEmail}">\${PROJECT.authorEmail}</a>\`
    : '';
  const li = arr => arr.map(x => \`<li>\${x}</li>\`).join('');

  // Work identification block — only render fields that are actually set in the config.
  const workParts = [
    PROJECT.title    ? \`<strong>\${PROJECT.title}</strong>\`    : null,
    PROJECT.subtitle ? \`<em>\${PROJECT.subtitle}</em>\`         : null,
    PROJECT.location ? PROJECT.location                         : null,
  ].filter(Boolean);
  const workBlock = workParts.length
    ? \`<h2>\${T.work}</h2><p>\${workParts.join(' \u00b7 ')}</p>\${PROJECT.description ? '<p><em>' + PROJECT.description + '</em></p>' : ''}\`
    : '';

  return \`
    <h1>\${T.title}</h1>
    \${workBlock}
    <p>\${T.intro(a, yr)}</p>
    <h2>\${T.h1}</h2>
    <p>\${T.p1}</p>
    <ul>\${li(T.b1)}</ul>
    <p><a href="\${T.lawUrl}" target="_blank" rel="noopener">\${T.law}</a></p>
    <h2>\${T.h2}</h2>
    <p>\${T.p2}</p>
    <ul>\${li(T.b2)}</ul>
    <p>\${T.p2b}</p>
    <h2>\${T.h3}</h2>
    <p>\${T.p3}</p>
    <p><strong>\${a}</strong>\${em ? '<br>' + em : ''}</p>
    <hr>
    <p>\${T.footer}</p>
  \`;
}

function buildLegalText(l) {
  // Custom template takes full priority over the built-in multilingual strings.
  if (PROJECT.legalTxt) return PROJECT.legalTxt;
  const T    = LEGAL_I18N[l] || LEGAL_I18N.en;
  const a    = PROJECT.author || T.anon;
  const yr   = PROJECT.date ? PROJECT.date.slice(0,4) : new Date().getFullYear();
  const em   = PROJECT.authorEmail || '';
  const strip = s => s.replace(/<[^>]*>/g, '');
  const sep  = '-'.repeat(60);

  // Work identification block (plain-text version, only non-empty fields).
  const workLines = [PROJECT.title, PROJECT.subtitle, PROJECT.location].filter(Boolean);
  const workSection = workLines.length
    ? [T.work.toUpperCase(), workLines.join(' \u00b7 '), ...(PROJECT.description ? [PROJECT.description] : []), '']
    : [];

  return [
    T.title, sep, '',
    ...workSection,
    strip(T.intro(a, yr)), '',
    T.h1.toUpperCase(),
    strip(T.p1),
    T.b1.map(b => '  \u2022 ' + strip(b)).join('\\n'),
    T.law + ': ' + T.lawUrl, '',
    T.h2.toUpperCase(),
    strip(T.p2),
    T.b2.map(b => '  \u2022 ' + strip(b)).join('\\n'),
    strip(T.p2b), '',
    T.h3.toUpperCase(),
    strip(T.p3),
    a + (em ? '\\n' + em : ''),
    '', sep, T.footer,
  ].join('\\n');
}

// Localize the "Legal notice" button to match the gallery's locale.
document.getElementById('legal-btn').textContent = (LEGAL_I18N[lang] || LEGAL_I18N.en).btn;

document.getElementById('legal-btn').addEventListener('click', () => {
  legalBody.innerHTML = buildLegalHTML(lang);
  legalOverlay.style.display = 'flex';
});
document.getElementById('legal-close').addEventListener('click', closeLegalOverlay);
legalOverlay.addEventListener('click', e => {
  if (e.target === legalOverlay) closeLegalOverlay();
});

/* ── ESC key — multi-level close ─────────────────────── */
/* Priority order: legal overlay → EXIF overlay → GLightbox (native).
   stopImmediatePropagation prevents GLightbox from consuming the event
   when an overlay above it is dismissed first. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (legalOverlay.style.display !== 'none') {
    e.stopImmediatePropagation();
    closeLegalOverlay();
    return;
  }
  if (exifOpen) {
    e.stopImmediatePropagation();
    hideExif();
    return;
  }
  // otherwise GLightbox handles ESC natively → closes the lightbox → returns to grid
}, true);

/* ── Bulk ZIP download ───────────────────────────────── */
/* Fetches all original JPEGs one by one, bundles them into a ZIP archive
   together with a multilingual legal notice text file, and triggers a
   browser download.  JSZip is loaded from dist/vendor/jszip.min.js. */
(function () {
  const btn   = document.getElementById('dl-all-btn');
  const label = document.getElementById('dl-all-label');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    // Load JSZip on-demand (not included at page load to save ~77 KB).
    if (typeof JSZip === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = '${vp}jszip.min.js'; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const zip = new JSZip();
    let ok = 0;

    for (let i = 0; i < PHOTOS.length; i++) {
      label.textContent = \`\${i + 1} / \${PHOTOS.length}…\`;
      try {
        const res  = await fetch('originals/' + PHOTOS[i].name + '.jpg');
        if (res.ok) { zip.file(PHOTOS[i].name + '.jpg', await res.blob()); ok++; }
      } catch (_) {}
    }

    label.textContent = 'Zipping\u2026';
    // Include only the gallery locale (fallback to EN if not supported).
    const legalLang = LEGAL_I18N[lang] ? lang : 'en';
    zip.file('LEGAL_NOTICE.txt', buildLegalText(legalLang));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    // Slugify the title: strip accents, lowercase, hyphens — gives clean filenames.
    a.download = (PROJECT.title || 'galerie')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      + '.zip';
    a.click();
    URL.revokeObjectURL(a.href);

    label.textContent = 'Download all';
    btn.disabled = false;
  });
})();
`;

  // Inline data.js and gallery.js directly into the HTML so the gallery works
  // regardless of URL path (no trailing-slash issues, deployable in any sub-folder).
  const inlinedHtml = html
    .replace('<script src="data.js"></script>', `<script>\n${dataJs}</script>`)
    .replace('<script src="gallery.js"></script>', `<script>\n${galleryJs}</script>`);

  return { html: inlinedHtml, dataJs, galleryJs };
}

// ── Legal notice (Markdown) ───────────────────────────────────────────────────

/**
 * Generate a French Markdown legal notice written to dist/LEGAL.md.
 * This provides a human-readable rights statement alongside the gallery files.
 *
 * @param {object} cfg - Merged project + build config.
 * @returns {string}   - Markdown string.
 */
const LEGAL_MD_I18N = {
  en: {
    title:   'Copyright Notice',
    intro:   (a, yr) => `The photographs in this folder are original works by **${a}** (© ${yr}).\nThey are protected under Swiss copyright law (CopA/LDA/URG). All rights reserved.\nAny unauthorised use is strictly prohibited.`,
    hWork:   'Work',
    hRights: 'Usage Rights',
    rights:  `Under the **Federal Act on Copyright and Related Rights (CopA)**, all exclusive rights\nto these photographs belong to their author, including:\n\n- The right to decide how their works are used (art. 10 CopA)\n- Automatic recognition of the author as rights holder (art. 2 CopA)\n- Moral rights, inalienable and non-transferable (art. 9 CopA)\n\nFull text of the law: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en`,
    hPermit: 'Permitted Use',
    permit:  `Access is granted for **private use only** (cf. art. 19 CopA):\n\n- Viewing the photographs\n- Copying or printing them **for personal use only**\n\nAny other use — publication, reproduction, distribution, adaptation, removal of metadata\nor watermarks, AI training datasets, etc. — is **strictly forbidden** without prior\nwritten authorisation from the author.`,
    hContact:'Permission Requests',
    contact: `To use one or more photographs for any other purpose (press, editorial, exhibition,\nwebsite, artistic project, etc.), please contact the author:`,
    closing: 'Thank you for respecting these terms and supporting the protection of artistic works.',
    anon:    'Unknown',
  },
  fr: {
    title:   'Notice de droits d\'auteur',
    intro:   (a, yr) => `Les photographies contenues dans ce dossier sont des œuvres originales de **${a}** (© ${yr}).\nElles sont protégées par la loi suisse sur le droit d'auteur (LDA/CopA/URG). Tous droits réservés.\nToute utilisation non autorisée est strictement interdite.`,
    hWork:   'Œuvre',
    hRights: 'Droits d\'utilisation',
    rights:  `En vertu de la **Loi fédérale sur le droit d'auteur et les droits voisins (LDA)**, tous les droits exclusifs\nsur ces photographies appartiennent à leur auteur, notamment :\n\n- Le droit de décider de l'utilisation de ses œuvres (art. 10 LDA)\n- La reconnaissance automatique de l'auteur comme titulaire des droits (art. 2 LDA)\n- Les droits moraux, inaliénables et incessibles (art. 9 LDA)\n\nTexte intégral de la loi : https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr`,
    hPermit: 'Utilisation autorisée',
    permit:  `L'accès est accordé pour un **usage privé uniquement** (cf. art. 19 LDA) :\n\n- Visualisation des photographies\n- Copie ou impression **à usage personnel uniquement**\n\nToute autre utilisation — publication, reproduction, distribution, adaptation, suppression de métadonnées\nou de filigranes, jeux de données pour l'IA, etc. — est **strictement interdite** sans autorisation\nécrite préalable de l'auteur.`,
    hContact:'Demandes d\'autorisation',
    contact: `Pour utiliser une ou plusieurs photographies à d'autres fins (presse, édition, exposition,\nsite web, projet artistique, etc.), veuillez contacter l'auteur :`,
    closing: 'Merci de respecter ces conditions et de soutenir la protection des œuvres artistiques.',
    anon:    'Inconnu',
  },
  de: {
    title:   'Urheberrechtshinweis',
    intro:   (a, yr) => `Die Fotografien in diesem Ordner sind Originalwerke von **${a}** (© ${yr}).\nSie sind durch das schweizerische Urheberrechtsgesetz (URG/CopA/LDA) geschützt. Alle Rechte vorbehalten.\nJede unbefugte Nutzung ist strengstens untersagt.`,
    hWork:   'Werk',
    hRights: 'Nutzungsrechte',
    rights:  `Gemäss dem **Bundesgesetz über das Urheberrecht und verwandte Schutzrechte (URG)** liegen alle ausschliesslichen Rechte\nan diesen Fotografien beim Urheber, einschliesslich:\n\n- Das Recht, über die Verwendung seiner Werke zu entscheiden (Art. 10 URG)\n- Die automatische Anerkennung des Urhebers als Rechteinhaber (Art. 2 URG)\n- Urheberpersönlichkeitsrechte, unveräusserlich und unübertragbar (Art. 9 URG)\n\nVolltext des Gesetzes: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/de`,
    hPermit: 'Erlaubte Nutzung',
    permit:  `Der Zugang wird nur für den **privaten Gebrauch** gewährt (vgl. Art. 19 URG):\n\n- Betrachten der Fotografien\n- Kopieren oder Ausdrucken **ausschliesslich für den persönlichen Gebrauch**\n\nJede andere Verwendung — Veröffentlichung, Vervielfältigung, Verbreitung, Bearbeitung, Entfernung von Metadaten\noder Wasserzeichen, KI-Trainingsdatensätze usw. — ist **strengstens verboten** ohne vorherige\nschriftliche Genehmigung des Urhebers.`,
    hContact:'Genehmigungsanfragen',
    contact: `Um eine oder mehrere Fotografien für andere Zwecke zu verwenden (Presse, Verlag, Ausstellung,\nWebsite, künstlerisches Projekt usw.), wenden Sie sich bitte an den Urheber:`,
    closing: 'Vielen Dank für die Einhaltung dieser Bedingungen und die Unterstützung des Schutzes künstlerischer Werke.',
    anon:    'Unbekannt',
  },
  it: {
    title:   'Nota sul diritto d\'autore',
    intro:   (a, yr) => `Le fotografie contenute in questa cartella sono opere originali di **${a}** (© ${yr}).\nSono protette dalla legislazione svizzera sul diritto d'autore (LDA/CopA/URG). Tutti i diritti riservati.\nQualsiasi utilizzo non autorizzato è vietato.`,
    hWork:   'Opera',
    hRights: 'Diritti d\'uso',
    rights:  `Ai sensi della **Legge federale sul diritto d'autore e sui diritti affini (LDA)**, tutti i diritti esclusivi\nsulle presenti fotografie appartengono al loro autore, inclusi:\n\n- Il diritto di decidere come vengono utilizzate le sue opere (art. 10 LDA)\n- Il riconoscimento automatico dell'autore come titolare dei diritti (art. 2 LDA)\n- I diritti morali, inalienabili e intrasferibili (art. 9 LDA)\n\nTesto integrale della legge: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/it`,
    hPermit: 'Uso consentito',
    permit:  `L'accesso è concesso esclusivamente per **uso privato** (cfr. art. 19 LDA):\n\n- Visualizzazione delle fotografie\n- Copia o stampa **esclusivamente per uso personale**\n\nQualsiasi altro utilizzo — pubblicazione, riproduzione, distribuzione, adattamento, rimozione di metadati\no filigrane, dataset per l'IA, ecc. — è **severamente vietato** senza previa\nautorizzazione scritta dell'autore.`,
    hContact:'Richieste di autorizzazione',
    contact: `Per utilizzare una o più fotografie per qualsiasi altro scopo (stampa, redazione, esposizione,\nsito web, progetto artistico, ecc.), si prega di contattare l'autore:`,
    closing: 'Grazie per aver rispettato questi termini e per sostenere la protezione delle opere artistiche.',
    anon:    'Sconosciuto',
  },
  es: {
    title:   'Aviso de derechos de autor',
    intro:   (a, yr) => `Las fotografías contenidas en esta carpeta son obras originales de **${a}** (© ${yr}).\nEstán protegidas por la legislación suiza sobre derechos de autor (CopA/LDA/URG). Todos los derechos reservados.\nCualquier uso no autorizado está estrictamente prohibido.`,
    hWork:   'Obra',
    hRights: 'Derechos de uso',
    rights:  `De conformidad con la **Ley federal sobre derechos de autor y derechos afines (CopA)**, todos los derechos exclusivos\nsobre estas fotografías pertenecen a su autor, incluyendo:\n\n- El derecho a decidir cómo se utilizan sus obras (art. 10 CopA)\n- El reconocimiento automático del autor como titular de los derechos (art. 2 CopA)\n- Los derechos morales, inalienables e intransferibles (art. 9 CopA)\n\nTexto completo de la ley: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en`,
    hPermit: 'Uso permitido',
    permit:  `El acceso se concede únicamente para **uso privado** (cf. art. 19 CopA):\n\n- Visualización de las fotografías\n- Copia o impresión **exclusivamente para uso personal**\n\nCualquier otro uso — publicación, reproducción, distribución, adaptación, eliminación de metadatos\no marcas de agua, conjuntos de datos para IA, etc. — está **estrictamente prohibido** sin autorización\nescrita previa del autor.`,
    hContact:'Solicitudes de autorización',
    contact: `Para utilizar una o más fotografías con cualquier otro fin (prensa, editorial, exposición,\nsitio web, proyecto artístico, etc.), póngase en contacto con el autor:`,
    closing: 'Gracias por respetar estas condiciones y apoyar la protección de las obras artísticas.',
    anon:    'Desconocido',
  },
  pt: {
    title:   'Aviso de direitos de autor',
    intro:   (a, yr) => `As fotografias contidas nesta pasta são obras originais de **${a}** (© ${yr}).\nEstão protegidas pela legislação suíça sobre direitos de autor (CopA/LDA/URG). Todos os direitos reservados.\nQualquer utilização não autorizada é estritamente proibida.`,
    hWork:   'Obra',
    hRights: 'Direitos de utilização',
    rights:  `Nos termos da **Lei federal sobre direitos de autor e direitos conexos (CopA)**, todos os direitos exclusivos\nsobre estas fotografias pertencem ao seu autor, incluindo:\n\n- O direito de decidir como as suas obras são utilizadas (art. 10 CopA)\n- O reconhecimento automático do autor como titular dos direitos (art. 2 CopA)\n- Os direitos morais, inalienáveis e intransmissíveis (art. 9 CopA)\n\nTexto integral da lei: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en`,
    hPermit: 'Utilização permitida',
    permit:  `O acesso é concedido apenas para **uso privado** (cf. art. 19 CopA):\n\n- Visualização das fotografias\n- Cópia ou impressão **exclusivamente para uso pessoal**\n\nQualquer outra utilização — publicação, reprodução, distribuição, adaptação, remoção de metadados\nou marcas de água, conjuntos de dados para IA, etc. — é **estritamente proibida** sem autorização\nprévia por escrito do autor.`,
    hContact:'Pedidos de autorização',
    contact: `Para utilizar uma ou mais fotografias para qualquer outro fim (imprensa, editorial, exposição,\nsítio web, projeto artístico, etc.), contacte o autor:`,
    closing: 'Obrigado por respeitar estes termos e por apoiar a proteção das obras artísticas.',
    anon:    'Desconhecido',
  },
};

function buildLegalNotice(cfg) {
  const p           = cfg.project;
  const locale      = (p.locale || 'en').slice(0, 2).toLowerCase();
  const T           = LEGAL_MD_I18N[locale] || LEGAL_MD_I18N.en;
  const displayName = p.author || T.anon;
  const year        = p.date ? p.date.slice(0, 4) : new Date().getFullYear();

  const workLines = [
    p.title    ? `**${p.title}**` : null,
    p.subtitle ? p.subtitle       : null,
    p.location ? p.location       : null,
  ].filter(Boolean);
  const workSection = workLines.length
    ? `## ${T.hWork}\n\n${workLines.join(' · ')}${p.description ? '\n\n' + p.description : ''}\n\n`
    : '';

  return `# ${T.title}

${T.intro(displayName, year)}

${workSection}## ${T.hRights}

${T.rights}

## ${T.hPermit}

${T.permit}

## ${T.hContact}

${T.contact}

**${displayName}**
${p.authorEmail ? p.authorEmail : ''}

---

${T.closing}
`;
}

// ── File system helpers ───────────────────────────────────────────────────────

/**
 * Recursively copy a directory from src to dst.
 * Existing files at the destination are overwritten.
 *
 * @param {string} src - Source directory path.
 * @param {string} dst - Destination directory path.
 */
function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ── Site index page ───────────────────────────────────────────────────────────

/**
 * Scan dist/ for all built galleries by reading their photos.json manifests.
 * Returns an array of gallery info objects for every non-private gallery.
 *
 * @returns {{ distName: string, project: object, photoCount: number, firstPhoto: string|null }[]}
 */
function collectBuiltGalleries() {
  if (!fs.existsSync(DIST_ROOT)) return [];
  return fs.readdirSync(DIST_ROOT)
    .filter(entry => {
      const manifestPath = path.join(DIST_ROOT, entry, 'photos.json');
      return fs.existsSync(manifestPath);
    })
    .map(entry => {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(DIST_ROOT, entry, 'photos.json'), 'utf8'));
        const project  = manifest.project || {};
        if (project.private) return null;   // skip private galleries
        const photos     = Object.values(manifest.photos || {});
        const photoCount = photos.length;
        const firstPhoto = photos.find(p => p.name)?.name || null;
        return { distName: entry, project, photoCount, firstPhoto };
      } catch (_) { return null; }
    })
    .filter(Boolean);
}

/**
 * Generate the site index page (dist/index.html) listing all public galleries.
 *
 * @param {string} fontCss - Inlinable @font-face CSS.
 */
function buildIndexHTML(fontCss) {
  const galleries = collectBuiltGalleries();

  // Sort by project date descending (most recent first), then alphabetically.
  galleries.sort((a, b) => {
    const da = a.project.date || '';
    const db = b.project.date || '';
    return db.localeCompare(da) || (a.project.title || '').localeCompare(b.project.title || '');
  });

  const cards = galleries.map(g => {
    const p      = g.project;
    const yr     = p.date ? p.date.slice(0, 4) : '';
    const meta   = [p.location, yr].filter(Boolean).join(' \u00b7 ');
    const bgImg  = g.firstPhoto
      ? `<img class="card-bg" src="${escHtml(g.distName)}/img/grid/${escHtml(g.firstPhoto)}.webp" alt="" loading="lazy">`
      : `<div class="card-bg card-bg-empty"></div>`;
    const subtitleHtml  = p.subtitle    ? `<div class="card-sub">${escHtml(p.subtitle)}</div>`   : '';
    const authorHtml    = p.author      ? `<div class="card-author">\u00a9\u00a0${escHtml(p.author)}</div>` : '';
    const metaHtml      = meta          ? `<span>${escHtml(meta)}</span>` : '';
    const countHtml     = `<span class="card-count">${g.photoCount}\u00a0photo${g.photoCount !== 1 ? 's' : ''}</span>`;
    return `<a class="card" href="${escHtml(g.distName)}/">
  ${bgImg}
  <div class="card-body">
    <div class="card-title">${escHtml(p.title || g.distName)}</div>
    ${subtitleHtml}
    ${authorHtml}
    <div class="card-meta">${metaHtml}${metaHtml && countHtml ? '<span class="card-sep">\u00b7</span>' : ''}${countHtml}</div>
  </div>
</a>`;
  }).join('\n');

  const emptyState = galleries.length === 0
    ? `<p class="empty">No gallery built yet. Run <code>npm run build:all</code>.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SSGG — Galleries</title>
<style>
${fontCss}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#1c1c1c;--ink:#e8e4dd;--muted:#706860;--accent:#c8a96e;--gap:2px;--bar:56px}
html,body{min-height:100%;background:var(--bg);color:var(--ink);font-family:'Poppins',sans-serif}
.bar{
  position:fixed;top:0;left:0;right:0;height:var(--bar);
  display:flex;align-items:center;padding:0 24px;
  background:rgba(0,0,0,.85);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border-bottom:1px solid rgba(255,255,255,.07);z-index:90
}
.bar-title{font-size:15px;font-weight:600;letter-spacing:-.01em}
.bar-sub{font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.wrap{padding:calc(var(--bar) + 32px) 24px 48px}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
  gap:16px;max-width:1200px;margin:0 auto
}
.card{
  display:block;position:relative;
  aspect-ratio:3/2;overflow:hidden;border-radius:8px;
  text-decoration:none;background:#111;
  transition:transform .25s cubic-bezier(.25,.46,.45,.94),box-shadow .25s
}
.card:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.6)}
.card-bg{
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;display:block;
  transition:transform .4s cubic-bezier(.25,.46,.45,.94)
}
.card:hover .card-bg{transform:scale(1.04)}
.card-bg-empty{position:absolute;inset:0;background:linear-gradient(135deg,#1a1a1a,#111)}
.card-body{
  position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.1) 65%,transparent 100%);
  display:flex;flex-direction:column;justify-content:flex-end;
  padding:18px 20px
}
.card-title{font-size:14px;font-weight:600;color:#fff;line-height:1.3;margin-bottom:3px}
.card-sub{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:3px;font-weight:300}
.card-author{font-size:11px;color:rgba(255,255,255,.45);margin-bottom:6px;font-weight:300}
.card-meta{
  display:flex;align-items:center;gap:6px;
  font-size:10px;color:rgba(255,255,255,.35);letter-spacing:.04em
}
.card-sep{color:rgba(255,255,255,.2)}
.card-count{color:var(--accent);font-weight:500}
.empty{color:var(--muted);font-size:13px;text-align:center;padding:48px 0}
.empty code{color:rgba(255,255,255,.5);font-family:monospace;font-size:12px}
.footer{text-align:center;padding:0 0 32px;font-size:10px;color:rgba(255,255,255,.15);letter-spacing:.1em;text-transform:uppercase}
.footer a{color:rgba(255,255,255,.2);text-decoration:none}.footer a:hover{color:rgba(255,255,255,.5)}
</style>
</head>
<body>
<div class="bar">
  <div>
    <div class="bar-title">Galleries</div>
    <div class="bar-sub">${galleries.length} public galerie${galleries.length !== 1 ? 's' : ''}</div>
  </div>
</div>
<main class="wrap">
  <div class="grid">
${emptyState}
${cards}
  </div>
</main>
<footer class="footer">
  <a href="https://github.com/pvollenweider/ssgg" target="_blank" rel="noopener">SSGG v${VERSION}</a>
</footer>
</body>
</html>`;

  fs.writeFileSync(path.join(DIST_ROOT, 'index.html'), html, 'utf8');
  ok('index.html → dist/  (site index)');
}

// ── HTML escaping ─────────────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into an HTML attribute or text node.
 *
 * @param {string} s - Raw string.
 * @returns {string} - HTML-safe string.
 */
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Build a single gallery by name.
 * Returns gallery metadata used to populate the site index page.
 *
 * @param {string} srcName    - Gallery folder name under src/.
 * @param {{ build: object }} cfg - Shared build config.
 * @param {string} fontCss    - Inlinable @font-face CSS from downloadFonts().
 * @returns {Promise<{srcName, distName, project, photoCount, firstPhoto}|null>}
 */
async function buildGallery(srcName, { build }, fontCss) {
  // Read config first so we can compute the dist folder name (private → hash).
  const cfgPath = path.join(SRC_ROOT, srcName, 'gallery.config.json');
  const galCfg  = readConfig(cfgPath);
  galCfg.build  = build;

  const distName = galleryDistName(galCfg.project, srcName);
  const paths    = galleryPaths(srcName, distName);

  if (galCfg.project.private) {
    log(`\n\x1b[1m📷  Gallery: ${srcName}\x1b[0m \x1b[33m(private → ${distName})\x1b[0m`);
  } else {
    log(`\n\x1b[1m📷  Gallery: ${srcName}\x1b[0m`);
  }
  log(`   Title  : ${galCfg.project.title || '(no title)'}`);
  log(`   Source : ${paths.srcDir}`);
  log(`   Dist   : ${paths.dist}\n`);

  // Ensure all output directories exist before writing any files.
  const noDownloads = galCfg.project.allowDownloadImage   === false
                   && galCfg.project.allowDownloadGallery === false;
  fs.mkdirSync(path.join(paths.distImg, 'grid'),    { recursive: true });
  fs.mkdirSync(path.join(paths.distImg, 'grid-sm'), { recursive: true });
  fs.mkdirSync(path.join(paths.distImg, 'full'),    { recursive: true });
  if (!noDownloads) fs.mkdirSync(paths.distOri, { recursive: true });

  // Convert photos.
  const photos = listPhotos(paths.srcDir);
  if (photos.length === 0) { fail(`No photos found in ${paths.srcDir}`); return null; }
  log(`\n\x1b[1m🖼   Conversion (${photos.length} photo(s))\x1b[0m`);

  const results = await processPhotos(photos, galCfg, paths);

  // Reverse-geocode any GPS coordinates → human-readable place name.
  // Results are cached in photos.json so subsequent builds skip the API call.
  await resolveGpsLocations(results, paths.manifest, galCfg.project.locale || 'en');

  // Resolve date:'auto' — pick the earliest EXIF DateTimeOriginal across all photos.
  if (galCfg.project.date === 'auto') {
    const exifDates = results
      .map(p => p.exif?.date)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()));
    if (exifDates.length) {
      exifDates.sort((a, b) => a - b);
      galCfg.project.date = exifDates[0].toISOString().slice(0, 10);
      ok(`date: auto → ${galCfg.project.date}  (earliest EXIF date)`);
    } else {
      galCfg.project.date = '';
      ok('date: auto → no EXIF dates found, date left empty');
    }
  }

  // HTML + JS output (skipped in --webp-only mode).
  if (!WEBP_ONLY) {
    const isStandalone = !!galCfg.project.standalone;
    log('\n\x1b[1m🏗   HTML\x1b[0m');

    // For standalone galleries, font-face URLs use 'fonts/' (local); otherwise '../fonts/'.
    const localFontCss = isStandalone
      ? fontCss.replace(/url\('\.\.\/fonts\//g, "url('fonts/")
      : fontCss;

    // Load legal notice templates. Priority:
    //   1. Gallery-specific src/<gallery>/legal.html + legal.txt
    //   2. Default locale template from build/legal-templates/legal.<locale>.html
    //      (falls back to legal.en.html if the locale has no template)
    // Tokens and {{#if}} blocks are resolved at build time.
    const galSrc        = path.join(SRC_ROOT, srcName);
    const legalHtmlPath = path.join(galSrc, 'legal.html');
    const legalTxtPath  = path.join(galSrc, 'legal.txt');
    const LEGAL_TMPL_DIR = path.join(__DIR, 'legal-templates');
    const customLegal   = {};

    if (fs.existsSync(legalHtmlPath)) {
      customLegal.html = applyLegalTokens(fs.readFileSync(legalHtmlPath, 'utf8'), galCfg.project);
      ok('legal.html → gallery-specific template applied');
    } else {
      // Pick default locale template (html only — txt fallback handled by built-in LEGAL_I18N)
      const locale = (galCfg.project.locale || 'en').slice(0, 2).toLowerCase();
      const tmplPath = path.join(LEGAL_TMPL_DIR, `legal.${locale}.html`);
      const fallbackPath = path.join(LEGAL_TMPL_DIR, 'legal.en.html');
      const chosenPath = fs.existsSync(tmplPath) ? tmplPath
                       : fs.existsSync(fallbackPath) ? fallbackPath
                       : null;
      if (chosenPath) {
        customLegal.html = applyLegalTokens(fs.readFileSync(chosenPath, 'utf8'), galCfg.project);
        ok(`legal.html → default template (${path.basename(chosenPath)}) applied`);
      }
    }

    if (fs.existsSync(legalTxtPath)) {
      customLegal.txt  = applyLegalTokens(fs.readFileSync(legalTxtPath,  'utf8'), galCfg.project);
      ok('legal.txt  → gallery-specific template applied');
    }

    const { html, dataJs, galleryJs } = buildHTML(galCfg, results, localFontCss, isStandalone, customLegal, distName);
    fs.writeFileSync(path.join(paths.dist, 'index.html'), html, 'utf8');
    fs.writeFileSync(path.join(paths.dist, 'data.js'),    dataJs, 'utf8');
    fs.writeFileSync(path.join(paths.dist, 'gallery.js'), galleryJs, 'utf8');
    ok('index.html + data.js + gallery.js → dist/');
    fs.writeFileSync(path.join(paths.dist, 'LEGAL.md'), buildLegalNotice(galCfg), 'utf8');
    ok('LEGAL.md → dist/');
    // For private galleries the output folder is a hash — log the URL so it isn't lost.
    if (galCfg.project.private) {
      log(`\n  \x1b[33m🔒  Private gallery URL:\x1b[0m`);
      log(`     http://localhost:3000/${distName}/\n`);
    }

    // Standalone mode: copy shared vendor and font assets into the gallery folder
    // so it operates independently without the rest of dist/.
    if (isStandalone) {
      if (fs.existsSync(DIST_VEN))   { copyDirSync(DIST_VEN,   path.join(paths.dist, 'vendor')); ok('vendor/ → standalone'); }
      if (fs.existsSync(DIST_FONTS)) { copyDirSync(DIST_FONTS, path.join(paths.dist, 'fonts'));  ok('fonts/  → standalone'); }
    }
  }

  return {
    srcName,
    distName,
    project:    galCfg.project,
    photoCount: results.length,
    firstPhoto: results[0]?.name || null,
  };
}

/**
 * Orchestrate the full build pipeline.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const build = JSON.parse(fs.readFileSync(BUILD_CFG_PATH, 'utf8'));

  // Discover available galleries.
  const available = discoverGalleries();
  if (available.length === 0) {
    fail('No gallery found. Create src/<gallery-name>/gallery.config.json first.');
    process.exit(1);
  }

  // Determine which galleries to build.
  let targets;
  if (BUILD_ALL) {
    targets = available;
  } else if (GALLERY_ARG) {
    if (!available.includes(GALLERY_ARG)) {
      fail(`Gallery "${GALLERY_ARG}" not found. Available: ${available.join(', ')}`);
      process.exit(1);
    }
    targets = [GALLERY_ARG];
  } else if (available.length === 1) {
    targets = available;   // single gallery: use it automatically
  } else {
    fail(`Multiple galleries found. Specify one or use --all.\nAvailable: ${available.join(', ')}`);
    process.exit(1);
  }

  // Shared assets (downloaded once even when building multiple galleries).
  if (!WEBP_ONLY) {
    await downloadVendors();
    // fontCss is computed once and reused for all galleries.
  }
  let fontCss = '';
  if (!WEBP_ONLY) {
    fontCss = await downloadFonts();
  }

  // Build each target gallery.
  for (const name of targets) {
    await buildGallery(name, { build }, fontCss);
  }

  // (Re)generate the site index page listing all public galleries in dist/.
  if (!WEBP_ONLY) {
    log('\n\x1b[1m🗂   Site index\x1b[0m');
    buildIndexHTML(fontCss);
  }

  log('\n\x1b[32m\x1b[1m✅  Build complete\x1b[0m\n');
}

main().catch(e => { fail(e.message); process.exit(1); });
