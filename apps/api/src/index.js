// apps/api/src/index.js — GalleryPack API server entry point
import express    from 'express';
import cookieParser from 'cookie-parser';
import path       from 'path';
import { fileURLToPath } from 'url';

import { runMigrations } from './db/migrations/run.js';
import { bootstrap }     from './services/bootstrap.js';
import { errorHandler }  from './middleware/error.js';

import authRoutes      from './routes/auth.js';
import galleriesRoutes from './routes/galleries.js';
import photosRoutes    from './routes/photos.js';

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT  = process.env.PORT || 4000;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
runMigrations();
bootstrap();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/galleries', galleriesRoutes);
app.use('/api/galleries', photosRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, version: process.env.npm_package_version || '0.0.1' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✓  GalleryPack API listening on port ${PORT}\n`);
});

export default app;
