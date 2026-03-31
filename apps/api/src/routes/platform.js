// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/platform.js — superadmin platform management
// All routes require platformRole = 'superadmin'
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getOrganization,
  getOrganizationBySlug,
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  setDefaultOrganization,
} from '../services/organization.js';
import {
  createInvitation, getSettings,
} from '../db/helpers.js';
import { sendInviteEmail } from '../services/email.js';
import { query } from '../db/database.js';
import { getLicenseInfo, effectiveOrgLimit, installLicense } from '../services/license.js';

const router = Router();
router.use(requireAuth);

// Superadmin guard
function requireSuperadmin(req, res, next) {
  if (req.platformRole !== 'superadmin')
    return res.status(403).json({ error: 'Forbidden: superadmin only' });
  next();
}
router.use(requireSuperadmin);

// POST /api/platform/switch/:orgId — superadmin switches active organization
router.post('/switch/:orgId', async (req, res) => {
  const org = await getOrganization(req.params.orgId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  res.cookie('organization_override', org.id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000, // 8h
  });
  // Keep legacy cookie for backward compat
  res.cookie('studio_override', org.id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000, // 8h
  });
  res.json({ ok: true, organization: { id: org.id, name: org.name, slug: org.slug } });
});

// DELETE /api/platform/switch — return to default organization
router.delete('/switch', (req, res) => {
  res.clearCookie('organization_override');
  res.clearCookie('studio_override'); // legacy compat
  res.json({ ok: true });
});

// GET /api/platform/organizations
router.get('/organizations', async (req, res) => {
  const organizations = await listOrganizations();
  res.json(organizations);
});

// GET /api/platform/studios — backward compat alias
router.get('/studios', async (req, res) => {
  const organizations = await listOrganizations();
  res.json(organizations);
});

// GET /api/platform/license — current license status (superadmin only)
router.get('/license', (req, res) => {
  res.json(getLicenseInfo());
});


