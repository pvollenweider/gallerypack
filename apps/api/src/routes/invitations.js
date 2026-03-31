// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/invitations.js — organization user invitation system
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import {
  getOrganization,
} from '../services/organization.js';
import {
  createInvitation,
  getInvitationByToken,
  acceptInvitation,
  listInvitations,
  deleteInvitation,
  getSettings,
  createSession,
  audit,
  getUserByEmail,
  upsertGalleryRoleAssignment,
} from '../db/helpers.js';
import { sendInviteEmail } from '../services/email.js';

const VALID_ROLES = ['owner', 'admin', 'collaborator', 'photographer'];

const router = Router();

// ── Authenticated routes ──────────────────────────────────────────────────────

// POST /api/invitations — create invitation (admin+)
router.post('/', requireAuth, async (req, res) => {
  if (!can(req.user, 'manage', 'member', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { email, name, role, galleryId, galleryRole } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const VALID_GALLERY_ROLES = ['contributor', 'editor'];
  if (galleryId && (!galleryRole || !VALID_GALLERY_ROLES.includes(galleryRole))) {
    return res.status(400).json({ error: 'galleryRole must be one of: contributor, editor' });
  }

  // If the user already exists in this studio, just (re-)assign the gallery role directly
  // instead of sending a new invitation (covers the "revoked then re-added" case).
  const existingUser = await getUserByEmail(email);
  if (existingUser && existingUser.studio_id === req.organizationId) {
    if (galleryId && galleryRole) {
      await upsertGalleryRoleAssignment(galleryId, existingUser.id, galleryRole, req.userId);
      try { await audit(req.organizationId, req.userId, 'gallery.member_added', 'gallery', galleryId, { userId: existingUser.id, role: galleryRole, via: 'reinvite' }); } catch {}
    }
    return res.status(200).json({ ok: true, existing: true, userId: existingUser.id });
  }

  let invitation;
  try {
    invitation = await createInvitation(req.organizationId, email, role, req.userId, { galleryId: galleryId || null, galleryRole: galleryRole || null, name: name || '' });
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE') || err.message.includes('Duplicate'))) {
      return res.status(409).json({ error: 'An invitation for this email already exists' });
    }
    throw err;
  }

  try { await audit(req.organizationId, req.userId, 'member.invite', 'invitation', invitation.id, { email, role }); } catch {}

  // Send invite email (fire-and-forget)
  try {
    const s = await getSettings(req.organizationId);
    const base = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    const org = await getOrganization(req.organizationId);
    sendInviteEmail({
      studioId: req.organizationId,
      to: email,
      studioName: org?.name || 'GalleryPack',
      inviteUrl: `${base}/admin/invite/${invitation.token}`,
    });
  } catch {}

  res.status(201).json(invitation);
});

// GET /api/invitations — list invitations for user's studio (admin+)
router.get('/', requireAuth, async (req, res) => {
  if (!can(req.user, 'manage', 'member', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const invitations = await listInvitations(req.organizationId);
  res.json(invitations);
});

// DELETE /api/invitations/:id — revoke invitation (admin+)
router.delete('/:id', requireAuth, async (req, res) => {
  if (!can(req.user, 'manage', 'member', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await deleteInvitation(req.params.id);
  try { await audit(req.organizationId, req.userId, 'member.invite_revoked', 'invitation', req.params.id, {}); } catch {}
  res.json({ ok: true });
});

// ── Public accept endpoints (no auth required) ────────────────────────────────

// GET /api/invitations/accept/:token — get invitation info for the accept page
router.get('/accept/:token', async (req, res) => {
  const inv = await getInvitationByToken(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });

  const org = await getOrganization(inv.studio_id);

  let galleryTitle = null;
  if (inv.gallery_id) {
    try {
      const { query } = await import('../db/database.js');
      const [[gRow]] = await query('SELECT title, slug FROM galleries WHERE id = ?', [inv.gallery_id]);
      galleryTitle = gRow ? (gRow.title || gRow.slug) : null;
    } catch {}
  }

  res.json({
    email:           inv.email,
    role:            inv.role,
    studioName:      org ? org.name : null,
    galleryId:       inv.gallery_id  || null,
    galleryTitle,
    expiresAt:       inv.expires_at,
    alreadyAccepted: !!inv.accepted_at,
  });
});

// POST /api/invitations/accept/:token — accept invitation, body: { password }
router.post('/accept/:token', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required' });

  let user;
  try {
    user = await acceptInvitation(req.params.token, password);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err.message });
  }

  const sessionToken = await createSession(user.id);
  res.cookie('session', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  try { await audit(user.studio_id, user.id, 'member.invite_accepted', 'user', user.id, { email: user.email }); } catch {}
  res.status(201).json({
    ok:   true,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  });
});

export default router;
