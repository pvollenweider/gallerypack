// apps/api/src/services/bootstrap.js — first-run setup
// Creates a default studio + admin user from environment variables if none exist.
import { createHash } from 'crypto';
import { getDb } from '../db/database.js';
import { createStudio, createUser, getUserByEmail } from '../db/helpers.js';

function hashPassword(pwd) {
  return createHash('sha256').update(pwd).digest('hex');
}

export function bootstrap() {
  const db = getDb();

  const studioCount = db.prepare('SELECT COUNT(*) as n FROM studios').get().n;
  if (studioCount > 0) return; // already set up

  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail    = process.env.ADMIN_EMAIL || 'admin@localhost';

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

  // Create admin user
  const existing = getUserByEmail(adminEmail);
  if (!existing) {
    createUser({
      studioId:     studio.id,
      email:        adminEmail,
      passwordHash: hashPassword(adminPassword),
      role:         'admin',
      name:         'Admin',
    });
  }

  console.log(`  ✓  Bootstrap complete — admin: ${adminEmail}`);
}
