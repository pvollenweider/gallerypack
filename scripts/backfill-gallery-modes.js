#!/usr/bin/env node
// Copyright (c) 2026 Philippe Vollenweider
//
// scripts/backfill-gallery-modes.js — classify existing galleries with gallery_mode IS NULL
// and suggest (or apply) a mode based on their current access/download flags.
//
// Usage:
//   node scripts/backfill-gallery-modes.js           # dry-run (default): print proposed changes
//   node scripts/backfill-gallery-modes.js --apply   # apply changes to the database

import 'dotenv/config';
import { createPool } from 'mariadb';

const APPLY = process.argv.includes('--apply');

const pool = createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER     || 'gallerypack',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME     || 'gallerypack',
  connectionLimit: 2,
});

/**
 * Heuristic classification — matches the spec in issue #451.
 *
 * Priority order:
 *  1. allow_download_original = 1 → archive
 *  2. access = 'private' AND (allow_download_image = 1 OR allow_download_gallery = 1) → client_delivery
 *  3. access = 'private' → client_preview
 *  4. access = 'public'  AND download_mode = 'none' → portfolio
 *  5. Otherwise → ambiguous (manual review required)
 *
 * @param {object} g  Raw DB row
 * @returns {{ mode: string|null, reason: string, ambiguous: boolean }}
 */
function classify(g) {
  const dlOriginal = !!g.allow_download_original;
  const dlImage    = !!g.allow_download_image;
  const dlGallery  = !!g.allow_download_gallery;
  const access     = g.access || 'public';
  const dlMode     = g.download_mode || 'display';

  if (dlOriginal) {
    return { mode: 'archive', reason: 'allow_download_original=1', ambiguous: false };
  }
  if (access === 'private' && (dlImage || dlGallery)) {
    return { mode: 'client_delivery', reason: `access=private + download enabled (image=${+dlImage} gallery=${+dlGallery})`, ambiguous: false };
  }
  if (access === 'private') {
    return { mode: 'client_preview', reason: 'access=private, no downloads', ambiguous: false };
  }
  if (access === 'public' && dlMode === 'none') {
    return { mode: 'portfolio', reason: 'access=public, download_mode=none', ambiguous: false };
  }
  // Public gallery with downloads — could be portfolio+override or just public archive
  return {
    mode: null,
    reason: `access=public, download_mode=${dlMode} (image=${+dlImage} gallery=${+dlGallery}) — manual review needed`,
    ambiguous: true,
  };
}

async function main() {
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(
      `SELECT id, slug, title, access, download_mode,
              allow_download_image, allow_download_gallery, allow_download_original
       FROM galleries
       WHERE gallery_mode IS NULL
       ORDER BY created_at ASC`
    );

    if (rows.length === 0) {
      console.log('✅  No galleries with gallery_mode IS NULL — nothing to backfill.');
      return;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  GalleryPack — gallery_mode backfill   [${APPLY ? 'APPLY' : 'DRY RUN'}]`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`  Found ${rows.length} galleries without a mode.\n`);

    const updates   = [];
    const ambiguous = [];

    for (const g of rows) {
      const { mode, reason, ambiguous: isAmbiguous } = classify(g);
      const label = g.title || g.slug;
      if (isAmbiguous) {
        ambiguous.push({ g, reason });
        console.log(`  ⚠️  SKIP   ${label} (${g.id.slice(0, 8)}…) — ${reason}`);
      } else {
        updates.push({ id: g.id, mode });
        console.log(`  →  ${mode.padEnd(16)} ${label} (${g.id.slice(0, 8)}…) — ${reason}`);
      }
    }

    console.log(`\n  Summary: ${updates.length} will be set, ${ambiguous.length} ambiguous.\n`);

    if (APPLY && updates.length > 0) {
      console.log('  Applying updates…');
      for (const { id, mode } of updates) {
        await conn.query(
          'UPDATE galleries SET gallery_mode = ?, updated_at = ? WHERE id = ?',
          [mode, Date.now(), id]
        );
      }
      console.log(`  ✅  Applied ${updates.length} mode assignments.`);
    } else if (!APPLY) {
      console.log('  Dry-run complete. Re-run with --apply to commit changes.');
    }

    if (ambiguous.length > 0) {
      console.log(`\n  ⚠️  ${ambiguous.length} gallery/galleries need manual review:`);
      for (const { g, reason } of ambiguous) {
        console.log(`     • ${g.slug} — ${reason}`);
      }
    }
    console.log('');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
