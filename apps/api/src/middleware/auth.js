// apps/api/src/middleware/auth.js — session authentication middleware
import { getSession, getUserById } from '../db/helpers.js';

/**
 * Require a valid session cookie.
 * Attaches req.user and req.studioId on success.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });

  const user = getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  req.user    = user;
  req.studioId = user.studio_id;
  next();
}

/**
 * Require admin role.
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}
