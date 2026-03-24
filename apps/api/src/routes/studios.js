// apps/api/src/routes/studios.js — studio membership management
import { Router } from 'express';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import { getDb } from '../db/database.js';
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

// ── Convenience routes for the logged-in user's own studio ───────────────────
// These use req.studioId directly — no studio ID needed in the URL.

// GET /api/studios/members
router.get('/members', requireStudioRole('admin'), (req, res) => {
  res.json(listStudioMembers(req.studioId));
});

// PUT /api/studios/members/:userId — update role
router.put('/members/:userId', requireStudioRole('admin'), (req, res) => {
  const { userId } = req.params;
  const { role } = req.body || {};
  if (!role || !ROLE_HIERARCHY.includes(role))
    return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });
  if (role === 'owner' && req.studioRole !== 'owner')
    return res.status(403).json({ error: 'Only owners can assign the owner role' });
  const existing = getStudioMembership(userId, req.studioId);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });
  res.json(upsertStudioMembership(req.studioId, userId, role));
});

// DELETE /api/studios/members/:userId
router.delete('/members/:userId', requireStudioRole('owner'), (req, res) => {
  const { userId } = req.params;
  const existing = getStudioMembership(userId, req.studioId);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });
  removeStudioMembership(req.studioId, userId);
  res.json({ ok: true });
});

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

// GET /api/studios/audit — last 100 audit log entries for the user's studio (admin+)
router.get('/audit', requireStudioRole('admin'), (req, res) => {
  const entries = getDb().prepare(
    `SELECT al.*, u.email as user_email
     FROM audit_log al
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.studio_id = ?
     ORDER BY al.created_at DESC
     LIMIT 100`
  ).all(req.studioId);
  res.json(entries);
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
