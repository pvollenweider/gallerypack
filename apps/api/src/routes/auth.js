// apps/api/src/routes/auth.js — login / logout
import { Router }  from 'express';
import { createHash } from 'crypto';
import {
  getUserByEmail, createSession, deleteSession,
  getSession, getUserById,
} from '../db/helpers.js';

const router = Router();

// Hash password with SHA-256 (upgrade to bcrypt in Phase 6 if needed)
function hashPassword(pwd) {
  return createHash('sha256').update(pwd).digest('hex');
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = getUserByEmail(email);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

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
  res.json({ id: user.id, email: user.email, role: user.role, name: user.name, studioId: user.studio_id });
});

export default router;
