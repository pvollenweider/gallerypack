// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/inspector.js — superadmin inspector API (Sprints 16-21)
// All routes require platformRole = superadmin.
import { Router }     from 'express';
import { randomUUID } from 'crypto';
import { query }      from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Guard: superadmin only ────────────────────────────────────────────────────
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.platformRole !== 'superadmin') return res.status(403).json({ error: 'Superadmin only' });
  next();
});

// ── Audit helper ──────────────────────────────────────────────────────────────
async function auditLog(actorId, action, targetType, targetId, before = null, after = null) {
  try {
    await query(
      `INSERT INTO inspector_audit_log (id, actor_id, action, target_type, target_id, before_state, after_state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [randomUUID(), actorId, action, targetType, String(targetId),
       before ? JSON.stringify(before) : null,
       after  ? JSON.stringify(after)  : null]
    );
  } catch {}
}

// ── Health warnings helper ────────────────────────────────────────────────────
async function galleryHealthWarnings(galleryId, gallery) {
  const warnings = [];

  // Photo counts
  const [counts] = await query(
    `SELECT status, COUNT(*) AS n FROM photos WHERE gallery_id = ? GROUP BY status`,
    [galleryId]
  );
  const photoCount = { uploaded: 0, validated: 0, published: 0 };
  for (const r of counts) photoCount[r.status] = Number(r.n);
  const total = Object.values(photoCount).reduce((a, b) => a + b, 0);

  if (total === 0) {
    warnings.push({ code: 'no_photos', severity: 'warning', message: 'Gallery has no photos' });
  }
  if (photoCount.uploaded > 0) {
    warnings.push({ code: 'inbox_not_empty', severity: 'warning', message: `${photoCount.uploaded} photo(s) pending validation`, count: photoCount.uploaded });
  }

  // Last build
  const [buildRows] = await query(
    `SELECT id, status FROM build_jobs WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 1`,
    [galleryId]
  );
  const lastBuild = buildRows[0] || null;
  if (lastBuild?.status === 'error') {
    warnings.push({ code: 'build_failed', severity: 'error', message: 'Last build failed', job_id: lastBuild.id });
  }
  if (gallery.workflow_status === 'published' && !lastBuild) {
    warnings.push({ code: 'never_built', severity: 'error', message: 'Gallery marked published but no build exists' });
  }
  if (!gallery.active) {
    warnings.push({ code: 'disabled', severity: 'info', message: 'Gallery is disabled' });
  }

  // Upload links
  const [linkRows] = await query(
    `SELECT COUNT(*) AS n FROM gallery_upload_links WHERE gallery_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
    [galleryId]
  );
  if (Number(linkRows[0].n) === 0) {
    warnings.push({ code: 'no_upload_link', severity: 'info', message: 'No active upload link' });
  }

  // Stale draft
  if (gallery.workflow_status === 'draft') {
    const stale = Date.now() - new Date(gallery.updated_at || gallery.created_at).getTime() > 30 * 24 * 60 * 60 * 1000;
    if (stale) warnings.push({ code: 'stale_draft', severity: 'info', message: 'Gallery in draft with no activity in > 30 days' });
  }

  return warnings;
}

// ── Sprint 16: Search ─────────────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'Query too short (min 2 chars)' });
  const like = `%${q}%`;

  const [studios, projects, galleries, users] = await Promise.all([
    query(
      `SELECT id, name, slug FROM studios WHERE id = ? OR slug LIKE ? OR name LIKE ? LIMIT 10`,
      [q, like, like]
    ).then(r => r[0]),
    query(
      `SELECT id, name, slug, studio_id FROM projects WHERE id = ? OR slug LIKE ? OR name LIKE ? LIMIT 10`,
      [q, like, like]
    ).then(r => r[0]),
    query(
      `SELECT id, title, slug, workflow_status AS status, studio_id, project_id FROM galleries WHERE id = ? OR slug LIKE ? OR title LIKE ? LIMIT 10`,
      [q, like, like]
    ).then(r => r[0]),
    query(
      `SELECT id, email, name FROM users WHERE id = ? OR email LIKE ? OR name LIKE ? LIMIT 10`,
      [q, like, like]
    ).then(r => r[0]),
  ]);

  res.json({ studios, projects, galleries, users });
});

// ── Sprint 17: Gallery detail ─────────────────────────────────────────────────

