// infra/fs.js — path constants and filesystem helpers
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Path constants ────────────────────────────────────────────────────────────
const __DIR   = path.dirname(fileURLToPath(import.meta.url)); // infra/
export const ROOT    = path.resolve(__DIR, '..'); // project root (infra/ is directly under root)

export const SRC_ROOT       = path.join(ROOT, 'src');
export const BUILD_CFG_PATH = path.join(ROOT, 'build.config.json');
export const DIST_ROOT      = path.join(ROOT, 'dist');
export const DIST_VEN       = path.join(DIST_ROOT, 'vendor');
export const DIST_FONTS     = path.join(DIST_ROOT, 'fonts');

// ── Logging helpers ───────────────────────────────────────────────────────────
// Coloured one-liners that avoid mixing with stderr.
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
