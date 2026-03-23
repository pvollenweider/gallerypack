#!/usr/bin/env node
/**
 * GalleryPack v2 — server/app.js
 *
 * Express server combining the static gallery viewer with a web upload UI.
 *
 * Routes:
 *   GET  /                         → site index (dist/index.html)
 *   GET  /new                      → direct gallery creation form (admin shortcut)
 *   GET  /upload/:token            → photographer invite form
 *   POST /api/upload/:token        → create gallery via invite link
 *   POST /api/galleries            → create gallery (direct, admin use)
 *   GET  /api/galleries/:id        → job status (JSON)
 *   GET  /api/galleries/:id/stream → SSE build log stream
 *   GET  /status/:id               → status page (HTML)
 *   GET  /admin                    → admin SPA
 *   POST /api/admin/login          → admin authentication
 *   GET  /api/admin/galleries      → list all galleries
 *   PATCH  /api/admin/galleries/:id → update gallery + rebuild
 *   DELETE /api/admin/galleries/:id → delete gallery
 *   GET  /api/admin/invites        → list invite links
 *   POST /api/admin/invites        → create invite link
 *   DELETE /api/admin/invites/:token → revoke invite
 *   GET  /*                        → serve dist/ static files
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
  updateJob, deleteJob, resetJobForRebuild,
} from './jobs.js';
import { slugify } from '../build/utils.js';
import {
  checkPassword, createSessionToken, verifySessionToken, requireAdmin,
} from './auth.js';
import {
  createInvite, getInvite, allInvites, deleteInvite, incrementUsage,
} from './invites.js';
import { notifyGalleryReady, notifyInviteCreated } from './mailer.js';
import { getSetting, getSettings, saveSettings } from './settings.js';

const __DIR   = path.dirname(fileURLToPath(import.meta.url));

// ── Helper: verify photographer token ────────────────────────────────────────
function getJobByToken(jobId, token) {
  const job = getJob(jobId);
  if (!job || !token || job.photographerToken !== token) return null;
  return job;
}
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

// ── Admin static pages ────────────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__DIR, 'public', 'admin')));
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__DIR, 'public', 'admin', 'index.html')));

// ── Photographer invite page ──────────────────────────────────────────────────
app.get('/upload/:token', (req, res) => {
  const invite = getInvite(req.params.token);
  if (!invite) {
    return res.status(404).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Invalid link</title>
<style>body{background:#0d0d0d;color:#e8e8e8;font-family:sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center}.box h1{color:#e05555;font-size:20px;margin-bottom:8px}
.box p{color:#666;font-size:14px}</style></head>
<body><div class="box"><h1>Invalid or expired link</h1>
<p>This upload link is not valid. Please contact the gallery administrator.</p>
</div></body></html>`);
  }
  // Inject token and invite data as JS globals before serving the page
  const html = fs.readFileSync(path.join(__DIR, 'public', 'upload', 'index.html'), 'utf8');
  const inviteData = { ...invite };
  delete inviteData.token; // don't expose raw token in page source, it's already in the URL
  const injected = html.replace(
    '</head>',
    `<script>window.INVITE_TOKEN = ${JSON.stringify(req.params.token)};window.INVITE_DATA = ${JSON.stringify(inviteData)};</script>\n</head>`
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(injected);
});

// ── Photographer gallery management page ──────────────────────────────────────
app.use('/my-gallery', express.static(path.join(__DIR, 'public', 'my-gallery')));
app.get('/my-gallery/:jobId', (req, res) =>
  res.sendFile(path.join(__DIR, 'public', 'my-gallery', 'index.html')));

// ── Upload form (admin shortcut) ──────────────────────────────────────────────
app.use('/new', express.static(path.join(__DIR, 'public', 'new')));

// ── Status page ───────────────────────────────────────────────────────────────
app.use('/status', express.static(path.join(__DIR, 'public', 'status')));
app.get('/status/:id', (req, res) =>
  res.sendFile(path.join(__DIR, 'public', 'status', 'index.html')));

// ── Admin auth ────────────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  // Always delay slightly to blunt brute-force
  await new Promise(r => setTimeout(r, 50));
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ token: createSessionToken() });
});

// ── Admin: invite management ──────────────────────────────────────────────────
app.get('/api/admin/invites', requireAdmin, (req, res) => {
  res.json({ invites: allInvites() });
});

app.post('/api/admin/invites', requireAdmin, (req, res) => {
  const { label = '', ...prefill } = req.body;
  const invite    = createInvite(label, prefill);
  const uploadUrl = `${BASE_URL}/upload/${invite.token}`;
  // Fire-and-forget invite email
  if (invite.photographerEmail) {
    notifyInviteCreated({
      uploadUrl,
      photographerEmail: invite.photographerEmail,
      photographerName:  invite.photographerName,
      label:             invite.label,
    }).catch(() => {});
  }
  res.status(201).json({ invite, uploadUrl });
});

app.delete('/api/admin/invites/:token', requireAdmin, (req, res) => {
  if (!deleteInvite(req.params.token)) {
    return res.status(404).json({ error: 'Invite not found' });
  }
  res.json({ ok: true });
});

// ── Admin: settings ───────────────────────────────────────────────────────────
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const s = getSettings();
  // Redact password in response
  const safe = { ...s };
  if (safe.smtpPass) safe.smtpPass = '••••••••';
  res.json({ settings: safe });
});

app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  const allowed = ['smtpHost','smtpPort','smtpSecure','smtpUser','smtpPass','smtpFrom','adminEmail','appName'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  // Don't overwrite password if placeholder sent
  if (updates.smtpPass === '••••••••') delete updates.smtpPass;
  saveSettings(updates);
  res.json({ ok: true });
});

app.post('/api/admin/settings/test-email', requireAdmin, async (req, res) => {
  const adminEmail = getSetting('adminEmail');
  if (!adminEmail) return res.status(400).json({ error: 'No admin email configured in settings.' });
  const { sendMail } = await import('./mailer.js');
  const ok = await sendMail({
    to:      adminEmail,
    subject: 'GalleryPack — SMTP test',
    html:    '<p>SMTP is configured correctly. This is a test email from GalleryPack.</p>',
    text:    'SMTP is configured correctly. This is a test email from GalleryPack.',
  });
  if (ok) res.json({ ok: true });
  else res.status(500).json({ error: 'Failed to send email. Check SMTP settings and logs.' });
});

// ── Admin: gallery management ─────────────────────────────────────────────────
app.get('/api/admin/galleries', requireAdmin, (req, res) => {
  const galleries = allJobs().map(job => {
    const cfgPath = path.join(SRC, job.slug, 'gallery.config.json');
    let config = null;
    try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).project; } catch (_) {}
    return { ...job, config };
  });
  res.json({ galleries });
});

app.patch('/api/admin/galleries/:jobId', requireAdmin, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const {
    title, photographerName, photographerEmail,
    locale, access, password,
    allowDownloadImage, allowDownloadGallery,
  } = req.body;

  // 1. Update job metadata
  const metaUpdate = {};
  if (title             !== undefined) metaUpdate.title             = title;
  if (photographerName  !== undefined) metaUpdate.photographerName  = photographerName;
  if (photographerEmail !== undefined) metaUpdate.photographerEmail = photographerEmail;
  if (Object.keys(metaUpdate).length) updateJob(job.id, metaUpdate);

  // 2. Update gallery.config.json (if gallery still exists on disk)
  const cfgPath = path.join(SRC, job.slug, 'gallery.config.json');
  let needsRebuild = false;
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (title)  { cfg.project.title = title; needsRebuild = true; }
    if (locale) { cfg.project.locale = locale; needsRebuild = true; }
    if (access === 'public') {
      delete cfg.project.access;
      delete cfg.project.password;
      needsRebuild = true;
    } else if (access === 'password') {
      cfg.project.access = 'password';
      if (password?.trim()) cfg.project.password = password.trim();
      needsRebuild = true;
    }
    if (allowDownloadImage   !== undefined) {
      cfg.project.allowDownloadImage   = allowDownloadImage === true || allowDownloadImage === 'true';
      needsRebuild = true;
    }
    if (allowDownloadGallery !== undefined) {
      cfg.project.allowDownloadGallery = allowDownloadGallery === true || allowDownloadGallery === 'true';
      needsRebuild = true;
    }
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  }

  // 3. Trigger rebuild if config changed
  if (needsRebuild) {
    resetJobForRebuild(job.id);
    setImmediate(() => runBuild(job.id, job.slug));
    return res.status(202).json({
      job: getJob(job.id),
      rebuilding: true,
      statusUrl: `/status/${job.id}`,
    });
  }

  res.json({ job: getJob(job.id), rebuilding: false });
});

app.delete('/api/admin/galleries/:jobId', requireAdmin, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Remove source + built output
  try { fs.rmSync(path.join(SRC,  job.slug), { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(path.join(DIST, job.slug), { recursive: true, force: true }); } catch (_) {}

  deleteJob(job.id);
  res.json({ ok: true });
});

// ── API: photographer gallery management ──────────────────────────────────────

// GET gallery info
app.get('/api/my-gallery/:jobId', (req, res) => {
  const token = req.query.token;
  const job   = getJobByToken(req.params.jobId, token);
  if (!job) return res.status(401).json({ error: 'Invalid link' });

  // List photos in src/<slug>/photos/
  let photos = [];
  const photosDir = path.join(SRC, job.slug, 'photos');
  try {
    photos = fs.readdirSync(photosDir)
      .filter(f => /\.(jpe?g|png|tiff?|heic|heif|avif|webp)$/i.test(f))
      .sort();
  } catch (_) {}

  // Read config for metadata
  const cfgPath = path.join(SRC, job.slug, 'gallery.config.json');
  let config = null;
  try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).project; } catch (_) {}

  res.json({ job: { ...job, photographerToken: undefined }, photos, config });
});

// DELETE a photo
app.delete('/api/my-gallery/:jobId/photos/:filename', (req, res) => {
  const token = req.query.token;
  const job   = getJobByToken(req.params.jobId, token);
  if (!job) return res.status(401).json({ error: 'Invalid link' });

  // Sanitize filename — no path traversal
  const filename = path.basename(req.params.filename);
  const photoPath = path.join(SRC, job.slug, 'photos', filename);
  if (!fs.existsSync(photoPath)) return res.status(404).json({ error: 'Photo not found' });

  try {
    fs.unlinkSync(photoPath);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // Trigger rebuild
  resetJobForRebuild(job.id);
  setImmediate(() => runBuild(job.id, job.slug));
  res.json({ ok: true, rebuilding: true });
});

// POST add photos
app.post('/api/my-gallery/:jobId/photos', upload.array('photos'), (req, res) => {
  const token = req.query.token;
  const job   = getJobByToken(req.params.jobId, token);
  if (!job) {
    // Clean up uploaded temp files
    for (const f of (req.files || [])) { try { fs.unlinkSync(f.path); } catch (_) {} }
    return res.status(401).json({ error: 'Invalid link' });
  }

  const photosDir = path.join(SRC, job.slug, 'photos');
  if (!fs.existsSync(photosDir)) {
    for (const f of (req.files || [])) { try { fs.unlinkSync(f.path); } catch (_) {} }
    return res.status(404).json({ error: 'Gallery source not found' });
  }

  for (const file of (req.files || [])) {
    const dest = path.join(photosDir, file.originalname);
    fs.copyFileSync(file.path, dest);
    fs.unlinkSync(file.path);
  }

  resetJobForRebuild(job.id);
  setImmediate(() => runBuild(job.id, job.slug));
  res.json({ ok: true, added: req.files?.length || 0, rebuilding: true });
});

// PATCH gallery metadata
app.patch('/api/my-gallery/:jobId', (req, res) => {
  const token = req.query.token;
  const job   = getJobByToken(req.params.jobId, token);
  if (!job) return res.status(401).json({ error: 'Invalid link' });

  const cfgPath = path.join(SRC, job.slug, 'gallery.config.json');
  if (!fs.existsSync(cfgPath)) return res.status(404).json({ error: 'Gallery config not found' });

  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { title, location } = req.body;
  let changed = false;
  if (title?.trim())          { cfg.project.title    = title.trim();    changed = true; }
  if (location !== undefined) { cfg.project.location = location.trim() || undefined; changed = true; }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

  if (title?.trim()) updateJob(job.id, { title: title.trim() });

  if (changed) {
    resetJobForRebuild(job.id);
    setImmediate(() => runBuild(job.id, job.slug));
    return res.status(202).json({ ok: true, rebuilding: true });
  }
  res.json({ ok: true, rebuilding: false });
});

// ── API: create gallery via invite link ───────────────────────────────────────
app.post('/api/upload/:token', upload.array('photos'), async (req, res) => {
  const invite = getInvite(req.params.token);
  if (!invite) {
    return res.status(401).json({ error: 'Invalid or expired invite link' });
  }
  if (invite.singleDelivery && invite.usageCount > 0) {
    return res.status(409).json({ error: 'This invite link has already been used.' });
  }
  return handleGalleryCreate(req, res, {
    photographerName:  req.body.photographerName,
    photographerEmail: req.body.photographerEmail,
    inviteToken:       req.params.token,
  });
});

// ── API: create gallery (direct / admin) ──────────────────────────────────────
app.post('/api/galleries', upload.array('photos'), async (req, res) => {
  return handleGalleryCreate(req, res, {});
});

// ── Shared gallery creation logic ─────────────────────────────────────────────
async function handleGalleryCreate(req, res, extra = {}) {
  const { title, author, date, locale, access, password,
          allowDownloadImage, allowDownloadGallery, location } = req.body;

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

  // Copy uploaded files into photos/ then remove the temp file.
  // (fs.renameSync fails across Docker volume mount boundaries — EXDEV error)
  for (const file of req.files) {
    const dest = path.join(photosDir, file.originalname);
    fs.copyFileSync(file.path, dest);
    fs.unlinkSync(file.path);
  }

  // Write gallery.config.json
  const project = { name: slug, title: title.trim() };
  if (author?.trim())  project.author = author.trim();
  if (location?.trim()) project.location = location.trim();
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

  // Store photographer email in config if provided via invite flow
  if (extra.photographerEmail?.trim()) {
    project.authorEmail = extra.photographerEmail.trim();
  }

  fs.writeFileSync(
    path.join(galDir, 'gallery.config.json'),
    JSON.stringify({ project }, null, 2) + '\n',
    'utf8'
  );

  // Create job and respond immediately
  createJob(jobId, slug, title.trim(), extra);
  if (extra.inviteToken) incrementUsage(extra.inviteToken);

  const createdJob = getJob(jobId);
  const manageUrl  = `${BASE_URL}/my-gallery/${jobId}?token=${createdJob.photographerToken}`;
  res.status(202).json({ jobId, statusUrl: `/status/${jobId}`, manageUrl });

  // Enqueue build asynchronously
  setImmediate(() => runBuild(jobId, slug));
}

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
  console.log(`     \x1b[35mhttp://localhost:${PORT}/admin\x1b[0m  ← admin panel`);
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
      // Send email notifications if SMTP configured
      const job2 = getJob(jobId);
      const manageUrl2 = `${BASE_URL}/my-gallery/${jobId}?token=${job2?.photographerToken}`;
      notifyGalleryReady({
        galleryUrl,
        galleryTitle:      job2?.title || slug,
        photographerName:  job2?.photographerName,
        photographerEmail: job2?.photographerEmail,
        manageUrl: manageUrl2,
      }).catch(() => {});
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