router.get('/galleries/:id', async (req, res) => {
  const [galleryRows] = await query(`
    SELECT g.*,
           p.id AS proj_id, p.name AS proj_name, p.slug AS proj_slug,
           s.id AS studio_id_r, s.name AS studio_name, s.slug AS studio_slug
    FROM galleries g
    LEFT JOIN projects p ON p.id = g.project_id
    LEFT JOIN studios s  ON s.id = g.studio_id
    WHERE g.id = ?
  `, [req.params.id]);

  const gallery = galleryRows[0];
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  const [photoCounts, lastBuildRows, uploadLinks, viewerTokens, memberRows] = await Promise.all([
    query(`SELECT status, COUNT(*) AS n FROM photos WHERE gallery_id = ? GROUP BY status`, [gallery.id]).then(r => r[0]),
    query(`SELECT id, status, created_at AS started_at, updated_at AS finished_at, error_msg FROM build_jobs WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 1`, [gallery.id]).then(r => r[0]),
    query(`SELECT id, label, created_at, expires_at, revoked_at, (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS active FROM gallery_upload_links WHERE gallery_id = ? ORDER BY created_at DESC`, [gallery.id]).then(r => r[0]),
    query(`SELECT id, label, created_at, expires_at, revoked_at, (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS active FROM gallery_access_tokens WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 20`, [gallery.id]).then(r => r[0]).catch(() => []),
    query(`SELECT gra.role, u.id AS user_id, u.email, u.name FROM gallery_role_assignments gra JOIN users u ON u.id = gra.user_id WHERE gra.gallery_id = ?`, [gallery.id]).then(r => r[0]),
  ]);

  const photoByStatus = { uploaded: 0, validated: 0, published: 0 };
  for (const r of photoCounts) photoByStatus[r.status] = Number(r.n);

  const health = await galleryHealthWarnings(gallery.id, gallery);

  res.json({
    id:             gallery.id,
    slug:           gallery.slug,
    title:          gallery.title,
    status:         gallery.workflow_status,
    active:         gallery.active !== 0,
    needs_rebuild:  gallery.needs_rebuild === 1,
    build_status:   gallery.build_status,
    created_at:     gallery.created_at,
    updated_at:     gallery.updated_at,
    project:        gallery.proj_id ? { id: gallery.proj_id, name: gallery.proj_name, slug: gallery.proj_slug } : null,
    studio:         { id: gallery.studio_id_r, name: gallery.studio_name, slug: gallery.studio_slug },
    photos:         { total: Object.values(photoByStatus).reduce((a, b) => a + b, 0), by_status: photoByStatus },
    last_build:     lastBuildRows[0] || null,
    upload_links:   uploadLinks,
    viewer_tokens:  viewerTokens,
    members:        memberRows,
    health:         { warnings: health },
  });
});

// ── Sprint 17: Gallery safe actions ──────────────────────────────────────────

// POST /api/inspector/galleries/:id/rebuild
router.post('/galleries/:id/rebuild', async (req, res) => {
  const [rows] = await query('SELECT id, studio_id, title, slug FROM galleries WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Gallery not found' });
  const gallery = rows[0];

  // Check for active build
  const [active] = await query(
    `SELECT id FROM build_jobs WHERE gallery_id = ? AND status IN ('queued','running') LIMIT 1`,
    [gallery.id]
  );
  if (active[0]) return res.status(409).json({ error: 'Build already in progress', job_id: active[0].id });

  const jobId = randomUUID();
  await query(
    `INSERT INTO build_jobs (id, studio_id, gallery_id, status, force, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 0, NOW(), NOW())`,
    [jobId, gallery.studio_id, gallery.id]
  );
  await auditLog(req.userId, 'gallery.rebuild', 'gallery', gallery.id, null, { job_id: jobId });
  res.json({ job_id: jobId });
});

// PATCH /api/inspector/galleries/:id — enable/disable
router.patch('/galleries/:id', async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'active (boolean) required' });

  const [rows] = await query('SELECT id, active FROM galleries WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Gallery not found' });

  const before = { active: rows[0].active !== 0 };
  await query('UPDATE galleries SET active = ?, updated_at = NOW() WHERE id = ?', [active ? 1 : 0, req.params.id]);
  await auditLog(req.userId, active ? 'gallery.enable' : 'gallery.disable', 'gallery', req.params.id, before, { active });
  res.json({ id: req.params.id, active });
});

