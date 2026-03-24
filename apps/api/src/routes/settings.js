// apps/api/src/routes/settings.js — admin global settings
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, upsertSettings } from '../db/helpers.js';
import { sendEmail } from '../services/email.js';

const router = Router();
router.use(requireAdmin);

function rowToSettings(row) {
  return {
    siteTitle:                  row?.site_title                    || null,
    defaultAuthor:              row?.default_author                || null,
    defaultAuthorEmail:         row?.default_author_email          || null,
    defaultLocale:              row?.default_locale                || 'fr',
    defaultAccess:              row?.default_access                || 'public',
    defaultAllowDownloadImage:  row?.default_allow_download_image  !== 0,
    defaultAllowDownloadGallery:row?.default_allow_download_gallery === 1,
    defaultPrivate:             row?.default_private               === 1,
    smtpHost:                   row?.smtp_host                     || null,
    smtpPort:                   row?.smtp_port                     || 587,
    smtpUser:                   row?.smtp_user                     || null,
    smtpFrom:                   row?.smtp_from                     || null,
    smtpSecure:                 row?.smtp_secure                   === 1,
    smtpPassSet:                !!(row?.smtp_pass),  // never send the password itself
    baseUrl:                    row?.base_url                      || null,
  };
}

// GET /api/settings
router.get('/', (req, res) => {
  const row = getSettings(req.studioId);
  res.json(rowToSettings(row));
});

// PATCH /api/settings
router.patch('/', (req, res) => {
  const {
    siteTitle, defaultAuthor, defaultAuthorEmail,
    defaultLocale, defaultAccess,
    defaultAllowDownloadImage, defaultAllowDownloadGallery, defaultPrivate,
    smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure,
    baseUrl,
  } = req.body || {};

  const updates = {
    site_title:                     siteTitle                    ?? null,
    default_author:                 defaultAuthor                ?? null,
    default_author_email:           defaultAuthorEmail           ?? null,
    default_locale:                 defaultLocale                ?? 'fr',
    default_access:                 defaultAccess                ?? 'public',
    default_allow_download_image:   defaultAllowDownloadImage    !== false ? 1 : 0,
    default_allow_download_gallery: defaultAllowDownloadGallery  === true  ? 1 : 0,
    default_private:                defaultPrivate               === true  ? 1 : 0,
    smtp_host:                      smtpHost                     ?? null,
    smtp_port:                      smtpPort                     ?? 587,
    smtp_user:                      smtpUser                     ?? null,
    smtp_from:                      smtpFrom                     ?? null,
    smtp_secure:                    smtpSecure                   === true  ? 1 : 0,
    base_url:                       baseUrl                      ?? null,
  };
  // Only update password if a new one was explicitly provided
  if (smtpPass && smtpPass.trim()) updates.smtp_pass = smtpPass.trim();

  upsertSettings(req.studioId, updates);
  res.json(rowToSettings(getSettings(req.studioId)));
});

// POST /api/settings/smtp-test — send a test email to the logged-in user
router.post('/smtp-test', async (req, res) => {
  const to = req.user.email;
  if (!to) return res.status(400).json({ error: 'No email address on your account' });

  const s = getSettings(req.studioId);
  const hasDbConfig = s?.smtp_host && s?.smtp_user && s?.smtp_pass;
  const hasEnvConfig = process.env.EMAIL_PROVIDER === 'smtp' && process.env.SMTP_HOST;

  if (!hasDbConfig && !hasEnvConfig) {
    return res.status(400).json({ error: 'No SMTP configuration found. Fill in the SMTP settings and save first.' });
  }

  try {
    // Dynamically build a one-shot transporter to get the actual error
    const nodemailer = (await import('nodemailer')).default;
    const cfg = hasDbConfig
      ? { host: s.smtp_host, port: Number(s.smtp_port) || 587, secure: s.smtp_secure === 1,
          auth: { user: s.smtp_user, pass: s.smtp_pass }, from: s.smtp_from || s.smtp_user }
      : { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          from: process.env.SMTP_FROM || process.env.SMTP_USER };

    const transporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth,
    });

    await transporter.verify();
    await transporter.sendMail({
      from:    cfg.from,
      to,
      subject: 'GalleryPack — SMTP test',
      text:    'Your SMTP configuration is working correctly.',
      html:    '<p>Your SMTP configuration is working correctly. ✓</p>',
    });

    res.json({ ok: true, to });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
