// apps/api/src/services/bootstrap.js — first-run setup
// Creates a default studio + admin user from environment variables if none exist.
import { query } from '../db/database.js';
import {
  createStudio, createUser, getUserByEmail,
  hashPassword, upsertStudioMembership,
} from '../db/helpers.js';

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
      name:      process.env.STUDIO_NAME || 'GalleryPack',
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
}