// DELETE /api/inspector/galleries/:id/upload-links/:linkId
router.delete('/galleries/:id/upload-links/:linkId', async (req, res) => {
  const [rows] = await query(
    'SELECT id FROM gallery_upload_links WHERE id = ? AND gallery_id = ?',
    [req.params.linkId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Upload link not found' });

  await query('UPDATE gallery_upload_links SET revoked_at = NOW() WHERE id = ?', [req.params.linkId]);
  await auditLog(req.userId, 'upload_link.revoke', 'upload_link', req.params.linkId);
  res.json({ ok: true });
});

// DELETE /api/inspector/galleries/:id/viewer-tokens/:tokenId
router.delete('/galleries/:id/viewer-tokens/:tokenId', async (req, res) => {
  const [rows] = await query(
    'SELECT id FROM gallery_access_tokens WHERE id = ? AND gallery_id = ?',
    [req.params.tokenId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Viewer token not found' });

  await query('UPDATE gallery_access_tokens SET revoked_at = NOW() WHERE id = ?', [req.params.tokenId]);
  await auditLog(req.userId, 'viewer_token.revoke', 'viewer_token', req.params.tokenId);
  res.json({ ok: true });
});

// ── Sprint 18: Photo detail ───────────────────────────────────────────────────

router.get('/photos/:id', async (req, res) => {
  const [rows] = await query(`
    SELECT p.*,
           g.title AS gallery_title, g.slug AS gallery_slug, g.workflow_status AS gallery_status,
           proj.id AS proj_id, proj.name AS proj_name,
           s.id AS studio_id_r, s.name AS studio_name,
           u.email AS uploader_email, u.name AS uploader_name,
           ul.label AS upload_link_label
    FROM photos p
    JOIN galleries g    ON g.id = p.gallery_id
    LEFT JOIN projects proj ON proj.id = g.project_id
    LEFT JOIN studios s     ON s.id = g.studio_id
    LEFT JOIN users u       ON u.id = p.uploaded_by_user_id
    LEFT JOIN gallery_upload_links ul ON ul.id = p.upload_link_id
    WHERE p.id = ?
  `, [req.params.id]);

  if (!rows[0]) return res.status(404).json({ error: 'Photo not found' });
  const p = rows[0];

  const warnings = [];
  if (p.status === 'uploaded') warnings.push({ code: 'unvalidated', severity: 'warning', message: 'Photo has not been validated yet' });
  if (p.status === 'validated') warnings.push({ code: 'unpublished', severity: 'info', message: 'Photo validated but gallery not yet built' });

  let uploadedBy;
  if (p.uploaded_by_user_id) {
    uploadedBy = { type: 'user', user_id: p.uploaded_by_user_id, email: p.uploader_email, name: p.uploader_name };
  } else if (p.upload_link_id) {
    uploadedBy = { type: 'upload_link', link_id: p.upload_link_id, label: p.upload_link_label };
  } else {
    uploadedBy = { type: 'unknown' };
  }

  res.json({
    id:                p.id,
    gallery_id:        p.gallery_id,
    gallery:           { id: p.gallery_id, title: p.gallery_title, slug: p.gallery_slug, status: p.gallery_status },
    project:           p.proj_id ? { id: p.proj_id, name: p.proj_name } : null,
    studio:            { id: p.studio_id_r, name: p.studio_name },
    status:            p.status,
    filename:          p.filename,
    original_filename: p.original_name,
    size_bytes:        p.size_bytes,
    sort_order:        p.sort_order,
    uploaded_at:       p.created_at,
    uploaded_by:       uploadedBy,
    health:            { warnings },
  });
});

// ── Sprint 19: Studio & Project detail ───────────────────────────────────────

router.get('/studios', async (req, res) => {
  const [rows] = await query(`
    SELECT s.id, s.name, s.slug, s.locale, s.country, s.is_default, s.created_at,
           COUNT(DISTINCT g.id)  AS gallery_count,
           COUNT(DISTINCT sm.user_id) AS member_count
    FROM studios s
    LEFT JOIN galleries g ON g.studio_id = s.id
    LEFT JOIN studio_memberships sm ON sm.studio_id = s.id
    GROUP BY s.id ORDER BY s.name ASC
  `);
  res.json(rows);
});

router.get('/studios/:id', async (req, res) => {
  const [rows] = await query(`
    SELECT s.*, COUNT(DISTINCT g.id) AS gallery_count, COUNT(DISTINCT sm.user_id) AS member_count
    FROM studios s
    LEFT JOIN galleries g ON g.studio_id = s.id
    LEFT JOIN studio_memberships sm ON sm.studio_id = s.id
    WHERE s.id = ?
    GROUP BY s.id
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Studio not found' });

  const [members, projects] = await Promise.all([
    query(`SELECT sm.role, u.id, u.email, u.name FROM studio_memberships sm JOIN users u ON u.id = sm.user_id WHERE sm.studio_id = ?`, [req.params.id]).then(r => r[0]),
    query(`SELECT id, name, slug, created_at FROM projects WHERE studio_id = ? ORDER BY created_at DESC LIMIT 20`, [req.params.id]).then(r => r[0]),
  ]);

  res.json({ ...rows[0], members, projects });
});

router.get('/projects/:id', async (req, res) => {
  const [rows] = await query(`
    SELECT p.*, s.name AS studio_name, s.slug AS studio_slug
    FROM projects p
    LEFT JOIN studios s ON s.id = p.studio_id
    WHERE p.id = ?
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });

  const [galleries] = await query(`
    SELECT id, title, slug, workflow_status AS status, build_status, active, created_at, updated_at
    FROM galleries WHERE project_id = ? ORDER BY created_at DESC
  `, [req.params.id]);

  res.json({ ...rows[0], galleries });
});

router.get('/users', async (req, res) => {
  const [rows] = await query(
    `SELECT id, email, name, platform_role, created_at FROM users ORDER BY created_at DESC LIMIT 100`
  );
  res.json(rows);
});

router.get('/users/:id', async (req, res) => {
  const [rows] = await query('SELECT id, email, name, platform_role, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });

  const [memberships] = await query(`
    SELECT sm.role, sm.studio_id, s.name AS studio_name
    FROM studio_memberships sm
    JOIN studios s ON s.id = sm.studio_id
    WHERE sm.user_id = ?
  `, [req.params.id]);

  res.json({ ...rows[0], memberships });
});

// ── Sprint 21: Audit log ──────────────────────────────────────────────────────

router.get('/audit-log', async (req, res) => {
  const { target_type, target_id, limit = 50 } = req.query;
  const where = [];
  const params = [];
  if (target_type) { where.push('target_type = ?'); params.push(target_type); }
  if (target_id)   { where.push('target_id = ?');   params.push(target_id); }
  const sql = `
    SELECT ial.*, u.email AS actor_email, u.name AS actor_name
    FROM inspector_audit_log ial
    LEFT JOIN users u ON u.id = ial.actor_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ial.created_at DESC LIMIT ?
  `;
  const [rows] = await query(sql, [...params, Math.min(Number(limit) || 50, 200)]);
  res.json({ entries: rows });
});

// ── Sprint 21: System dashboard ───────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [buildStats, recentBuilds, uploadStats, recentUploads, anomalyCounts] = await Promise.all([
    // Build stats last 24h
    query(`
      SELECT COUNT(*) AS total,
             SUM(status = 'done')    AS success,
             SUM(status = 'error')   AS failed,
             SUM(status IN ('queued','running')) AS active
      FROM build_jobs WHERE created_at > ?
    `, [since24h]).then(r => r[0][0]),

    // Recent builds
    query(`
      SELECT bj.id AS job_id, bj.status, bj.created_at,
             TIMESTAMPDIFF(SECOND, bj.created_at, bj.updated_at) * 1000 AS duration_ms,
             g.id AS gallery_id, g.title AS gallery_title,
             s.name AS studio
      FROM build_jobs bj
      JOIN galleries g ON g.id = bj.gallery_id
      JOIN studios s   ON s.id = bj.studio_id
      ORDER BY bj.created_at DESC LIMIT 10
    `).then(r => r[0]),

    // Upload stats last 24h
    query(`
      SELECT COUNT(*) AS photos, COUNT(DISTINCT gallery_id) AS galleries_active
      FROM photos WHERE created_at > ?
    `, [since24h]).then(r => r[0][0]),

    // Recent uploads by gallery
    query(`
      SELECT p.gallery_id, g.title AS gallery_title, s.name AS studio,
             COUNT(*) AS count, MAX(p.created_at) AS created_at
      FROM photos p
      JOIN galleries g ON g.id = p.gallery_id
      JOIN studios s   ON s.id = g.studio_id
      WHERE p.created_at > ?
      GROUP BY p.gallery_id, g.title, s.name
      ORDER BY created_at DESC LIMIT 10
    `, [since24h]).then(r => r[0]),

    // Anomaly counts
    query(`
      SELECT
        SUM(bj_last.status = 'error')                                                   AS build_failed,
        SUM(inbox.n > 0 AND inbox.oldest < ?)                                           AS inbox_old,
        SUM(g.workflow_status = 'draft' AND g.updated_at < ?)                           AS stale_draft
      FROM galleries g
      LEFT JOIN LATERAL (
        SELECT status FROM build_jobs WHERE gallery_id = g.id ORDER BY created_at DESC LIMIT 1
      ) bj_last ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n, MIN(created_at) AS oldest
        FROM photos WHERE gallery_id = g.id AND status = 'uploaded'
      ) inbox ON TRUE
    `, [since24h, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]).then(r => r[0][0]).catch(() => ({})),
  ]);

  res.json({
    builds: {
      last_24h: {
        total:   Number(buildStats.total)   || 0,
        success: Number(buildStats.success) || 0,
        failed:  Number(buildStats.failed)  || 0,
        active:  Number(buildStats.active)  || 0,
      },
      recent: recentBuilds,
    },
    uploads: {
      last_24h: {
        photos:           Number(uploadStats.photos)           || 0,
        galleries_active: Number(uploadStats.galleries_active) || 0,
      },
      recent: recentUploads,
    },
    anomalies: {
      build_failed: Number(anomalyCounts.build_failed) || 0,
      inbox_old:    Number(anomalyCounts.inbox_old)    || 0,
      stale_draft:  Number(anomalyCounts.stale_draft)  || 0,
    },
  });
});

