// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/enroll.js — public viewer enrollment (double opt-in)
//
// Routes (no requireAuth — all public):
//   GET  /enroll/confirm/:confirmToken  — confirm email, create viewer token, redirect
//   GET  /enroll/:galleryRef            — show enrollment form
//   POST /enroll/:galleryRef            — submit enrollment request

import { Router }    from 'express';
import { randomBytes } from 'crypto';
import { query }       from '../db/database.js';
import { genId, createViewerTokenDb } from '../db/helpers.js';
import { sendEmail }   from '../services/email.js';
import { renderEnrollPage } from '../views/enroll.js';

const router = Router();

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Basic email format check — intentionally lenient. */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Lookup a video gallery by id.
 * @returns {Promise<{id: string, title: string, organization_id: string}|null>}
 */
async function getVideoGallery(galleryId) {
  const [rows] = await query(
    "SELECT id, title, organization_id FROM galleries WHERE id = ? AND type = 'video'",
    [galleryId]
  );
  return rows[0] ?? null;
}

// ── GET /enroll/confirm/:confirmToken ─────────────────────────────────────────
// MUST be declared before GET /enroll/:galleryRef to avoid Express routing conflict.

router.get('/enroll/confirm/:confirmToken', async (req, res) => {
  const { confirmToken } = req.params;

  const renderError = (msg) =>
    res.type('html').send(renderEnrollPage(null, '', msg, null));

  try {
    // 1. Look up the pending access request
    const [rows] = await query(
      "SELECT * FROM access_requests WHERE confirm_token = ? AND status = 'pending'",
      [confirmToken]
    );
    const request = rows[0];

    if (!request) {
      return renderError('Ce lien de confirmation est invalide ou a expiré.');
    }

    // 2. Check 24-hour expiry (created_at is a DATETIME stored in UTC)
    const createdAt = new Date(request.created_at).getTime();
    const EXPIRY_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - createdAt > EXPIRY_MS) {
      return renderError('Ce lien de confirmation est invalide ou a expiré.');
    }

    // 3. Mark confirmed
    const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // DATETIME format
    await query(
      "UPDATE access_requests SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
      [now, request.id]
    );

    // 4. Create viewer token (no expiry for enrollment tokens)
    const vtResult = await createViewerTokenDb('gallery', request.gallery_id, null, {
      email: request.email,
      label: request.email,
    });
    const rawToken = vtResult.token;

    // 5. Store token_id on the access_request
    await query(
      'UPDATE access_requests SET token_id = ? WHERE id = ?',
      [vtResult.id, request.id]
    );

    // 6. Redirect to watch page
    return res.redirect(302, `/watch/${rawToken}`);
  } catch (err) {
    req.log?.error({ err }, 'enroll confirm error');
    return renderError('Une erreur est survenue. Veuillez réessayer.');
  }
});

// ── GET /enroll/:galleryRef ───────────────────────────────────────────────────

router.get('/enroll/:galleryRef', async (req, res) => {
  const { galleryRef } = req.params;
  // Support ?sent=<email> query param set by the client-side JS redirect
  const sentEmail = req.query.sent || null;

  try {
    const gallery = await getVideoGallery(galleryRef);
    if (!gallery) {
      return res.status(404).type('html').send(
        renderEnrollPage(null, galleryRef, 'Cette galerie est introuvable.', null)
      );
    }

    if (sentEmail) {
      return res.type('html').send(
        renderEnrollPage(gallery.title, galleryRef, null, sentEmail)
      );
    }

    return res.type('html').send(
      renderEnrollPage(gallery.title, galleryRef, null, null)
    );
  } catch (err) {
    req.log?.error({ err }, 'enroll GET error');
    return res.status(500).type('html').send(
      renderEnrollPage(null, galleryRef, 'Une erreur est survenue.', null)
    );
  }
});

// ── POST /enroll/:galleryRef ─────────────────────────────────────────────────
// Accepts JSON (from fetch) or urlencoded (plain form fallback).

