// apps/api/src/routes/platform.js — superadmin platform management
// All routes require platformRole = 'superadmin'
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listAllStudios, getStudio, createStudio, updateStudio, deleteStudio,
  createUser, getUserByEmail, hashPassword, upsertStudioMembership,
  getStudioBySlug,
} from '../db/helpers.js';
import { query } from '../db/database.js';

const router = Router();
router.use(requireAuth);

// Superadmin guard
function requireSuperadmin(req, res, next) {
  if (req.platformRole !== 'superadmin')
    return res.status(403).json({ error: 'Forbidden: superadmin only' });
  next();
}
router.use(requireSuperadmin);

// GET /api/platform/studios
router.get('/studios', async (req, res) => {
  const studios = await listAllStudios();
  res.json(studios);
});

// POST /api/platform/studios — create a new studio + optional first owner
router.post('/studios', async (req, res) => {
  const { name, slug, plan = 'free', ownerEmail, ownerPassword, ownerName } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!slug)  return res.status(400).json({ error: 'slug is required' });
  if (!/^[a-z0-9-]+$/.test(slug))
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens' });

  const existing = await getStudioBySlug(slug);
  if (existing) return res.status(409).json({ error: 'A studio with this slug already exists' });

  const studio = await createStudio({ name, slug, plan });

  let owner = null;
  if (ownerEmail) {
    if (!ownerPassword || ownerPassword.length < 8)
      return res.status(400).json({ error: 'ownerPassword must be at least 8 characters' });
    const existingUser = await getUserByEmail(ownerEmail);
    owner = existingUser || await createUser({
      studioId:     studio.id,
      email:        ownerEmail,
      passwordHash: hashPassword(ownerPassword),
      role:         'admin',
      name:         ownerName || ownerEmail,
    });
    await upsertStudioMembership(studio.id, owner.id, 'owner');
  }

  res.status(201).json({ ...studio, owner: owner ? { id: owner.id, email: owner.email } : null });
});

// PATCH /api/platform/studios/:id
router.patch('/studios/:id', async (req, res) => {
  const studio = await getStudio(req.params.id);
  if (!studio) return res.status(404).json({ error: 'Studio not found' });

  const { name, slug, plan } = req.body || {};

  if (slug && slug !== studio.slug) {
    const existing = await getStudioBySlug(slug);
    if (existing) return res.status(409).json({ error: 'Slug already taken' });
  }

  const updated = await updateStudio(req.params.id, { name, slug, plan });
  res.json(updated);
});

// DELETE /api/platform/studios/:id
router.delete('/studios/:id', async (req, res) => {
  const studio = await getStudio(req.params.id);
  if (!studio) return res.status(404).json({ error: 'Studio not found' });
  if (studio.is_default)
    return res.status(400).json({ error: 'Cannot delete the default studio' });
  await deleteStudio(req.params.id);
  res.json({ ok: true });
});

// GET /api/platform/users — list all users (superadmin oversight)
router.get('/users', async (req, res) => {
  const [rows] = await query(`
    SELECT u.id, u.email, u.name, u.role, u.platform_role, u.studio_id, u.created_at,
           s.name AS studio_name, s.slug AS studio_slug
    FROM users u
    LEFT JOIN studios s ON s.id = u.studio_id
    ORDER BY u.created_at DESC
  `);
  res.json(rows);
});

// PATCH /api/platform/users/:id — toggle superadmin
router.patch('/users/:id', async (req, res) => {
  const { platformRole } = req.body || {};
  if (platformRole !== null && platformRole !== 'superadmin')
    return res.status(400).json({ error: 'platformRole must be "superadmin" or null' });
  await query('UPDATE users SET platform_role = ? WHERE id = ?', [platformRole || null, req.params.id]);
  const [rows] = await query('SELECT id, email, name, role, platform_role FROM users WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

export default router;
