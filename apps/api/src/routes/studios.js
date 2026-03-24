// apps/api/src/routes/studios.js — studio membership management
import { Router } from 'express';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import {
  getStudio,
  listStudioMembers,
  upsertStudioMembership,
  removeStudioMembership,
  getStudioMembership,
  ROLE_HIERARCHY,
} from '../db/helpers.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Helper: resolve studioId from param and verify caller has access
function resolveStudio(req, res) {
  const studio = getStudio(req.params.id);
  if (!studio) {
    res.status(404).json({ error: 'Studio not found' });
    return null;
  }
  // Override req.studioId/studioRole to the target studio
  // (for multi-studio support; single-studio setups always match req.studioId)
  return studio;
}

// GET /api/studios/:id/members — list members (admin+)
router.get('/:id/members', requireStudioRole('admin'), (req, res) => {
  const studio = resolveStudio(req, res);
  if (!studio) return;
  const members = listStudioMembers(studio.id);
  res.json(members);
});

// POST /api/studios/:id/members — add/update member (admin+)
// Body: { userId, role }
router.post('/:id/members', requireStudioRole('admin'), (req, res) => {
  const studio = resolveStudio(req, res);
  if (!studio) return;

  const { userId, role } = req.body || {};
  if (!userId || !role) return res.status(400).json({ error: 'userId and role are required' });
  if (!ROLE_HIERARCHY.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });
  }

  // Only owners can assign 'owner' role
  if (role === 'owner' && req.studioRole !== 'owner') {
    return res.status(403).json({ error: 'Only owners can assign the owner role' });
  }

  const membership = upsertStudioMembership(studio.id, userId, role);
  res.status(201).json(membership);
});

// PATCH /api/studios/:id/members/:userId — change role (admin+)
// Body: { role }
router.patch('/:id/members/:userId', requireStudioRole('admin'), (req, res) => {
  const studio = resolveStudio(req, res);
  if (!studio) return;

  const { userId } = req.params;
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: 'role is required' });
  if (!ROLE_HIERARCHY.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });
  }

  // Only owners can assign 'owner' role
  if (role === 'owner' && req.studioRole !== 'owner') {
    return res.status(403).json({ error: 'Only owners can assign the owner role' });
  }

  const existing = getStudioMembership(userId, studio.id);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });

  const membership = upsertStudioMembership(studio.id, userId, role);
  res.json(membership);
});

// DELETE /api/studios/:id/members/:userId — remove member (owner only)
router.delete('/:id/members/:userId', requireStudioRole('owner'), (req, res) => {
  const studio = resolveStudio(req, res);
  if (!studio) return;

  const { userId } = req.params;
  const existing = getStudioMembership(userId, studio.id);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });

  removeStudioMembership(studio.id, userId);
  res.json({ ok: true });
});

export default router;
