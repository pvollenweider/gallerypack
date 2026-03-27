// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/personalTokens.js — CRUD for personal upload tokens
// All routes require a logged-in session (cookie auth).

import { Router } from 'express';
import { getSession } from '../db/helpers.js';
import { createToken, listTokens, revokeToken } from '../services/personalTokenService.js';

const router = Router();

/** Require a valid session; attach req.user */
async function requireAuth(req, res, next) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session;
  next();
}

// GET /api/tokens — list my tokens
router.get('/', requireAuth, async (req, res) => {
  try {
    const tokens = await listTokens(req.user.id);
    res.json({ tokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tokens — create a token (raw value returned once)
router.post('/', requireAuth, async (req, res) => {
  const { name, scopeType, scopeId, expiresAt } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 1) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!['gallery', 'project'].includes(scopeType)) {
    return res.status(400).json({ error: 'scopeType must be "gallery" or "project"' });
  }
  if (!scopeId || typeof scopeId !== 'string') {
    return res.status(400).json({ error: 'scopeId is required' });
  }

  try {
    const result = await createToken(req.user.id, name.trim(), scopeType, scopeId, expiresAt ?? null);
    // raw token is returned only here — caller must show it once
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tokens/:id — revoke a token
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const ok = await revokeToken(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Token not found or already revoked' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
