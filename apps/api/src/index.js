// apps/api/src/index.js — GalleryPack API server entry point
import express    from 'express';
import cookieParser from 'cookie-parser';
import path       from 'path';
import fs         from 'fs';
import { fileURLToPath } from 'url';

import { runMigrations } from './db/migrations/run.js';
import { bootstrap }     from './services/bootstrap.js';
import { errorHandler }  from './middleware/error.js';
import { rateLimit }     from './middleware/rateLimit.js';
import { getDb }         from './db/database.js';
import { createStorage } from '../../../packages/shared/src/storage/index.js';

import authRoutes        from './routes/auth.js';
import galleriesRoutes   from './routes/galleries.js';
import accessRoutes      from './routes/access.js';
import photosRoutes      from './routes/photos.js';
import jobsRoutes        from './routes/jobs.js';
import invitesRoutes     from './routes/invites.js';
import invitationsRouter from './routes/invitations.js';
import publicRoutes, { getPublicGalleries } from './routes/public.js';
import { renderLanding } from './views/landing.js';
import settingsRoutes from './routes/settings.js';
import studiosRoutes  from './routes/studios.js';
import { getSettings, getSession } from './db/helpers.js';

const __DIR      = path.dirname(fileURLToPath(import.meta.url));
const PORT       = process.env.PORT || 4000;
const ADMIN_DIST = process.env.ADMIN_DIST || path.join(__DIR, '../../../../apps/web/dist');
// Gallery dist dir — served as static files when no reverse proxy (Caddy) is in front
const DIST_DIR   = process.env.DIST_DIR   || path.join(__DIR, '../../../../dist');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
runMigrations();
bootstrap();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Rate limiters ─────────────────────────────────────────────────────────────
const uploadRateLimit = rateLimit({ windowMs: 60_000, max: 100 }); // 100 req/min per IP on upload

// ── Health (must be registered before the catch-all /api router) ──────────────
const _storage = createStorage();
app.get('/api/health', async (req, res) => {
  const checks = { ok: true, version: process.env.npm_package_version || '0.0.1' };

  // DB check
  try {
    getDb().prepare('SELECT 1').get();
    checks.db = 'connected';
  } catch (e) {
    checks.db  = 'error';
    checks.ok  = false;
  }

  // Storage check
  try {
    await _storage.exists('__health');
    checks.storage = 'ok';
  } catch (e) {
    checks.storage = 'error';
    checks.ok      = false;
  }

  // Worker liveness: check for a recently enqueued/running job as proxy
  try {
    const recent = getDb()
      .prepare("SELECT COUNT(*) as n FROM build_jobs WHERE status IN ('queued','running') AND created_at > ?")
      .get(Date.now() - 5 * 60_000);
    checks.worker = recent.n > 0 ? 'running' : 'idle';
  } catch {
    checks.worker = 'unknown';
  }

  res.status(checks.ok ? 200 : 503).json(checks);
});

// ── Admin SPA (served before API routes) ─────────────────────────────────────
app.use('/admin', express.static(ADMIN_DIST));
app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(path.join(ADMIN_DIST, 'index.html')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/public',              publicRoutes);           // no auth — must be before /api catch-all
app.use('/api/settings',            settingsRoutes);
app.use('/api/auth',                authRoutes);
app.use('/api/galleries',           galleriesRoutes);
app.use('/api/galleries',           accessRoutes);
app.use('/api/galleries',           uploadRateLimit, photosRoutes);
app.use('/api/galleries',           jobsRoutes);
app.use('/api/jobs',                jobsRoutes); // for /api/jobs/:jobId and /api/jobs/:jobId/stream
app.use('/api/invites',             invitesRoutes);
app.use('/api/invitations',         invitationsRouter);
app.use('/api/studios',             studiosRoutes);

// ── Built galleries — static files (fallback when no reverse proxy in front) ──
// Serves /dist/<slug>/* as static files and falls back to index.html for SPA routing.
app.use(express.static(DIST_DIR, { index: 'index.html' }));
app.get(/^\/([^/]+)\/?$/, (req, res, next) => {
  const slug    = req.params[0];
  const indexHtml = path.join(DIST_DIR, slug, 'index.html');
  if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
  next();
});

// ── Public gallery listing (served when Caddy falls back for missing /index.html) ──
app.get('/', (req, res) => {
  const galleries  = getPublicGalleries();
  const studioRow  = getDb().prepare('SELECT id FROM studios LIMIT 1').get();
  const settings   = studioRow ? getSettings(studioRow.id) : null;
  const siteTitle  = settings?.site_title || 'GalleryPack';
  const token      = req.cookies?.session;
  const isLoggedIn = token ? !!getSession(token) : false;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderLanding(galleries, siteTitle, isLoggedIn));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✓  GalleryPack API listening on port ${PORT}\n`);
});

export default app;
