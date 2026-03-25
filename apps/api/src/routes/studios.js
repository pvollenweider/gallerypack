// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/studios.js — studio membership management
// v1: single-studio only. All routes operate on req.studioId (the caller's studio).
import { Router } from 'express';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import { query } from '../db/database.js';
import {
  listStudioMembers,
  upsertStudioMembership,
  removeStudioMembership,
  getStudioMembership,
  ROLE_HIERARCHY,
  audit,
} from '../db/helpers.js';

async function countOwners(studioId) {
  const [rows] = await query(
    "SELECT COUNT(*) AS n FROM studio_memberships WHERE studio_id = ? AND role = 'owner'",
    [studioId]
  );
  return rows[0].n;
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/studios/members
router.get('/members', requireStudioRole('admin'), async (req, res) => {
  res.json(await listStudioMembers(req.studioId));
});

// GET /api/studios/members/:userId — single member profile
router.get('/members/:userId', requireStudioRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const members = await listStudioMembers(req.studioId);
  const member = members.find(m => m.user.id === userId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
});

// PUT /api/studios/members/:userId — update role
router.put('/members/:userId', requireStudioRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body || {};
  if (!role || !ROLE_HIERARCHY.includes(role))
    return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });
  if (role === 'owner' && req.studioRole !== 'owner')
    return res.status(403).json({ error: 'Only owners can assign the owner role' });
  const existing = await getStudioMembership(userId, req.studioId);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });
  if (existing.role === 'owner' && role !== 'owner' && await countOwners(req.studioId) <= 1)
    return res.status(409).json({ error: 'Cannot demote the last owner. Assign another owner first.' });
  const result = await upsertStudioMembership(req.studioId, userId, role);
  try { await audit(req.studioId, req.userId, 'member.role_changed', 'user', userId, { from: existing.role, to: role }); } catch {}
  res.json(result);
});

// DELETE /api/studios/members/:userId
router.delete('/members/:userId', requireStudioRole('owner'), async (req, res) => {
  const { userId } = req.params;
  const existing = await getStudioMembership(userId, req.studioId);
  if (!existing) return res.status(404).json({ error: 'Membership not found' });
  if (existing.role === 'owner' && await countOwners(req.studioId) <= 1)
    return res.status(409).json({ error: 'Cannot remove the last owner. Assign another owner first.' });
  await removeStudioMembership(req.studioId, userId);
  try { await audit(req.studioId, req.userId, 'member.removed', 'user', userId, { removedRole: existing.role }); } catch {}
  res.json({ ok: true });
});

// GET /api/studios/audit — last 100 audit log entries (admin+)
router.get('/audit', requireStudioRole('admin'), async (req, res) => {
  const [entries] = await query(
    `SELECT al.*, u.email AS user_email
     FROM audit_log al
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.studio_id = ?
     ORDER BY al.created_at DESC
     LIMIT 100`,
    [req.studioId]
  );
  res.json(entries);
});

export default router;
