// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/autoInsights.js — automatic text insights from EXIF distributions
//
// Each generator takes a processed metric object and returns { headline, detail } strings.
// All generators return null when there is insufficient data (< MIN_PHOTOS).

const MIN_PHOTOS = 10; // minimum withData count to produce insights

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(count, total) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function top(items, n = 3) {
  return [...items].sort((a, b) => b.count - a.count).slice(0, n);
}

// ── Focal length ──────────────────────────────────────────────────────────────

/**
 * @param {{ withData: number, bins: Array<{label:string, midMm:number, count:number}> }} focalData
 * @returns {{ headline: string, detail: string } | null}
 */
export function generateFocalInsight(focalData) {
  if (!focalData || focalData.withData < MIN_PHOTOS) return null;

  const { bins, withData } = focalData;
  const sorted = [...bins].sort((a, b) => b.count - a.count);
  const topBin = sorted[0];
  if (!topBin) return null;

  const topPct = pct(topBin.count, withData);
  const midMm  = Math.round(topBin.midMm);

  let headline, detail;
  if (topPct >= 40) {
    headline = `${topPct}% of photos in the ${topBin.label} range`;
    detail   = `Strong preference for ${midMm}mm. This suggests a dedicated lens or focal length choice for this shoot.`;
  } else if (sorted.length >= 2 && Math.abs(pct(sorted[0].count, withData) - pct(sorted[1].count, withData)) <= 10) {
    headline = `Balanced focal range`;
    detail   = `No dominant focal length — the top two ranges (${sorted[0].label} and ${sorted[1].label}) are similarly used.`;
  } else {
    headline = `Most used range: ${topBin.label}`;
    detail   = `${topPct}% of photos with focal data fall in this range.`;
  }

  return { headline, detail };
}

// ── Wide / tele ratio ─────────────────────────────────────────────────────────

/**
 * @param {{ withData: number, photos?: Array<{mm:number}>, bins?: Array<{midMm:number, count:number}> }} focalData
 * @returns {{ headline: string, detail: string, wideRatio: number, teleRatio: number } | null}
 */
export function generateWideTeleInsight(focalData) {
  if (!focalData || focalData.withData < MIN_PHOTOS) return null;

  const { withData } = focalData;
  let wideCount = 0, teleCount = 0;

  // Support both raw photos array and pre-binned data
  if (focalData.photos) {
    for (const p of focalData.photos) {
      if (p.mm < 35)  wideCount++;
      if (p.mm > 85)  teleCount++;
    }
  } else if (focalData.bins) {
    for (const bin of focalData.bins) {
      if (bin.midMm < 35)  wideCount += bin.count;
      if (bin.midMm > 85)  teleCount += bin.count;
    }
  } else {
    return null;
  }

  const wideRatio = wideCount / withData;
  const teleRatio = teleCount / withData;
  const widePct   = Math.round(wideRatio * 100);
  const telePct   = Math.round(teleRatio * 100);

  let headline, detail;
  if (wideRatio > 0.7) {
    headline = `Wide-angle shooter (${widePct}% below 35mm)`;
    detail   = `This gallery strongly favours wide angles. Minimal telephoto usage.`;
  } else if (teleRatio > 0.7) {
    headline = `Telephoto-heavy gallery (${telePct}% above 85mm)`;
    detail   = `Long focal lengths dominate. Likely wildlife, sports, or event photography.`;
  } else if (wideRatio > 0.5) {
    headline = `Wide-leaning focal range`;
    detail   = `${widePct}% of photos below 35mm, ${telePct}% above 85mm.`;
  } else if (teleRatio > 0.5) {
    headline = `Telephoto-leaning focal range`;
    detail   = `${telePct}% of photos above 85mm, ${widePct}% below 35mm.`;
  } else {
    headline = `Balanced wide/tele usage`;
    detail   = `${widePct}% wide (< 35mm) · ${telePct}% tele (> 85mm) — versatile range.`;
  }

  return { headline, detail, wideRatio, teleRatio };
}

// ── Aperture ──────────────────────────────────────────────────────────────────

/**
 * @param {{ withData: number, items: Array<{label:string, count:number}> }} apertureData
 * @returns {{ headline: string, detail: string } | null}
 */
export function generateApertureInsight(apertureData) {
  if (!apertureData || apertureData.withData < MIN_PHOTOS) return null;

  const { items, withData } = apertureData;

  // Classify items as wide (≤ f/2.8), normal (f/4–f/5.6), narrow (≥ f/8)
  let wideCount = 0, narrowCount = 0;
  for (const item of items) {
    const f = parseFloat(item.label.replace('f/', ''));
    if (!isNaN(f)) {
      if (f <= 2.8) wideCount  += item.count;
      if (f >= 8)   narrowCount += item.count;
    }
  }

  const widePct   = pct(wideCount, withData);
  const narrowPct = pct(narrowCount, withData);
  const topItem   = top(items, 1)[0];

  let headline, detail;
  if (widePct >= 60) {
    headline = `Shallow depth of field style (${widePct}% at f/2.8 or wider)`;
    detail   = `Predominantly wide apertures — portraits, low-light, or intentional bokeh focus.`;
  } else if (narrowPct >= 60) {
    headline = `Deep focus style (${narrowPct}% at f/8 or narrower)`;
    detail   = `Narrow apertures dominate — landscape, architecture, or controlled-light shooting.`;
  } else if (topItem) {
    headline = `Most used aperture: ${topItem.label} (${pct(topItem.count, withData)}%)`;
    detail   = `Mixed aperture usage — ${widePct}% wide (≤ f/2.8), ${narrowPct}% narrow (≥ f/8).`;
  } else {
    return null;
  }

  return { headline, detail };
}

// ── Shutter speed ─────────────────────────────────────────────────────────────

