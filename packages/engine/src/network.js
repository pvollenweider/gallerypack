// packages/engine/src/network.js — download helpers, font + vendor fetching
import fs    from 'fs';
import path  from 'path';
import https from 'https';
import http  from 'http';
import { createWriteStream } from 'fs';

import { DIST_VEN, DIST_FONTS } from './fs.js';

// Inline logging helpers (copied to avoid circular-dependency risk).
const log  = (m) => process.stdout.write(m + '\n');
const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const warn = (m) => process.stdout.write(`  \x1b[33m!\x1b[0m  ${m}\n`);

// ── Vendor assets (CDN URLs → dist/vendor/) ───────────────────────────────────
// Each entry is downloaded once and cached locally so the gallery works offline.
export const VENDORS = [
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

/**
 * Chrome-like UA sent to Google Fonts so the API returns WOFF2 URLs
 * (instead of legacy TTF/EOT variants returned for older clients).
 */
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Download a remote URL to a local file, transparently following HTTP redirects.
 * The destination file is deleted on error to avoid leaving partial downloads.
 *
 * @param {string} url  - Remote URL (http or https).
 * @param {string} dest - Absolute path to the output file.
 * @returns {Promise<void>}
 */
export function download(url, dest) {
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
export function fetchText(url, userAgent) {
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
 * Download the latin subset of the Poppins typeface from Google Fonts and
 * store each weight/style as a WOFF2 file under dist/fonts/.
 *
 * @returns {Promise<string>} - CSS @font-face block(s) for embedding, or '' on failure.
 */
export async function downloadFonts() {
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

  const localFaces = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]+\})/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[1] !== 'latin') continue;
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
export async function downloadVendors() {
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
