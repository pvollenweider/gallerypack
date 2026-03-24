// apps/api/src/index.js — GalleryPack API server entry point
import express    from 'express';
import cookieParser from 'cookie-parser';
import path       from 'path';
import { fileURLToPath } from 'url';

import { runMigrations } from './db/migrations/run.js';
import { bootstrap }     from './services/bootstrap.js';
import { errorHandler }  from './middleware/error.js';
import { rateLimit }     from './middleware/rateLimit.js';
import { getDb }         from './db/database.js';
import { createStorage } from '../../../packages/shared/src/storage/index.js';

import authRoutes      from './routes/auth.js';
import galleriesRoutes from './routes/galleries.js';
import accessRoutes    from './routes/access.js';
import photosRoutes    from './routes/photos.js';
import jobsRoutes      from './routes/jobs.js';
import invitesRoutes   from './routes/invites.js';

const __DIR     = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.PORT || 4000;
const ADMIN_DIST = process.env.ADMIN_DIST || path.join(__DIR, '../../../../apps/web/dist');

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
app.use('/api/auth',                authRoutes);
app.use('/api/galleries',           galleriesRoutes);
app.use('/api/galleries',           accessRoutes);
app.use('/api/galleries',           uploadRateLimit, photosRoutes);
app.use('/api/galleries',           jobsRoutes);
app.use('/api',                     jobsRoutes); // for /api/jobs/:jobId routes
app.use('/api/invites',             invitesRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✓  GalleryPack API listening on port ${PORT}\n`);
});

export default app;
