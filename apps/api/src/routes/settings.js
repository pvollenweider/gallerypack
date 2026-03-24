// apps/api/src/routes/settings.js — admin global settings
import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, upsertSettings } from '../db/helpers.js';

const router = Router();
router.use(requireAdmin);

function rowToSettings(row) {
  return {
    siteTitle: row?.site_title || null,
    smtpHost:  row?.smtp_host  || null,
    smtpPort:  row?.smtp_port  || 587,
    smtpUser:  row?.smtp_user  || null,
    smtpFrom:  row?.smtp_from  || null,
    baseUrl:   row?.base_url   || null,
  };
}

// GET /api/settings
router.get('/', (req, res) => {
  const row = getSettings(req.studioId);
  res.json(rowToSettings(row));
});

// PATCH /api/settings
router.patch('/', (req, res) => {
  const { siteTitle } = req.body || {};
  upsertSettings(req.studioId, { site_title: siteTitle ?? null });
  res.json(rowToSettings(getSettings(req.studioId)));
});

export default router;
