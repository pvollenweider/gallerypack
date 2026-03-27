// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/photoInsights.js — unified EXIF analytics service
//
// Reads the built photos.json manifest for a gallery and aggregates
// all 5 metric dimensions: focal, lens, aperture, shutter, ISO.
//
// EXIF field shapes (from packages/engine/src/exif.js):
//   exif.focal35    number (mm) | undefined
//   exif.lens       string | undefined
//   exif.aperture   "ƒ/2.8" | undefined
//   exif.shutter    "1/250s" | "0.5s" | undefined
//   exif.iso        "ISO 1600" | undefined

import { FOCAL_BINS, binFocalLength, parseFocal35 } from '../../../../packages/shared/src/focalBins.js';
import { generateAllInsights } from './autoInsights.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function toItems(map, total) {
  return Object.entries(map)
    .map(([label, count]) => ({ label, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

// ── Focal length ──────────────────────────────────────────────────────────────

function processFocal(photos) {
  const counts = Object.fromEntries(FOCAL_BINS.map(b => [b.key, 0]));
  const rawPhotos = [];

  for (const p of photos) {
    const mm = parseFocal35(p.exif?.focal35);
    if (mm !== null) {
      rawPhotos.push({ filename: p.filename, mm, lens: p.exif?.lens ?? null, id: p.id, thumbnail: p.thumbnail });
      const key = binFocalLength(mm);
      if (key) counts[key]++;
    }
  }

  const withData = rawPhotos.length;
  const bins = FOCAL_BINS.map(b => ({
    key:   b.key,
    label: b.label,
    midMm: b.max === Infinity ? b.min + 50 : (b.min + b.max) / 2,
    count: counts[b.key],
    pct:   pct(counts[b.key], withData),
  })).filter(b => b.count > 0);

  const dominant = bins.sort((a, b) => b.count - a.count)[0]?.key ?? null;

  return { total: photos.length, withData, photos: rawPhotos, bins, dominant };
}

// ── Lens model ────────────────────────────────────────────────────────────────

function processLens(photos) {
  const map = {};
  let withData = 0;

  for (const p of photos) {
    const raw = p.exif?.lens;
    if (!raw) continue;
    const label = raw.trim();
    if (!label) continue;
    map[label] = (map[label] ?? 0) + 1;
    withData++;
  }

  // Cap at top 10 + "Other"
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  let items;
  if (sorted.length > 10) {
    const top10 = sorted.slice(0, 10);
    const otherCount = sorted.slice(10).reduce((s, [, c]) => s + c, 0);
    items = [
      ...top10.map(([label, count]) => ({ label, count, pct: pct(count, withData) })),
      { label: 'Other', count: otherCount, pct: pct(otherCount, withData) },
    ];
  } else {
    items = sorted.map(([label, count]) => ({ label, count, pct: pct(count, withData) }));
  }

  return { total: photos.length, withData, items };
}

// ── Aperture ──────────────────────────────────────────────────────────────────

// Standard f-stop buckets for grouping
const FSTOP_BUCKETS = [1.0, 1.4, 1.8, 2.0, 2.8, 4.0, 5.6, 8.0, 11.0, 16.0, 22.0];

function nearestFstop(f) {
  let best = FSTOP_BUCKETS[0], bestDist = Infinity;
  for (const b of FSTOP_BUCKETS) {
    const d = Math.abs(f - b);
    if (d < bestDist) { best = b; bestDist = d; }
  }
  return best;
}

function processAperture(photos) {
  const map = {};
  let withData = 0;

  for (const p of photos) {
    const raw = p.exif?.aperture; // "ƒ/2.8"
    if (!raw) continue;
    const f = parseFloat(raw.replace(/[ƒf\/]/g, ''));
    if (isNaN(f)) continue;
    const label = `f/${nearestFstop(f)}`;
    map[label] = (map[label] ?? 0) + 1;
    withData++;
  }

  // Sort by f-number ascending
  const items = toItems(map, withData).sort((a, b) => {
    const fa = parseFloat(a.label.replace('f/', ''));
    const fb = parseFloat(b.label.replace('f/', ''));
    return fa - fb;
  });

  return { total: photos.length, withData, items };
}

// ── Shutter speed ─────────────────────────────────────────────────────────────

const SHUTTER_RANGES = [
  { label: '< 1/1000s',    test: s => s < 1/1000  },
  { label: '1/1000–1/250s', test: s => s >= 1/1000 && s < 1/250 },
  { label: '1/250–1/30s',  test: s => s >= 1/250  && s < 1/30  },
  { label: '1/30–1/2s',    test: s => s >= 1/30   && s < 0.5   },
  { label: '≥ 1/2s',        test: s => s >= 0.5    },
];

function parseShutterSec(raw) {
  if (!raw) return null;
  const s = raw.replace(/s$/, '');
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    return isNaN(n) || isNaN(d) || d === 0 ? null : n / d;
  }
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function processShutter(photos) {
  const map = Object.fromEntries(SHUTTER_RANGES.map(r => [r.label, 0]));
  let withData = 0;

  for (const p of photos) {
    const sec = parseShutterSec(p.exif?.shutter);
    if (sec === null) continue;
    for (const range of SHUTTER_RANGES) {
      if (range.test(sec)) { map[range.label]++; break; }
    }
    withData++;
  }

  const items = SHUTTER_RANGES
    .map(r => ({ label: r.label, count: map[r.label], pct: pct(map[r.label], withData) }))
    .filter(i => i.count > 0);

  return { total: photos.length, withData, items };
}

// ── ISO ───────────────────────────────────────────────────────────────────────

const ISO_RANGES = [
  { label: 'ISO ≤ 100',  test: n => n <= 100  },
  { label: 'ISO 200',    test: n => n > 100 && n <= 200  },
  { label: 'ISO 400',    test: n => n > 200 && n <= 400  },
  { label: 'ISO 800',    test: n => n > 400 && n <= 800  },
  { label: 'ISO 1600',   test: n => n > 800  && n <= 1600 },
  { label: 'ISO 3200',   test: n => n > 1600 && n <= 3200 },
  { label: 'ISO 6400',   test: n => n > 3200 && n <= 6400 },
  { label: 'ISO > 6400', test: n => n > 6400  },
];

function parseISO(raw) {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function processISO(photos) {
  const map = Object.fromEntries(ISO_RANGES.map(r => [r.label, 0]));
  let withData = 0;

  for (const p of photos) {
    const n = parseISO(p.exif?.iso);
    if (n === null) continue;
    for (const range of ISO_RANGES) {
      if (range.test(n)) { map[range.label]++; break; }
    }
    withData++;
  }

  const items = ISO_RANGES
    .map(r => ({ label: r.label, count: map[r.label], pct: pct(map[r.label], withData) }))
    .filter(i => i.count > 0);

  return { total: photos.length, withData, items };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute all 5 EXIF metric dimensions for a set of photo entries from photos.json.
 *
 * @param {Array<{ filename: string, exif: object, id?: string, thumbnail?: object }>} photos
 * @returns {{ focal, lens, aperture, shutter, iso, insights }}
 */
export function computeInsights(photos) {
  const focal    = processFocal(photos);
  const lens     = processLens(photos);
  const aperture = processAperture(photos);
  const shutter  = processShutter(photos);
  const iso      = processISO(photos);

  const insights = generateAllInsights({ focal, lens, aperture, shutter, iso });

  return { focal, lens, aperture, shutter, iso, insights };
}
