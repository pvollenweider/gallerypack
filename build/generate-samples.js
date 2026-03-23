#!/usr/bin/env node
/**
 * GalleryPack — Sample photo generator
 * Creates 15 placeholder JPEGs in src/example-gallery/photos/ and writes
 * (or overwrites) src/example-gallery/gallery.config.json.
 *
 * Each image shows two soft pastel colour regions separated by a smooth
 * mountain-ridge silhouette drawn with cubic Bézier curves.
 * Realistic EXIF metadata (camera, lens, aperture, shutter, ISO, date…)
 * is embedded in every JPEG via piexifjs.
 *
 * Usage:
 *   npm run setup:example         — skip existing images, always rewrite config
 *   npm run setup:example:force   — overwrite every image + rewrite config
 *
 * @author  Philippe Vollenweider
 * @license MIT
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import sharp from 'sharp';

// piexifjs is a CommonJS module — load it via createRequire.
const require = createRequire(import.meta.url);
const piexif  = require('piexifjs');

// Pass --force to overwrite existing sample images.
const FORCE = process.argv.includes('--force');

const __DIR    = path.dirname(fileURLToPath(import.meta.url));
const ROOT     = path.resolve(__DIR, '..');
const GAL_DIR  = path.join(ROOT, 'src', 'example-gallery');
const OUT_DIR  = path.join(GAL_DIR, 'photos');
const CFG_PATH = path.join(GAL_DIR, 'gallery.config.json');

// ── Example gallery config ─────────────────────────────────────────────────────
// Always written (or overwritten) so the example gallery is self-consistent.
const EXAMPLE_CONFIG = {
  project: {
    name:        'summer-zurich-2025',
    title:       'Summer in Zürich — Portraits & Landscapes',
    subtitle:    'Documentary series, spring 2025',
    author:      'Léa Müller-Girard',
    authorEmail: 'lea.muller@example.com',
    date:        '2025-04-15',
    location:    'Zürich, Enge District',
    description: 'A cross-perspective look at neighbourhood life through the lens of spring light.',
    locale:      'en',
    private:     false,
    standalone:  true,
    autoplay:    { slideshowInterval: 3 },
  },
};

// ── Colour palette ─────────────────────────────────────────────────────────────
// Each pair uses two distinctly different pastel hues — sky and mountain are
// clearly different colours, not just lighter/darker shades of the same tone.
// top = sky colour,  bot = mountain / earth colour.
const SAMPLES = [
  { name:'sample_01.jpg', w:4000, h:2667, seed: 1, top:[195,218,242], bot:[210,192,165], // powder blue sky  + warm sand mountain
    exif:{ make:'Sony',      model:'ILCE-7RM4',  lens:'Sony FE 35mm F1.4 GM',            et:[1,160],  fn:[14,5],  iso:400,  fl:[35,1],  fl35:35,  dt:'2025:04:15 09:23:14' } },
  { name:'sample_02.jpg', w:2667, h:4000, seed: 2, top:[242,208,215], bot:[160,185,170], // blush rose sky   + soft sage mountain
    exif:{ make:'Sony',      model:'ILCE-7RM4',  lens:'Sony FE 85mm F1.4 GM',            et:[1,500],  fn:[9,5],   iso:200,  fl:[85,1],  fl35:85,  dt:'2025:04:15 10:07:32' } },
  { name:'sample_03.jpg', w:4000, h:2667, seed: 3, top:[195,235,220], bot:[192,170,188], // soft mint sky    + dusty mauve mountain
    exif:{ make:'Nikon',     model:'Z 7II',      lens:'NIKKOR Z 24-70mm f/2.8 S',        et:[1,125],  fn:[28,5],  iso:100,  fl:[24,1],  fl35:24,  dt:'2025:04:15 11:45:08' } },
  { name:'sample_04.jpg', w:2667, h:4000, seed: 4, top:[218,205,238], bot:[205,183,148], // pale lilac sky   + warm ochre mountain
    exif:{ make:'Canon',     model:'EOS R5',     lens:'Canon RF 50mm F1.2 L USM',        et:[1,320],  fn:[7,5],   iso:200,  fl:[50,1],  fl35:50,  dt:'2025:04:14 16:22:51' } },
  { name:'sample_05.jpg', w:4000, h:2667, seed: 5, top:[248,220,202], bot:[145,182,185], // peach sky        + dusty teal mountain
    exif:{ make:'Sony',      model:'ILCE-7M3',   lens:'Sony FE 24mm F1.4 GM',            et:[1,80],   fn:[4,1],   iso:800,  fl:[24,1],  fl35:24,  dt:'2025:04:15 14:33:27' } },
  { name:'sample_06.jpg', w:4000, h:2667, seed: 6, top:[245,238,198], bot:[175,162,200], // pale lemon sky   + soft violet mountain
    exif:{ make:'FUJIFILM',  model:'X-T5',       lens:'XF16-55mmF2.8 R LM WR',          et:[1,200],  fn:[7,2],   iso:320,  fl:[23,1],  fl35:35,  dt:'2025:04:14 13:18:44' } },
  { name:'sample_07.jpg', w:2667, h:4000, seed: 7, top:[198,222,240], bot:[210,175,175], // ice blue sky     + warm blush mountain
    exif:{ make:'Leica',     model:'Q2',         lens:'SUMMILUX 1:1.7/28 ASPH.',         et:[1,250],  fn:[14,5],  iso:400,  fl:[28,1],  fl35:28,  dt:'2025:04:15 15:52:19' } },
  { name:'sample_08.jpg', w:4000, h:2667, seed: 8, top:[250,238,215], bot:[158,172,205], // warm cream sky   + slate blue mountain
    exif:{ make:'Sony',      model:'ILCE-7M3',   lens:'Sony FE 70-200mm F2.8 GM OSS II', et:[1,640],  fn:[4,1],   iso:200,  fl:[135,1], fl35:135, dt:'2025:04:15 17:44:03' } },
  { name:'sample_09.jpg', w:2667, h:4000, seed: 9, top:[245,210,200], bot:[158,185,168], // soft coral sky   + sage green mountain
    exif:{ make:'Canon',     model:'EOS R5',     lens:'Canon RF 50mm F1.2 L USM',        et:[1,400],  fn:[9,5],   iso:160,  fl:[50,1],  fl35:50,  dt:'2025:04:16 08:12:36' } },
  { name:'sample_10.jpg', w:4000, h:2667, seed:10, top:[222,210,238], bot:[208,188,158], // lavender sky     + warm tan mountain
    exif:{ make:'Sony',      model:'ILCE-7RM4',  lens:'Sony FE 24-70mm F2.8 GM II',      et:[1,100],  fn:[63,10], iso:100,  fl:[35,1],  fl35:35,  dt:'2025:04:16 10:28:54' } },
  { name:'sample_11.jpg', w:4000, h:2667, seed:11, top:[195,232,232], bot:[200,168,172], // pale aqua sky    + dusty rose mountain
    exif:{ make:'Nikon',     model:'Z 7II',      lens:'NIKKOR Z 35mm f/1.8 S',           et:[1,250],  fn:[5,2],   iso:400,  fl:[35,1],  fl35:35,  dt:'2025:04:14 15:03:27' } },
  { name:'sample_12.jpg', w:2667, h:4000, seed:12, top:[200,208,240], bot:[212,195,165], // periwinkle sky   + warm sand mountain
    exif:{ make:'FUJIFILM',  model:'X-T5',       lens:'XF90mmF2 R LM WR',                et:[1,500],  fn:[2,1],   iso:200,  fl:[90,1],  fl35:135, dt:'2025:04:15 12:41:18' } },
  { name:'sample_13.jpg', w:4000, h:2667, seed:13, top:[198,228,210], bot:[202,172,175], // soft sage sky    + dusty rose mountain
    exif:{ make:'Sony',      model:'ILCE-7C',    lens:'Sony FE 35mm F1.4 GM',            et:[1,160],  fn:[2,1],   iso:640,  fl:[35,1],  fl35:35,  dt:'2025:04:16 14:07:43' } },
  { name:'sample_14.jpg', w:2667, h:4000, seed:14, top:[248,238,200], bot:[148,182,180], // pale gold sky    + dusty teal mountain
    exif:{ make:'Sony',      model:'ILCE-7M3',   lens:'Sony FE 50mm F1.2 GM',            et:[1,320],  fn:[9,5],   iso:400,  fl:[50,1],  fl35:50,  dt:'2025:04:15 16:33:12' } },
  { name:'sample_15.jpg', w:4000, h:2667, seed:15, top:[238,212,220], bot:[150,178,182], // misty rose sky   + slate teal mountain
    exif:{ make:'Sony',      model:'ILCE-7RM4',  lens:'Sony FE 70-200mm F2.8 GM OSS II', et:[1,800],  fn:[28,5],  iso:100,  fl:[85,1],  fl35:85,  dt:'2025:04:16 18:22:05' } },
];

// ── Deterministic PRNG ─────────────────────────────────────────────────────────
// Same seed + index always produces the same value, so images are reproducible.
function rand(seed, idx) {
  const x = Math.sin(seed * 127.1 + idx * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

// ── Mountain ridge vertices ────────────────────────────────────────────────────
/**
 * Generate a small set of control vertices for a gentle mountain-ridge line.
 * Keeping the count low (6 segments) lets the Bézier interpolation produce
 * wide, naturally flowing arcs rather than tight, angular shapes.
 *
 * @param {number} w    - Image width in px.
 * @param {number} h    - Image height in px.
 * @param {number} seed - Per-sample seed for reproducibility.
 * @returns {{x:number, y:number}[]}
 */
