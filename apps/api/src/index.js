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
import cors        from 'cors';
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

const PLATFORM_MODE = process.env.PLATFORM_MODE || 'single';
import { getSettings, getSession,
  createViewerToken, verifyViewerToken, getViewerToken, touchViewerToken,
} from './db/helpers.js';

import authRoutes        from './routes/auth.js';
import galleriesRoutes   from './routes/galleries.js';
import accessRoutes      from './routes/access.js';
import photosRoutes      from './routes/photos.js';
import videoRoutes, { publicVideoRouter } from './routes/videos.js';
import videoStreamRoutes from './routes/videoStream.js';
import jobsRoutes        from './routes/jobs.js';
import invitesRoutes     from './routes/invites.js';
import invitationsRouter from './routes/invitations.js';
import scopedInvitesRouter from './routes/scopedInvites.js';
import publicRoutes, { getPublicGalleries, getCoverName, getPublicPhotoCount, getPublicDateRange } from './routes/public.js';
import { renderLanding, renderProjectIndex, renderProjectListing } from './views/landing.js';
import watchRoutes  from './routes/watch.js';
import enrollRoutes from './routes/enroll.js';
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
import { startAccessRequestCleanupCron } from './jobs/cleanExpiredAccessRequests.js';
import { prerenderAll }            from './services/prerender.js';

const __DIR        = path.dirname(fileURLToPath(import.meta.url));
const PORT         = process.env.PORT || 4000;
const ADMIN_DIST   = process.env.ADMIN_DIST   || path.join(__DIR, '../../../../apps/web/dist');
const DIST_DIR     = process.env.DIST_DIR     || DIST_ROOT;
const THUMB_ROOT   = process.env.THUMB_ROOT   || path.join(INTERNAL_ROOT, 'thumbnails');

/** Resolve the org-isolated prerender path for /:projectSlug/index.html. */
function projectPreviewPath(orgId, projectSlug) {
  return (PLATFORM_MODE === 'multi' && orgId)
    ? path.join(DIST_DIR, '__prerender', orgId, projectSlug, 'index.html')
    : path.join(DIST_DIR, projectSlug, 'index.html');
}

// ── Sentry (must init before app) ────────────────────────────────────────────
initSentry();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // trust X-Forwarded-Proto from Traefik

const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'gallerypack.app').toLowerCase();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / non-browser
    try {
      const host = new URL(origin).hostname.toLowerCase();
      const allowed =
        host === BASE_DOMAIN ||
        host === `www.${BASE_DOMAIN}` ||
        host.endsWith(`.${BASE_DOMAIN}`);
      cb(null, allowed ? origin : false);
    } catch {
      cb(null, false);
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Upload-Offset', 'Upload-Length',
                   'Upload-Metadata', 'Tus-Resumable', 'X-Requested-With',
                   'X-HTTP-Method-Override'],
  exposedHeaders: ['Upload-Offset', 'Location', 'Tus-Resumable'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
}));

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
// Hashed assets (JS/CSS) get long-term cache; index.html must never be cached
// so browsers always fetch the latest bundle references after a deploy.
app.use('/admin', express.static(ADMIN_DIST, { index: false }));
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(ADMIN_DIST, 'index.html'));
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/public',              publicRoutes);
app.use('/api/settings',            settingsRoutes);
app.use('/api/auth',                authRoutes);


app.use('/api/v', videoStreamRoutes);  // no auth middleware — token is in URL
app.use('/api/video-covers', publicVideoRouter); // public video gallery covers
app.use('/watch',  watchRoutes);        // public video viewer page
app.use('/',       enrollRoutes);       // /enroll/:ref, /enroll/confirm/:token (HTML)
app.use('/api',    enrollRoutes);       // /api/enroll/:ref (JSON POST)

app.use('/api/galleries',           galleriesRoutes);
app.use('/api/galleries',           accessRoutes);
app.use('/api/galleries',           authUploadRateLimit, photosRoutes);
app.use('/api/galleries',           videoRoutes);
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

