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

// packages/engine/src/gallery.js — main build orchestration
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ROOT, SRC_ROOT, DIST_ROOT, DIST_VEN, DIST_FONTS, galleryPaths, copyDirSync } from './fs.js';
import { downloadVendors, downloadFonts } from './network.js';
import { discoverGalleries, readConfig } from './config.js';
import { galleryDistName } from './utils.js';
import { listPhotos, processPhotos } from './images.js';
import { resolveGpsLocations } from './exif.js';
import { buildHTML, buildIndexHTML, buildLegalNotice, buildBasicAuth, applyLegalTokens } from './html.js';

// ── Path constant for this file (packages/engine/src/) ────────────────────────
const __DIR = path.dirname(fileURLToPath(import.meta.url));

// Legal templates live at packages/engine/legal-templates/ (one level up from src/)
const LEGAL_TMPL_DIR = path.join(__DIR, '../legal-templates');

// ── Read the package version once at startup ──────────────────────────────────
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

// ── CLI flags ─────────────────────────────────────────────────────────────────
export const WEBP_ONLY  = process.argv.includes('--webp-only');
export const FORCE      = process.argv.includes('--force');
export const BUILD_ALL  = process.argv.includes('--all');
export const GALLERY_ARG = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

// ── Logging helpers ───────────────────────────────────────────────────────────
const log  = (m) => process.stdout.write(m + '\n');
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const fail = (m) => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);

// ── Delivery message ──────────────────────────────────────────────────────────

/**
 * Generate a ready-to-send delivery message in the gallery's locale.
 */
export function buildDeliveryMessage(project, summary, authInfo) {
  const isFr  = (project.locale || 'fr').startsWith('fr');
  const date  = summary.builtAt.slice(0, 10);
  const url   = summary.url || '(URL à renseigner — voir npm run publish)';

  const lines = [];

  if (isFr) {
    lines.push(`# Livraison — ${project.title}`);
    lines.push('');
    lines.push(`**Galerie :** ${project.title}`);
    if (project.subtitle)    lines.push(`**Sous-titre :** ${project.subtitle}`);
    if (project.author)      lines.push(`**Photographe :** ${project.author}`);
    if (project.date && project.date !== 'auto') lines.push(`**Date de prise de vue :** ${project.date}`);
    lines.push(`**Nombre de photos :** ${summary.photos}`);
    lines.push(`**URL :** ${url}`);
    lines.push(`**Généré le :** ${date}`);
    if (authInfo) {
      lines.push('');
      lines.push('## Accès');
      lines.push(`**Identifiant :** \`${authInfo.username}\``);
      lines.push(`**Mot de passe :** \`${authInfo.password}\``);
    }
    lines.push('');
    lines.push('## Instructions');
    if (authInfo) lines.push('Entrez le mot de passe ci-dessus pour accéder à la galerie.');
    lines.push('- Naviguez entre les photos avec les flèches ou en swipant');
    lines.push('- Cliquez sur ⛶ pour passer en plein écran');
    if (project.allowDownloadImage !== false) lines.push('- Téléchargez une photo avec le bouton ↓');
    if (project.allowDownloadGallery !== false) lines.push('- Téléchargez toutes les photos (ZIP) avec le bouton ZIP');
  } else {
    lines.push(`# Delivery — ${project.title}`);
    lines.push('');
    lines.push(`**Gallery:** ${project.title}`);
    if (project.subtitle)    lines.push(`**Subtitle:** ${project.subtitle}`);
    if (project.author)      lines.push(`**Photographer:** ${project.author}`);
    if (project.date && project.date !== 'auto') lines.push(`**Shoot date:** ${project.date}`);
    lines.push(`**Photos:** ${summary.photos}`);
    lines.push(`**URL:** ${url}`);
    lines.push(`**Generated:** ${date}`);
    if (authInfo) {
      lines.push('');
      lines.push('## Access');
      lines.push(`**Username:** \`${authInfo.username}\``);
      lines.push(`**Password:** \`${authInfo.password}\``);
    }
    lines.push('');
    lines.push('## How to use');
    if (authInfo) lines.push('Enter the password above to access the gallery.');
    lines.push('- Navigate with arrow keys or swipe');
    lines.push('- Click ⛶ for fullscreen');
    if (project.allowDownloadImage !== false) lines.push('- Download a single photo with the ↓ button');
    if (project.allowDownloadGallery !== false) lines.push('- Download all photos (ZIP) with the ZIP button');
  }

  lines.push('');
  lines.push('---');
  lines.push(`*${isFr ? 'Généré' : 'Generated'} by [GalleryPack](https://github.com/pvollenweider/gallerypack) v${VERSION}*`);
  return lines.join('\n') + '\n';
}

