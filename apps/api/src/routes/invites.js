// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/invites.js — photographer invite links
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createInvite, getInviteById, getInviteByToken, listInvites, useInvite, revokeInvite,
} from '../db/helpers.js';
import { getOrganization } from '../services/organization.js';
import { query } from '../db/database.js';
import { sendInviteEmail } from '../services/email.js';

const router = Router();

// ── POST /api/invites — create an invite (admin only) ─────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { galleryId, email, label, expiresIn, singleUse } = req.body;

  const invite = await createInvite({
    studioId:  req.organizationId,
    galleryId: galleryId || null,
    email:     email     || null,
    label:     label     || null,
    expiresIn: expiresIn != null ? Number(expiresIn) : undefined,
    singleUse: !!singleUse,
  });

  // Send invite email if an address was provided
  if (invite.email) {
    const org = await getOrganization(req.organizationId);
    const [galleryRows] = invite.gallery_id
      ? await query('SELECT title, slug FROM galleries WHERE id = ?', [invite.gallery_id])
      : [[]];
    const gallery = galleryRows?.[0] || null;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
    sendInviteEmail({
      studioId:     req.organizationId,
      to:           invite.email,
      studioName:   org?.name || 'GalleryPack',
      galleryTitle: gallery?.title || null,
      inviteUrl:    `${baseUrl}/invite/${invite.token}`,
    });
  }

  res.status(201).json(sanitize(invite));
});

// ── GET /api/invites — list invites for studio ────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const invites = await listInvites(req.organizationId);
  res.json(invites.map(sanitize));
});

// ── GET /api/invites/:token — validate token (public, used by upload page) ────
router.get('/:token', async (req, res) => {
  const invite = await getInviteByToken(req.params.token);

  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  const now = Date.now();

  if (invite.revoked_at) {
    return res.status(410).json({ error: 'Invite has been revoked' });
  }
  if (invite.expires_at && invite.expires_at < now) {
    return res.status(410).json({ error: 'Invite has expired' });
  }
  if (invite.single_use && invite.used_at) {
    return res.status(410).json({ error: 'Invite has already been used' });
  }

  // Mark as used (for single-use invites this is definitive)
  if (invite.single_use) {
    await useInvite(invite.id);
  }

  res.json({
    id:        invite.id,
    galleryId: invite.gallery_id,
    email:     invite.email,
    label:     invite.label,
  });
});

// ── POST /api/invites/:id/revoke — revoke an invite ───────────────────────────
router.post('/:id/revoke', requireAuth, async (req, res) => {
  const invite = await getInviteById(req.params.id);

  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.studio_id !== req.organizationId) return res.status(403).json({ error: 'Forbidden' });

  await revokeInvite(invite.id);
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(invite) {
  const { token, ...rest } = invite;
  return { ...rest, token };
}

export default router;
