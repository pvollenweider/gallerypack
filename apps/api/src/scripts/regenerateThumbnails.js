// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/scripts/regenerateThumbnails.js — backfill thumbnails for existing photos
//
// Usage:
//   node regenerateThumbnails.js [--gallery <id>] [--missing-only] [--dry-run]
//
//   --gallery <id>   Only process photos belonging to this gallery
//   --missing-only   Skip photos that already have both sm and md thumbnails
//   --dry-run        Report what would be done without writing any files

import path         from 'node:path';
import { existsSync } from 'node:fs';
import { createPool } from 'mysql2/promise';
import { generateThumbnails, thumbPath, THUMB_SIZES } from '../services/thumbnailService.js';
import { ROOT } from '../../../../packages/engine/src/fs.js';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const galleryId   = args.includes('--gallery')      ? args[args.indexOf('--gallery') + 1]      : null;
const missingOnly = args.includes('--missing-only');
const dryRun      = args.includes('--dry-run');

if (dryRun) console.log('[dry-run] No files will be written.');

// ── DB connection ─────────────────────────────────────────────────────────────
const pool = createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER     || 'gallerypack',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'gallerypack',
  connectionLimit: 2,
});

async function run() {
  let sql  = 'SELECT p.id, p.filename, g.slug FROM photos p JOIN galleries g ON g.id = p.gallery_id';
  const params = [];
  if (galleryId) { sql += ' WHERE p.gallery_id = ?'; params.push(galleryId); }
  sql += ' ORDER BY p.created_at ASC';

  const [rows] = await pool.query(sql, params);
  console.log(`Found ${rows.length} photo(s) to process.`);

  let processed = 0, skipped = 0, failed = 0;

  for (const [i, row] of rows.entries()) {
    const label = `[${i + 1}/${rows.length}] ${row.id} (${row.filename})`;

    // Missing-only: skip if both sizes already exist
    if (missingOnly) {
      const allExist = Object.keys(THUMB_SIZES).every(s => existsSync(thumbPath(row.id, s)));
      if (allExist) { skipped++; continue; }
    }

    const srcPath = path.join(ROOT, 'src', row.slug, 'photos', row.filename);
    if (!existsSync(srcPath)) {
      console.warn(`${label} — source file missing, skipping`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`${label} — would generate thumbnails`);
      processed++;
      continue;
    }

    try {
      await generateThumbnails(srcPath, row.id);
      console.log(`${label} — ok`);
      processed++;
    } catch (err) {
      console.error(`${label} — FAILED: ${err.message}`);
      failed++;
    }
  }

  await pool.end();

  console.log(`\nDone. processed=${processed}  skipped=${skipped}  failed=${failed}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