router.post('/enroll/:galleryRef', async (req, res) => {
  const { galleryRef } = req.params;
  const rawEmail = (req.body?.email || '').trim().toLowerCase();

  if (!isValidEmail(rawEmail)) {
    return res.status(400).json({ ok: false, error: 'Adresse e-mail invalide.' });
  }

  try {
    const gallery = await getVideoGallery(galleryRef);
    if (!gallery) {
      return res.status(404).json({ ok: false, error: 'Galerie introuvable.' });
    }

    // Check for an existing non-revoked request for this email + gallery
    const [existingRows] = await query(
      "SELECT * FROM access_requests WHERE gallery_id = ? AND email = ? AND status != 'revoked' ORDER BY created_at DESC LIMIT 1",
      [gallery.id, rawEmail]
    );
    const existing = existingRows[0];

    if (existing) {
      if (existing.status === 'confirmed') {
        // Re-send watch link to their email
        if (existing.token_id) {
          const [vtRows] = await query('SELECT token_hash FROM viewer_tokens WHERE id = ? AND revoked_at IS NULL LIMIT 1', [existing.token_id]);
          if (vtRows[0]) {
            // We only have the hash, not the raw token — generate a new token and update
            const rawToken  = (await import('crypto')).randomBytes(32).toString('hex');
            const { createHash } = await import('crypto');
            const tokenHash = createHash('sha256').update(rawToken).digest('hex');
            await query('UPDATE viewer_tokens SET token_hash = ? WHERE id = ?', [tokenHash, existing.token_id]);
            const watchUrl = `${BASE_URL}/watch/${rawToken}`;
            const subject  = `Votre lien d'accès — ${gallery.title}`;
            const text     = `Voici votre lien d'accès personnel :\n${watchUrl}\n\nCe lien vous est personnel. Merci de ne pas le partager.`;
            const html     = `<p>Voici votre lien d'accès personnel :</p><p><a href="${watchUrl}">${watchUrl}</a></p><p>Ce lien vous est personnel. Merci de ne pas le partager.</p>`;
            sendEmail({ organizationId: gallery.organization_id, to: rawEmail, subject, html, text, template: 'watch-link-resend' });
          }
        }
        return res.status(200).json({ ok: true, message: "Votre lien d'accès vous a été renvoyé par email." });
      }

      // status === 'pending' — re-send confirmation (idempotent)
      _sendConfirmationEmail(gallery, rawEmail, existing.confirm_token);
      return res.status(200).json({ ok: true, message: 'Confirmation email sent' });
    }

    // New request — generate confirm token and insert
    const confirmToken = randomBytes(32).toString('hex');
    const id           = genId();
    const now          = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await query(
      `INSERT INTO access_requests (id, gallery_id, email, status, confirm_token, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [id, gallery.id, rawEmail, confirmToken, now]
    );

    // Fire-and-forget confirmation email
    _sendConfirmationEmail(gallery, rawEmail, confirmToken);

    return res.status(200).json({ ok: true, message: 'Confirmation email sent' });
  } catch (err) {
    req.log?.error({ err }, 'enroll POST error');
    return res.status(500).json({ ok: false, error: 'Une erreur est survenue. Veuillez réessayer.' });
  }
});

// ── Private helpers ───────────────────────────────────────────────────────────

function _sendConfirmationEmail(gallery, email, confirmToken) {
  const confirmUrl = `${BASE_URL}/enroll/confirm/${confirmToken}`;
  const subject    = `Confirmez votre accès — ${gallery.title}`;
  const text       = `Cliquez ce lien pour confirmer et recevoir votre lien d'accès personnel :\n${confirmUrl}\n\nCe lien expire dans 24h.`;
  const html       = `<p>Cliquez ce lien pour confirmer et recevoir votre lien d'accès personnel :</p><p><a href="${confirmUrl}">${confirmUrl}</a></p><p>Ce lien expire dans 24h.</p>`;
  sendEmail({
    organizationId: gallery.organization_id,
    to:       email,
    subject,
    html,
    text,
    template: 'enroll-confirm',
  });
}

export default router;
