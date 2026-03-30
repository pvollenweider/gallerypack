// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/organizations.js — canonical organization management API (Sprint 22 Phase 3)
//
// Exposes org CRUD, member management, and domain management via the OrganizationService.
// During the Sprint 22 transitional period this co-exists with /api/studios and /api/platform.
// In Sprint 23 the studio endpoints will be deprecated in favour of these.
//
// Route overview:
//   GET    /                         list organizations (superadmin: all; user: own)
//   GET    /:id                      org detail + members
//   PATCH  /:id                      update name/slug/plan/locale/country (admin+)
//   DELETE /:id                      delete org (superadmin only)
//   GET    /:id/members              list members
//   PUT    /:id/members/:userId      upsert member role (admin+)
//   DELETE /:id/members/:userId      remove member (owner only)
//   GET    /:id/domains              list custom domains (admin+)
//   POST   /:id/domains              add domain (admin+)
//   DELETE /:id/domains/:domain      remove domain (admin+)

import { Router } from 'express';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import {
  getOrganization,
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listOrgMembers,
  getOrgRole,
  upsertOrgMember,
  removeOrgMember,
  listOrgDomains,
  addOrgDomain,
  removeOrgDomain,
} from '../services/organization.js';
import { ROLE_HIERARCHY, audit, genId, hashPassword } from '../db/helpers.js';
import { query } from '../db/database.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSuperadmin(req) {
  return req.platformRole === 'superadmin';
}

/** Fetch org + verify the caller has access (superadmin or member). */
async function loadOrg(req, res) {
  const org = await getOrganization(req.params.id);
  if (!org) { res.status(404).json({ error: 'Organization not found' }); return null; }
  if (!isSuperadmin(req)) {
    const role = await getOrgRole(req.userId, org.id);
    if (!role) { res.status(403).json({ error: 'Forbidden' }); return null; }
  }
  return org;
}

// ── List ──────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  if (isSuperadmin(req)) {
    return res.json(await listOrganizations());
  }
  // Regular users see only their own org
  const orgId = req.organizationId || req.studioId;
  if (!orgId) return res.json([]);
  const org = await getOrganization(orgId);
  return res.json(org ? [org] : []);
});

// ── Create (superadmin only) ──────────────────────────────────────────────────

router.post('/', async (req, res) => {
  if (!isSuperadmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { name, slug, plan, locale, country } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });
  try {
    const org = await createOrganization({ name, slug, plan, locale, country });
    res.status(201).json(org);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug already taken' });
    throw err;
  }
});

// ── Detail ────────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  const members = await listOrgMembers(org.id);
  res.json({ ...org, members });
});

// ── Update ────────────────────────────────────────────────────────────────────

router.patch('/:id', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;

  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }

  const { name, description, slug, plan, locale, country } = req.body || {};
  const updated = await updateOrganization(org.id, { name, description, slug, plan, locale, country });
  try { await audit(org.id, req.userId, 'organization.update', 'organization', org.id, { name, slug }); } catch {}
  res.json(updated);
});

// ── Delete (superadmin only) ──────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  if (!isSuperadmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (org.is_default) return res.status(409).json({ error: 'Cannot delete the default organization' });
  await deleteOrganization(org.id);
  try { await audit(org.id, req.userId, 'organization.delete', 'organization', org.id, { slug: org.slug }); } catch {}
  res.json({ ok: true });
});

// ── Members ───────────────────────────────────────────────────────────────────

router.get('/:id/members', requireStudioRole('admin'), async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  res.json(await listOrgMembers(org.id));
});

// POST /organizations/:id/members/create — create user directly and add to org (no invitation sent)
router.post('/:id/members/create', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }

  const { name, email, password, role = 'collaborator' } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!password) return res.status(400).json({ error: 'password is required' });
  if (!ROLE_HIERARCHY.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });

  const [existing] = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing[0]) return res.status(409).json({ error: 'A user with this email already exists' });

  const id  = genId();
  const now = Date.now();
  await query(
    `INSERT INTO users (id, studio_id, organization_id, email, password_hash, role, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, org.id, org.id, email, hashPassword(password), role, name || '', now, now]
  );
  await upsertOrgMember(org.id, id, role);
  try { await audit(org.id, req.userId, 'member.created', 'user', id, { email, role }); } catch {}

  const members = await listOrgMembers(org.id);
  const member  = members.find(m => m.id === id);
  res.status(201).json(member);
});

// PATCH /organizations/:id/members/:userId — update member profile (name, bio, isPhotographer)
router.patch('/:id/members/:userId', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }

  const { userId } = req.params;
  const { name, bio, isPhotographer } = req.body || {};
  const sets = [];
  const vals = [];
  if (name          !== undefined) { sets.push('name = ?');            vals.push(name ?? ''); }
  if (bio           !== undefined) { sets.push('bio = ?');             vals.push(bio ?? null); }
  if (isPhotographer !== undefined) { sets.push('is_photographer = ?'); vals.push(isPhotographer ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  sets.push('updated_at = ?');
  vals.push(Date.now(), userId);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
  try { await audit(org.id, req.userId, 'member.profile_updated', 'user', userId, { name, bio, isPhotographer }); } catch {}
  res.json({ ok: true });
});

router.put('/:id/members/:userId', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;

  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }

  const { userId } = req.params;
  const { role } = req.body || {};
  if (!role || !ROLE_HIERARCHY.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ROLE_HIERARCHY.join(', ')}` });
  }
  if (role === 'owner' && callerRole !== 'owner') {
    return res.status(403).json({ error: 'Only owners can assign the owner role' });
  }

  await upsertOrgMember(org.id, userId, role);
  try { await audit(org.id, req.userId, 'member.role_changed', 'user', userId, { to: role }); } catch {}
  res.json({ ok: true, userId, role });
});

// GET /organizations/:id/photographers — org members with is_photographer = true
router.get('/:id/photographers', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  const members = await listOrgMembers(org.id);
  res.json(members.filter(m => m.is_photographer));
});

// PATCH /organizations/:id/members/:userId/photographer — toggle is_photographer flag
router.patch('/:id/members/:userId/photographer', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }
  const { userId } = req.params;
  await query('UPDATE users SET is_photographer = NOT is_photographer WHERE id = ?', [userId]);
  const [rows] = await query('SELECT is_photographer FROM users WHERE id = ?', [userId]);
  res.json({ ok: true, isPhotographer: !!rows[0]?.is_photographer });
});

router.delete('/:id/members/:userId', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;

  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (callerRole !== 'owner') {
    return res.status(403).json({ error: 'Only owners can remove members' });
  }

  await removeOrgMember(org.id, req.params.userId);
  try { await audit(org.id, req.userId, 'member.removed', 'user', req.params.userId, {}); } catch {}
  res.json({ ok: true });
});

// ── Domains ───────────────────────────────────────────────────────────────────

router.get('/:id/domains', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;
  res.json(await listOrgDomains(org.id));
});

router.post('/:id/domains', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;

  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }

  const { domain, isPrimary = false } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'domain is required' });
  await addOrgDomain(org.id, domain, isPrimary);
  res.status(201).json({ ok: true, domain });
});

router.delete('/:id/domains/:domain', async (req, res) => {
  const org = await loadOrg(req, res);
  if (!org) return;

  const callerRole = isSuperadmin(req) ? 'owner' : (await getOrgRole(req.userId, org.id));
  if (!['admin', 'owner'].includes(callerRole)) {
    return res.status(403).json({ error: 'Requires admin role or higher' });
  }

  await removeOrgDomain(org.id, req.params.domain);
  res.json({ ok: true });
});

export default router;
