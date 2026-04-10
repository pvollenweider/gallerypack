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

// packages/engine/src/pwa.js — PWA asset generation for gallery builds
// Writes manifest.webmanifest, sw.js, icon-192.png, icon-512.png into distPath.

import fs   from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);

// ── Manifest ──────────────────────────────────────────────────────────────────

/**
 * Generate the Web App Manifest for a gallery.
 *
 * @param {object} project  - Gallery project config (title, locale, etc.)
 * @param {string} distName - Gallery dist path segment (e.g. "project/gallery")
 * @returns {string}        - JSON string for manifest.webmanifest
 */
export function buildManifest(project, distName) {
  const name       = project.title || 'Gallery';
  const shortName  = name.length > 12 ? name.slice(0, 12) : name;
  const lang       = (project.locale || 'fr').slice(0, 2);
  const themeColor = project.pwaThemeColor || '#000000';
  const bgColor    = project.pwaBgColor    || '#000000';

  const manifest = {
    name,
    short_name:       shortName,
    description:      project.description || name,
    lang,
    start_url:        './',
    scope:            './',
    display:          'standalone',
    orientation:      'any',
    theme_color:      themeColor,
    background_color: bgColor,
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };

  return JSON.stringify(manifest, null, 2);
}

// ── Service Worker ────────────────────────────────────────────────────────────

/**
 * Recursively list all files under a directory, returning relative paths
 * prefixed with './' (relative to distPath).
 *
 * @param {string} dir      - Absolute path to directory to enumerate
 * @param {string} distPath - Gallery dist root (used to build relative paths)
 * @returns {string[]}
 */
function listFilesRecursively(dir, distPath) {
  const result = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      result.push(...listFilesRecursively(full, distPath));
    } else {
      result.push('./' + path.relative(distPath, full).replace(/\\/g, '/'));
    }
  }
  return result;
}

/**
 * Generate a service worker that caches all gallery assets on first load.
 * Cache name includes a hash of the build timestamp to bust on rebuild.
 *
 * @param {string[]} photoFilenames  - List of WebP filenames in the gallery
 * @param {string}   buildHash       - Short hash to version the cache (e.g. build timestamp hex)
 * @param {string[]} [extraAssets]   - Additional assets to pre-cache (e.g. standalone vendor/fonts)
 * @returns {string}                 - JS source for sw.js
 */
export function buildServiceWorker(photoFilenames, buildHash, extraAssets = []) {
  const coreAssets = [
    './',
    './index.html',
    './data.js',
    './gallery.js',
  ];

  const photoAssets = photoFilenames.flatMap(f => [
    `./img/grid/${f}`,
    `./img/grid-sm/${f}`,
  ]);
  const allAssets   = [...coreAssets, ...photoAssets, ...extraAssets];

  return `// GalleryPack PWA Service Worker — auto-generated, do not edit
// Cache version: ${buildHash}

const CACHE_NAME = 'gallerypack-${buildHash}';

const ASSETS = ${JSON.stringify(allAssets, null, 2)};

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Only handle GET requests for same-origin assets
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses for future offline use
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

/**
 * Generate PWA icons (192x192 and 512x512) from the first gallery photo.
 * The icon is a center-cropped square with a slight padding on dark background.
 *
 * @param {string|null} firstPhotoPath - Absolute path to the first WebP photo in dist
 * @param {string}      distPath       - Absolute path to the gallery dist directory
 */
export async function buildPWAIcons(firstPhotoPath, distPath) {
  if (!firstPhotoPath || !fs.existsSync(firstPhotoPath)) {
    info('PWA icons: no photo found, using placeholder');
    await buildPlaceholderIcon(distPath);
    return;
  }

  for (const size of [192, 512]) {
    const outPath = path.join(distPath, `icon-${size}.png`);
    await sharp(firstPhotoPath)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(outPath);
  }
  ok('PWA icons → icon-192.png + icon-512.png');
}

/**
 * Generate a simple dark placeholder icon when no photo is available.
 *
 * @param {string} distPath - Absolute path to the gallery dist directory
 */
async function buildPlaceholderIcon(distPath) {
  for (const size of [192, 512]) {
    const outPath = path.join(distPath, `icon-${size}.png`);
    await sharp({
      create: {
        width:      size,
        height:     size,
        channels:   3,
        background: { r: 20, g: 20, b: 20 },
      },
    })
      .png()
      .toFile(outPath);
  }
  ok('PWA icons → placeholder generated');
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generate all PWA assets for a gallery and write them to distPath.
 *
 * @param {object}   opts
 * @param {object}   opts.project        - Gallery project config
 * @param {string}   opts.distPath       - Absolute path to gallery dist directory
 * @param {string}   opts.distName       - Gallery dist path segment
 * @param {string[]} opts.photoFilenames - Ordered list of WebP filenames in dist
 * @param {string}   opts.buildHash      - Short hash to version the SW cache
 * @param {boolean}  [opts.isStandalone] - Whether vendor/fonts are bundled in dist
 */
export async function buildPWAAssets({ project, distPath, distImgPath, distName, photoFilenames, buildHash, isStandalone }) {
  info('PWA → generating manifest, service worker, icons...');

  // manifest.webmanifest
  const manifestJson = buildManifest(project, distName);
  fs.writeFileSync(path.join(distPath, 'manifest.webmanifest'), manifestJson, 'utf8');
  ok('PWA manifest → manifest.webmanifest');

  // For standalone galleries, vendor and fonts are bundled — enumerate them for pre-caching
  const standaloneAssets = [];
  if (isStandalone) {
    for (const subdir of ['vendor', 'fonts']) {
      const subdirPath = path.join(distPath, subdir);
      if (fs.existsSync(subdirPath)) {
        standaloneAssets.push(...listFilesRecursively(subdirPath, distPath));
      }
    }
  }

  // sw.js
  const swJs = buildServiceWorker(photoFilenames, buildHash, standaloneAssets);
  fs.writeFileSync(path.join(distPath, 'sw.js'), swJs, 'utf8');
  ok('PWA service worker → sw.js');

  // Icons — use first photo from img/grid/ as source
  const imgBase = distImgPath || path.join(distPath, 'img');
  const firstPhoto = photoFilenames[0]
    ? path.join(imgBase, 'grid', photoFilenames[0])
    : null;
  await buildPWAIcons(firstPhoto, distPath);
}

// ── HTML head snippet ─────────────────────────────────────────────────────────

/**
 * Return the HTML snippet to inject in <head> to activate the PWA.
 *
 * @param {object} project - Gallery project config
 * @returns {string}       - HTML string
 */
export function buildPWAHead(project) {
  const themeColor = project.pwaThemeColor || '#000000';
  return `<link rel="manifest" href="./manifest.webmanifest">
<meta name="theme-color" content="${themeColor}">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${project.title || 'Gallery'}">
<link rel="apple-touch-icon" href="./icon-192.png">
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .catch(err => console.warn('SW registration failed:', err));
    });
  }
  // In standalone PWA mode, open external links in Safari so the user can navigate back
  if (window.navigator.standalone) {
    document.addEventListener('click', function(e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href) return;
      // External link: different origin, or mailto/tel
      var isExternal = /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
      var isScheme   = /^(mailto|tel|sms):/i.test(href);
      if (isExternal || isScheme) {
        e.preventDefault();
        window.open(href, '_blank');
      }
    }, true);
  }
</script>`.trim();
}
