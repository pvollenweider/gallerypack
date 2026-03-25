// apps/api/src/routes/jobs.js — build job queue + SSE progress stream
import { Router } from 'express';
import { getDb }  from '../db/database.js';
import { createJob, getJob, listJobs, getEvents, getGalleryRole, audit } from '../db/helpers.js';
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
router.post('/:id/build', (req, res) => {
  const gallery = getDb()
    .prepare('SELECT * FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
  if (!can(req.user, 'publish', 'gallery', { studioRole: req.studioRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Enforce max 1 concurrent build per studio
  const running = getDb()
    .prepare("SELECT COUNT(*) as n FROM build_jobs WHERE studio_id = ? AND status IN ('queued','running')")
    .get(req.studioId);
  if (running.n >= 1) {
    return res.status(429).json({ error: 'A build is already in progress. Please wait for it to finish.' });
  }

  const { force = false } = req.body || {};
  const job = createJob({
    galleryId:   gallery.id,
    studioId:    req.studioId,
    triggeredBy: req.user.id,
    force,
  });

  try { audit(req.studioId, req.userId, 'gallery.build_triggered', 'gallery', gallery.id, { jobId: job.id, force }); } catch {}
  res.status(202).json(jobToJson(job));
});

// ── GET /api/galleries/:id/jobs — list recent jobs ───────────────────────────
router.get('/:id/jobs', (req, res) => {
  const gallery = getDb()
    .prepare('SELECT id FROM galleries WHERE id = ? AND studio_id = ?')
    .get(req.params.id, req.studioId);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  res.json(listJobs(gallery.id).map(jobToJson));
});

// ── GET /api/jobs/:jobId — single job ────────────────────────────────────────
router.get('/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job || job.studio_id !== req.studioId) return res.status(404).json({ error: 'Job not found' });
  res.json(jobToJson(job));
});

// ── GET /api/jobs/:jobId/stream — SSE live build log ─────────────────────────
// Polls build_events table every 500ms and pushes new events to the client.
// Closes the stream when the job reaches done/error status.
router.get('/:jobId/stream', (req, res) => {
  const job = getJob(req.params.jobId);
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

  function poll() {
    if (closed) return;

    const events = getEvents(job.id, lastSeq);
    for (const ev of events) {
      send(ev.type, { seq: ev.seq, data: ev.data, ts: ev.created_at });
      lastSeq = ev.seq;
    }

    const current = getJob(job.id);
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
