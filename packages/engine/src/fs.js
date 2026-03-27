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

// packages/engine/src/fs.js — path constants and filesystem helpers
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Path constants ────────────────────────────────────────────────────────────
const __DIR   = path.dirname(fileURLToPath(import.meta.url)); // packages/engine/src/
export const ROOT    = path.resolve(__DIR, '../../..'); // project root (code, not storage)

// STORAGE_ROOT splits into three access tiers:
//   public/   — generated galleries (HTML/CSS/JS + images) — served by Caddy
//   internal/ — admin thumbnails, previews, inbox          — backend only
//   private/  — original uploads, high-res                 — backend only
const STORAGE_ROOT  = process.env.STORAGE_ROOT || ROOT;
export const INTERNAL_ROOT  = path.join(STORAGE_ROOT, 'internal');
export const SRC_ROOT       = path.join(STORAGE_ROOT, 'private');
export const BUILD_CFG_PATH = path.join(ROOT, 'build.config.json');
export const DIST_ROOT      = path.join(STORAGE_ROOT, 'public');
export const DIST_VEN       = path.join(DIST_ROOT, 'vendor');
export const DIST_FONTS     = path.join(DIST_ROOT, 'fonts');

// ── Logging helpers ───────────────────────────────────────────────────────────
export const log  = (m) => process.stdout.write(m + '\n');
export const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
export const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
export const warn = (m) => process.stdout.write(`  \x1b[33m!\x1b[0m  ${m}\n`);
export const fail = (m) => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);

// ── Per-gallery path resolver ─────────────────────────────────────────────────

/**
 * Resolve per-gallery paths for a given source name and (optional) dist name.
 * For private galleries the dist name is a content hash rather than the src name.
 *
 * @param {string} srcName  - Gallery folder name under src/.
 * @param {string} [distName] - Output folder name under dist/ (defaults to srcName).
 */
export function galleryPaths(srcName, distName) {
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

// ── File system helpers ───────────────────────────────────────────────────────

/**
 * Recursively copy a directory from src to dst.
 * Existing files at the destination are overwritten.
 *
 * @param {string} src - Source directory path.
 * @param {string} dst - Destination directory path.
 */
export function copyDirSync(src, dst) {
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
