// apps/api/src/routes/settings.js — admin global settings
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, upsertSettings, getStudio, updateStudio, getStudioBySlug, audit } from '../db/helpers.js';
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
router.get('/', async (req, res) => {
  const row = await getSettings(req.studioId);
  res.json(rowToSettings(row));
});

// PATCH /api/settings
router.patch('/', async (req, res) => {
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

  await upsertSettings(req.studioId, updates);
  // Audit SMTP changes separately (sensitive config — don't log passwords)
  const hasSmtpChange = smtpHost !== undefined || smtpPort !== undefined || smtpUser !== undefined || smtpPass !== undefined || smtpFrom !== undefined;
  try { await audit(req.studioId, req.userId, 'studio.settings_changed', 'studio', req.studioId, { smtp_changed: hasSmtpChange }); } catch {}
  res.json(rowToSettings(await getSettings(req.studioId)));
});

// POST /api/settings/smtp-test — send a test email to the logged-in user
router.post('/smtp-test', async (req, res) => {
  const to = req.user.email;
  if (!to) return res.status(400).json({ error: 'No email address on your account' });

  const s = await getSettings(req.studioId);
  const hasDbConfig = s?.smtp_host && s?.smtp_user && s?.smtp_pass;
  const hasEnvConfig = process.env.EMAIL_PROVIDER === 'smtp' && process.env.SMTP_HOST;

  if (!hasDbConfig && !hasEnvConfig) {
    return res.status(400).json({ error: 'No SMTP configuration found. Fill in the SMTP settings and save first.' });
  }

  try {
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

// GET /api/settings/studio — current studio info
router.get('/studio', async (req, res) => {
  const studio = await getStudio(req.studioId);
  if (!studio) return res.status(404).json({ error: 'Studio not found' });
  res.json({
    id:      studio.id,
    name:    studio.name,
    slug:    studio.slug,
    locale:  studio.locale  || null,
    country: studio.country || null,
    plan:    studio.plan,
  });
});

// PATCH /api/settings/studio — update studio (admin+)
// name/locale/country: any admin; slug rename: owner or superadmin only
router.patch('/studio', async (req, res) => {
  const { name, locale, country, slug } = req.body || {};
  const updates = {};

  if (name    !== undefined) updates.name    = name;
  if (locale  !== undefined) updates.locale  = locale  || null;
  if (country !== undefined) updates.country = country || null;

  // Slug rename is a dangerous operation — owner or superadmin only
  if (slug !== undefined) {
    const isOwner      = req.studioRole === 'owner';
    const isSuperadmin = req.platformRole === 'superadmin';
    if (!isOwner && !isSuperadmin) {
      return res.status(403).json({ error: 'Only owner or superadmin can rename the studio slug' });
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug must be lowercase letters, numbers and hyphens only' });
    }
    const conflict = await getStudioBySlug(slug);
    if (conflict && conflict.id !== req.studioId) {
      return res.status(409).json({ error: 'This slug is already taken' });
    }
    updates.slug = slug;
  }

  if (!Object.keys(updates).length) {
    const studio = await getStudio(req.studioId);
    return res.json({ id: studio.id, name: studio.name, slug: studio.slug, locale: studio.locale || null, country: studio.country || null, plan: studio.plan });
  }

  const updated = await updateStudio(req.studioId, updates);
  try { await audit(req.studioId, req.userId, 'studio.updated', 'studio', req.studioId, { fields: Object.keys(updates) }); } catch {}
  res.json({
    id:      updated.id,
    name:    updated.name,
    slug:    updated.slug,
    locale:  updated.locale  || null,
    country: updated.country || null,
    plan:    updated.plan,
  });
});

export default router;
