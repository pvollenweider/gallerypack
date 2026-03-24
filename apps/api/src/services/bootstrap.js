// apps/api/src/services/bootstrap.js — first-run setup
// Creates a default studio + admin user from environment variables if none exist.
import { getDb } from '../db/database.js';
import {
  createStudio, createUser, getUserByEmail,
  hashPassword, upsertStudioMembership,
} from '../db/helpers.js';

export function bootstrap() {
  const db = getDb();

  const studioCount = db.prepare('SELECT COUNT(*) as n FROM studios').get().n;

  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail    = process.env.ADMIN_EMAIL || 'admin@localhost';

  if (studioCount === 0) {
    if (!adminPassword) {
      console.warn('  ⚠  ADMIN_PASSWORD not set — skipping bootstrap (set it to create the default admin)');
      return;
    }

    // Create default studio
    const studio = createStudio({
      name: process.env.STUDIO_NAME || 'GalleryPack',
      slug: 'default',
      plan: 'free',
    });

    // Create admin user with scrypt-hashed password
    const existing = getUserByEmail(adminEmail);
    const user = existing || createUser({
      studioId:     studio.id,
      email:        adminEmail,
      passwordHash: hashPassword(adminPassword),
      role:         'admin',
      name:         'Admin',
    });

    // Insert owner membership for the admin user
    upsertStudioMembership(studio.id, user.id, 'owner');

    console.log(`  ✓  Bootstrap complete — admin: ${adminEmail}`);
    return;
  }

  // Backfill: ensure every admin user has a studio_membership row
  const admins = db.prepare(
    "SELECT u.id, u.studio_id FROM users u WHERE u.role = 'admin' AND u.studio_id IS NOT NULL"
  ).all();

  for (const admin of admins) {
    const existing = db.prepare(
      'SELECT id FROM studio_memberships WHERE studio_id = ? AND user_id = ?'
    ).get(admin.studio_id, admin.id);
    if (!existing) {
      upsertStudioMembership(admin.studio_id, admin.id, 'owner');
      console.log(`  ✓  Backfilled owner membership for user ${admin.id}`);
    }
  }
}