// ── Public project index — must be before express.static so it's org-aware ───
app.get('/', async (req, res) => {
  // Resolve org from request context (set by organizationContext middleware).
  // Fall back to default org for backward-compat (single-org / platform root).
  const orgId = req.organizationId ?? null;
  const [orgRows] = orgId
    ? await query('SELECT id, name, description FROM organizations WHERE id = ? LIMIT 1', [orgId])
    : await query('SELECT id, name, description FROM organizations WHERE is_default = 1 LIMIT 1');
  const org       = orgRows[0] ?? null;
  const effectiveOrgId = org?.id ?? null;
  const settings  = effectiveOrgId ? await getSettings(effectiveOrgId) : null;
  const siteTitle = settings?.site_title || 'GalleryPack';
  const orgName   = org?.name || siteTitle;
  const orgDescHtml = org?.description ? marked.parse(org.description) : '';
  const token     = req.cookies?.session;
  const isLoggedIn = token ? !!(await getSession(token)) : false;

  const projQuery = effectiveOrgId
    ? `SELECT p.id, p.slug, p.name, p.description, p.sort_order, p.cover_gallery_id,
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
       WHERE p.organization_id = ?
       GROUP BY p.id
       ORDER BY p.sort_order ASC, date_to DESC, p.created_at DESC`
    : `SELECT p.id, p.slug, p.name, p.description, p.sort_order, p.cover_gallery_id,
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
       ORDER BY p.sort_order ASC, date_to DESC, p.created_at DESC`;
  const [projRows] = effectiveOrgId
    ? await query(projQuery, [effectiveOrgId])
    : await query(projQuery);

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

  const proto   = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = process.env.BASE_URL || `${proto}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProjectIndex(projects, siteTitle, isLoggedIn, orgName, orgDescHtml, baseUrl));
});

// ── robots.txt ────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const proto   = req.get('x-forwarded-proto') || req.protocol;
  const siteUrl = process.env.BASE_URL || `${proto}://${req.get('host')}`;
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`);
});

// ── sitemap.xml ───────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  try {
    const orgId = req.organizationId ?? null;
    const proto   = req.get('x-forwarded-proto') || req.protocol;
    const siteUrl = process.env.BASE_URL || `${proto}://${req.get('host')}`;

    // Fetch all public projects and galleries for this org
    const [projRows] = orgId
      ? await query(
          `SELECT p.slug, MAX(g.built_at) AS last_built
           FROM projects p
           JOIN galleries g ON g.project_id = p.id AND g.access = 'public' AND g.build_status = 'done'
           WHERE p.organization_id = ?
           GROUP BY p.id ORDER BY p.sort_order ASC, p.created_at DESC`,
          [orgId])
      : await query(
          `SELECT p.slug, MAX(g.built_at) AS last_built
           FROM projects p
           JOIN galleries g ON g.project_id = p.id AND g.access = 'public' AND g.build_status = 'done'
           GROUP BY p.id ORDER BY p.sort_order ASC, p.created_at DESC`);

    const projectSlugs = projRows.map(p => p.slug);
    let galRows = [];
    if (projectSlugs.length > 0) {
      const [rows] = orgId
        ? await query(
            `SELECT g.dist_name, g.slug AS gslug, p.slug AS pslug, g.built_at
             FROM galleries g JOIN projects p ON p.id = g.project_id
             WHERE p.organization_id = ? AND g.access = 'public' AND g.build_status = 'done'
             ORDER BY g.date DESC, g.created_at DESC`,
            [orgId])
        : await query(
            `SELECT g.dist_name, g.slug AS gslug, p.slug AS pslug, g.built_at
             FROM galleries g JOIN projects p ON p.id = g.project_id
             WHERE g.access = 'public' AND g.build_status = 'done'
             ORDER BY g.date DESC, g.created_at DESC`);
      galRows = rows;
    }

    const fmtDate = ts => {
      if (!ts) return '';
      const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    };

    const urlTag = (loc, priority, lastmod, changefreq) =>
      `  <url>\n    <loc>${loc}</loc>\n` +
      (lastmod    ? `    <lastmod>${lastmod}</lastmod>\n`       : '') +
      (changefreq ? `    <changefreq>${changefreq}</changefreq>\n` : '') +
      `    <priority>${priority}</priority>\n  </url>`;

    const urls = [
      urlTag(`${siteUrl}/`, '1.0', '', 'weekly'),
      ...projRows.map(p =>
        urlTag(`${siteUrl}/${p.slug}/`, '0.8', fmtDate(p.last_built), 'weekly')),
      ...galRows.map(g => {
        const distPath = g.dist_name || `${g.pslug}/${g.gslug}`;
        return urlTag(`${siteUrl}/${distPath}/`, '0.6', fmtDate(g.built_at), 'monthly');
      }),
    ].join('\n');

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  } catch (err) {
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  }
});

