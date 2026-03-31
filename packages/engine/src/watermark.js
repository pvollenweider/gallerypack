// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of GalleryPack.
//
// GalleryPack is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// packages/engine/src/watermark.js — watermark overlay for full-size images
//
// Design spec (hardcoded per product requirements):
//   Font:    Local Brewery Five (Google Fonts)
//   Shadow:  opacity 0.80, translation 10px, angle -90° (straight up), blur radius 20
//   Effect:  opacity 0.50, font-size = 8% of image width
//            horizontal padding = 3% from right, vertical padding = 1% from bottom
//            alignment: bottom-right

import fs   from 'fs';
import path from 'path';
import { INTERNAL_ROOT }      from './fs.js';
import { fetchText, download } from './network.js';

const FONT_DIR  = path.join(INTERNAL_ROOT, 'fonts');
const FONT_PATH = path.join(FONT_DIR, 'local-brewery-five.ttf');

const warn = (m) => process.stdout.write(`  \x1b[33m!\x1b[0m  ${m}\n`);
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);

// ── Font management ───────────────────────────────────────────────────────────

/**
 * Download "Local Brewery Five" from Google Fonts (TTF format) and cache it.
 * Returns the local font file path, or null if unavailable.
 */
export async function ensureWatermarkFont() {
  if (fs.existsSync(FONT_PATH)) return FONT_PATH;
  fs.mkdirSync(FONT_DIR, { recursive: true });

  // Request TTF via an old-style UA so Google Fonts returns TTF instead of WOFF2
  const TTF_UA = 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)';
  try {
    const css = await fetchText(
      'https://fonts.googleapis.com/css2?family=Local+Brewery+Five&display=swap',
      TTF_UA,
    );
    const urlM = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(css);
    if (!urlM) throw new Error('Font URL not found in Google Fonts CSS');
    await download(urlM[1], FONT_PATH);
    ok('local-brewery-five.ttf');
    return FONT_PATH;
  } catch (e) {
    warn(`Watermark font unavailable (${e.message}) — falling back to sans-serif`);
    return null;
  }
}

// ── SVG overlay ───────────────────────────────────────────────────────────────

/**
 * Build an SVG Buffer sized to imgWidth × imgHeight that renders the
 * watermark text with the product-spec shadow and opacity, bottom-right aligned.
 *
 * @param {number} imgWidth
 * @param {number} imgHeight
 * @param {string} text       — watermark string
 * @param {string|null} fontPath — absolute path to TTF font, or null for fallback
 * @returns {Buffer}
 */
export function buildWatermarkSvg(imgWidth, imgHeight, text, fontPath) {
  // Design constants
  const opacity    = 0.50;
  const sizeRatio  = 0.08;   // 8% of image width
  const hPadRatio  = 0.03;   // 3% from right
  const vPadRatio  = 0.01;   // 1% from bottom
  const shadowOpacity    = 0.80;
  const shadowTranslation = 10;
  const shadowAngle      = -90; // degrees → straight up
  const shadowRadius     = 20;

  const fontSize = Math.round(imgWidth * sizeRatio);
  const x        = imgWidth  - Math.round(imgWidth  * hPadRatio);
  const y        = imgHeight - Math.round(imgHeight * vPadRatio);

  // Shadow offset from angle
  const rad = (shadowAngle * Math.PI) / 180;
  const sdx = Math.round(shadowTranslation * Math.cos(rad) * 10) / 10;
  const sdy = Math.round(shadowTranslation * Math.sin(rad) * 10) / 10;

  const fontDecl = fontPath
    ? `@font-face{font-family:'WMFont';src:url('file://${fontPath}')}`
    : '';
  const fontFamily = fontPath ? "'WMFont', sans-serif" : 'sans-serif';

  const txt = escXml(text);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}">
  <defs>
    <style>${fontDecl}</style>
    <filter id="wmshadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="${sdx}" dy="${sdy}" stdDeviation="${shadowRadius}"
        flood-color="black" flood-opacity="${shadowOpacity}"/>
    </filter>
  </defs>
  <text
    x="${x}" y="${y}"
    font-family="${fontFamily}"
    font-size="${fontSize}"
    fill="white"
    fill-opacity="${opacity}"
    text-anchor="end"
    dominant-baseline="auto"
    filter="url(#wmshadow)"
  >${txt}</text>
</svg>`;

  return Buffer.from(svg, 'utf8');
}

function escXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
