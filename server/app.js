#!/usr/bin/env node
/**
 * GalleryPack v2 — server/app.js
 *
 * Express server combining the static gallery viewer with a web upload UI.
 *
 * Routes:
 *   GET  /                    → site index (dist/index.html)
 *   GET  /new                 → gallery creation form
 *   POST /api/galleries       → create + enqueue build
 *   GET  /api/galleries/:id   → job status (JSON)
 *   GET  /api/galleries/:id/stream → SSE build log stream
 *   GET  /status/:id          → status page (HTML)
 *   GET  /*                   → serve dist/ static files
 *
 * Usage:
 *   npm run dev               → start server on http://localhost:3000
 */

import fs          from 'fs';
import path        from 'path';
import crypto      from 'crypto';
import { spawn }   from 'child_process';
import { fileURLToPath } from 'url';

import express from 'express';
import multer  from 'multer';

import {
  createJob, getJob, allJobs,
  appendLog, setBuilding, setDone, setError,
  subscribe, unsubscribe,
} from './jobs.js';
import { slugify } from '../build/utils.js';

const __DIR   = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__DIR, '..');
const DIST    = path.join(ROOT, 'dist');
const SRC     = path.join(ROOT, 'src');
const UPLOADS = path.join(__DIR, 'uploads');

const PORT     = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

fs.mkdirSync(UPLOADS, { recursive: true });

// ── Multer — store uploads in a temp dir keyed by fieldname+date ──────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpe?g|png|tiff?|heic|heif|avif|webp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  },
});

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Upload form ───────────────────────────────────────────────────────────────
app.use('/new', express.static(path.join(__DIR, 'public', 'new')));

// ── Status page ───────────────────────────────────────────────────────────────
app.use('/status', express.static(path.join(__DIR, 'public', 'status')));

// ── API: create gallery ───────────────────────────────────────────────────────
app.post('/api/galleries', upload.array('photos'), async (req, res) => {
  const { title, author, date, locale, access, password,
          allowDownloadImage, allowDownloadGallery } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'at least one photo is required' });
  }

  // Build gallery slug & job id
  const slug  = slugify(title) || `gallery-${Date.now()}`;
  const jobId = crypto.randomUUID();

  // Abort if slug already exists in src/
  const galDir    = path.join(SRC, slug);
  const photosDir = path.join(galDir, 'photos');
  if (fs.existsSync(galDir)) {
    return res.status(409).json({ error: `Gallery "${slug}" already exists.` });
  }

  // Create gallery scaffold
  fs.mkdirSync(photosDir, { recursive: true });

  // Move uploaded files into photos/
  for (const file of req.files) {
    const dest = path.join(photosDir, file.originalname);
    fs.renameSync(file.path, dest);
  }

  // Write gallery.config.json
  const project = { name: slug, title: title.trim() };
  if (author?.trim())  project.author = author.trim();
  if (date?.trim() && date !== 'auto') project.date = date.trim();
  else project.date = 'auto';
  project.locale = locale || 'fr';
  if (access === 'password') {
    project.access = 'password';
    if (password?.trim()) project.password = password.trim();
  }
  if (allowDownloadImage   === 'false') project.allowDownloadImage   = false;
  if (allowDownloadGallery === 'false') project.allowDownloadGallery = false;
  project.autoplay = { slideshowInterval: 3 };

  fs.writeFileSync(
    path.join(galDir, 'gallery.config.json'),
    JSON.stringify({ project }, null, 2) + '\n',
    'utf8'
  );

  // Create job and respond immediately
  createJob(jobId, slug, title.trim());
  res.status(202).json({ jobId, statusUrl: `/status/${jobId}` });

  // Enqueue build asynchronously
  setImmediate(() => runBuild(jobId, slug));
});

// ── API: job status (JSON) ────────────────────────────────────────────────────
app.get('/api/galleries/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ── API: SSE stream ───────────────────────────────────────────────────────────
app.get('/api/galleries/:id/stream', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });
  res.write(': connected\n\n');

  subscribe(req.params.id, res);

  req.on('close', () => {
    unsubscribe(req.params.id, res);
  });
});

// ── API: recent jobs list ─────────────────────────────────────────────────────
app.get('/api/galleries', (req, res) => {
  res.json(allJobs().slice(0, 20));
});

// ── Static: serve dist/ ───────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // Redirect bare gallery dirs to index.html
  app.use((req, res, next) => {
    const filePath = path.join(DIST, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      return res.sendFile(path.join(filePath, 'index.html'));
    }
    next();
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  \x1b[32m✓\x1b[0m  GalleryPack v2 server`);
  console.log(`     \x1b[1mhttp://localhost:${PORT}/\x1b[0m`);
  console.log(`     \x1b[36mhttp://localhost:${PORT}/new\x1b[0m  ← create a gallery`);
  console.log('\n  Press Ctrl+C to stop.\n');
});

// ── Build runner ──────────────────────────────────────────────────────────────

function runBuild(jobId, slug) {
  setBuilding(jobId);
  appendLog(jobId, `▶ Starting build for "${slug}"…`);

  const child = spawn('node', ['build/index.js', slug], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const clean = line => line.replace(/\x1b\[[0-9;]*m/g, '').trim();

  child.stdout.on('data', chunk => {
    for (const line of chunk.toString().split('\n')) {
      const l = clean(line);
      if (l) appendLog(jobId, l);
    }
  });

  child.stderr.on('data', chunk => {
    for (const line of chunk.toString().split('\n')) {
      const l = clean(line);
      if (l) appendLog(jobId, `⚠ ${l}`);
    }
  });

  child.on('close', code => {
    if (code === 0) {
      const galleryUrl = `${BASE_URL}/${slug}/`;
      appendLog(jobId, `✓ Build complete → ${galleryUrl}`);
      setDone(jobId, galleryUrl);
    } else {
      const msg = `Build failed (exit code ${code})`;
      appendLog(jobId, `✗ ${msg}`);
      setError(jobId, msg);
    }
  });

  child.on('error', err => {
    setError(jobId, err.message);
  });
}
