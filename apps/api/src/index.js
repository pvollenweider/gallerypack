// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/index.js — GalleryPack API server entry point
import express    from 'express';
import cookieParser from 'cookie-parser';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';

import { runMigrations } from './db/migrations/run.js';
import { bootstrap }     from './services/bootstrap.js';
import { errorHandler }       from './middleware/error.js';
import { rateLimit }          from './middleware/rateLimit.js';
import { resolveStudioContext } from './middleware/studioContext.js';
import { query, getPool } from './db/database.js';
import { createStorage } from '../../../packages/shared/src/storage/index.js';
import { getSettings, getSession } from './db/helpers.js';

import authRoutes        from './routes/auth.js';
import galleriesRoutes   from './routes/galleries.js';
import accessRoutes      from './routes/access.js';
import photosRoutes      from './routes/photos.js';
import jobsRoutes        from './routes/jobs.js';
import invitesRoutes     from './routes/invites.js';
import invitationsRouter from './routes/invitations.js';
import scopedInvitesRouter from './routes/scopedInvites.js';
import publicRoutes, { getPublicGalleries, getCoverName, getPublicPhotoCount, getPublicDateRange } from './routes/public.js';
import { renderLanding, renderProjectListing } from './views/landing.js';
import settingsRoutes  from './routes/settings.js';
import studiosRoutes   from './routes/studios.js';
import projectsRoutes  from './routes/projects.js';
import platformRoutes  from './routes/platform.js';
import uploadRoutes    from './routes/upload.js';
import dashboardRoutes  from './routes/dashboard.js';
import inspectorRoutes from './routes/inspector.js';

const __DIR      = path.dirname(fileURLToPath(import.meta.url));
const PORT       = process.env.PORT || 4000;
const ADMIN_DIST = process.env.ADMIN_DIST || path.join(__DIR, '../../../../apps/web/dist');
const DIST_DIR   = process.env.DIST_DIR   || path.join(__DIR, '../../../../dist');

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Studio context — resolve studio from hostname (before all routes) ─────────
app.use(resolveStudioContext);

// ── Rate limiters ─────────────────────────────────────────────────────────────
const uploadRateLimit = rateLimit({ windowMs: 60_000, max: 100 });

// ── Health (registered before routes) ────────────────────────────────────────
const _storage = createStorage();
app.get('/api/health', async (req, res) => {
  const checks = { ok: true, version: process.env.npm_package_version || '0.0.1' };

  try {
    await query('SELECT 1');
    checks.db = 'connected';
  } catch {
    checks.db = 'error';
    checks.ok = false;
  }

  try {
    await _storage.exists('__health');
    checks.storage = 'ok';
  } catch {
    checks.storage = 'error';
    checks.ok      = false;
  }

  try {
    const [rows] = await query(
      "SELECT COUNT(*) AS n FROM build_jobs WHERE status IN ('queued','running') AND created_at > ?",
      [Date.now() - 5 * 60_000]
    );
    checks.worker = rows[0].n > 0 ? 'running' : 'idle';
  } catch {
    checks.worker = 'unknown';
  }

  res.status(checks.ok ? 200 : 503).json(checks);
});

// ── Admin SPA (served before API routes) ─────────────────────────────────────
app.use('/admin', express.static(ADMIN_DIST));
app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(ADMIN_DIST, 'index.html')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/public',              publicRoutes);
app.use('/api/settings',            settingsRoutes);
app.use('/api/auth',                authRoutes);
app.use('/api/galleries',           galleriesRoutes);
app.use('/api/galleries',           accessRoutes);
app.use('/api/galleries',           uploadRateLimit, photosRoutes);
app.use('/api/galleries',           jobsRoutes);
app.use('/api/jobs',                jobsRoutes); // for /api/jobs/:jobId and /api/jobs/:jobId/stream
app.use('/api/invites',             scopedInvitesRouter); // canonical scoped invites (Sprint 5)
app.use('/api/invites/v1',          invitesRoutes);       // legacy gallery viewer invite links
app.use('/api/invitations',         invitationsRouter);   // legacy studio invitations (Sprint 9 cleanup)
app.use('/api/studios',             studiosRoutes);
app.use('/api/projects',            projectsRoutes);
app.use('/api/platform',            platformRoutes);
app.use('/upload',                  uploadRateLimit, uploadRoutes);
app.use('/api/dashboard',           dashboardRoutes);
app.use('/api/inspector',           inspectorRoutes);