function ridgePoints(w, h, seed) {
  const steps = 6;
  const pts   = [];
  for (let i = 0; i <= steps; i++) {
    const x = Math.round((i / steps) * w);
    const t = rand(seed, i * 4);
    // Random peak height in the 18–32 % band (well above the edge anchor).
    const peakY  = Math.max(0.18, Math.min(0.32, 0.25 + (t - 0.5) * 0.14));
    // Parabolic edge weight: 0 at the left/right edges, 1 at the centre.
    const norm       = (i / steps) * 2 - 1;     // −1 … 0 … +1
    const edgeWeight = 1 - norm * norm;           // 0 at edges, 1 at centre
    // Edge anchor: ridge ends at 35–50 % from top = 50–65 % from the bottom.
    const edgeLow = 0.35 + rand(seed, i * 4 + 99) * 0.15;
    // Blend peak and edge — creates a natural mountain arch.
    const y = Math.round((peakY * edgeWeight + edgeLow * (1 - edgeWeight)) * h);
    pts.push({ x, y });
  }
  return pts;
}

// ── Catmull-Rom → cubic Bézier ─────────────────────────────────────────────────
/**
 * Convert an array of 2-D points into a smooth SVG cubic-Bézier path string
 * using the standard Catmull-Rom → Bézier conversion formula.
 * Result string starts with "M x,y" and continues with C commands.
 *
 * @param {{x:number, y:number}[]} pts
 * @returns {string}
 */
