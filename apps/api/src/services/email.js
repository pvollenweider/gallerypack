// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/email.js — email provider abstraction + transactional templates
import { query }  from '../db/database.js';
import { genId, getSettings } from '../db/helpers.js';

// ── Provider factory ──────────────────────────────────────────────────────────

function createSmtpProvider(config) {
  let transporter = null;
  async function getTransporter() {
    if (!transporter) {
      const nodemailer = (await import('nodemailer')).default;
      transporter = nodemailer.createTransport({
        host:   config.host,
        port:   Number(config.port) || 587,
        secure: config.secure === 'true' || config.secure === true,
        auth:   { user: config.user, pass: config.pass },
      });
    }
    return transporter;
  }

  return {
    async send(to, subject, html, text) {
      const t = await getTransporter();
      await t.sendMail({ from: config.from || config.user, to, subject, html, text });
      return true;
    },
  };
}

function createNullProvider() {
  return {
    async send(to, subject, html, text) {
      console.log(`[email:null] to=${to} subject="${subject}"\n${text}`);
      return true;
    },
  };
}

/**
 * Resolve the SMTP provider for a given studio.
 * DB settings take priority over environment variables.
 */
async function getProvider(studioId) {
  if (studioId) {
    const s = await getSettings(studioId);
    if (s?.smtp_host && s?.smtp_user && s?.smtp_pass) {
      return createSmtpProvider({
        host:   s.smtp_host,
        port:   s.smtp_port || 587,
        secure: s.smtp_secure === 1,
        user:   s.smtp_user,
        pass:   s.smtp_pass,
        from:   s.smtp_from || s.smtp_user,
      });
    }
  }
  const driver = process.env.EMAIL_PROVIDER || 'null';
  if (driver === 'smtp') {
    return createSmtpProvider({
      host:   process.env.SMTP_HOST,
      port:   process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      user:   process.env.SMTP_USER,
      pass:   process.env.SMTP_PASS,
      from:   process.env.SMTP_FROM,
    });
  }
  return createNullProvider();
}

// ── Log helpers ───────────────────────────────────────────────────────────────

async function logEmail({ studioId, to, subject, template, status, error }) {
  try {
    await query(
      `INSERT INTO email_log (id, studio_id, to_address, subject, template, status, error, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [genId(), studioId || null, to, subject, template || null, status, error || null, Date.now()]
    );
  } catch (e) {
    console.error('[email] failed to write log:', e.message);
  }
}

// ── Core send (fire-and-forget) ───────────────────────────────────────────────

/**
 * Send an email non-blocking. Logs result to email_log.
 * @param {{ studioId?, to, subject, html, text, template? }} opts
 */
export function sendEmail({ studioId, to, subject, html, text, template }) {
  getProvider(studioId).then(provider =>
    provider.send(to, subject, html, text)
  ).then(() => {
    logEmail({ studioId, to, subject, template, status: 'sent' });
  }).catch(err => {
    console.error('[email] send failed:', err.message);
    logEmail({ studioId, to, subject, template, status: 'failed', error: err.message });
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function sendInviteEmail({ studioId, to, studioName, galleryTitle, inviteUrl }) {
  const title   = galleryTitle ? `the gallery "${galleryTitle}"` : 'a photo gallery';
  const subject = `You've been invited to upload photos`;
  const text    = `Hi,\n\nYou've been invited to upload photos to ${title} for ${studioName}.\n\nUse this link to upload:\n${inviteUrl}\n\nThis link may expire — use it as soon as possible.\n`;
  const html    = `<p>Hi,</p><p>You've been invited to upload photos to <strong>${title}</strong> for ${studioName}.</p><p><a href="${inviteUrl}">Click here to upload photos</a></p><p>This link may expire — use it as soon as possible.</p>`;
  sendEmail({ studioId, to, subject, html, text, template: 'invite' });
}

export function sendMagicLinkEmail({ studioId, to, magicUrl }) {
  const subject = 'Votre lien de connexion (valable 5 min)';
  const text    = `Bonjour,\n\nCliquez sur ce lien pour vous connecter :\n${magicUrl}\n\nCe lien est valable 5 minutes et ne peut être utilisé qu'une seule fois.\nSi vous n'avez pas demandé ce lien, ignorez cet email.`;
  const html    = `<p>Bonjour,</p><p>Cliquez sur ce lien pour vous connecter :</p><p><a href="${magicUrl}">${magicUrl}</a></p><p>Ce lien est <strong>valable 5 minutes</strong> et ne peut être utilisé qu'une seule fois.</p><p>Si vous n'avez pas demandé ce lien, ignorez cet email.</p>`;
  sendEmail({ studioId, to, subject, html, text, template: 'magic-link' });
}

export function sendPhotosReadyEmail({ studioId, to, photographerName, galleryTitle, galleryAdminUrl }) {
  const subject = `Photos prêtes — ${galleryTitle}`;
  const text    = `Bonjour,\n\n${photographerName} a indiqué que les photos de la galerie "${galleryTitle}" sont prêtes à publier.\n\nGérer la galerie :\n${galleryAdminUrl}\n`;
  const html    = `<p>Bonjour,</p><p><strong>${photographerName}</strong> a indiqué que les photos de la galerie <strong>${galleryTitle}</strong> sont prêtes à publier.</p><p><a href="${galleryAdminUrl}">Gérer la galerie</a></p>`;
  sendEmail({ studioId, to, subject, html, text, template: 'photos-ready' });
}

export function sendGalleryReadyEmail({ studioId, to, galleryTitle, galleryUrl }) {
  const subject = `Your gallery "${galleryTitle}" is published`;
  const text    = `Hi,\n\nYour gallery "${galleryTitle}" has been built and is now published.\n\nView it here:\n${galleryUrl}\n`;
  const html    = `<p>Hi,</p><p>Your gallery <strong>${galleryTitle}</strong> has been built and is now published.</p><p><a href="${galleryUrl}">View gallery</a></p>`;
  sendEmail({ studioId, to, subject, html, text, template: 'gallery-ready' });
}

export function sendAccessResendEmail({ studioId, to, galleryTitle, managementUrl }) {
  const subject = `Your management link for "${galleryTitle}"`;
  const text    = `Hi,\n\nHere is your management link for the gallery "${galleryTitle}":\n${managementUrl}\n`;
  const html    = `<p>Hi,</p><p>Here is your management link for the gallery <strong>${galleryTitle}</strong>:</p><p><a href="${managementUrl}">${managementUrl}</a></p>`;
  sendEmail({ studioId, to, subject, html, text, template: 'access-resend' });
}