// GET /api/platform/license/usage — current usage vs. quota limits
router.get('/license/usage', async (req, res, next) => {
  try {
    const [[{ orgs }]]          = await query('SELECT COUNT(*) AS orgs FROM organizations');
    const [[{ galleries }]]     = await query('SELECT COUNT(*) AS galleries FROM galleries');
    const [[{ collaborators }]] = await query("SELECT COUNT(*) AS collaborators FROM studio_memberships WHERE role != 'owner'");
    const [[{ storageBytes }]]  = await query('SELECT COALESCE(SUM(size_bytes),0) AS storageBytes FROM photos');
    const storageGb = Math.round((Number(storageBytes) / (1024 ** 3)) * 100) / 100;
    res.json({ orgs: Number(orgs), galleries: Number(galleries), collaborators: Number(collaborators), storageGb });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/license — install a new license from JSON (superadmin only)
router.post('/license', (req, res) => {
  const { licenseJson } = req.body || {};
  if (!licenseJson || typeof licenseJson !== 'string') {
    return res.status(400).json({ error: 'licenseJson is required' });
  }
  try {
    const { info } = installLicense(licenseJson);
    res.json({ ok: true, license: info });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/platform/organizations — create a new organization + optional owner invitation
router.post('/organizations', async (req, res) => {
  const { name, slug, plan = 'free', ownerEmail } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!slug)  return res.status(400).json({ error: 'slug is required' });
  if (!/^[a-z0-9-]+$/.test(slug))
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens' });

  // Enforce organization_limit from license
  const limit = effectiveOrgLimit();
  if (limit !== Infinity) {
    const [[{ n }]] = await query('SELECT COUNT(*) AS n FROM organizations');
    if (Number(n) >= limit) {
      return res.status(403).json({ error: 'organization_limit_reached', limit, source: getLicenseInfo().source });
    }
  }

  const existing = await getOrganizationBySlug(slug);
  if (existing) return res.status(409).json({ error: 'An organization with this slug already exists' });

  const org = await createOrganization({ name, slug, plan });

  let inviteToken = null;
  if (ownerEmail) {
    // Create an invitation — the owner sets their own password via the invite link
    const invitation = await createInvitation(org.id, ownerEmail, 'owner', req.userId);
    inviteToken = invitation.token;

    // Send invite email (fire-and-forget)
    try {
      const s = await getSettings(org.id);
      const base = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
      sendInviteEmail({
        studioId:   org.id,
        to:         ownerEmail,
        studioName: org.name,
        inviteUrl:  `${base}/admin/invite/${inviteToken}`,
      });
    } catch {}
  }

  res.status(201).json({ ...org, inviteToken, ownerEmail: ownerEmail || null });
});

// POST /api/platform/studios — backward compat alias
router.post('/studios', async (req, res, next) => {
  // Delegate to the /organizations handler
  req.url = '/organizations';
  router.handle(req, res, next);
});

// PATCH /api/platform/organizations/:id
router.patch('/organizations/:id', async (req, res) => {
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const { name, slug, plan } = req.body || {};

  if (slug && slug !== org.slug) {
    const existing = await getOrganizationBySlug(slug);
    if (existing) return res.status(409).json({ error: 'Slug already taken' });
  }

  const updated = await updateOrganization(req.params.id, { name, slug, plan });
  res.json(updated);
});

// PATCH /api/platform/studios/:id — backward compat alias
router.patch('/studios/:id', async (req, res) => {
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const { name, slug, plan } = req.body || {};

  if (slug && slug !== org.slug) {
    const existing = await getOrganizationBySlug(slug);
    if (existing) return res.status(409).json({ error: 'Slug already taken' });
  }

  const updated = await updateOrganization(req.params.id, { name, slug, plan });
  res.json(updated);
});

// POST /api/platform/organizations/:id/set-default
router.post('/organizations/:id/set-default', async (req, res) => {
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  const updated = await setDefaultOrganization(req.params.id);
  res.json(updated);
});

// POST /api/platform/studios/:id/set-default — backward compat alias
router.post('/studios/:id/set-default', async (req, res) => {
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  const updated = await setDefaultOrganization(req.params.id);
  res.json(updated);
});

// DELETE /api/platform/organizations/:id
router.delete('/organizations/:id', async (req, res) => {
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (org.is_default)
    return res.status(400).json({ error: 'Cannot delete the default organization' });

  // Reassign any users whose organization_id points here to the default organization,
  // so they survive the deletion (belt-and-suspenders on top of the FK SET NULL).
  const [[defaultOrg]] = await query('SELECT id FROM organizations WHERE is_default = 1 LIMIT 1');
  if (defaultOrg) {
    await query('UPDATE users SET studio_id = ?, organization_id = ? WHERE studio_id = ?', [defaultOrg.id, defaultOrg.id, req.params.id]);
  }

  await deleteOrganization(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/platform/studios/:id — backward compat alias
router.delete('/studios/:id', async (req, res) => {
  const org = await getOrganization(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (org.is_default)
    return res.status(400).json({ error: 'Cannot delete the default organization' });

  const [[defaultOrg]] = await query('SELECT id FROM organizations WHERE is_default = 1 LIMIT 1');
  if (defaultOrg) {
    await query('UPDATE users SET studio_id = ?, organization_id = ? WHERE studio_id = ?', [defaultOrg.id, defaultOrg.id, req.params.id]);
  }

  await deleteOrganization(req.params.id);
  res.json({ ok: true });
});

// GET /api/platform/users — list all users (superadmin oversight)
router.get('/users', async (req, res) => {
  const [rows] = await query(`
    SELECT u.id, u.email, u.name, u.role, u.platform_role, u.studio_id AS organization_id, u.studio_id, u.created_at,
           o.name AS organization_name, o.slug AS organization_slug
    FROM users u
    LEFT JOIN organizations o ON o.id = u.studio_id
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
