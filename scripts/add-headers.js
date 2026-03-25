#!/usr/bin/env node
// scripts/add-headers.js — inject license headers into all source files
// Safe to re-run: skips files that already have a copyright header.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const AGPL_HEADER = `\
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
`;

const PROPRIETARY_HEADER = `\
// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.
`;

const SQL_AGPL_HEADER = `\
-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of GalleryPack (AGPL-3.0).
-- See LICENSES/AGPL-3.0.txt for license terms.
`;

const SQL_PROPRIETARY_HEADER = `\
-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.
`;

const IGNORE = ['node_modules', 'dist', '.git'];

function walk(dir, exts) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full, exts));
    else if (exts.includes(extname(entry.name))) results.push(full);
  }
  return results;
}

function getLicense(relPath) {
  if (relPath.startsWith('packages/')) return 'agpl';
  if (relPath.startsWith('apps/') || relPath.startsWith('workers/')) return 'proprietary';
  return null;
}

const TARGETS = [
  { dir: 'packages',                   exts: ['.js', '.jsx'] },
  { dir: 'apps/api/src',               exts: ['.js', '.jsx'] },
  { dir: 'apps/web/src',               exts: ['.js', '.jsx'] },
  { dir: 'workers/builder/src',        exts: ['.js', '.jsx'] },
  { dir: 'apps/api/src/db/migrations', exts: ['.sql'] },
];

let injected = 0, skipped = 0;

for (const { dir, exts } of TARGETS) {
  const absDir = join(ROOT, dir);
  try { statSync(absDir); } catch { continue; }

  for (const absPath of walk(absDir, exts)) {
    const relPath = relative(ROOT, absPath);
    const license = getLicense(relPath);
    if (!license) continue;

    const content = readFileSync(absPath, 'utf8');
    if (content.slice(0, 300).includes('Copyright')) { skipped++; continue; }

    const isSql = extname(absPath) === '.sql';
    let header;
    if (isSql)  header = license === 'agpl' ? SQL_AGPL_HEADER : SQL_PROPRIETARY_HEADER;
    else        header = license === 'agpl' ? AGPL_HEADER      : PROPRIETARY_HEADER;

    writeFileSync(absPath, header + '\n' + content);
    console.log(`  + ${relPath}`);
    injected++;
  }
}

console.log(`\nDone: ${injected} headers added, ${skipped} already had a header.`);
