// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/settings.js — admin global settings
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  getOrganization,
  getOrganizationBySlug,
  updateOrganization,
} from '../services/organization.js';
import { getSettings, upsertSettings, audit, genId } from '../db/helpers.js';
import { query } from '../db/database.js';
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
    defaultDownloadMode:        row?.default_download_mode         || 'display',
    defaultAllowDownloadImage:  row?.default_allow_download_image  !== 0,
    defaultAllowDownloadGallery:row?.default_allow_download_gallery === 1,
    defaultPrivate:             row?.default_private               === 1,
    defaultPwaThemeColor:       row?.default_pwa_theme_color       || '#000000',
    defaultPwaBgColor:          row?.default_pwa_bg_color          || '#000000',
    smtpHost:                   row?.smtp_host                     || null,
    smtpPort:                   row?.smtp_port                     || 587,
    smtpUser:                   row?.smtp_user                     || null,
    smtpFrom:                   row?.smtp_from                     || null,
    smtpSecure:                 row?.smtp_secure                   === 1,
    smtpPassSet:                !!(row?.smtp_pass),  // never send the password itself
    baseUrl:                    row?.base_url                      || null,
    hostname:                   row?.hostname                      || null,
  };
}

// GET /api/settings
router.get('/', async (req, res) => {
  const row = await getSettings(req.organizationId);
  const result = rowToSettings(row);
  // Attach primary domain (hostname field)
  const [domainRows] = await query(
    'SELECT domain FROM organization_domains WHERE organization_id = ? AND is_primary = 1 LIMIT 1',
    [req.organizationId]
  );
  result.hostname = domainRows[0]?.domain ?? null;
  res.json(result);
});

// PATCH /api/settings
router.patch('/', async (req, res) => {
  const {
    siteTitle, defaultAuthor, defaultAuthorEmail,
    defaultLocale, defaultAccess,
    defaultDownloadMode,
    defaultAllowDownloadImage, defaultAllowDownloadGallery, defaultPrivate,
    defaultPwaThemeColor, defaultPwaBgColor,
    smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpSecure,
    baseUrl, hostname,
  } = req.body || {};

  const updates = {
    site_title:                     siteTitle                    ?? null,
    default_author:                 defaultAuthor                ?? null,
    default_author_email:           defaultAuthorEmail           ?? null,
    default_locale:                 defaultLocale                ?? 'fr',
    default_access:                 defaultAccess                ?? 'public',
    default_download_mode:          ['none','display','original'].includes(defaultDownloadMode) ? defaultDownloadMode : 'display',
    default_allow_download_image:   defaultAllowDownloadImage    !== false ? 1 : 0,
    default_allow_download_gallery: defaultAllowDownloadGallery  === true  ? 1 : 0,
    default_private:                defaultPrivate               === true  ? 1 : 0,
    default_pwa_theme_color:        defaultPwaThemeColor         || '#000000',
    default_pwa_bg_color:           defaultPwaBgColor            || '#000000',
    smtp_host:                      smtpHost                     ?? null,
    smtp_port:                      smtpPort                     ?? 587,
    smtp_user:                      smtpUser                     ?? null,
    smtp_from:                      smtpFrom                     ?? null,
    smtp_secure:                    smtpSecure                   === true  ? 1 : 0,
    base_url:                       baseUrl                      ?? null,
  };
  // Only update password if a new one was explicitly provided
  if (smtpPass && smtpPass.trim()) updates.smtp_pass = smtpPass.trim();

  await upsertSettings(req.organizationId, updates);

  // Persist primary hostname to organization_domains if provided
  if (hostname !== undefined) {
    const h = (hostname || '').trim().toLowerCase();
    if (h) {
      // Remove existing primary domain for this studio, then insert new one

      await query('UPDATE organization_domains SET is_primary = 0 WHERE organization_id = ?', [req.organizationId]);
      await query(
        'INSERT INTO organization_domains (id, organization_id, domain, is_primary, created_at) VALUES (?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE is_primary = 1',
        [genId(), req.organizationId, h, Date.now()]
      );
    } else {
      // Clear primary hostname
      await query('UPDATE organization_domains SET is_primary = 0 WHERE organization_id = ?', [req.organizationId]);
    }
  }

  // Audit SMTP changes separately (sensitive config — don't log passwords)
  const hasSmtpChange = smtpHost !== undefined || smtpPort !== undefined || smtpUser !== undefined || smtpPass !== undefined || smtpFrom !== undefined;
  try { await audit(req.organizationId, req.userId, 'organization.settings_changed', 'organization', req.organizationId, { smtp_changed: hasSmtpChange }); } catch {}
  const finalRow = await getSettings(req.organizationId);
  const finalResult = rowToSettings(finalRow);
  const [finalDomainRows] = await query('SELECT domain FROM organization_domains WHERE organization_id = ? AND is_primary = 1 LIMIT 1', [req.organizationId]);
  finalResult.hostname = finalDomainRows[0]?.domain ?? null;
  res.json(finalResult);
});

// POST /api/settings/smtp-test — send a test email to the logged-in user
router.post('/smtp-test', async (req, res) => {
  const to = req.user.email;
  if (!to) return res.status(400).json({ error: 'No email address on your account' });

  const s = await getSettings(req.organizationId);
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

// GET /api/settings/studio — current organization info (legacy alias)
router.get('/studio', async (req, res) => {
  const org = await getOrganization(req.organizationId);
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  res.json({
    id:      org.id,
    name:    org.name,
    slug:    org.slug,
    locale:  org.locale  || null,
    country: org.country || null,
    plan:    org.plan,
  });
});

// PATCH /api/settings/studio — update organization (admin+, legacy alias)
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
      return res.status(403).json({ error: 'Only owner or superadmin can rename the organization slug' });
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug must be lowercase letters, numbers and hyphens only' });
    }
    const conflict = await getOrganizationBySlug(slug);
    if (conflict && conflict.id !== req.organizationId) {
      return res.status(409).json({ error: 'This slug is already taken' });
    }
    updates.slug = slug;
  }

  if (!Object.keys(updates).length) {
    const org = await getOrganization(req.organizationId);
    return res.json({ id: org.id, name: org.name, slug: org.slug, locale: org.locale || null, country: org.country || null, plan: org.plan });
  }

  const updated = await updateOrganization(req.organizationId, updates);
  try { await audit(req.organizationId, req.userId, 'organization.updated', 'organization', req.organizationId, { fields: Object.keys(updates) }); } catch {}
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