function smoothPath(pts) {
  const n = v => Math.round(v * 10) / 10;   // 1-decimal precision
  const d = [`M${n(pts[0].x)},${n(pts[0].y)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    // Catmull-Rom control points: tangent at P1 = (P2−P0)/2, bezier CP = tangent/3
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C${n(cp1x)},${n(cp1y)} ${n(cp2x)},${n(cp2y)} ${n(p2.x)},${n(p2.y)}`);
  }
  return d.join(' ');
}

// ── Colour helpers ─────────────────────────────────────────────────────────────
const clamp = (v, lo = 0, hi = 255) => Math.round(Math.max(lo, Math.min(hi, v)));
// Lighten a channel by adding a flat offset (result clamped to [0, 255]).
const lighten = (rgb, amount) => rgb.map(c => clamp(c + amount)).join(',');
// Darken a channel by scaling (result clamped to [0, 255]).
const darken  = (rgb, factor) => rgb.map(c => clamp(c * factor)).join(',');

// ── Ridge interpolation ────────────────────────────────────────────────────────
/**
 * Return the approximate ridge Y at a given X by linearly interpolating
 * between the nearest two ridge control vertices.
 */
function getRidgeY(pts, x) {
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
      return pts[i].y + t * (pts[i + 1].y - pts[i].y);
    }
  }
  return pts[pts.length - 1].y;
}

