// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/prerenderService.js
//
// Background pre-rendering of publication-ready image variants.
// Runs at very low priority (concurrency 2) during upload idle time.
//
// Per photo, generates 5 WebP files in the prerender sidecar cache
// (internal/prerender/{hash}/):
//   full.webp           — ≤ 3840px fit-inside   (quality 90)
//   grid-small.webp     — 800×800  cover-crop    (quality 78)
//   grid-big.webp       — 1400×1400 cover-crop   (quality 78)
//   grid-sm-small.webp  — 400×400  cover-crop    (quality 78)
//   grid-sm-big.webp    — 600×600  cover-crop    (quality 78)
//
// At build time, packages/engine/src/images.js checks this cache and copies
// the appropriate variant instead of reprocessing from the full-res original.

import path                    from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import fs                      from 'node:fs/promises';
import crypto                  from 'node:crypto';
import { INTERNAL_ROOT, BUILD_CFG_PATH } from '../../../../packages/engine/src/fs.js';

// ── Build config (sizes & quality) ───────────────────────────────────────────

let _cfg = null;
function getBuildCfg() {
  if (_cfg) return _cfg;
  try {
    _cfg = JSON.parse(readFileSync(BUILD_CFG_PATH, 'utf8'));
  } catch {
    _cfg = {
      gridSizeSmall:       800,
      gridSizeBig:         1400,
      gridSizeMobileSmall: 400,
      gridSizeMobileBig:   600,
      fullSize:            3840,
      quality: { grid: 78, full: 90 },
    };
  }
  return _cfg;
}

// ── Hash (must match packages/engine/src/images.js photoHash) ────────────────

export function computePhotoHash(srcPath, filename) {
  const stat = statSync(srcPath);
  return crypto.createHash('sha256')
    .update(`${filename}:${stat.size}:${stat.mtimeMs}`)
    .digest('hex').slice(0, 16);
}

export function prerenderCacheDir(hash) {
  return path.join(INTERNAL_ROOT, 'prerender', hash);
}

// ── Queue ─────────────────────────────────────────────────────────────────────
// Very low concurrency — this runs silently while the API handles other requests.

const CONCURRENCY = 2;
const log = (...args) => console.log('[prerender]', ...args);

class PrerenderQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running     = 0;
    this.jobs        = [];
  }
  push(fn) { this.jobs.push(fn); this._tick(); }
  _tick() {
    while (this.running < this.concurrency) {
      const fn = this.jobs.shift();
      if (!fn) break;
      this.running++;
      Promise.resolve().then(fn).catch(() => {})
        .finally(() => { this.running--; this._tick(); });
    }
  }
  get size() { return this.jobs.length + this.running; }
}

const queue = new PrerenderQueue(CONCURRENCY);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue background pre-rendering for a freshly uploaded photo.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param {string} srcPath     - Absolute path to the source file on disk.
 * @param {string} filename    - Original filename (used in hash computation).
 */
export function enqueuePrerender(srcPath, filename) {
  queue.push(async () => {
    const hash = computePhotoHash(srcPath, filename);
    const dir  = prerenderCacheDir(hash);

    // Skip if all 5 variants are already present.
    const variants = ['full.webp', 'grid-small.webp', 'grid-big.webp', 'grid-sm-small.webp', 'grid-sm-big.webp'];
    if (variants.every(v => existsSync(path.join(dir, v)))) {
      log(`${hash} — already complete, skip`);
      return;
    }

    log(`${filename} → ${hash}`);
    await fs.mkdir(dir, { recursive: true });

    const { default: sharp } = await import('sharp');
    const cfg = getBuildCfg();

    // Pre-validate: check the file is decodable before queuing full processing.
    // This catches Live Photos (JPEG + embedded H.264 video) and other corrupt files
    // that would cause a SIGBUS crash in libvips during actual decoding.
    try {
      await sharp(srcPath, { failOn: 'none', sequentialRead: true }).metadata();
    } catch (err) {
      log(`  ✗ skipped (undecodable): ${err.message}`);
      return;
    }

    // sequentialRead: true — use sequential I/O instead of mmap to prevent SIGBUS
    // crashes on corrupt JPEG data (e.g. iOS Live Photos with embedded H.264 video).
    const sharpOpts = { failOn: 'none', sequentialRead: true };

    const jobs = [
      // full — layout-independent
      {
        out:    path.join(dir, 'full.webp'),
        build:  () => sharp(srcPath, sharpOpts).rotate()
                  .resize(cfg.fullSize, cfg.fullSize, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: cfg.quality.full }),
        label:  `full ≤${cfg.fullSize}px`,
      },
      // grid small (position !big)
      {
        out:    path.join(dir, 'grid-small.webp'),
        build:  () => sharp(srcPath, sharpOpts).rotate()
                  .resize(cfg.gridSizeSmall, cfg.gridSizeSmall, { fit: 'cover', position: 'centre' })
                  .webp({ quality: cfg.quality.grid }),
        label:  `grid-small ${cfg.gridSizeSmall}×${cfg.gridSizeSmall}`,
      },
      // grid big (position 0 or 8 mod 12)
      {
        out:    path.join(dir, 'grid-big.webp'),
        build:  () => sharp(srcPath, sharpOpts).rotate()
                  .resize(cfg.gridSizeBig, cfg.gridSizeBig, { fit: 'cover', position: 'centre' })
                  .webp({ quality: cfg.quality.grid }),
        label:  `grid-big ${cfg.gridSizeBig}×${cfg.gridSizeBig}`,
      },
      // grid-sm small (mobile, position !big)
      {
        out:    path.join(dir, 'grid-sm-small.webp'),
        build:  () => sharp(srcPath, sharpOpts).rotate()
                  .resize(cfg.gridSizeMobileSmall, cfg.gridSizeMobileSmall, { fit: 'cover', position: 'centre' })
                  .webp({ quality: cfg.quality.grid }),
        label:  `grid-sm-small ${cfg.gridSizeMobileSmall}×${cfg.gridSizeMobileSmall}`,
      },
      // grid-sm big (mobile, position 0 or 8 mod 12)
      {
        out:    path.join(dir, 'grid-sm-big.webp'),
        build:  () => sharp(srcPath, sharpOpts).rotate()
                  .resize(cfg.gridSizeMobileBig, cfg.gridSizeMobileBig, { fit: 'cover', position: 'centre' })
                  .webp({ quality: cfg.quality.grid }),
        label:  `grid-sm-big ${cfg.gridSizeMobileBig}×${cfg.gridSizeMobileBig}`,
      },
    ];

    for (const { out, build, label } of jobs) {
      if (existsSync(out)) continue; // already generated in a previous attempt
      try {
        const buf = await build().toBuffer();
        await fs.writeFile(out, buf);
        log(`  ✓ ${label}`);
      } catch (err) {
        log(`  ✗ ${label}: ${err.message}`);
      }
    }

    log(`${hash} — done`);
  });
}

export const prerenderQueueSize = () => queue.size;
