// apps/api/src/routes/auth.js — login / logout
import { Router } from 'express';
import { createHash } from 'crypto';
import {
  getUserByEmail, createSession, deleteSession,
  getSession, getUserById, hashPassword, verifyPassword, getStudioRole,
  createPasswordResetToken, getPasswordResetToken, usePasswordResetToken,
  createMagicLink, useMagicLink,
} from '../db/helpers.js';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail, sendMagicLinkEmail } from '../services/email.js';

const router = Router();

// Legacy SHA-256 hash (for backward-compat migration only)
function legacySha256(pwd) {
  return createHash('sha256').update(pwd).digest('hex');
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const stored = user.password_hash;
  let authenticated = false;

  if (stored && stored.startsWith('$scrypt$')) {
    // New scrypt format
    authenticated = verifyPassword(password, stored);
  } else if (stored && stored.startsWith('scrypt:')) {
    // Old scrypt format (scrypt:<salt>:<hash>)
    authenticated = verifyPassword(password, stored);
  } else {
    // Legacy SHA-256 — verify then re-hash with scrypt on success
    const legacyHash = legacySha256(password);
    if (stored === legacyHash) {
      authenticated = true;
      // Re-hash with scrypt and persist
      const newHash = hashPassword(password);
      getDb()
        .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(newHash, Date.now(), user.id);
    }
  }

  if (!authenticated) return res.status(401).json({ error: 'Invalid credentials' });

  const token = createSession(user.id);
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) deleteSession(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });
  const user = getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const studioRole = user.studio_id ? getStudioRole(user.id, user.studio_id) : null;
  res.json({ id: user.id, email: user.email, role: user.role, name: user.name, studioId: user.studio_id, studioRole, locale: user.locale || null });
});

// PATCH /api/auth/me — update own profile (name, password)
router.patch('/me', requireAuth, (req, res) => {
  const { name, currentPassword, newPassword, locale } = req.body || {};
  const user = getUserById(req.userId);

  if (newPassword !== undefined) {
    if (!currentPassword) return res.status(400).json({ error: 'currentPassword is required' });
    if (!verifyPassword(currentPassword, user.password_hash))
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
    getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(hashPassword(newPassword), Date.now(), req.userId);
  }

  if (name !== undefined) {
    getDb().prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
      .run(name || null, Date.now(), req.userId);
  }

  if (locale !== undefined) {
    getDb().prepare('UPDATE users SET locale = ?, updated_at = ? WHERE id = ?')
      .run(locale || null, Date.now(), req.userId);
  }

  const updated = getUserById(req.userId);
  const studioRole = updated.studio_id ? getStudioRole(updated.id, updated.studio_id) : null;
  res.json({ id: updated.id, email: updated.email, role: updated.role, name: updated.name, studioId: updated.studio_id, studioRole, locale: updated.locale || null });
});

// GET /api/auth/me/galleries — list galleries the current user has explicit access to
router.get('/me/galleries', requireAuth, (req, res) => {
  const rows = getDb().prepare(`
    SELECT g.id, g.title, g.slug, gm.role
    FROM gallery_memberships gm
    JOIN galleries g ON g.id = gm.gallery_id
    WHERE gm.user_id = ?
    ORDER BY g.title
  `).all(req.userId);
  res.json(rows);
});

// POST /api/auth/forgot — request password reset (public)
router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = getUserByEmail(email);
  if (!user) return res.json({ ok: true }); // don't reveal whether email exists

  const resetRow = createPasswordResetToken(user.id);
  const base     = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const resetUrl = `${base}/admin/reset-password/${resetRow.token}`;

  let emailSent = false;
  try {
    await sendEmail({
      studioId: user.studio_id,
      to:      email,
      subject: 'Réinitialisation de votre mot de passe',
      html:    `<p>Bonjour,</p><p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe. Il est valable 2 heures.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>`,
    });
    emailSent = true;
  } catch {}

  res.json({ ok: true, emailSent });
});

// GET /api/auth/reset/:token — check token validity (public)
router.get('/reset/:token', (req, res) => {
  const row = getPasswordResetToken(req.params.token);
  if (!row || row.used_at || row.expires_at < Date.now())
    return res.status(404).json({ error: 'Lien invalide ou expiré' });
  const user = getUserById(row.user_id);
  res.json({ email: user?.email });
});

// POST /api/auth/reset/:token — set new password (public)
router.post('/reset/:token', (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  let user;
  try {
    user = usePasswordResetToken(req.params.token, password);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const sessionToken = createSession(user.id);
  res.cookie('session', sessionToken, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// POST /api/auth/magic — request a magic login link (public)
router.post('/magic', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = getUserByEmail(email);
  if (!user) return res.json({ ok: true, emailSent: false }); // don't reveal whether email exists

  const row  = createMagicLink(user.id);
  const base = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const magicUrl = `${base}/magic-login/${row.token}`;

  let emailSent = false;
  try {
    sendMagicLinkEmail({ studioId: user.studio_id, to: email, magicUrl });
    emailSent = true;
  } catch {}

  res.json({ ok: true, emailSent });
});

// GET /api/auth/magic/:token — consume magic link, open session
router.get('/magic/:token', (req, res) => {
  let user;
  try {
    user = useMagicLink(req.params.token);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const token = createSession(user.id);
  res.cookie('session', token, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// POST /api/auth/admin/reset-link — admin generates a reset link for any member (admin+)
router.post('/admin/reset-link', requireAuth, (req, res) => {
  if (!['owner', 'admin'].includes(req.studioRole))
    return res.status(403).json({ error: 'Forbidden' });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const user = getUserById(userId);
  if (!user || user.studio_id !== req.studioId)
    return res.status(404).json({ error: 'User not found' });
  const resetRow = createPasswordResetToken(userId);
  const base     = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  res.json({ resetUrl: `${base}/admin/reset-password/${resetRow.token}` });
});

export default router;