// ── Forest generator ────────────────────────────────────────────────────────────
/**
 * Generate SVG triangular conifer silhouettes along the mountain slope.
 * Trees are placed in a band from the ridge down to ~38 % of the mountain
 * height.  Two tone layers simulate depth: lighter trees in the background,
 * darker in the foreground.  All positions are deterministic via seed.
 *
 * @param {number}                w    - Image width in px.
 * @param {number}                h    - Image height in px.
 * @param {number}                seed - PRNG seed.
 * @param {number[]}              bot  - Mountain base colour [R, G, B].
 * @param {{x:number,y:number}[]} pts  - Ridge control vertices.
 * @returns {string}                   - SVG polygon elements.
 */
function buildForest(w, h, seed, bot, pts) {
  const fcDark  = darken(bot, 0.42);  // foreground trees — dark silhouette
  const fcLight = darken(bot, 0.58);  // background trees — slightly lighter

  let out = '';
  const numTrees = 20 + Math.floor(rand(seed, 200) * 14);

  for (let i = 0; i < numTrees; i++) {
    const tx    = Math.round((0.03 + rand(seed, i * 17 + 201) * 0.94) * w);
    const ry    = getRidgeY(pts, tx);
    const depth = rand(seed, i * 17 + 202);   // 0 = at ridge, 1 = deep into slope

    const treeBase = Math.round(ry + depth * (h - ry) * 0.38);
    // Larger/taller trees deeper in the scene — basic perspective scaling.
    const treeH    = Math.round(h * (0.025 + rand(seed, i * 17 + 203) * 0.030) * (0.55 + depth * 0.45));
    const treeW    = Math.round(treeH * (0.35 + rand(seed, i * 17 + 204) * 0.20));

    const color    = depth < 0.45 ? fcLight : fcDark;
    const opacity  = (0.65 + depth * 0.30).toFixed(2);
    out += `\n  <polygon points="${tx},${treeBase - treeH} ${tx - treeW},${treeBase} ${tx + treeW},${treeBase}" fill="rgb(${color})" opacity="${opacity}"/>`;
  }
  return out;
}

// ── House generator ─────────────────────────────────────────────────────────────
/**
 * Generate 1–2 hamlet clusters of 2–4 houses below the road (or on the lower
 * slope when there is no road).  Houses within a cluster are tight together and
 * never overlap each other.
 *
 * Positions are expressed as `frac` — fraction of mountain height below the
 * ridge (0 = at ridge, 1 = at the very base).  This maps directly to y-coords:
 *   baseY = ridgeY_at_x + frac * (h − ridgeY_at_x)
 *
 * @param {number}                w         - Image width in px.
 * @param {number}                h         - Image height in px.
 * @param {number}                seed      - PRNG seed.
 * @param {number[]}              bot       - Mountain base colour [R, G, B].
 * @param {{x:number,y:number}[]} pts       - Ridge control vertices.
 * @param {number|null}           roadDepth - Road depth (same frac unit), or null.
 * @returns {string}                        - SVG rect/polygon elements.
 */