// ── Gallery builder ───────────────────────────────────────────────────────────

/**
 * Build a single gallery by name.
 *
 * @param {string} srcName    - Gallery folder name under src/.
 * @param {{ build: object }} cfg - Shared build config.
 * @param {string} fontCss    - Inlinable @font-face CSS from downloadFonts().
 * @param {import('@gallerypack/shared').BuildOptions} [options]
 * @returns {Promise<import('@gallerypack/shared').BuildOutput|null>}
 */
export async function buildGallery(srcName, { build, project: projectOverride, distName: distNameOverride }, fontCss, options = {}) {
  const {
    force             = FORCE,
    generateApacheAuth = false,
    geocoder          = undefined,  // undefined = use default Nominatim; null = skip
  } = options;
  const buildStart = Date.now();
  const cfgPath = path.join(SRC_ROOT, srcName, 'gallery.config.json');
  const galCfg  = readConfig(cfgPath, srcName);
  // Merge project config passed from caller (e.g. from DB via runner.js) — overrides file defaults
  if (projectOverride && typeof projectOverride === 'object') {
    Object.assign(galCfg.project, projectOverride);
  }
  galCfg.build  = build;

  const distName = distNameOverride || galleryDistName(galCfg.project, srcName);
  const paths    = galleryPaths(srcName, distName);

  if (galCfg.project.private) {
    log(`\n\x1b[1m📷  Gallery: ${srcName}\x1b[0m \x1b[33m(private → ${distName})\x1b[0m`);
  } else {
    log(`\n\x1b[1m📷  Gallery: ${srcName}\x1b[0m`);
  }
  log(`   Title  : ${galCfg.project.title || '(no title)'}`);
  log(`   Source : ${paths.srcDir}`);
  log(`   Dist   : ${paths.dist}\n`);

  const noDownloads = galCfg.project.allowDownloadImage   === false
                   && galCfg.project.allowDownloadGallery === false;
  fs.mkdirSync(path.join(paths.distImg, 'grid'),    { recursive: true });
  fs.mkdirSync(path.join(paths.distImg, 'grid-sm'), { recursive: true });
  fs.mkdirSync(path.join(paths.distImg, 'full'),    { recursive: true });
  if (!noDownloads) fs.mkdirSync(paths.distOri, { recursive: true });

  const photos = listPhotos(paths.srcDir);
  if (photos.length === 0) { fail(`No photos found in ${paths.srcDir}`); return null; }

  // Move cover photo to front if specified in config
  if (galCfg.project.coverPhoto) {
    const idx = photos.findIndex(p => p.file === galCfg.project.coverPhoto);
    if (idx > 0) photos.unshift(photos.splice(idx, 1)[0]);
  }

  log(`\n\x1b[1m🖼   Conversion (${photos.length} photo(s))\x1b[0m`);

  const results = await processPhotos(photos, galCfg, paths, force);

  await resolveGpsLocations(results, paths.manifest, galCfg.project.locale || 'en', VERSION, geocoder);

  // Resolve date:'auto' — pick the earliest EXIF DateTimeOriginal across all photos.
  if (galCfg.project.date === 'auto') {
    const exifDates = results
      .map(p => p.exif?.date)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d.getTime()));
    if (exifDates.length) {
      exifDates.sort((a, b) => a - b);
      galCfg.project.date = exifDates[0].toISOString().slice(0, 10);
      ok(`date: auto → ${galCfg.project.date}  (earliest EXIF date)`);
    } else {
      galCfg.project.date = '';
      ok('date: auto → no EXIF dates found, date left empty');
    }
  }

  if (!WEBP_ONLY) {
    const isStandalone = !!galCfg.project.standalone;
    log('\n\x1b[1m🏗   HTML\x1b[0m');

    const distDepth    = distName ? distName.split('/').length : 1;
    const localFontCss = isStandalone
      ? fontCss.replace(/url\('\.\.\/fonts\//g, "url('fonts/")
      : distDepth > 1
        ? fontCss.replace(/url\('\.\.\/fonts\//g, `url('${'../'.repeat(distDepth)}fonts/`)
        : fontCss;

    const galSrc        = path.join(SRC_ROOT, srcName);
    const legalHtmlPath = path.join(galSrc, 'legal.html');
    const legalTxtPath  = path.join(galSrc, 'legal.txt');
    const customLegal   = {};

    if (fs.existsSync(legalHtmlPath)) {
      customLegal.html = applyLegalTokens(fs.readFileSync(legalHtmlPath, 'utf8'), galCfg.project);
      ok('legal.html → gallery-specific template applied');
    } else {
      const locale = (galCfg.project.locale || 'en').slice(0, 2).toLowerCase();
      const tmplPath = path.join(LEGAL_TMPL_DIR, `legal.${locale}.html`);
      const fallbackPath = path.join(LEGAL_TMPL_DIR, 'legal.en.html');
      const chosenPath = fs.existsSync(tmplPath) ? tmplPath
                       : fs.existsSync(fallbackPath) ? fallbackPath
                       : null;
      if (chosenPath) {
        customLegal.html = applyLegalTokens(fs.readFileSync(chosenPath, 'utf8'), galCfg.project);
        ok(`legal.html → default template (${path.basename(chosenPath)}) applied`);
      }
    }

    if (fs.existsSync(legalTxtPath)) {
      customLegal.txt  = applyLegalTokens(fs.readFileSync(legalTxtPath,  'utf8'), galCfg.project);
      ok('legal.txt  → gallery-specific template applied');
    }

    const { html, dataJs, galleryJs } = buildHTML(galCfg, results, localFontCss, isStandalone, customLegal, distName, VERSION);
    fs.writeFileSync(path.join(paths.dist, 'index.html'), html, 'utf8');
    fs.writeFileSync(path.join(paths.dist, 'data.js'),    dataJs, 'utf8');
    fs.writeFileSync(path.join(paths.dist, 'gallery.js'), galleryJs, 'utf8');
    ok('index.html + data.js + gallery.js → dist/');
    fs.writeFileSync(path.join(paths.dist, 'LEGAL.md'), buildLegalNotice(galCfg), 'utf8');
    ok('LEGAL.md → dist/');
    if (galCfg.project.private) {
      log(`\n  \x1b[33m🔒  Private gallery URL:\x1b[0m`);
      log(`     http://localhost:3000/${distName}/\n`);
    }

    if (isStandalone) {
      if (fs.existsSync(DIST_VEN))   { copyDirSync(DIST_VEN,   path.join(paths.dist, 'vendor')); ok('vendor/ → standalone'); }
      if (fs.existsSync(DIST_FONTS)) { copyDirSync(DIST_FONTS, path.join(paths.dist, 'fonts'));  ok('fonts/  → standalone'); }
    }
  }

  // ── Basic-auth protection ─────────────────────────────────────────────────
  // authInfo is always computed for password galleries so callers can act on it,
  // but .htaccess/.htpasswd are only written when generateApacheAuth = true.
  let authInfo = null;
  if (!WEBP_ONLY && galCfg.project.access === 'password') {
    authInfo = buildBasicAuth(galCfg.project, paths.dist);
    if (generateApacheAuth) {
      fs.writeFileSync(path.join(paths.dist, '.htaccess'),  authInfo.htaccess, 'utf8');
      fs.writeFileSync(path.join(paths.dist, '.htpasswd'), authInfo.htpasswd, 'utf8');
      ok(`.htaccess + .htpasswd → generated (user: ${authInfo.username} / pwd: ${authInfo.password})`);
      log(`\n  \x1b[33m🔒  Password: ${authInfo.password}\x1b[0m\n`);
    } else {
      ok(`password gallery (user: ${authInfo.username} / pwd: ${authInfo.password}) — .htaccess skipped`);
      log(`\n  \x1b[33m🔒  Password: ${authInfo.password}\x1b[0m\n`);
    }

    if (results[0]?.name) {
      const coversDir = path.join(DIST_ROOT, 'covers');
      fs.mkdirSync(coversDir, { recursive: true });
      const srcCover  = path.join(paths.distImg, 'grid', `${results[0].name}.webp`);
      const destCover = path.join(coversDir, `${distName}.webp`);
      if (fs.existsSync(srcCover)) {
        fs.copyFileSync(srcCover, destCover);
        ok(`cover → dist/covers/${distName}.webp  (outside protected zone)`);
      }
    }
  }

  // ── Build summary ─────────────────────────────────────────────────────────
  const durationSec = ((Date.now() - buildStart) / 1000).toFixed(1);
  const srcBytes    = photos.reduce((sum, p) => { try { return sum + fs.statSync(p.full).size; } catch { return sum; } }, 0);
  const srcMB       = (srcBytes / 1024 / 1024).toFixed(1);
  const summary = {
    version:      VERSION,
    gallery:      galCfg.project.title,
    srcName,
    distName,
    dist:         paths.dist,
    photos:       results.length,
    sourceSizeMB: parseFloat(srcMB),
    locale:       galCfg.project.locale || 'fr',
    date:         galCfg.project.date   || '',
    access:       galCfg.project.access || 'public',
    ...(authInfo ? { authUser: authInfo.username, authPassword: authInfo.password } : {}),
    builtAt:      new Date().toISOString(),
    durationSec:  parseFloat(durationSec),
  };
  if (!WEBP_ONLY) {
    fs.writeFileSync(path.join(paths.dist, 'build-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  }

  if (!WEBP_ONLY) {
    const deliveryMd = buildDeliveryMessage(galCfg.project, summary, authInfo);
    fs.writeFileSync(path.join(paths.dist, 'DELIVERY.md'), deliveryMd, 'utf8');
    ok('DELIVERY.md → dist/');
  }

  log(`\n\x1b[1m📋  Summary\x1b[0m`);
  ok(`${results.length} photo(s)  ·  ${srcMB} MB source  ·  built in ${durationSec}s`);
  ok(`dist/ → ${paths.dist}`);

  return {
    srcName,
    distName,
    project:    galCfg.project,
    photoCount: results.length,
    firstPhoto: results[0]?.name || null,
    durationMs: Date.now() - buildStart,
    authInfo,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Orchestrate the full build pipeline.
 */
export async function main() {
  const build = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.config.json'), 'utf8'));

  const available = discoverGalleries();
  if (available.length === 0) {
    fail('No gallery found. Create src/<gallery-name>/gallery.config.json first.');
    process.exit(1);
  }

  let targets;
  if (BUILD_ALL) {
    targets = available;
  } else if (GALLERY_ARG) {
    if (!available.includes(GALLERY_ARG)) {
      fail(`Gallery "${GALLERY_ARG}" not found. Available: ${available.join(', ')}`);
      process.exit(1);
    }
    targets = [GALLERY_ARG];
  } else if (available.length === 1) {
    targets = available;
  } else {
    fail(`Multiple galleries found. Specify one or use --all.\nAvailable: ${available.join(', ')}`);
    process.exit(1);
  }

  if (!WEBP_ONLY) {
    await downloadVendors();
  }
  let fontCss = '';
  if (!WEBP_ONLY) {
    fontCss = await downloadFonts();
  }

  for (const name of targets) {
    await buildGallery(name, { build }, fontCss, { generateApacheAuth: true });
  }

  if (!WEBP_ONLY) {
    log('\n\x1b[1m🗂   Site index\x1b[0m');
    buildIndexHTML(fontCss, VERSION);
  }

  log('\n\x1b[32m\x1b[1m✅  Build complete\x1b[0m\n');
}
