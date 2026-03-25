// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of GalleryPack.
//
// GalleryPack is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// GalleryPack is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// packages/engine/src/images.js — photo listing, conversion, manifest management
import fs   from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const piexif  = require('piexifjs');

import crypto from 'crypto';
import { extractExif } from './exif.js';
import { buildName, MANIFEST_SCHEMA_VERSION } from './utils.js';

/**
 * Compute a stable 16-char hex ID for a photo based on filename + size + mtime.
 * Content-addressed: changes only when the file is replaced/modified.
 * Does NOT change on gallery rename or photo reorder.
 */
function photoHash(photo) {
  const stat = fs.statSync(photo.full);
  return crypto.createHash('sha256')
    .update(`${photo.file}:${stat.size}:${stat.mtimeMs}`)
    .digest('hex').slice(0, 16);
}

// Inline logging helpers (copied to avoid circular-dependency risk).
const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const fail = (m) => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);

// ── Supported source-image extensions ────────────────────────────────────────
export const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);

// ── Grid layout ───────────────────────────────────────────────────────────────
export const BIG_POSITIONS = new Set([0, 8]);

// ── Photo listing ─────────────────────────────────────────────────────────────

/**
 * Return an ordered list of all supported image files found in srcDir.
 * Respects photo_order.json if present in the parent gallery directory.
 *
 * @returns {{ file: string, full: string }[]}
 */
export function listPhotos(srcDir) {
  if (!fs.existsSync(srcDir)) { fail(`Dossier introuvable : ${srcDir}`); process.exit(1); }

  const allFiles = fs.readdirSync(srcDir)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()));

  const galDir = path.dirname(srcDir); // gallery root (parent of photos/)

  // Load explicit ordering saved by the admin UI (photo_order.json sits next to photos/)
  const orderFile = path.join(galDir, 'photo_order.json');
  let savedOrder = null;
  if (fs.existsSync(orderFile)) {
    try { savedOrder = JSON.parse(fs.readFileSync(orderFile, 'utf8')); } catch {}
  }

  // Load photographer attribution (photo_attribution.json) — issue #133
  // Maps filename → photographer name, written by the builder runner before each build.
  const attrFile = path.join(galDir, 'photo_attribution.json');
  let attribution = {};
  if (fs.existsSync(attrFile)) {
    try { attribution = JSON.parse(fs.readFileSync(attrFile, 'utf8')); } catch {}
  }

  let ordered;
  if (savedOrder && Array.isArray(savedOrder)) {
    const available = new Set(allFiles);
    const knownSet  = new Set(savedOrder);
    const extra     = allFiles.filter(f => !knownSet.has(f)).sort();
    ordered = [...savedOrder.filter(f => available.has(f)), ...extra];
  } else {
    ordered = allFiles.sort();
  }

  return ordered.map(f => ({
    file:   f,
    full:   path.join(srcDir, f),
    credit: attribution[f] ?? null,  // photographer name or null
  }));
}

// ── Brightness analysis ───────────────────────────────────────────────────────

/**
 * Determine whether the bottom portion of a grid thumbnail is visually dark.
 *
 * @param {string} gridPath - Absolute path to the already-written grid WebP.
 * @param {number} gridSize - Side length (px) of the square grid thumbnail.
 * @returns {Promise<boolean>}
 */
export async function computeIsDark(gridPath, gridSize) {
  const cutY  = Math.round(gridSize * 0.65);
  const cutH  = gridSize - cutY;
  const stats = await sharp(gridPath)
    .extract({ left: 0, top: cutY, width: gridSize, height: cutH })
    .resize(24, 8)
    .stats();
  const lum = 0.299 * stats.channels[0].mean
            + 0.587 * stats.channels[1].mean
            + 0.114 * stats.channels[2].mean;
  return lum < 140;
}

// ── Image conversion ──────────────────────────────────────────────────────────

/**
 * Convert a single source photo to three output files.
 *
 * @param {object}       photo        - { file, full } source photo descriptor.
 * @param {object}       cfg          - Merged project + build config.
 * @param {number}       idx          - Zero-based index in the photo list.
 * @param {boolean|null} cachedIsDark - Brightness flag from the manifest, or null.
 * @param {object}       paths        - Gallery path descriptors from galleryPaths().
 * @param {string|null}  cachedName   - Previously computed output name from manifest.
 * @param {boolean}      FORCE        - Whether to force reconversion.
 * @returns {Promise<{name: string, width: number, height: number, isDark: boolean}>}
 */