// ── Built galleries — static files (fallback when no reverse proxy in front) ──
app.use(express.static(DIST_DIR, { index: 'index.html' }));

// ── Shared vendor/fonts fallback for project-scoped galleries ─────────────────
// Galleries at /{project}/{gallery}/ use relative ../vendor/ and ../fonts/ paths
// which resolve to /{project}/vendor/ and /{project}/fonts/ — serve from dist root.
app.use(/^\/[^/]+\/(vendor|fonts)(\/.*)?$/, (req, res, next) => {
  const rel = req.path.replace(/^\/[^/]+/, ''); // strip leading /{project}
  const file = path.join(DIST_DIR, rel);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return res.sendFile(file);
  next();
});
app.get(/^\/([^/]+)\/?$/, (req, res, next) => {
  const slug      = req.params[0];
  const indexHtml = path.join(DIST_DIR, slug, 'index.html');
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  next();
});

// ── Project gallery listing — /:projectSlug/ ─────────────────────────────────
// Handles the back-button target from project-scoped gallery URLs.
app.get(/^\/([^/]+)\/?$/, async (req, res, next) => {
  const projectSlug = req.params[0];
  // Only intercept if there's no built index.html at this path (handled earlier)
  const indexHtml = path.join(DIST_DIR, projectSlug, 'index.html');
  if (fs.existsSync(indexHtml)) return next();

  const [projRows] = await query(
    'SELECT id, name FROM projects WHERE slug = ? LIMIT 1',
    [projectSlug]
  );
  const project = projRows[0];
  if (!project) return next();

  const [galRows] = await query(
    `SELECT g.slug, g.title, g.date, g.location, g.cover_photo
     FROM galleries g
     WHERE g.project_id = ? AND g.access = 'public' AND g.build_status = 'done'
     ORDER BY g.date DESC, g.created_at DESC`,
    [project.id]
  );

  const galleries = await Promise.all(galRows.map(async g => {
    const distSlug = `${projectSlug}/${g.slug}`;
    const [coverName, photoCount, dateRange] = await Promise.all([
      getCoverName(g, distSlug),
      getPublicPhotoCount(g.slug),
      getPublicDateRange(distSlug),
    ]);
    return { slug: g.slug, title: g.title, date: g.date, location: g.location, coverName, photoCount, dateRange };
  }));

  const [studioRows] = await query('SELECT id FROM studios LIMIT 1');
  const settings = studioRows[0] ? await getSettings(studioRows[0].id) : null;
  const siteTitle = settings?.site_title || 'GalleryPack';
  const token = req.cookies?.session;
  const isLoggedIn = token ? !!(await getSession(token)) : false;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProjectListing(projectSlug, project.name, galleries, siteTitle, isLoggedIn));
});

// ── Public gallery listing ────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const galleries = await getPublicGalleries();
  const [studioRows] = await query('SELECT id FROM studios LIMIT 1');
  const studioRow  = studioRows[0];
  const settings   = studioRow ? await getSettings(studioRow.id) : null;
  const siteTitle  = settings?.site_title || 'GalleryPack';
  const token      = req.cookies?.session;
  const isLoggedIn = token ? !!(await getSession(token)) : false;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLanding(galleries, siteTitle, isLoggedIn));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Bootstrap then start ──────────────────────────────────────────────────────
(async () => {
  try {
    await runMigrations();
    await bootstrap();
    app.listen(PORT, () => {
      console.log(`\n  ✓  GalleryPack API listening on port ${PORT}\n`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
})();

export default app;
