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

// packages/engine/src/config.js — configuration loading and gallery discovery
import fs   from 'fs';
import path from 'path';

import { SRC_ROOT, BUILD_CFG_PATH } from './fs.js';
import { titleFromSlug, validateConfig } from './utils.js';

// Inline logging helpers (copied to avoid circular-dependency risk).
const info = (m) => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const fail = (m) => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);

/**
 * Return all gallery names discovered in src/.
 * A gallery is any subdirectory that has a gallery.config.json OR a photos/ subfolder.
 */
export function discoverGalleries() {
  if (!fs.existsSync(SRC_ROOT)) return [];
  return fs.readdirSync(SRC_ROOT)
    .filter(name => {
      try {
        const galDir = path.join(SRC_ROOT, name);
        return fs.statSync(galDir).isDirectory()
          && (fs.existsSync(path.join(galDir, 'gallery.config.json'))
              || fs.existsSync(path.join(galDir, 'photos')));
      } catch { return false; }
    });
}

/**
 * Load and merge gallery.config.json (project metadata) and
 * build.config.json (image dimensions / quality settings).
 *
 * Defaults applied when absent:
 *   title  → title-cased version of srcName  (e.g. "my-shoot" → "My Shoot")
 *   date   → "auto" (derive from EXIF, or today if no EXIF)
 *   locale → "fr"
 *   author → "" (omitted gracefully in the gallery)
 */
export function readConfig(cfgPath, srcName) {
  if (!fs.existsSync(BUILD_CFG_PATH)) { fail(`build.config.json introuvable`); process.exit(1); }
  const build = JSON.parse(fs.readFileSync(BUILD_CFG_PATH, 'utf8'));

  let project = {};
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    project = raw.project || {};
  } else {
    info(`No gallery.config.json found → using defaults  (tip: npm run new-gallery ${srcName || ''})`);
  }

  // Apply fallbacks for any missing field.
  if (!project.title)  project.title  = titleFromSlug(srcName || 'gallery');
  if (!project.date)   project.date   = 'auto';
  if (!project.locale) project.locale = 'fr';

  // Validate config and print any warnings.
  const warns = validateConfig(project);
  for (const w of warns) process.stdout.write(`  \x1b[33m⚠\x1b[0m  ${w}\n`);

  return { project, build };
}
