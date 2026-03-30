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
import { runSharp } from './sharpProcess.js';
import { prerenderLogger as log } from '../lib/logger.js';

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
// Automatically pauses while uploads are in progress so Sharp child processes
// don't compete with the upload validation pipeline.

const CONCURRENCY = Number(process.env.PRERENDER_CONCURRENCY) || 2;

class PrerenderQueue {
  constructor(concurrency) {
    this.concurrency   = concurrency;
    this.running       = 0;
    this.jobs          = [];
    this.activeUploads = 0;   // incremented by uploadStarted(), decremented by uploadFinished()
  }
  push(fn) { this.jobs.push(fn); this._tick(); }
  _tick() {
    // Pause while any upload is in flight — uploads get exclusive access to Sharp workers.
    if (this.activeUploads > 0) return;
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

/**
 * Call at the start of every upload request.
 * Pauses prerender processing for the duration of the upload.
 */
export function uploadStarted() {
  queue.activeUploads++;
}

/**
 * Call when an upload request finishes (success or error).
 * Resumes prerender processing once all concurrent uploads have completed.
 */
export function uploadFinished() {
  if (queue.activeUploads > 0) queue.activeUploads--;
  // Drain any jobs that were queued while uploads were running.
  queue._tick();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue background pre-rendering for a freshly uploaded photo.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param {string} srcPath     - Absolute path to the source file on disk.
 * @param {string} filename    - Original filename (used in hash computation).
 */
// ── Core prerender work — also exported for BullMQ worker use ─────────────────

export async function runPrerender(srcPath, filename) {
  const hash = computePhotoHash(srcPath, filename);
  const dir  = prerenderCacheDir(hash);

  const variants = ['full.webp', 'grid-small.webp', 'grid-big.webp', 'grid-sm-small.webp', 'grid-sm-big.webp'];
  if (variants.every(v => existsSync(path.join(dir, v)))) {
    log.debug({ hash }, 'already complete, skip');
    return;
  }

  log.info({ filename, hash }, 'start prerender');
  await fs.mkdir(dir, { recursive: true });

  const cfg = getBuildCfg();

  try {
    await runSharp({ op: 'metadata', srcPath });
  } catch (err) {
    log.warn({ filename, hash, err }, 'skipped — undecodable');
    return;
  }

  const jobs = [
    { out: path.join(dir, 'full.webp'),          label: `full ≤${cfg.fullSize}px`,
      msg: { op: 'resize-webp', srcPath, destPath: path.join(dir, 'full.webp'),
             width: cfg.fullSize, height: cfg.fullSize, fit: 'inside', quality: cfg.quality.full } },
    { out: path.join(dir, 'grid-small.webp'),    label: `grid-small ${cfg.gridSizeSmall}×${cfg.gridSizeSmall}`,
      msg: { op: 'resize-webp', srcPath, destPath: path.join(dir, 'grid-small.webp'),
             width: cfg.gridSizeSmall, height: cfg.gridSizeSmall, fit: 'cover', quality: cfg.quality.grid } },
    { out: path.join(dir, 'grid-big.webp'),      label: `grid-big ${cfg.gridSizeBig}×${cfg.gridSizeBig}`,
      msg: { op: 'resize-webp', srcPath, destPath: path.join(dir, 'grid-big.webp'),
             width: cfg.gridSizeBig, height: cfg.gridSizeBig, fit: 'cover', quality: cfg.quality.grid } },
    { out: path.join(dir, 'grid-sm-small.webp'), label: `grid-sm-small ${cfg.gridSizeMobileSmall}×${cfg.gridSizeMobileSmall}`,
      msg: { op: 'resize-webp', srcPath, destPath: path.join(dir, 'grid-sm-small.webp'),
             width: cfg.gridSizeMobileSmall, height: cfg.gridSizeMobileSmall, fit: 'cover', quality: cfg.quality.grid } },
    { out: path.join(dir, 'grid-sm-big.webp'),   label: `grid-sm-big ${cfg.gridSizeMobileBig}×${cfg.gridSizeMobileBig}`,
      msg: { op: 'resize-webp', srcPath, destPath: path.join(dir, 'grid-sm-big.webp'),
             width: cfg.gridSizeMobileBig, height: cfg.gridSizeMobileBig, fit: 'cover', quality: cfg.quality.grid } },
  ];

  for (const { out, msg, label } of jobs) {
    if (existsSync(out)) continue;
    try {
      await runSharp(msg);
      log.debug({ hash, label }, 'variant done');
    } catch (err) {
      log.warn({ hash, label, err }, 'variant failed');
    }
  }

  log.info({ hash }, 'prerender complete');
}

// ── Queue dispatch — uses BullMQ if available, falls back to in-memory ─────────

export function enqueuePrerender(srcPath, filename) {
  // Try BullMQ first (imported lazily to avoid circular deps at module init)
  import('./queues.js').then(({ dispatchPrerender }) => {
    if (!dispatchPrerender(srcPath, filename)) {
      // BullMQ not ready — use in-memory fallback
      queue.push(() => runPrerender(srcPath, filename).catch(() => {}));
    }
  }).catch(() => {
    queue.push(() => runPrerender(srcPath, filename).catch(() => {}));
  });
}

export const prerenderQueueSize = () => queue.size;
