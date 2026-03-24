// apps/api/src/routes/invitations.js — studio user invitation system
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import {
  createInvitation,
  getInvitationByToken,
  acceptInvitation,
  listInvitations,
  deleteInvitation,
  getStudio,
  getSettings,
  createSession,
  audit,
} from '../db/helpers.js';
import { sendInviteEmail } from '../services/email.js';

const VALID_ROLES = ['owner', 'admin', 'editor', 'photographer'];

const router = Router();

// ── Authenticated routes ──────────────────────────────────────────────────────

// POST /api/invitations — create invitation (admin+)
router.post('/', requireAuth, (req, res) => {
  if (!can(req.user, 'manage', 'member', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { email, role, galleryId, galleryRole } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const VALID_GALLERY_ROLES = ['contributor', 'editor'];
  if (galleryId && (!galleryRole || !VALID_GALLERY_ROLES.includes(galleryRole))) {
    return res.status(400).json({ error: 'galleryRole must be one of: contributor, editor' });
  }

  let invitation;
  try {
    invitation = createInvitation(req.studioId, email, role, req.userId, { galleryId: galleryId || null, galleryRole: galleryRole || null });
  } catch (err) {
    // SQLite UNIQUE constraint on (studio_id, email)
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An invitation for this email already exists' });
    }
    throw err;
  }

  try { audit(req.studioId, req.userId, 'member.invite', 'invitation', invitation.id, { email, role }); } catch {}

  // Send invite email (fire-and-forget)
  try {
    const s = getSettings(req.studioId);
    const base = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    const studio = getStudio(req.studioId);
    sendInviteEmail({
      studioId: req.studioId,
      to: email,
      studioName: studio?.name || 'GalleryPack',
      inviteUrl: `${base}/admin/invite/${invitation.token}`,
    });
  } catch {}

  res.status(201).json(invitation);
});

// GET /api/invitations — list invitations for user's studio (admin+)
router.get('/', requireAuth, (req, res) => {
  if (!can(req.user, 'manage', 'member', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const invitations = listInvitations(req.studioId);
  res.json(invitations);
});

// DELETE /api/invitations/:id — revoke invitation (admin+)
router.delete('/:id', requireAuth, (req, res) => {
  if (!can(req.user, 'manage', 'member', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  deleteInvitation(req.params.id);
  res.json({ ok: true });
});

// ── Public accept endpoints (no auth required) ────────────────────────────────

// GET /api/invitations/accept/:token — get invitation info for the accept page
router.get('/accept/:token', (req, res) => {
  const inv = getInvitationByToken(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });

  const studio = getStudio(inv.studio_id);

  res.json({
    email:           inv.email,
    role:            inv.role,
    studioName:      studio ? studio.name : null,
    expiresAt:       inv.expires_at,
    alreadyAccepted: !!inv.accepted_at,
  });
});

// POST /api/invitations/accept/:token — accept invitation, body: { password }
router.post('/accept/:token', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required' });

  let user;
  try {
    user = acceptInvitation(req.params.token, password);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err.message });
  }

  const sessionToken = createSession(user.id);
  res.cookie('session', sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    ok:   true,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  });
});

export default router;
