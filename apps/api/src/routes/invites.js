// apps/api/src/routes/invites.js — photographer invite links
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createInvite, getInviteById, getInviteByToken, listInvites, useInvite, revokeInvite,
  getStudio,
} from '../db/helpers.js';
import { getDb } from '../db/database.js';
import { sendInviteEmail } from '../services/email.js';

const router = Router();

// ── POST /api/invites — create an invite (admin only) ─────────────────────────
router.post('/', requireAuth, (req, res) => {
  const { galleryId, email, label, expiresIn, singleUse } = req.body;

  const invite = createInvite({
    studioId:  req.studioId,
    galleryId: galleryId || null,
    email:     email     || null,
    label:     label     || null,
    expiresIn: expiresIn != null ? Number(expiresIn) : undefined,
    singleUse: !!singleUse,
  });

  // Send invite email if an address was provided
  if (invite.email) {
    const studio = getStudio(req.studioId);
    const gallery = invite.gallery_id
      ? getDb().prepare('SELECT title, slug FROM galleries WHERE id = ?').get(invite.gallery_id)
      : null;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
    sendInviteEmail({
      studioId:     req.studioId,
      to:           invite.email,
      studioName:   studio?.name || 'GalleryPack',
      galleryTitle: gallery?.title || null,
      inviteUrl:    `${baseUrl}/invite/${invite.token}`,
    });
  }

  // Never return raw token hash to client; return the opaque URL token
  res.status(201).json(sanitize(invite));
});

// ── GET /api/invites — list invites for studio ────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const invites = listInvites(req.studioId);
  res.json(invites.map(sanitize));
});

// ── GET /api/invites/:token — validate token (public, used by upload page) ────
router.get('/:token', (req, res) => {
  const invite = getInviteByToken(req.params.token);

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
    useInvite(invite.id);
  }

  // Return safe public info (no internal IDs that leak studio structure)
  res.json({
    id:        invite.id,
    galleryId: invite.gallery_id,
    email:     invite.email,
    label:     invite.label,
  });
});

// ── POST /api/invites/:id/revoke — revoke an invite ───────────────────────────
router.post('/:id/revoke', requireAuth, (req, res) => {
  const invite = getInviteById(req.params.id);

  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.studio_id !== req.studioId) return res.status(403).json({ error: 'Forbidden' });

  revokeInvite(invite.id);
  res.json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip internal fields before sending to client. */
function sanitize(invite) {
  const { token, ...rest } = invite;
  return { ...rest, token }; // keep token for the creator to copy the link
}

export default router;