export async function convertOne(photo, cfg, idx, cachedIsDark = null, paths, cachedName = null, FORCE = false) {
  const name   = photoHash(photo);          // stable content-based ID (never changes on reorder)
  const dlName = buildName(cfg.project, idx); // human-readable download name (author_title_date_NNN)
  const isBig  = BIG_POSITIONS.has(idx % 12);
  const gridOut   = path.join(paths.distImg, 'grid',    `${name}.webp`);
  const gridSmOut = path.join(paths.distImg, 'grid-sm', `${name}.webp`);
  const fullOut   = path.join(paths.distImg, 'full',    `${name}.webp`);
  const origOut   = path.join(paths.distOri, `${name}.jpg`);
  const { gridSizeSmall, gridSizeBig,
          gridSizeMobileSmall = 400, gridSizeMobileBig = 600,
          fullSize, quality } = cfg.build;
  const gridSize    = isBig ? gridSizeBig    : gridSizeSmall;
  const gridSizeMob = isBig ? gridSizeMobileBig : gridSizeMobileSmall;
  const skipOriginals = cfg.project.allowDownloadImage === false
                     && cfg.project.allowDownloadGallery === false;

  const origReady = skipOriginals || fs.existsSync(origOut);
  const positionUnchanged = cachedName === null || cachedName === name; // hash matches → skip reprocessing
  if (!FORCE && positionUnchanged && fs.existsSync(gridOut) && fs.existsSync(gridSmOut) && fs.existsSync(fullOut) && origReady) {
    ok(`${name} (skip)`);
    const [meta, isDark] = await Promise.all([
      sharp(photo.full).metadata(),
      cachedIsDark !== null ? Promise.resolve(cachedIsDark) : computeIsDark(gridOut, gridSize),
    ]);
    return { name, dlName, width: meta.width, height: meta.height, isDark };
  }

  info(`${photo.file}  →  ${name}  [${isBig ? 'big' : 'small'}]`);

  await sharp(photo.full)
    .rotate()
    .resize(gridSize, gridSize, { fit: 'cover', position: 'centre' })
    .webp({ quality: quality.grid })
    .toFile(gridOut);
  ok(`grid  ${gridSize}×${gridSize}`);

  await sharp(photo.full)
    .rotate()
    .resize(gridSizeMob, gridSizeMob, { fit: 'cover', position: 'centre' })
    .webp({ quality: quality.grid })
    .toFile(gridSmOut);
  ok(`grid-sm  ${gridSizeMob}×${gridSizeMob}`);

  await sharp(photo.full)
    .rotate()
    .resize(fullSize, fullSize, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: quality.full })
    .toFile(fullOut);
  ok(`full  ≤${fullSize}px`);

  if (!skipOriginals) {
    const ext = path.extname(photo.file).toLowerCase();
    if (['.jpg','.jpeg'].includes(ext)) {
      fs.copyFileSync(photo.full, origOut);
    } else {
      await sharp(photo.full).rotate().jpeg({ quality: 95 }).toFile(origOut);
    }
    ok(`orig  → originals/${name}.jpg`);

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

  const [meta, isDark] = await Promise.all([
    sharp(photo.full).rotate().metadata(),
    computeIsDark(gridOut, gridSize),
  ]);
  return { name, dlName, width: meta.width, height: meta.height, isDark };
}

// ── Manifest (photos.json) ────────────────────────────────────────────────────

/**
 * Load the existing dist/photos.json manifest, or return a blank structure.
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
 * Process all source photos: convert images, extract EXIF, write manifest.
 *
 * @param {{ file: string, full: string }[]} photos - Sorted source photo list.
 * @param {object} cfg - Merged project + build config.
 * @param {object} paths - Gallery path descriptors from galleryPaths().
 * @param {boolean} FORCE - Whether to force reconversion.
 * @returns {Promise<Array<{name, width, height, isDark, exif}>>}
 */
export async function processPhotos(photos, cfg, paths, FORCE = false) {
  const manifest = loadManifest(paths.manifest);
  if (!manifest.photos) manifest.photos = {};

  const results = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    try {
      const cached     = manifest.photos[photo.file];
      const cachedExif = cached?.exif;
      const cachedDark = cached?.isDark ?? null;
      const cachedName = cached?.name   ?? null;

      const [dims, exif] = await Promise.all([
        convertOne(photo, cfg, i, cachedDark, paths, cachedName, FORCE),
        cachedExif ? Promise.resolve(cachedExif) : extractExif(photo.full),
      ]);
      const srcBytes   = fs.statSync(photo.full).size;
      const srcSizeMB  = srcBytes / (1024 * 1024);
      const fileSizeStr = srcSizeMB >= 1
        ? srcSizeMB.toFixed(1) + ' MB'
        : Math.round(srcBytes / 1024) + ' KB';
      const exifFull = { ...(exif || {}), originalFile: photo.file, fileSize: fileSizeStr };
      manifest.photos[photo.file] = {
        name:   dims.name,    // stable hash ID (used for img/grid, img/full, originals paths)
        dlName: dims.dlName,  // human-readable download name (author_title_date_NNN)
        index:  i + 1,
        role:   BIG_POSITIONS.has(i % 12) ? 'big' : 'small',
        isDark: dims.isDark,
        exif:   exifFull,
        credit: photo.credit ?? null,  // photographer name (issue #133)
      };
      results.push({ ...dims, exif: exifFull, credit: photo.credit ?? null });
    } catch (e) {
      fail(`Erreur sur ${photo.file} : ${e.message}`);
    }
  }

  // Remove manifest entries for photos no longer in the source folder.
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
