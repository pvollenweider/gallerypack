// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/auth.js — login / logout
import { Router } from 'express';
import { createHash } from 'crypto';
import {
  getUserByEmail, createSession, deleteSession,
  getSession, getUserById, hashPassword, verifyPassword,
  createPasswordResetToken, getPasswordResetToken, usePasswordResetToken,
  createMagicLink, useMagicLink,
} from '../db/helpers.js';
import { getOrgRole } from '../services/organization.js';
import { query } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail, sendMagicLinkEmail } from '../services/email.js';

const router = Router();

function sha256(raw) { return createHash('sha256').update(raw).digest('hex'); }

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const stored = user.password_hash;
  let authenticated = false;

  if (stored && (stored.startsWith('$scrypt$') || stored.startsWith('scrypt:'))) {
    authenticated = verifyPassword(password, stored);
  } else if (stored) {
    // Legacy SHA-256 — verify then re-hash with scrypt on success
    const legacyHash = sha256(password);
    if (stored === legacyHash) {
      authenticated = true;
      await query(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        [hashPassword(password), Date.now(), user.id]
      );
    }
  }

  if (!authenticated) return res.status(401).json({ error: 'Invalid credentials' });

  const token = await createSession(user.id);
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  const studioRole = user.studio_id ? await getOrgRole(user.id, user.studio_id) : null;
  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, name: user.name, organizationId: user.organization_id || user.studio_id, studioId: user.studio_id, studioRole, locale: user.locale || null, platformRole: user.platform_role || null } });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.cookies?.session;
  if (token) await deleteSession(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });
  const user = await getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  // organizationId: use the request-resolved org (may differ from user.studio_id when override cookie is set)
  const resolvedOrgId = req.organizationId || user.organization_id || user.studio_id;
  const studioRole = resolvedOrgId ? await getOrgRole(user.id, resolvedOrgId) : null;
  const orgName = req.organization?.name ?? null;
  res.json({ id: user.id, email: user.email, role: user.role, name: user.name, organizationId: resolvedOrgId, studioId: resolvedOrgId, organizationName: orgName, studioName: orgName, studioRole, locale: user.locale || null, platformRole: user.platform_role || null, notifyOnUpload: user.notify_on_upload !== 0, notifyOnPublish: user.notify_on_publish !== 0 });
});

// PATCH /api/auth/me — update own profile (name, password, locale, notification prefs)
router.patch('/me', requireAuth, async (req, res) => {
  const { name, currentPassword, newPassword, locale, notifyOnUpload, notifyOnPublish } = req.body || {};
  const user = await getUserById(req.userId);

  if (newPassword !== undefined) {
    if (!currentPassword) return res.status(400).json({ error: 'currentPassword is required' });
    if (!verifyPassword(currentPassword, user.password_hash))
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
    await query(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [hashPassword(newPassword), Date.now(), req.userId]
    );
  }

  if (name !== undefined) {
    await query('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name || null, Date.now(), req.userId]);
  }

  if (locale !== undefined) {
    await query('UPDATE users SET locale = ?, updated_at = ? WHERE id = ?', [locale || null, Date.now(), req.userId]);
  }

  if (notifyOnUpload !== undefined) {
    await query('UPDATE users SET notify_on_upload = ?, updated_at = ? WHERE id = ?', [notifyOnUpload ? 1 : 0, Date.now(), req.userId]);
  }

  if (notifyOnPublish !== undefined) {
    await query('UPDATE users SET notify_on_publish = ?, updated_at = ? WHERE id = ?', [notifyOnPublish ? 1 : 0, Date.now(), req.userId]);
  }

  const updated    = await getUserById(req.userId);
  const studioRole = updated.studio_id ? await getOrgRole(updated.id, updated.studio_id) : null;
  res.json({ id: updated.id, email: updated.email, role: updated.role, name: updated.name, organizationId: updated.organization_id || updated.studio_id, studioId: updated.studio_id, studioRole, locale: updated.locale || null, platformRole: updated.platform_role || null, notifyOnUpload: updated.notify_on_upload !== 0, notifyOnPublish: updated.notify_on_publish !== 0 });
});

// GET /api/auth/me/galleries — list galleries the current user has explicit access to
router.get('/me/galleries', requireAuth, async (req, res) => {
  const [rows] = await query(`
    SELECT g.id, g.title, g.slug, gra.role
    FROM gallery_role_assignments gra
    JOIN galleries g ON g.id = gra.gallery_id
    WHERE gra.user_id = ?
    ORDER BY g.title
  `, [req.userId]);
  res.json(rows);
});

// POST /api/auth/forgot — request password reset (public)
router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = await getUserByEmail(email);
  if (!user) return res.json({ ok: true }); // don't reveal whether email exists

  const resetRow = await createPasswordResetToken(user.id);
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
router.get('/reset/:token', async (req, res) => {
  const row = await getPasswordResetToken(req.params.token);
  if (!row || row.used_at || row.expires_at < Date.now())
    return res.status(404).json({ error: 'Lien invalide ou expiré' });
  const user = await getUserById(row.user_id);
  res.json({ email: user?.email });
});

// POST /api/auth/reset/:token — set new password (public)
router.post('/reset/:token', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  let user;
  try {
    user = await usePasswordResetToken(req.params.token, password);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const sessionToken = await createSession(user.id);
  res.cookie('session', sessionToken, {
    httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// POST /api/auth/magic — request a magic login link (public)
router.post('/magic', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = await getUserByEmail(email);
  if (!user) return res.json({ ok: true, emailSent: false }); // don't reveal whether email exists

  const row  = await createMagicLink(user.id);
  const base = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  const magicUrl = `${base}/magic-login/${row.token}`;

  let emailSent = false;
  try {
    sendMagicLinkEmail({ studioId: user.studio_id, to: email, magicUrl });
    emailSent = true;
  } catch {}

  res.json({ ok: true, emailSent });
});

// GET /api/auth/magic/:token — validate token without consuming it
// Safe for mail scanner prefetch: no session created, no state changed.
router.get('/magic/:token', async (req, res) => {
  const [rows] = await query(
    'SELECT * FROM magic_links WHERE token_hash = ?',
    [sha256(req.params.token)]
  );
  const row = rows[0];
  if (!row)          return res.status(404).json({ error: 'Invalid link' });
  if (row.used_at)   return res.status(409).json({ error: 'Link already used' });
  if (row.expires_at < Date.now()) return res.status(410).json({ error: 'Link expired' });
  const user = await getUserById(row.user_id);
  res.json({ ok: true, email: user?.email || null });
});

// POST /api/auth/magic/:token — consume token and open a session
router.post('/magic/:token', async (req, res) => {
  let user;
  try {
    user = await useMagicLink(req.params.token);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const sessionToken = await createSession(user.id);
  res.cookie('session', sessionToken, {
    httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// POST /api/auth/admin/reset-link — admin generates a reset link for any member (admin+)
router.post('/admin/reset-link', requireAuth, async (req, res) => {
  if (!['owner', 'admin'].includes(req.orgRole || req.studioRole))
    return res.status(403).json({ error: 'Forbidden' });
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const user = await getUserById(userId);
  if (!user || (user.studio_id !== req.organizationId && user.organization_id !== req.organizationId))
    return res.status(404).json({ error: 'User not found' });
  const resetRow = await createPasswordResetToken(userId);
  const base     = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
  res.json({ resetUrl: `${base}/admin/reset-password/${resetRow.token}` });
});

export default router;