function buildHouses(w, h, seed, bot, pts, roadDepth) {
  const wallColor = lighten(bot, 18);
  const roofColor = darken(bot, 0.50);

  // Houses sit BELOW the road.  Add a 12 % margin so they are clearly under it.
  const minFrac = roadDepth !== null ? roadDepth * 1.12 : 0.28;
  const maxFrac = 0.80;   // don't go all the way to the mountain base
  if (minFrac >= maxFrac) return '';   // road too deep — no room

  const placed = [];   // bounding boxes of already-drawn houses (for overlap check)
  let out = '';

  const numClusters = 1 + (rand(seed, 700) > 0.42 ? 1 : 0);   // 1 or 2 hamlets

  for (let ci = 0; ci < numClusters; ci++) {
    // Cluster anchor — random point in the lower-slope zone.
    const anchorX    = Math.round((0.10 + rand(seed, ci * 31 + 710) * 0.80) * w);
    const anchorFrac = minFrac + rand(seed, ci * 31 + 711) * (maxFrac - minFrac) * 0.65;
    const numInCluster = 2 + Math.floor(rand(seed, ci * 31 + 712) * 3);   // 2–4

    for (let i = 0; i < numInCluster; i++) {
      // Fixed size for this (ci, i) pair — stays consistent across placement attempts.
      const bh = Math.round(h * (0.019 + rand(seed, ci * 31 + i * 7 + 722) * 0.011));
      const bw = Math.round(bh * (1.25 + rand(seed, ci * 31 + i * 7 + 723) * 0.55));
      const roofH = Math.round(bh * (0.52 + rand(seed, ci * 31 + i * 7 + 724) * 0.36));

      // Try up to 10 slightly different positions to avoid overlapping neighbours.
      for (let attempt = 0; attempt < 10; attempt++) {
        const aOff   = attempt * 97;   // offset keeps per-attempt values distinct
        const spreadX = Math.round((rand(seed, ci * 31 + i * 7 + aOff + 720) - 0.5) * w * 0.06);
        const spreadF = (rand(seed, ci * 31 + i * 7 + aOff + 721) - 0.5) * 0.04;

        const tx   = Math.max(10, Math.min(w - 10, anchorX + spreadX));
        const frac = Math.max(minFrac, Math.min(maxFrac, anchorFrac + spreadF));

        const ry    = getRidgeY(pts, tx);
        const baseY = Math.round(ry + frac * (h - ry));
        const bx    = tx - Math.floor(bw / 2);
        const by    = baseY - bh;
        const roofTop = by - roofH;

        // Bounding box with a small gap so adjacent rooftops don't touch.
        const gap = Math.max(4, Math.round(bw * 0.15));
        const bb  = { x1: bx - gap, x2: bx + bw + gap, y1: roofTop - gap, y2: baseY + gap };
        const overlaps = placed.some(p =>
          bb.x1 < p.x2 && bb.x2 > p.x1 && bb.y1 < p.y2 && bb.y2 > p.y1
        );
        if (overlaps) continue;

        // Place the house.
        placed.push(bb);
        const overhang = Math.round(bw * 0.07);
        const ridgePx  = bx + Math.floor(bw / 2);
        const opacity  = (0.72 + frac * 0.15).toFixed(2);

        out += `\n  <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="rgb(${wallColor})" opacity="${opacity}"/>`;
        out += `\n  <polygon points="${bx - overhang},${by} ${bx + bw + overhang},${by} ${ridgePx},${roofTop}" fill="rgb(${roofColor})" opacity="${opacity}"/>`;
        if (rand(seed, ci * 31 + i * 7 + 725) > 0.45) {
          const cw = Math.max(2, Math.round(bw * 0.09));
          const ch = Math.round(roofH * 0.42);
          const cx = bx + Math.round(bw * (0.60 + rand(seed, ci * 31 + i * 7 + 726) * 0.20));
          out += `\n  <rect x="${cx}" y="${roofTop + Math.round(roofH * 0.18)}" width="${cw}" height="${ch}" fill="rgb(${roofColor})" opacity="${opacity}"/>`;
        }
        break;   // placed successfully — move to next house
      }
    }
  }
  return out;
}

