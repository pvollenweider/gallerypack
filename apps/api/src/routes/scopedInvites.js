// apps/api/src/routes/scopedInvites.js — unified scoped invite system
// Scope types: studio | project | gallery
// Routes:
//   POST   /api/invites
//   GET    /api/invites?scopeType=studio&scopeId=X
//   DELETE /api/invites/:id
//   GET    /api/invites/accept/:token   — validate (no side effects)
//   POST   /api/invites/accept/:token   — consume
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';
import {
  createScopedInvite, getScopedInviteById, getScopedInviteByToken,
  listScopedInvites, revokeScopedInvite, acceptScopedInvite,
  INVITE_SCOPE_TYPES,
  getStudio, getProject, getStudioRole, getProjectRole, getGalleryRoleAssignment,
  getSettings, createSession, audit,
} from '../db/helpers.js';
import { query } from '../db/database.js';
import { sendInviteEmail } from '../services/email.js';

const STUDIO_ROLES  = ['photographer', 'collaborator', 'admin', 'owner'];
const PROJECT_ROLES = ['contributor', 'editor', 'manager'];
const GALLERY_ROLES = ['viewer', 'contributor', 'editor'];

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate that caller is allowed to manage membership for the given scope. */
async function canManageScope(req, scopeType, scopeId) {
  if (scopeType === 'studio') {
    return can(req.user, 'manageMembers', 'studio', { studioRole: req.studioRole });
  }
  if (scopeType === 'project') {
    const projectRole = await getProjectRole(req.userId, scopeId);
    return can(req.user, 'manageMembers', 'project', { studioRole: req.studioRole, projectRole });
  }
  if (scopeType === 'gallery') {
    const gra = await getGalleryRoleAssignment(req.userId, scopeId);
    const galleryRole = gra?.role ?? null;
    return can(req.user, 'manageAccess', 'gallery', { studioRole: req.studioRole, galleryRole });
  }
  return false;
}

/** Determine valid roles for a scope type. */
function validRolesForScope(scopeType) {
  if (scopeType === 'studio')  return STUDIO_ROLES;
  if (scopeType === 'project') return PROJECT_ROLES;
  if (scopeType === 'gallery') return GALLERY_ROLES;
  return [];
}

// ── POST /api/invites — create scoped invite ──────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const { scopeType, scopeId, email, role } = req.body || {};

  if (!scopeType || !INVITE_SCOPE_TYPES.includes(scopeType)) {
    return res.status(400).json({ error: `scopeType must be one of: ${INVITE_SCOPE_TYPES.join(', ')}` });
  }
  if (!scopeId) return res.status(400).json({ error: 'scopeId is required' });
  if (!email)   return res.status(400).json({ error: 'email is required' });

  const validRoles = validRolesForScope(scopeType);
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  // Verify scope exists and belongs to resolved studio
  if (scopeType === 'studio' && scopeId !== req.studioId) {
    return res.status(403).json({ error: 'Forbidden: scope belongs to a different studio' });
  }
  if (scopeType === 'project') {
    const project = await getProject(scopeId);
    if (!project || project.studio_id !== req.studioId) {
      return res.status(404).json({ error: 'Project not found' });
    }
  }
  if (scopeType === 'gallery') {
    const [gRows] = await query('SELECT studio_id FROM galleries WHERE id = ?', [scopeId]);
    if (!gRows[0] || gRows[0].studio_id !== req.studioId) {
      return res.status(404).json({ error: 'Gallery not found' });
    }
  }

  if (!await canManageScope(req, scopeType, scopeId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let invite;
  try {
    invite = await createScopedInvite(scopeType, scopeId, email, role, req.userId);
  } catch (err) {
    if (err.message?.includes('already a member')) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }

  // Send invite email (fire and forget)
  try {
    const s       = await getSettings(req.studioId);
    const studio  = await getStudio(req.studioId);
    const base    = (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    sendInviteEmail({
      studioId:   req.studioId,
      to:         email,
      studioName: studio?.name || 'GalleryPack',
      inviteUrl:  `${base}/admin/invite/${invite.token}`,
    });
  } catch {}

  try { await audit(req.studioId, req.userId, 'invite.create', 'invite', invite.id, { scopeType, scopeId, email, role }); } catch {}

  const { token, ...rest } = invite;
  res.status(201).json({ ...rest, token }); // token sent once to caller for sharing
});

// ── GET /api/invites — list pending invites for a scope ───────────────────────

router.get('/', requireAuth, async (req, res) => {
  const { scopeType, scopeId } = req.query;

  if (!scopeType || !INVITE_SCOPE_TYPES.includes(scopeType)) {
    return res.status(400).json({ error: `scopeType must be one of: ${INVITE_SCOPE_TYPES.join(', ')}` });
  }
  if (!scopeId) return res.status(400).json({ error: 'scopeId is required' });

  if (!await canManageScope(req, scopeType, scopeId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const invites = await listScopedInvites(scopeType, scopeId);
  res.json(invites.map(({ token_hash, ...rest }) => rest)); // never expose hash
});

// ── GET /api/invites/accept/:token — validate (no side effects) ───────────────
// Must be registered before /:id to avoid routing conflict.

router.get('/accept/:token', async (req, res) => {
  const inv = await getScopedInviteByToken(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invite not found' });

  if (inv.revoked_at) return res.status(410).json({ error: 'Invite has been revoked' });
  if (inv.used_at)    return res.status(410).json({ error: 'Invite has already been used' });
  if (inv.expires_at < Date.now()) return res.status(410).json({ error: 'Invite has expired' });

  // Resolve studio name for the accept page
  let scopeName = null;
  if (inv.scope_type === 'studio') {
    const s = await getStudio(inv.scope_id);
    scopeName = s?.name ?? null;
  } else if (inv.scope_type === 'project') {
    const p = await getProject(inv.scope_id);
    scopeName = p?.name ?? null;
  } else if (inv.scope_type === 'gallery') {
    const [gRows] = await query('SELECT title, slug FROM galleries WHERE id = ?', [inv.scope_id]);
    scopeName = gRows[0]?.title ?? gRows[0]?.slug ?? null;
  }

  res.json({
    email:     inv.email,
    scopeType: inv.scope_type,
    scopeId:   inv.scope_id,
    scopeName,
    role:      inv.role_to_grant,
    expiresAt: inv.expires_at,
  });
});

// ── POST /api/invites/accept/:token — consume invite ─────────────────────────

router.post('/accept/:token', async (req, res) => {
  const { password = null } = req.body || {};

  let user;
  try {
    user = await acceptScopedInvite(req.params.token, password);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err.message });
  }

  const sessionToken = await createSession(user.id);
  res.cookie('session', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   30 * 24 * 60 * 60 * 1000,
  });

  try { await audit(user.studio_id, user.id, 'invite.accepted', 'user', user.id, { email: user.email }); } catch {}
  res.status(201).json({
    ok:   true,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  });
});

// ── DELETE /api/invites/:id — revoke ──────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  const invite = await getScopedInviteById(req.params.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  if (!await canManageScope(req, invite.scope_type, invite.scope_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await revokeScopedInvite(invite.id);
  try { await audit(req.studioId, req.userId, 'invite.revoked', 'invite', invite.id, {}); } catch {}
  res.json({ ok: true });
});

export default router;
