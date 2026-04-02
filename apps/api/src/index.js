// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/index.js — GalleryPack API server entry point
import express    from 'express';
import { marked }  from 'marked';
import cookieParser from 'cookie-parser';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';

import { runMigrations } from './db/migrations/run.js';
import { logger }        from './lib/logger.js';
import pinoHttp          from 'pino-http';
import { registry, httpRequestsTotal, httpRequestDuration } from './lib/metrics.js';
import { initSentry, sentryErrorHandler } from './lib/sentry.js';
import { bootstrap }     from './services/bootstrap.js';
import { loadLicense }   from './services/license.js';
import { errorHandler }       from './middleware/error.js';
import { rateLimit }          from './middleware/rateLimit.js';
import { resolveOrganizationContext } from './middleware/organizationContext.js';
import { query, getPool } from './db/database.js';
import { createStorage } from '../../../packages/shared/src/storage/index.js';
import { DIST_ROOT, INTERNAL_ROOT } from '../../../packages/engine/src/fs.js';
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
import { renderLanding, renderProjectIndex, renderProjectListing } from './views/landing.js';
import settingsRoutes  from './routes/settings.js';
import organizationsLegacyRoutes from './routes/organizations-legacy.js';
import projectsRoutes  from './routes/projects.js';
import platformRoutes  from './routes/platform.js';
import uploadRoutes       from './routes/upload.js';
import dashboardRoutes    from './routes/dashboard.js';
import inspectorRoutes    from './routes/inspector.js';
import organizationsRoutes from './routes/organizations.js';
import focalStatsRoutes       from './routes/focalStats.js';
import insightsRoutes         from './routes/insights.js';
import galleryMaintenanceRoutes from './routes/galleryMaintenance.js';
import personalTokensRoutes   from './routes/personalTokens.js';
import personalUploadRoutes   from './routes/personalUpload.js';
import tusRoutes               from './routes/tus.js';
import { uploadThrottle }      from './middleware/uploadThrottle.js';
import { uploadChecksum }      from './middleware/uploadChecksum.js';
import { initQueues, closeQueues } from './services/queues.js';
import { startCleanupCron }        from './jobs/cleanExpiredUploads.js';
import { prerenderAll }            from './services/prerender.js';

const __DIR        = path.dirname(fileURLToPath(import.meta.url));
const PORT         = process.env.PORT || 4000;
const ADMIN_DIST   = process.env.ADMIN_DIST   || path.join(__DIR, '../../../../apps/web/dist');
const DIST_DIR     = process.env.DIST_DIR     || DIST_ROOT;
const THUMB_ROOT   = process.env.THUMB_ROOT   || path.join(INTERNAL_ROOT, 'thumbnails');

// ── Sentry (must init before app) ────────────────────────────────────────────
initSentry();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // trust X-Forwarded-Proto from Traefik

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── HTTP request logger (pino-http) ──────────────────────────────────────────
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: req =>
      req.url === '/api/health' ||
      req.url?.startsWith('/media/') ||
      (req.url?.startsWith('/admin') && req.method === 'GET'),
  },
  customLogLevel: (_req, res) => res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage:   (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  serializers: {
    req: req => ({ method: req.method, url: req.url, userId: req.raw?.userId?.slice(0, 8) }),
    res: res => ({ statusCode: res.statusCode }),
  },
}));

// ── Organization context — resolve org from hostname (before all routes) ──────
app.use(resolveOrganizationContext);

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Public token-based upload routes (unauthenticated) — strict per-IP limit
const uploadRateLimit = rateLimit({ windowMs: 60_000, max: 300 });
// Authenticated photo upload — keyed by userId so each user gets their own bucket
const authUploadRateLimit = rateLimit({
  windowMs: 60_000,
  max: 600,
  keyFn: req => req.userId || req.ip || 'unknown',
});

// ── Prometheus metrics endpoint ───────────────────────────────────────────────
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// ── HTTP request instrumentation ──────────────────────────────────────────────
app.use((req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const route      = req.route?.path || req.path.replace(/\/[0-9a-f-]{8,}/gi, '/:id') || 'unknown';
    const durationS  = Number(process.hrtime.bigint() - t0) / 1e9;
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    httpRequestDuration.observe({ method: req.method, route }, durationS);
  });
  next();
});

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

