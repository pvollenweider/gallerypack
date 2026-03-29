// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/bootstrap.js — first-run setup + post-restart recovery
// Creates a default studio + admin user from environment variables if none exist.
// Also re-enqueues thumbnail generation for any photos that are missing thumbnails
// (e.g. after a container restart mid-upload).
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { query } from '../db/database.js';
import {
  createStudio, createUser, getUserByEmail,
  hashPassword, upsertStudioMembership,
} from '../db/helpers.js';
import { enqueueSm, enqueueMd, thumbPath, THUMB_SIZES } from './thumbnailService.js';
import { SRC_ROOT } from '../../../../packages/engine/src/fs.js';

export async function bootstrap() {
  const [rows] = await query('SELECT COUNT(*) AS n FROM studios');
  const studioCount = rows[0].n;

  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail    = process.env.ADMIN_EMAIL || 'admin@localhost';

  if (studioCount === 0) {
    if (!adminPassword) {
      console.warn('  ⚠  ADMIN_PASSWORD not set — skipping bootstrap (set it to create the default admin)');
      return;
    }

    // Create default studio (is_default = true for single-tenant fallback routing)
    const studio = await createStudio({
      name:      process.env.STUDIO_NAME || 'Default',
      slug:      'default',
      plan:      'free',
      isDefault: true,
    });

    // Create admin user with scrypt-hashed password, designated as platform superadmin
    const existing = await getUserByEmail(adminEmail);
    const user = existing || await createUser({
      studioId:     studio.id,
      email:        adminEmail,
      passwordHash: hashPassword(adminPassword),
      role:         'admin',
      name:         'Admin',
      platformRole: 'superadmin',
    });
    // Ensure platform_role is set even if user already existed
    if (existing && !existing.platform_role) {
      await query('UPDATE users SET platform_role = ? WHERE id = ?', ['superadmin', existing.id]);
    }

    // Insert owner membership for the admin user
    await upsertStudioMembership(studio.id, user.id, 'owner');

    console.log(`  ✓  Bootstrap complete — admin: ${adminEmail}`);
    return;
  }

  // Backfill: ensure every admin user has a studio_membership row
  const [admins] = await query(
    "SELECT u.id, u.studio_id FROM users u WHERE u.role = 'admin' AND u.studio_id IS NOT NULL"
  );

  for (const admin of admins) {
    const [existing] = await query(
      'SELECT id FROM studio_memberships WHERE studio_id = ? AND user_id = ?',
      [admin.studio_id, admin.id]
    );
    if (!existing[0]) {
      await upsertStudioMembership(admin.studio_id, admin.id, 'owner');
      console.log(`  ✓  Backfilled owner membership for user ${admin.id}`);
    }
  }

  // ── Post-restart thumbnail recovery ──────────────────────────────────────
  // Re-enqueue thumbnail generation for photos with missing or 0-byte thumbnails.
  // This handles the case where the container restarted while uploads were in progress.
  try {
    const [photos] = await query(
      `SELECT p.id, p.filename, g.slug AS gallery_slug
       FROM photos p
       JOIN galleries g ON g.id = p.gallery_id
       WHERE p.status = 'validated'`
    );
    const { default: sharp } = await import('sharp');
    let recovered = 0;
    let skipped   = 0;
    for (const p of photos) {
      const srcPath = path.join(SRC_ROOT, p.gallery_slug, 'photos', p.filename);
      if (!existsSync(srcPath)) continue;
      const missingSizes = Object.keys(THUMB_SIZES).filter(size => {
        const tp = thumbPath(p.id, size);
        if (!existsSync(tp)) return true;
        try { return statSync(tp).size === 0; } catch { return true; }
      });
      if (missingSizes.length === 0) continue;
      // Validate source file before re-queuing — skip unreadable files to avoid
      // an infinite failure loop on every API restart.
      try {
        await sharp(srcPath, { failOn: 'none' }).metadata();
      } catch {
        skipped++;
        continue;
      }
      if (missingSizes.includes('sm')) enqueueSm(srcPath, p.id);
      if (missingSizes.includes('md')) enqueueMd(srcPath, p.id);
      recovered++;
    }
    if (recovered > 0) console.log(`  ✓  Thumbnail recovery: ${recovered} photo(s) re-queued`);
    if (skipped   > 0) console.warn(`  ⚠  Thumbnail recovery: ${skipped} photo(s) skipped (unreadable by Sharp — delete or re-upload them)`);
  } catch (err) {
    console.warn('  ⚠  Thumbnail recovery scan failed:', err.message);
  }
}
