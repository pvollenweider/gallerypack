/**
 * GalleryPack v2 — server/jobs.js
 *
 * In-memory job queue with JSON persistence.
 * Each job represents one gallery build triggered via the web UI.
 *
 * States: queued → building → done | error
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __DIR      = path.dirname(fileURLToPath(import.meta.url));
const JOBS_FILE  = path.join(__DIR, 'jobs.json');

// In-memory store
const jobs = new Map();

// SSE subscribers: jobId → Set of res objects
const subscribers = new Map();

// ── Persistence ───────────────────────────────────────────────────────────────

function load() {
  if (!fs.existsSync(JOBS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    for (const job of data) {
      // Mark interrupted builds as errors on restart
      if (job.status === 'queued' || job.status === 'building') {
        job.status = 'error';
        job.error  = 'Server restarted during build.';
      }
      jobs.set(job.id, job);
    }
  } catch (_) {}
}

function save() {
  const data = [...jobs.values()].slice(-100); // keep last 100
  fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

load();

// ── Public API ────────────────────────────────────────────────────────────────

export function createJob(id, slug, title) {
  const job = {
    id,
    slug,
    title,
    status:      'queued',
    log:         [],
    galleryUrl:  null,
    error:       null,
    createdAt:   new Date().toISOString(),
    completedAt: null,
  };
  jobs.set(id, job);
  save();
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function allJobs() {
  return [...jobs.values()].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt));
}

/** Append a log line and notify SSE subscribers. */
export function appendLog(id, line) {
  const job = jobs.get(id);
  if (!job) return;
  job.log.push(line);
  save();
  emit(id, 'log', { line });
}

export function setBuilding(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'building';
  save();
  emit(id, 'status', { status: 'building' });
}

export function setDone(id, galleryUrl) {
  const job = jobs.get(id);
  if (!job) return;
  job.status      = 'done';
  job.galleryUrl  = galleryUrl;
  job.completedAt = new Date().toISOString();
  save();
  emit(id, 'done', { galleryUrl });
  cleanup(id);
}

export function setError(id, message) {
  const job = jobs.get(id);
  if (!job) return;
  job.status      = 'error';
  job.error       = message;
  job.completedAt = new Date().toISOString();
  save();
  emit(id, 'error', { message });
  cleanup(id);
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

export function subscribe(id, res) {
  if (!subscribers.has(id)) subscribers.set(id, new Set());
  subscribers.get(id).add(res);

  // Send buffered log immediately so late subscribers catch up
  const job = jobs.get(id);
  if (job) {
    for (const line of job.log) {
      res.write(`event: log\ndata: ${JSON.stringify({ line })}\n\n`);
    }
    if (job.status === 'done') {
      res.write(`event: done\ndata: ${JSON.stringify({ galleryUrl: job.galleryUrl })}\n\n`);
    }
    if (job.status === 'error') {
      res.write(`event: error\ndata: ${JSON.stringify({ message: job.error })}\n\n`);
    }
  }
}

export function unsubscribe(id, res) {
  subscribers.get(id)?.delete(res);
}

function emit(id, event, data) {
  const subs = subscribers.get(id);
  if (!subs || subs.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(payload); } catch (_) {}
  }
}

function cleanup(id) {
  // Close all SSE connections for this job after a short delay
  setTimeout(() => {
    const subs = subscribers.get(id);
    if (subs) {
      for (const res of subs) {
        try { res.end(); } catch (_) {}
      }
      subscribers.delete(id);
    }
  }, 500);
}
