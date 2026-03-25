// apps/api/src/routes/studios.js — studio membership management
// v1: single-studio only. All routes operate on req.studioId (the caller's studio).
// Multi-studio routes (/studios/:id/...) removed — they had an authorization bypass:
// requireStudioRole validated the caller's own studio, not the target studio.
import { Router } from 'express';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import { getDb } from '../db/database.js';
import {
  listStudioMembers,
  upsertStudioMembership,
  removeStudioMembership,
  getStudioMembership,
  ROLE_HIERARCHY,
} from '../db/helpers.js';

function countOwners(studioId) {
  return getDb()
    .prepare("SELECT COUNT(*) as n FROM studio_memberships WHERE studio_id = ? AND role = 'owner'")
    .get(studioId).n;
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/studios/members
router.get('/members', requireStudioRole('admin'), (req, res) => {
  res.json(listStudioMembers(req.studioId));
});

// GET /api/studios/members/:userId — single member profile
router.get('/members/:userId', requireStudioRole('admin'), (req, res) => {
  const { userId } = req.params;
  const members = listStudioMembers(req.studioId);
  const member = members.find(m => m.user.id === userId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
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
  if (existing.role === 'owner' && role !== 'owner' && countOwners(req.studioId) <= 1)
    return res.status(409).json({ error: 'Cannot demote the last owner. Assign another owner first.' });
  res.json(upsertStudioMembership(req.studioId, userId, role));
});

// DELETE /api/studios/members/:userId
router.delete('/members/:userId', requireStudioRole('owner'), (req, res) => {
  const { userId } = req.params;
  const existing = getStudioMembership(userId, req.studioId);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });
  if (existing.role === 'owner' && countOwners(req.studioId) <= 1)
    return res.status(409).json({ error: 'Cannot remove the last owner. Assign another owner first.' });
  removeStudioMembership(req.studioId, userId);
  res.json({ ok: true });
});

// GET /api/studios/audit — last 100 audit log entries (admin+)
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

export default router;
