// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/queues.js
//
// BullMQ-backed persistent job queues for thumbnail generation and prerender.
// Jobs survive API restarts; failed jobs retry with exponential backoff.
//
// Queues:
//   thumbnail  — jobs { type: 'sm'|'md', srcPath, photoId }
//                priority: sm=1 (high), md=2 (low)
//   prerender  — jobs { srcPath, filename }
//                concurrency 2, delayed while uploads in-flight
//
// Graceful fallback: if Redis is unavailable at startup, queues fall back
// to the existing in-memory implementations without crashing.
//
// Redis: REDIS_URL env var (default redis://localhost:6379).

import { Queue, Worker } from 'bullmq';
import IORedis           from 'ioredis';
import { logger }        from '../lib/logger.js';
import { thumbnailQueueSize, prerenderQueueSizeGauge } from '../lib/metrics.js';

// ── Redis ──────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export let redisAvailable = false;

let _redis = null;
export function getRedisConnection() {
  if (!_redis) {
    _redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,   // required by BullMQ
      enableReadyCheck:     false,
      lazyConnect:          true,
      connectTimeout:       3000,
    });
    _redis.on('ready', () => {
      redisAvailable = true;
      logger.info({ url: REDIS_URL }, 'Redis connected — persistent queues active');
    });
    _redis.on('error', e => {
      if (redisAvailable) logger.warn({ err: e }, 'Redis error — queues may be degraded');
      redisAvailable = false;
    });
    _redis.on('close', () => { redisAvailable = false; });
  }
  return _redis;
}

// ── Queues & workers ───────────────────────────────────────────────────────────

let thumbQueue     = null;
let prerenderQueue = null;
let thumbWorker    = null;
let prerenderWorker = null;
let _activeUploads  = 0;

const THUMB_CONCURRENCY     = Number(process.env.THUMB_CONCURRENCY)     || 4;
const PRERENDER_CONCURRENCY = Number(process.env.PRERENDER_CONCURRENCY) || 2;

export async function initQueues() {
  const conn = getRedisConnection();

  // Probe Redis availability with a short timeout
  try {
    await conn.connect();
    await conn.ping();
  } catch (e) {
    logger.warn({ err: e, url: REDIS_URL }, 'Redis unreachable — falling back to in-memory queues');
    return;
  }

  // Lazily import heavy services after Redis check passes
  const { generateSingleThumbnail }   = await import('./thumbnailService.js');
  const { runPrerender }              = await import('./prerenderService.js');

  // ── Thumbnail worker ────────────────────────────────────────────────────────
  thumbQueue = new Queue('thumbnail', { connection: conn });

  thumbWorker = new Worker('thumbnail', async (job) => {
    const { type, srcPath, photoId } = job.data;
    await generateSingleThumbnail(srcPath, photoId, type);
  }, {
    connection:  conn,
    concurrency: THUMB_CONCURRENCY,
  });

  thumbWorker.on('completed', job => {
    logger.debug({ type: job.data.type, photoId: job.data.photoId }, 'thumbnail done');
    syncThumbGauge();
  });
  thumbWorker.on('failed', (job, err) => {
    logger.error({ photoId: job?.data?.photoId, err }, 'thumbnail job failed');
    syncThumbGauge();
  });

  // ── Prerender worker ────────────────────────────────────────────────────────
  prerenderQueue = new Queue('prerender', { connection: conn });

  prerenderWorker = new Worker('prerender', async (job) => {
    if (_activeUploads > 0) {
      // Defer 5 s — uploads have priority over Sharp workers
      throw new Error('uploads in flight — deferred');
    }
    await runPrerender(job.data.srcPath, job.data.filename);
  }, {
    connection:  conn,
    concurrency: PRERENDER_CONCURRENCY,
  });

  prerenderWorker.on('completed', () => syncPrerenderGauge());
  prerenderWorker.on('failed', (job, err) => {
    if (err?.message?.includes('deferred')) return;   // normal — will retry
    logger.error({ filename: job?.data?.filename, err }, 'prerender job failed');
    syncPrerenderGauge();
  });

  redisAvailable = true;
  logger.info(
    { thumbConcurrency: THUMB_CONCURRENCY, prerenderConcurrency: PRERENDER_CONCURRENCY },
    'BullMQ queues initialised',
  );
}

// ── Gauge sync ─────────────────────────────────────────────────────────────────

async function syncThumbGauge() {
  if (!thumbQueue) return;
  try {
    thumbnailQueueSize.set({ priority: 'total' },
      (await thumbQueue.getWaitingCount()) + (await thumbQueue.getActiveCount()));
  } catch {}
}

async function syncPrerenderGauge() {
  if (!prerenderQueue) return;
  try {
    prerenderQueueSizeGauge.set(
      (await prerenderQueue.getWaitingCount()) + (await prerenderQueue.getActiveCount()));
  } catch {}
}

// ── Public API — drop-in for enqueueSm / enqueueMd / enqueuePrerender ──────────
// Called from tusService and photos.js. Falls back silently if Redis is down.

export function dispatchSm(srcPath, photoId) {
  if (!redisAvailable || !thumbQueue) return false;  // caller falls back to in-memory
  thumbQueue.add('sm', { type: 'sm', srcPath, photoId },
    { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
  ).then(() => syncThumbGauge()).catch(() => {});
  return true;
}

export function dispatchMd(srcPath, photoId) {
  if (!redisAvailable || !thumbQueue) return false;
  thumbQueue.add('md', { type: 'md', srcPath, photoId },
    { priority: 2, attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
  ).then(() => syncThumbGauge()).catch(() => {});
  return true;
}

export function dispatchPrerender(srcPath, filename) {
  if (!redisAvailable || !prerenderQueue) return false;
  prerenderQueue.add('prerender', { srcPath, filename },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
  ).then(() => syncPrerenderGauge()).catch(() => {});
  return true;
}

// Upload gate — prerender worker checks this before processing
export function queueUploadStarted()  { _activeUploads++; }
export function queueUploadFinished() { if (_activeUploads > 0) _activeUploads--; }

export const thumbQueueRef     = () => thumbQueue;
export const prerenderQueueRef = () => prerenderQueue;

// Graceful shutdown
export async function closeQueues() {
  await Promise.allSettled([
    thumbWorker?.close(),
    prerenderWorker?.close(),
    thumbQueue?.close(),
    prerenderQueue?.close(),
    _redis?.quit(),
  ]);
}