// ── Static thumbnail assets (/media/thumbnails/<size>/<photoId>.webp) ────────
app.use('/media/thumbnails', express.static(THUMB_ROOT, {
  maxAge: 0,        // thumbnails are generated async — force revalidation via ETag
  etag: true,
  lastModified: true,
}));

// ── Admin SPA (served before API routes) ─────────────────────────────────────
app.use('/admin', express.static(ADMIN_DIST));
app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(ADMIN_DIST, 'index.html')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/public',              publicRoutes);
app.use('/api/settings',            settingsRoutes);
app.use('/api/auth',                authRoutes);
app.use('/api/galleries',           galleriesRoutes);
app.use('/api/galleries',           accessRoutes);
app.use('/api/galleries',           authUploadRateLimit, photosRoutes);
app.use('/api/tus',                 authUploadRateLimit, uploadChecksum, uploadThrottle, tusRoutes);
app.use('/api/galleries',           jobsRoutes);
app.use('/api/jobs',                jobsRoutes); // for /api/jobs/:jobId and /api/jobs/:jobId/stream
app.use('/api/invites',             scopedInvitesRouter); // canonical scoped invites (Sprint 5)
app.use('/api/invites/v1',          invitesRoutes);       // legacy gallery viewer invite links
app.use('/api/invitations',         invitationsRouter);   // legacy studio invitations (Sprint 9 cleanup)
app.use('/api/organizations',       organizationsRoutes); // Sprint 22 — canonical org endpoint
app.use('/api/studios',             organizationsLegacyRoutes); // backward compat alias
app.use('/api/projects',            projectsRoutes);
app.use('/api/platform',            platformRoutes);
app.use('/upload',                  uploadRateLimit, uploadRoutes);
app.use('/api/dashboard',           dashboardRoutes);
app.use('/api/inspector',           inspectorRoutes);
app.use('/api/galleries',           focalStatsRoutes);
app.use('/api/galleries',           insightsRoutes);
app.use('/api/galleries',           galleryMaintenanceRoutes);
app.use('/api/tokens',              personalTokensRoutes);
app.use('/api/upload/token',        uploadRateLimit, personalUploadRoutes);

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
    'SELECT id, name, description FROM projects WHERE slug = ? LIMIT 1',
    [projectSlug]
  );
  const project = projRows[0];
  if (!project) return next();
  const projectDescHtml = project.description ? marked.parse(project.description) : '';

  const [galRows] = await query(
    `SELECT g.id, g.slug, g.title, g.date, g.location, g.description, g.cover_photo, g.sort_order
     FROM galleries g
     WHERE g.project_id = ? AND g.access = 'public' AND g.build_status = 'done'
     ORDER BY g.sort_order ASC, g.date DESC, g.created_at DESC`,
    [project.id]
  );

  // Batch-fetch photographer names per gallery (most prolific first)
  const galIds = galRows.map(g => g.id);
  const pgMap  = {};
  if (galIds.length > 0) {
    const [pgRows] = await query(
      `SELECT p.gallery_id, u.name, COUNT(*) AS cnt
       FROM photos p JOIN users u ON u.id = p.photographer_id
       WHERE p.gallery_id IN (${galIds.map(() => '?').join(',')})
       GROUP BY p.gallery_id, p.photographer_id ORDER BY cnt DESC`,
      galIds
    );
    for (const r of pgRows) {
      if (!pgMap[r.gallery_id]) pgMap[r.gallery_id] = [];
      pgMap[r.gallery_id].push(r.name);
    }
  }

  const galleries = await Promise.all(galRows.map(async g => {
    const distSlug = `${projectSlug}/${g.slug}`;
    const [coverName, photoCount, dateRange] = await Promise.all([
      getCoverName(g, distSlug),
      getPublicPhotoCount(g.slug),
      getPublicDateRange(distSlug),
    ]);
    return {
      slug: g.slug, title: g.title, date: g.date, location: g.location,
      description: g.description || null,
      photographers: pgMap[g.id] || [],
      coverName, photoCount, dateRange,
    };
  }));

  const [studioRows] = await query('SELECT id FROM organizations LIMIT 1');
  const settings = studioRows[0] ? await getSettings(studioRows[0].id) : null;
  const siteTitle = settings?.site_title || 'GalleryPack';
  const [orgRows2] = await query('SELECT name FROM organizations WHERE is_default = 1 LIMIT 1');
  const orgName = orgRows2[0]?.name || '';
  const token = req.cookies?.session;
  const isLoggedIn = token ? !!(await getSession(token)) : false;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProjectListing(projectSlug, project.name, galleries, siteTitle, isLoggedIn, projectDescHtml, orgName));
});