/**
 * @param {{ withData: number, items: Array<{label:string, count:number}> }} shutterData
 * @returns {{ headline: string, detail: string } | null}
 */
export function generateShutterInsight(shutterData) {
  if (!shutterData || shutterData.withData < MIN_PHOTOS) return null;

  const { items, withData } = shutterData;
  const topItem = top(items, 1)[0];
  if (!topItem) return null;

  const topPct = pct(topItem.count, withData);

  // Count fast vs slow
  let fastCount = 0, slowCount = 0;
  for (const item of items) {
    if (item.label.includes('1/250') || item.label.includes('1/1000') || item.label.includes('< 1/1000')) fastCount += item.count;
    if (item.label.includes('≥ 1s') || item.label.includes('1/2')) slowCount += item.count;
  }

  const fastPct = pct(fastCount, withData);
  const slowPct = pct(slowCount, withData);

  let headline, detail;
  if (fastPct >= 50) {
    headline = `Action-ready speeds (${fastPct}% at 1/250s or faster)`;
    detail   = `Fast shutter speeds dominate — likely sports, events, or natural light action.`;
  } else if (slowPct >= 40) {
    headline = `Long exposure presence (${slowPct}% at 1/2s or slower)`;
    detail   = `Significant slow-shutter usage — tripod work, night/low-light, or creative motion blur.`;
  } else {
    headline = `Most used speed: ${topItem.label} (${topPct}%)`;
    detail   = `${fastPct}% fast (≥ 1/250s) · ${slowPct}% slow (≤ 1/2s).`;
  }

  return { headline, detail };
}

// ── ISO ───────────────────────────────────────────────────────────────────────

/**
 * @param {{ withData: number, items: Array<{label:string, count:number, isoCeiling?:boolean}> }} isoData
 * @returns {{ headline: string, detail: string } | null}
 */
export function generateISOInsight(isoData) {
  if (!isoData || isoData.withData < MIN_PHOTOS) return null;

  const { items, withData } = isoData;

  let lowCount = 0, highCount = 0, ceilingCount = 0;
  for (const item of items) {
    const iso = parseInt(item.label.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(iso)) {
      if (iso <= 800)  lowCount  += item.count;
      if (iso >= 3200) highCount += item.count;
      // Detect auto-ISO ceiling heuristic: ISO 6400 has notably more photos than 3200
      if (iso === 6400 && item.count > withData * 0.15) ceilingCount += item.count;
    }
  }

  const lowPct    = pct(lowCount, withData);
  const highPct   = pct(highCount, withData);

  let headline, detail;
  if (ceilingCount > 0) {
    headline = `Auto-ISO ceiling detected at ISO 6400`;
    detail   = `${pct(ceilingCount, withData)}% of photos are at ISO 6400 — this pattern suggests an auto-ISO camera limit.`;
  } else if (highPct >= 50) {
    headline = `Low-light specialist (${highPct}% at ISO 3200+)`;
    detail   = `High ISO usage dominates — indoor, evening, or available-light shooting conditions.`;
  } else if (lowPct >= 80) {
    headline = `Clean conditions (${lowPct}% at ISO 800 or below)`;
    detail   = `Very low ISO throughout — controlled lighting, studio, or bright outdoor conditions.`;
  } else {
    const topItem = top(items, 1)[0];
    headline = topItem ? `Most used ISO: ${topItem.label} (${pct(topItem.count, withData)}%)` : `Varied ISO usage`;
    detail   = `${lowPct}% at ISO ≤ 800 · ${highPct}% at ISO ≥ 3200.`;
  }

  return { headline, detail };
}

// ── Lens model ────────────────────────────────────────────────────────────────

/**
 * @param {{ withData: number, items: Array<{label:string, count:number}> }} lensData
 * @returns {{ headline: string, detail: string } | null}
 */
export function generateLensInsight(lensData) {
  if (!lensData || lensData.withData < MIN_PHOTOS) return null;

  const { items, withData } = lensData;
  const sorted  = [...items].sort((a, b) => b.count - a.count).filter(i => i.label !== 'Other');
  if (sorted.length === 0) return null;

  const topLens = sorted[0];
  const topPct  = pct(topLens.count, withData);
  const lensCount = sorted.length;

  let headline, detail;
  if (topPct >= 60) {
    headline = `Primary lens: ${topLens.label} (${topPct}%)`;
    detail   = `One lens accounts for most shots. ${lensCount > 1 ? `${lensCount} lens${lensCount > 1 ? 'es' : ''} total.` : ''}`;
  } else if (topPct >= 40) {
    headline = `Dominant lens: ${topLens.label} (${topPct}%)`;
    detail   = `${lensCount} lenses used — top 3: ${sorted.slice(0, 3).map(l => l.label).join(', ')}.`;
  } else {
    headline = `Multi-lens shoot — ${lensCount} lenses`;
    detail   = `No single lens above ${topPct}%. Top: ${sorted.slice(0, 3).map(l => `${l.label} (${pct(l.count, withData)}%)`).join(', ')}.`;
  }

  return { headline, detail };
}

// ── Bundle all ────────────────────────────────────────────────────────────────

/**
 * Compute all auto-insights for a complete metrics object.
 * @param {{ focal, aperture, shutter, iso, lens }} metrics
 * @returns {{ focal, wideTele, aperture, shutter, iso, lens }}
 */
export function generateAllInsights(metrics) {
  return {
    focal:    generateFocalInsight(metrics.focal),
    wideTele: generateWideTeleInsight(metrics.focal),
    aperture: generateApertureInsight(metrics.aperture),
    shutter:  generateShutterInsight(metrics.shutter),
    iso:      generateISOInsight(metrics.iso),
    lens:     generateLensInsight(metrics.lens),
  };
}