// ── Sprint 21: Anomaly list ───────────────────────────────────────────────────

router.get('/anomalies', async (req, res) => {
  const { type, studio_id, limit = 50 } = req.query;

  const studioFilter = studio_id ? 'AND g.studio_id = ?' : '';
  const studioParam  = studio_id ? [studio_id] : [];

  const [buildFailed, inboxOld, staleGalleries] = await Promise.all([
    // build_failed
    (!type || type === 'build_failed') ? query(`
      SELECT 'build_failed' AS type, 'error' AS severity, 'gallery' AS target_type,
             g.id AS target_id, CONCAT(g.title, ' — ', s.name) AS target_label,
             bj.updated_at AS detected_at
      FROM galleries g
      JOIN studios s ON s.id = g.studio_id
      JOIN build_jobs bj ON bj.id = (
        SELECT id FROM build_jobs WHERE gallery_id = g.id ORDER BY created_at DESC LIMIT 1
      )
      WHERE bj.status = 'error' ${studioFilter}
      LIMIT ?
    `, [...studioParam, Number(limit)]).then(r => r[0]) : [],

    // inbox_not_empty (> 24h)
    (!type || type === 'inbox_not_empty') ? query(`
      SELECT 'inbox_not_empty' AS type, 'warning' AS severity, 'gallery' AS target_type,
             g.id AS target_id, CONCAT(g.title, ' — ', s.name) AS target_label,
             MIN(p.created_at) AS detected_at
      FROM photos p
      JOIN galleries g ON g.id = p.gallery_id
      JOIN studios s   ON s.id = g.studio_id
      WHERE p.status = 'uploaded' AND p.created_at < ? ${studioFilter}
      GROUP BY g.id, g.title, s.name
      LIMIT ?
    `, [new Date(Date.now() - 24 * 60 * 60 * 1000), ...studioParam, Number(limit)]).then(r => r[0]) : [],

    // stale_draft
    (!type || type === 'stale_draft') ? query(`
      SELECT 'stale_draft' AS type, 'info' AS severity, 'gallery' AS target_type,
             g.id AS target_id, CONCAT(g.title, ' — ', s.name) AS target_label,
             g.updated_at AS detected_at
      FROM galleries g
      JOIN studios s ON s.id = g.studio_id
      WHERE g.workflow_status = 'draft' AND g.updated_at < ? ${studioFilter}
      LIMIT ?
    `, [new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), ...studioParam, Number(limit)]).then(r => r[0]) : [],
  ]);

  const items = [...buildFailed, ...inboxOld, ...staleGalleries]
    .sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return (order[a.severity] || 9) - (order[b.severity] || 9);
    })
    .slice(0, Number(limit));

  res.json({ total: items.length, items });
});

export default router;