// ── Private gallery access gate ───────────────────────────────────────────────
// Runs before express.static. For private galleries, requires either:
//   a) a valid ?vt= viewer token in the URL (sets a 24h session cookie), or
//   b) an existing valid session cookie from a previous ?vt= visit.
// Only intercepts HTML/index requests (paths without a file extension).
// Individual asset protection (photos, JS) is deferred — index gating is
// sufficient to prevent casual access.
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/media/') ||
    req.path === '/metrics' ||
    req.path === '/'
  ) return next();

  // Only act on index-like requests (no file extension in last segment)
  const parts = req.path.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return next();
  const lastSeg = parts[parts.length - 1];
  if (lastSeg.includes('.')) return next();

  const distSlug = lastSeg;
  try {
    const gateOrgId = req.organizationId ?? null;
    const [rows] = gateOrgId
      ? await query(
          `SELECT id, access, project_id FROM galleries
           WHERE (slug = ? OR dist_name = ?) AND access = 'private' AND organization_id = ? LIMIT 1`,
          [distSlug, distSlug, gateOrgId]
        )
      : await query(
          `SELECT id, access, project_id FROM galleries
           WHERE (slug = ? OR dist_name = ?) AND access = 'private' LIMIT 1`,
          [distSlug, distSlug]
        );
    const gallery = rows[0];
    if (!gallery) return next(); // not private — serve normally

    // Fast path: valid session cookie from a previous ?vt= visit
    const cookieKey = `gv_${gallery.id}`;
    try {
      if (req.cookies?.[cookieKey] && verifyViewerToken(req.cookies[cookieKey]) === gallery.id) {
        return next();
      }
    } catch {}

    // Validate ?vt= viewer token
    const rawToken = req.query.vt;
    if (rawToken) {
      const vt = await getViewerToken(rawToken);
      if (vt && (
        (vt.scope_type === 'gallery' && vt.scope_id === gallery.id) ||
        (vt.scope_type === 'project' && gallery.project_id && vt.scope_id === gallery.project_id)
      )) {
        await touchViewerToken(vt.id);
        res.cookie(cookieKey, createViewerToken(gallery.id), {
          httpOnly: true, sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000,
          secure: process.env.NODE_ENV === 'production',
        });
        return next();
      }
    }

    // No valid access — return a minimal 403 page
    return res.status(403).set('Content-Type', 'text/html; charset=utf-8').send(
      '<!doctype html><html><head><meta charset=utf-8>' +
      '<meta name=viewport content="width=device-width,initial-scale=1">' +
      '<title>Accès restreint</title>' +
      '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;' +
      'align-items:center;justify-content:center;background:#111;color:#e8e4dd;' +
      'font-family:system-ui,sans-serif}' +
      '.box{text-align:center;padding:2rem}' +
      'h1{font-size:1.1rem;font-weight:600;margin:0 0 .5rem}' +
      'p{font-size:.875rem;color:#888;margin:0}</style></head>' +
      '<body><div class=box>' +
      '<h1>Accès restreint</h1>' +
      '<p>Ce lien n&#x2019;est plus valide ou a expiré.</p>' +
      '</div></body></html>'
    );
  } catch {
    next();
  }
});

// ── Built galleries — static files (fallback when no reverse proxy in front) ──
// app.get('/') above intercepts the root before this middleware runs, so
// index: 'index.html' here only fires for /{project}/{gallery}/ paths.
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
  const indexHtml = projectPreviewPath(req.organizationId ?? null, slug);
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  next();
});