// ── Road generator ──────────────────────────────────────────────────────────────
/**
 * Generate a single winding mountain road as a two-stroke Bézier path
 * (a slightly wider, darker border line + a lighter surface line).
 * The road runs from the left edge to the right edge of the mountain,
 * at ~28–53 % of the way from ridge to base.
 *
 * @param {number}                w    - Image width in px.
 * @param {number}                h    - Image height in px.
 * @param {number}                seed - PRNG seed.
 * @param {number[]}              bot  - Mountain base colour [R, G, B].
 * @param {{x:number,y:number}[]} pts  - Ridge control vertices.
 * @returns {string}                   - SVG path elements.
 */
function buildRoad(w, h, seed, bot, pts) {
  const rc  = lighten(bot, 48);    // road surface: lighter than mountain
  const rcs = darken(bot, 0.72);   // road border/shadow

  const ridgeL = getRidgeY(pts, 0);
  const ridgeR = getRidgeY(pts, w);
  const depth  = 0.28 + rand(seed, 501) * 0.25;
  const y1     = Math.round(ridgeL + (h - ridgeL) * depth);
  const y4     = Math.round(ridgeR + (h - ridgeR) * (depth + (rand(seed, 502) - 0.5) * 0.15));

  // Two control points make the road wind naturally across the slope.
  const cp1x = Math.round(w * (0.20 + rand(seed, 503) * 0.15));
  const cp1y = Math.round(y1 + (rand(seed, 504) - 0.5) * h * 0.12);
  const cp2x = Math.round(w * (0.62 + rand(seed, 505) * 0.15));
  const cp2y = Math.round(y4 + (rand(seed, 506) - 0.5) * h * 0.12);

  const sw   = Math.max(3, Math.round(w / 450));
  const swB  = sw + Math.ceil(w / 800);
  const d    = `M0,${y1} C${cp1x},${cp1y} ${cp2x},${cp2y} ${w},${y4}`;

  return `
  <path d="${d}" fill="none" stroke="rgb(${rcs})" stroke-width="${swB}" stroke-linecap="round" opacity="0.55"/>
  <path d="${d}" fill="none" stroke="rgb(${rc})"  stroke-width="${sw}"  stroke-linecap="round" opacity="0.75"/>`;
}

// ── Cloud generator ────────────────────────────────────────────────────────────
/**
 * Generate SVG markup for soft, wispy cloud clusters in the sky area.
 * Each cloud is a cluster of 5 overlapping white ellipses at low opacity.
 * Positions and sizes are fully deterministic via the PRNG seed.
 *
 * @param {number} w    - Image width in px.
 * @param {number} h    - Image height in px.
 * @param {number} seed - PRNG seed.
 * @returns {string}    - SVG ellipse elements (ready to splice into an <svg>).
 */
function buildClouds(w, h, seed) {
  // 2 or 3 cloud clusters, determined by the seed.
  const numClouds = 2 + (rand(seed, 77) > 0.55 ? 1 : 0);
  // Clouds are confined to the top 36 % of the image (the sky zone).
  const maxY = h * 0.36;
  let out = '';
  for (let ci = 0; ci < numClouds; ci++) {
    // Cloud centre — spread horizontally, avoid the very edges.
    const cx    = Math.round((0.10 + rand(seed, ci * 19 + 7) * 0.80) * w);
    const cy    = Math.round((0.06 + rand(seed, ci * 19 + 8) * 0.55) * maxY);
    // Scale proportional to image width (3.5 – 7 % of width).
    const scale = w * (0.035 + rand(seed, ci * 19 + 9) * 0.035);
    // 5-puff cluster: [dx, dy, rx-factor, ry-factor]
    const puffs = [
      [0,              0,              1.00, 0.58],
      [-scale * 0.72, +scale * 0.15,  0.68, 0.46],
      [+scale * 0.76, +scale * 0.12,  0.62, 0.42],
      [-scale * 0.32, -scale * 0.28,  0.56, 0.40],
      [+scale * 0.38, -scale * 0.22,  0.52, 0.38],
    ];
    for (const [dx, dy, rfx, rfy] of puffs) {
      const ex = Math.round(cx + dx);
      const ey = Math.round(cy + dy);
      const er = Math.round(scale * rfx);
      const eq = Math.round(scale * rfy);
      out += `\n  <ellipse cx="${ex}" cy="${ey}" rx="${er}" ry="${eq}" fill="rgba(255,255,255,.30)"/>`;
    }
  }
  return out;
}