// ── Public project index ──────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const [studioRows] = await query('SELECT id FROM organizations LIMIT 1');
  const studioRow  = studioRows[0];
  const settings   = studioRow ? await getSettings(studioRow.id) : null;
  const siteTitle  = settings?.site_title || 'GalleryPack';
  const [orgRows]  = await query('SELECT name, description FROM organizations WHERE is_default = 1 LIMIT 1');
  const org        = orgRows[0] ?? null;
  const orgName    = org?.name || siteTitle;
  const orgDescHtml = org?.description ? marked.parse(org.description) : '';
  const token      = req.cookies?.session;
  const isLoggedIn = token ? !!(await getSession(token)) : false;

  // Fetch projects that have at least one public, published gallery
  const [projRows] = await query(
    `SELECT p.id, p.slug, p.name, p.description, p.sort_order, p.cover_gallery_id,
            COUNT(g.id) AS gallery_count,
            MIN(g.date) AS date_from,
            MAX(g.date) AS date_to,
            (SELECT g2.slug FROM galleries g2
             WHERE g2.project_id = p.id AND g2.access = 'public' AND g2.build_status = 'done'
             ORDER BY g2.date DESC, g2.created_at DESC LIMIT 1) AS fallback_gallery_slug,
            (SELECT g2.cover_photo FROM galleries g2
             WHERE g2.project_id = p.id AND g2.access = 'public' AND g2.build_status = 'done'
             ORDER BY g2.date DESC, g2.created_at DESC LIMIT 1) AS fallback_cover_photo
     FROM projects p
     JOIN galleries g ON g.project_id = p.id AND g.access = 'public' AND g.build_status = 'done'
     GROUP BY p.id
     ORDER BY p.sort_order ASC, date_to DESC, p.created_at DESC`
  );

  // Resolve explicit cover galleries
  const coverGalIds = projRows.filter(p => p.cover_gallery_id).map(p => p.cover_gallery_id);
  let coverGalMap = {};
  if (coverGalIds.length > 0) {
    const [cgRows] = await query(
      `SELECT id, slug, cover_photo FROM galleries WHERE id IN (${coverGalIds.map(() => '?').join(',')})`,
      coverGalIds
    );
    for (const r of cgRows) coverGalMap[r.id] = r;
  }

  const projects = await Promise.all(projRows.map(async p => {
    let coverGallerySlug, coverPhoto;
    if (p.cover_gallery_id && coverGalMap[p.cover_gallery_id]) {
      coverGallerySlug = coverGalMap[p.cover_gallery_id].slug;
      coverPhoto       = coverGalMap[p.cover_gallery_id].cover_photo;
    } else {
      coverGallerySlug = p.fallback_gallery_slug;
      coverPhoto       = p.fallback_cover_photo;
    }
    let coverName = null;
    if (coverGallerySlug) {
      coverName = await getCoverName({ cover_photo: coverPhoto }, `${p.slug}/${coverGallerySlug}`);
    }
    const dateRange = (p.date_from || p.date_to)
      ? { from: p.date_from || p.date_to, to: p.date_to || p.date_from }
      : null;
    return {
      slug:         p.slug,
      name:         p.name,
      description:  p.description || null,
      galleryCount: Number(p.gallery_count),
      coverSlug:    coverGallerySlug,
      coverName,
      dateRange,
    };
  }));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProjectIndex(projects, siteTitle, isLoggedIn, orgName, orgDescHtml));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(sentryErrorHandler);  // must be before custom error handler
app.use(errorHandler);

// ── Safety net — log unhandled rejections without crashing ───────────────────
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection');
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM — shutting down');
  await closeQueues();
  process.exit(0);
});

// ── Bootstrap then start ──────────────────────────────────────────────────────
(async () => {
  try {
    loadLicense();
    await runMigrations();
    await bootstrap();
    await initQueues();       // BullMQ — graceful no-op if Redis unavailable
    startCleanupCron();       // purge incomplete tus uploads hourly
    prerenderAll();           // pre-generate static index.html for / and /{slug}/
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'GalleryPack API listening');
    });
  } catch (err) {
    logger.fatal({ err }, 'Fatal startup error');
    process.exit(1);
  }
})();

export default app;