// ── Fallback for project-scoped gallery URLs whose files are at the wrong path ─
// Galleries built before the project-scoped dist_name feature were stored as
// DIST_DIR/{gallery_slug}/ (flat).  After migration the engine uses
// DIST_DIR/{project_slug}/{gallery_slug}/ but the old files remain at the flat
// path until a rebuild.  When /{project}/{gallery}/ 404s (express.static found
// nothing), look up the gallery in the DB: if its dist_name resolves to a file
// that already exists on disk, do a 302 redirect so the browser lands there.
app.get(/^\/([^/]+)\/([^/]+)\/?$/, async (req, res, next) => {
  try {
    const [projSlug, galSlug] = [req.params[0], req.params[1]];
    // Only act when the project-scoped path really doesn't exist
    const expected = path.join(DIST_DIR, projSlug, galSlug, 'index.html');
    if (fs.existsSync(expected)) return next(); // already handled upstream
    const redirectOrgId = req.organizationId ?? null;
    const [rows] = redirectOrgId
      ? await query(
          `SELECT g.dist_name, g.slug
           FROM galleries g
           JOIN projects p ON p.id = g.project_id
           WHERE (g.slug = ? OR g.dist_name = ?) AND p.slug = ? AND p.organization_id = ?
           LIMIT 1`,
          [galSlug, galSlug, projSlug, redirectOrgId]
        )
      : await query(
          `SELECT g.dist_name, g.slug
           FROM galleries g
           JOIN projects p ON p.id = g.project_id
           WHERE (g.slug = ? OR g.dist_name = ?) AND p.slug = ?
           LIMIT 1`,
          [galSlug, galSlug, projSlug]
        );
    const g = rows[0];
    if (!g) return next();
    const altDistName = g.dist_name || g.slug;
    const altIndex = path.join(DIST_DIR, altDistName, 'index.html');
    if (fs.existsSync(altIndex)) {
      // Files are at the old flat path — redirect there, preserving query string
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(302, `/${altDistName}/${qs}`);
    }
  } catch {}
  next();
});

// ── Project gallery listing — /:projectSlug/ ─────────────────────────────────
// Handles the back-button target from project-scoped gallery URLs.
app.get(/^\/([^/]+)\/?$/, async (req, res, next) => {
  const projectSlug = req.params[0];
  // Skip if a prerendered file already handled this (via the handler above)
  const indexHtml = projectPreviewPath(req.organizationId ?? null, projectSlug);
  if (fs.existsSync(indexHtml)) return next();

  const orgId = req.organizationId ?? null;
  const [projRows] = orgId
    ? await query('SELECT id, name, description, standalone_default FROM projects WHERE slug = ? AND organization_id = ? LIMIT 1', [projectSlug, orgId])
    : await query('SELECT id, name, description, standalone_default FROM projects WHERE slug = ? LIMIT 1', [projectSlug]);
  const project = projRows[0];
  if (!project) return next();
  const projectDescHtml = project.description ? marked.parse(project.description) : '';

  const [galRows] = await query(
    `SELECT g.id, g.slug, g.title, g.date, g.location, g.description, g.cover_photo, g.sort_order,
            g.primary_photographer_id, u.name AS primary_photographer_name
     FROM galleries g
     LEFT JOIN users u ON u.id = g.primary_photographer_id
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
    // Fall back to primary_photographer_id if no per-photo attribution exists
    const photographers = pgMap[g.id]?.length
      ? pgMap[g.id]
      : (g.primary_photographer_name ? [g.primary_photographer_name] : []);
    return {
      slug: g.slug, title: g.title, date: g.date, location: g.location,
      description: g.description || null,
      photographers,
      coverName, photoCount, dateRange,
    };
  }));

  const [orgRows2] = orgId
    ? await query('SELECT id, name FROM organizations WHERE id = ? LIMIT 1', [orgId])
    : await query('SELECT id, name FROM organizations WHERE is_default = 1 LIMIT 1');
  const settings = orgRows2[0] ? await getSettings(orgRows2[0].id) : null;
  const siteTitle = settings?.site_title || 'GalleryPack';
  const orgName = orgRows2[0]?.name || '';
  const token = req.cookies?.session;
  const isLoggedIn = token ? !!(await getSession(token)) : false;

  const proto2   = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl2 = process.env.BASE_URL || `${proto2}://${req.get('host')}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderProjectListing(projectSlug, project.name, galleries, siteTitle, isLoggedIn, projectDescHtml, orgName, baseUrl2, !!project.standalone_default));
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
    startCleanupCron();               // purge incomplete tus uploads hourly
    startAccessRequestCleanupCron(); // purge old access_requests daily
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