// ── SVG builder ────────────────────────────────────────────────────────────────
/**
 * Build an SVG string with:
 *   • Sky section — vertical gradient, base colour at top → lighter near the ridge.
 *   • Cloud clusters — white semi-transparent ellipse puffs in the sky zone.
 *   • Mountain section — gradient from lighter hue at ridge → noticeably darker at base.
 *   • Ridge stroke — same Bézier path, blended into the mountain.
 *
 * @param {number}   w    - Width in px.
 * @param {number}   h    - Height in px.
 * @param {number}   seed - PRNG seed.
 * @param {number[]} top  - Sky base colour [R, G, B].
 * @param {number[]} bot  - Earth base colour [R, G, B].
 * @returns {string}      - SVG markup.
 */
function buildSVG(w, h, seed, top, bot) {
  const pts   = ridgePoints(w, h, seed);
  const ridge = smoothPath(pts);
  const first = pts[0];
  const last  = pts[pts.length - 1];

  // Closed mountain shape:
  //   bottom-left → up to first ridge point → smooth bezier → bottom-right → close.
  // ridge starts with "M x,y"; replacing the initial M with L lets us prepend our own M.
  const mountainD = `M${first.x},${h} ${ridge.replace(/^M/, 'L')} L${last.x},${h} Z`;

  // Sky gradient: base colour at top → slightly lighter/hazier near the ridge.
  const skyA = top.join(',');
  const skyB = lighten(top, 22);

  // Mountain gradient: slightly lighter at the ridge → noticeably darker at the base.
  const mtnA = lighten(bot, 10);
  const mtnB = darken(bot, 0.68);

  // Ridge stroke = earth colour at ~85 % brightness.
  const stroke = darken(bot, 0.85);

  // Stroke width scales with image size (~7 px at 4000 wide).
  const sw = Math.max(3, Math.round(w / 560));

  // Gradient anchor: approximate upper edge of the mountain.
  const ridgeY = Math.round(h * 0.28);

  const clouds    = buildClouds(w, h, seed);
  const forest    = buildForest(w, h, seed, bot, pts);
  // ~65 % of images have a road (deterministic via seed).
  const hasRoad   = rand(seed, 500) > 0.35;
  const road      = hasRoad ? buildRoad(w, h, seed, bot, pts) : '';
  // Road depth = fraction of mountain height from ridge; mirrors buildRoad's formula.
  const roadDepth = hasRoad ? 0.28 + rand(seed, 501) * 0.25 : null;
  const houses    = buildHouses(w, h, seed, bot, pts, roadDepth);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgb(${skyA})"/>
      <stop offset="100%" stop-color="rgb(${skyB})"/>
    </linearGradient>
    <linearGradient id="gmtn" x1="0" y1="${ridgeY}" x2="0" y2="${h}" gradientUnits="userSpaceOnUse">
      <stop offset="0%"   stop-color="rgb(${mtnA})"/>
      <stop offset="100%" stop-color="rgb(${mtnB})"/>
    </linearGradient>
    <clipPath id="clip-mtn">
      <path d="${mountainD}"/>
    </clipPath>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#gsky)"/>${clouds}
  <path d="${mountainD}" fill="url(#gmtn)"/>
  <g clip-path="url(#clip-mtn)">${road}${houses}
  </g>
  ${forest}
  <path d="${ridge}" fill="none"
        stroke="rgb(${stroke})" stroke-width="${sw}"
        stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

// ── EXIF embedding ─────────────────────────────────────────────────────────────

/**
 * Normalize a string to ASCII for EXIF text fields.
 * The EXIF spec mandates ASCII for IFD0 text fields (Make, Model, Artist,
 * Copyright). piexifjs stores strings as Latin-1 bytes; exifr reads them back
 * as UTF-8 — so any byte above 0x7F would be misinterpreted.
 *
 * Strategy: strip combining diacritics (NFD decomposition), map © → (c),
 * then drop anything outside the printable ASCII range.
 */
function toAscii(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining diacritics (é→e, ü→u…)
    .replace(/\u00A9/g, '(c)')         // © → (c)
    .replace(/[^\x20-\x7E]/g, '');     // drop any remaining non-ASCII printable
}

/**
 * Embed realistic EXIF metadata into a JPEG buffer using piexifjs.
 *
 * @param {Buffer} jpegBuf - Source JPEG buffer (from Sharp).
 * @param {object} e       - EXIF fields: make, model, lens, et, fn, iso, fl, fl35, dt.
 *   et   = ExposureTime as [numerator, denominator]  (e.g. [1, 250])
 *   fn   = FNumber      as [numerator, denominator]  (e.g. [14, 5] for f/2.8)
 *   iso  = ISO speed    as integer
 *   fl   = FocalLength  as [numerator, denominator]  (e.g. [85, 1])
 *   fl35 = FocalLengthIn35mmFilm as integer
 *   dt   = DateTimeOriginal string "YYYY:MM:DD HH:MM:SS"
 * @param {string} copyright - Copyright string (will be normalised to ASCII).
 * @returns {Buffer}         - New JPEG buffer with EXIF embedded.
 */
function embedExif(jpegBuf, e, copyright) {
  const author = toAscii(EXAMPLE_CONFIG.project.author);
  const exifObj = {
    '0th': {
      [piexif.ImageIFD.Make]:      e.make,
      [piexif.ImageIFD.Model]:     e.model,
      [piexif.ImageIFD.Copyright]: toAscii(copyright),
      [piexif.ImageIFD.Artist]:    author,
    },
    'Exif': {
      [piexif.ExifIFD.ExposureTime]:          e.et,
      [piexif.ExifIFD.FNumber]:               e.fn,
      [piexif.ExifIFD.ISOSpeedRatings]:       e.iso,
      [piexif.ExifIFD.DateTimeOriginal]:      e.dt,
      [piexif.ExifIFD.FocalLength]:           e.fl,
      [piexif.ExifIFD.FocalLengthIn35mmFilm]: e.fl35,
      [piexif.ExifIFD.LensModel]:             e.lens,
    },
    'GPS': {},
    '1st': {},
  };
  const exifBin  = piexif.dump(exifObj);
  const jpegBin  = piexif.insert(exifBin, jpegBuf.toString('binary'));
  return Buffer.from(jpegBin, 'binary');
}

// ── Main ───────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });

// Write (or overwrite) the example gallery config.
fs.writeFileSync(CFG_PATH, JSON.stringify(EXAMPLE_CONFIG, null, 2) + '\n', 'utf8');
console.log(`  wrote    gallery.config.json`);

const { author, date } = EXAMPLE_CONFIG.project;
const year      = date.slice(0, 4);
const copyright = `© ${year} ${author}`;
let created = 0;

for (const s of SAMPLES) {
  const dest = path.join(OUT_DIR, s.name);
  if (fs.existsSync(dest) && !FORCE) { console.log(`  skip     ${s.name}`); continue; }

  // 1. Render SVG → JPEG buffer via Sharp.
  const svg    = buildSVG(s.w, s.h, s.seed, s.top, s.bot);
  const jpgBuf = await sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toBuffer();

  // 2. Embed EXIF metadata via piexifjs.
  const finalBuf = embedExif(jpgBuf, s.exif, copyright);
  fs.writeFileSync(dest, finalBuf);

  console.log(`  created  ${s.name}  (${s.w}\xd7${s.h})  ${s.exif.make} ${s.exif.model}`);
  created++;
}

console.log(`\nDone — ${created} image(s) created in ${OUT_DIR}`);
