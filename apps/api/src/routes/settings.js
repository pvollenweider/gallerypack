// apps/api/src/routes/settings.js — admin global settings
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, upsertSettings } from '../db/helpers.js';

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
  } = req.body || {};
  upsertSettings(req.studioId, {
    site_title:                     siteTitle                    ?? null,
    default_author:                 defaultAuthor                ?? null,
    default_author_email:           defaultAuthorEmail           ?? null,
    default_locale:                 defaultLocale                ?? 'fr',
    default_access:                 defaultAccess                ?? 'public',
    default_allow_download_image:   defaultAllowDownloadImage    !== false ? 1 : 0,
    default_allow_download_gallery: defaultAllowDownloadGallery  === true  ? 1 : 0,
    default_private:                defaultPrivate               === true  ? 1 : 0,
  });
  res.json(rowToSettings(getSettings(req.studioId)));
});

export default router;
