// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/organizations-legacy.js — organization membership management (legacy)
// v1: single-organization only. All routes operate on req.organizationId (the caller's org).
import { Router } from 'express';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import { query } from '../db/database.js';
import { prerenderAll } from '../services/prerender.js';
import {
  listOrgMembers,
  upsertOrgMember,
  removeOrgMember,
  getOrgRole,
} from '../services/organization.js';
import {
  createJob,
  ROLE_HIERARCHY,
  audit,
} from '../db/helpers.js';

async function countOwners(orgId) {
  const [rows] = await query(
    "SELECT COUNT(*) AS n FROM studio_memberships WHERE studio_id = ? AND role = 'owner'",
    [orgId]
  );
  return rows[0].n;
}

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/organizations/members
router.get('/members', requireStudioRole('admin'), async (req, res) => {
  res.json(await listOrgMembers(req.organizationId));
});

// GET /api/organizations/members/:userId — single member profile
router.get('/members/:userId', requireStudioRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const members = await listOrgMembers(req.organizationId);
  const member = members.find(m => m.user.id === userId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
});

// PUT /api/organizations/members/:userId — update role
router.put('/members/:userId', requireStudioRole('admin'), async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body || {};
  if (!role || !ROLE_HIERARCHY.includes(role))
    return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });
  if (role === 'owner' && req.studioRole !== 'owner')
    return res.status(403).json({ error: 'Only owners can assign the owner role' });
  const existingRole = await getOrgRole(userId, req.organizationId);
  if (!existingRole) return res.status(404).json({ error: 'Membership not found' });
  if (existingRole === 'owner' && role !== 'owner' && await countOwners(req.organizationId) <= 1)
    return res.status(409).json({ error: 'Cannot demote the last owner. Assign another owner first.' });
  const result = await upsertOrgMember(req.organizationId, userId, role);
  try { await audit(req.organizationId, req.userId, 'member.role_changed', 'user', userId, { from: existingRole, to: role }); } catch {}
  res.json(result);
});

// DELETE /api/organizations/members/:userId
router.delete('/members/:userId', requireStudioRole('owner'), async (req, res) => {
  const { userId } = req.params;
  const existingRole = await getOrgRole(userId, req.organizationId);
  if (!existingRole) return res.status(404).json({ error: 'Membership not found' });
  if (existingRole === 'owner' && await countOwners(req.organizationId) <= 1)
    return res.status(409).json({ error: 'Cannot remove the last owner. Assign another owner first.' });
  await removeOrgMember(req.organizationId, userId);
  try { await audit(req.organizationId, req.userId, 'member.removed', 'user', userId, { removedRole: existingRole }); } catch {}
  res.json({ ok: true });
});

// POST /api/organizations/build-all — queue builds for every gallery in the organization
router.post('/build-all', requireStudioRole('admin'), async (req, res) => {
  const [rows] = await query(
    "SELECT id FROM galleries WHERE studio_id = ?",
    [req.organizationId]
  );
  if (!rows.length) return res.json({ queued: 0, total: 0 });

  let queued = 0;
  for (const { id } of rows) {
    const [existing] = await query(
      "SELECT COUNT(*) AS n FROM build_jobs WHERE studio_id = ? AND gallery_id = ? AND status IN ('queued','running')",
      [req.organizationId, id]
    );
    if (existing[0].n > 0) continue;
    try {
      await createJob({ galleryId: id, studioId: req.organizationId, triggeredBy: req.user.id, force: false });
      queued++;
    } catch {}
  }

  try { await audit(req.organizationId, req.userId, 'organization.build_all', 'organization', req.organizationId, { queued, total: rows.length }); } catch {}
  res.json({ queued, total: rows.length });
});

// GET /api/organizations/audit — last 100 audit log entries (admin+)
router.get('/audit', requireStudioRole('admin'), async (req, res) => {
  const [entries] = await query(
    `SELECT al.*, u.email AS user_email
     FROM audit_log al
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.studio_id = ?
     ORDER BY al.created_at DESC
     LIMIT 100`,
    [req.organizationId]
  );
  res.json(entries);
});

// POST /api/organizations/prerender — re-generate all static index.html pages
router.post('/prerender', requireStudioRole('admin'), async (req, res) => {
  await prerenderAll();
  res.json({ ok: true });
});

export default router;
