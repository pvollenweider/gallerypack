// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/jobs.js — build job queue + SSE progress stream
import { Router } from 'express';
import { query }  from '../db/database.js';
import { createJob, getJob, listJobs, getEvents, audit } from '../db/helpers.js';
import { requireAuth } from '../middleware/auth.js';
import { can } from '../authorization/index.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function jobToJson(row) {
  if (!row) return null;
  return {
    id:          row.id,
    galleryId:   row.gallery_id,
    studioId:    row.studio_id,
    status:      row.status,
    triggeredBy: row.triggered_by,
    force:       !!row.force,
    startedAt:   row.started_at,
    finishedAt:  row.finished_at,
    errorMsg:    row.error_msg,
    createdAt:   row.created_at,
  };
}

// ── POST /api/galleries/:id/build — enqueue a build ──────────────────────────
router.post('/:id/build', async (req, res) => {
  const [galleryRows] = await query(
    'SELECT * FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  const gallery = galleryRows[0];
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
  if (!can(req.user, 'publish', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Prevent duplicate queued builds for the same gallery
  const [runningRows] = await query(
    "SELECT COUNT(*) AS n FROM build_jobs WHERE studio_id = ? AND gallery_id = ? AND status IN ('queued','running')",
    [req.studioId, gallery.id]
  );
  if (runningRows[0].n >= 1) {
    return res.status(429).json({ error: 'A build for this gallery is already queued or running.' });
  }

  const { force = false } = req.body || {};
  const job = await createJob({
    galleryId:   gallery.id,
    studioId:    req.studioId,
    triggeredBy: req.user.id,
    force,
  });

  try { await audit(req.studioId, req.userId, 'gallery.build_triggered', 'gallery', gallery.id, { jobId: job.id, force }); } catch {}
  res.status(202).json(jobToJson(job));
});

// ── GET /api/galleries/:id/jobs — list recent jobs ───────────────────────────
router.get('/:id/jobs', async (req, res) => {
  const [galleryRows] = await query(
    'SELECT id FROM galleries WHERE id = ? AND studio_id = ?',
    [req.params.id, req.studioId]
  );
  if (!galleryRows[0]) return res.status(404).json({ error: 'Gallery not found' });

  const jobs = await listJobs(galleryRows[0].id);
  res.json(jobs.map(jobToJson));
});

// ── GET /api/jobs — active jobs for the current studio ───────────────────────
router.get('/', async (req, res) => {
  const [rows] = await query(
    `SELECT id, gallery_id, status, created_at, started_at
     FROM build_jobs
     WHERE studio_id = ? AND status IN ('queued','running')
     ORDER BY created_at ASC`,
    [req.studioId]
  );
  res.json(rows.map(r => ({
    id:        r.id,
    galleryId: r.gallery_id,
    status:    r.status,
    createdAt: r.created_at,
    startedAt: r.started_at,
  })));
});

// ── GET /api/jobs/:jobId — single job ────────────────────────────────────────
router.get('/:jobId', async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job || job.studio_id !== req.studioId) return res.status(404).json({ error: 'Job not found' });
  res.json(jobToJson(job));
});

// ── GET /api/jobs/:jobId/stream — SSE live build log ─────────────────────────
// Polls build_events table every 500ms and pushes new events to the client.
// Closes the stream when the job reaches done/error status.
router.get('/:jobId/stream', async (req, res) => {
  const job = await getJob(req.params.jobId);
  if (!job || job.studio_id !== req.studioId) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  let lastSeq = 0;
  let closed  = false;

  function send(event, data) {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async function poll() {
    if (closed) return;

    const events = await getEvents(job.id, lastSeq);
    for (const ev of events) {
      send(ev.type, { seq: ev.seq, data: ev.data, ts: ev.created_at });
      lastSeq = ev.seq;
    }

    const current = await getJob(job.id);
    if (current && (current.status === 'done' || current.status === 'error')) {
      send('close', { status: current.status, errorMsg: current.error_msg });
      res.end();
      closed = true;
      return;
    }

    setTimeout(poll, 500);
  }

  req.on('close', () => { closed = true; });
  poll();
});

export default router;
