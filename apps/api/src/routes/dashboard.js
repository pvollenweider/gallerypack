// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/dashboard.js — GET /api/dashboard (Sprint 14)
import { Router } from 'express';
import { query }  from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/dashboard — actionable organization state
router.get('/', async (req, res) => {
  const orgId = req.organizationId;

  try {
    const [
      galleryStats,
      inboxRows,
      recentBuilds,
      failedBuilds,
    ] = await Promise.all([
      // Gallery counts by workflow_status
      query(`
        SELECT
          COUNT(*)                                                     AS total,
          SUM(workflow_status = 'draft')                               AS draft,
          SUM(workflow_status = 'ready')                               AS ready,
          SUM(workflow_status = 'published')                           AS published,
          SUM(needs_rebuild = 1 AND workflow_status = 'published')     AS needs_rebuild
        FROM galleries WHERE studio_id = ?
      `, [orgId]),

      // Inbox: unvalidated photos by gallery
      query(`
        SELECT g.id AS gallery_id, g.title AS gallery_title,
               COUNT(p.id) AS unvalidated_count
        FROM photos p
        JOIN galleries g ON g.id = p.gallery_id
        WHERE g.studio_id = ? AND p.status = 'uploaded'
        GROUP BY g.id, g.title
        ORDER BY unvalidated_count DESC
        LIMIT 20
      `, [orgId]),

      // Recent builds (last 10)
      query(`
        SELECT bj.id AS job_id, bj.status, bj.created_at,
               g.id AS gallery_id, g.title AS gallery_title
        FROM build_jobs bj
        JOIN galleries g ON g.id = bj.gallery_id
        WHERE bj.studio_id = ?
        ORDER BY bj.created_at DESC
        LIMIT 10
      `, [orgId]),

      // Failed build count (last 24h)
      query(`
        SELECT COUNT(*) AS n FROM build_jobs
        WHERE studio_id = ? AND status = 'error'
          AND created_at > ?
      `, [studioId, Date.now() - 24 * 60 * 60 * 1000]),
    ]);

    const stats  = galleryStats[0][0];
    const inbox  = inboxRows[0];
    const builds = recentBuilds[0];

    // Build recommended actions list (Sprint 14 #106)
    const actions = [];

    // 1. Failed builds — always first
    for (const b of builds.filter(b => b.status === 'error').slice(0, 3)) {
      actions.push({ type: 'build_failed', job_id: b.job_id, gallery_id: b.gallery_id, gallery_title: b.gallery_title });
    }

    // 2. Photos to validate — ordered by count desc
    for (const row of inbox) {
      actions.push({ type: 'photos_to_validate', gallery_id: row.gallery_id, gallery_title: row.gallery_title, count: Number(row.unvalidated_count) });
    }

    // 3. Galleries with validated photos not yet published (ready state)
    const [readyGalleries] = await query(`
      SELECT g.id AS gallery_id, g.title AS gallery_title, g.built_at
      FROM galleries g
      WHERE g.studio_id = ? AND g.workflow_status = 'ready'
        AND (g.built_at IS NULL OR g.built_at < ?)
      LIMIT 5
    `, [studioId, Date.now() - 24 * 60 * 60 * 1000]);

    for (const g of readyGalleries) {
      actions.push({ type: 'gallery_ready', gallery_id: g.gallery_id, gallery_title: g.gallery_title });
    }

    // 4. Galleries without an upload link
    const [noLinkGalleries] = await query(`
      SELECT g.id AS gallery_id, g.title AS gallery_title
      FROM galleries g
      WHERE g.studio_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM gallery_upload_links ul
          WHERE ul.gallery_id = g.id AND ul.revoked_at IS NULL
        )
      LIMIT 5
    `, [orgId]);

    for (const g of noLinkGalleries) {
      actions.push({ type: 'no_upload_link', gallery_id: g.gallery_id, gallery_title: g.gallery_title });
    }

    res.json({
      galleries: {
        total:        Number(stats.total)        || 0,
        draft:        Number(stats.draft)        || 0,
        ready:        Number(stats.ready)        || 0,
        published:    Number(stats.published)    || 0,
        needs_rebuild: Number(stats.needs_rebuild) || 0,
      },
      inbox: {
        total_unvalidated: inbox.reduce((s, r) => s + Number(r.unvalidated_count), 0),
        by_gallery: inbox.map(r => ({
          gallery_id:        r.gallery_id,
          gallery_title:     r.gallery_title,
          unvalidated_count: Number(r.unvalidated_count),
        })),
      },
      builds: {
        recent:       builds,
        failed_count: Number(failedBuilds[0][0].n) || 0,
      },
      actions: actions.slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
