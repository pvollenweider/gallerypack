// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/lib/metrics.js
//
// Prometheus metrics registry.
// Exposed at GET /metrics (plaintext Prometheus format).
// Import the metric objects where you want to record values.
//
// Metrics defined here:
//   upload_total{status}                  — tus upload completions
//   upload_bytes_total{status}            — bytes transferred
//   upload_duration_seconds               — histogram of upload durations
//   upload_file_size_bytes                — histogram of file sizes
//   thumbnail_queue_size{priority}        — current sm/md queue depth
//   prerender_queue_size                  — current prerender queue depth
//   tus_incomplete_uploads_total          — counter for uploads started but not finished
//   tus_checksum_mismatch_total           — per-chunk Upload-Checksum failures (460)
//   http_requests_total{method,route,status_code} — HTTP request counter (via pino-http hook)
//   http_request_duration_seconds{method,route}   — HTTP latency histogram

import client from 'prom-client';

// Default Node.js metrics (memory, CPU, event loop lag, GC, etc.)
client.collectDefaultMetrics({ prefix: 'gallerypack_' });

// ── Upload counters ────────────────────────────────────────────────────────────

export const uploadTotal = new client.Counter({
  name:       'gallerypack_upload_total',
  help:       'Total tus upload completions by status',
  labelNames: ['status'],  // success | failed | duplicate | rejected
});

export const uploadBytesTotal = new client.Counter({
  name:       'gallerypack_upload_bytes_total',
  help:       'Total bytes transferred for completed uploads',
  labelNames: ['status'],
});

export const uploadDuration = new client.Histogram({
  name:    'gallerypack_upload_duration_seconds',
  help:    'Upload duration from tus create to finish',
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
});

export const uploadFileSize = new client.Histogram({
  name:    'gallerypack_upload_file_size_bytes',
  help:    'File size distribution for uploaded photos',
  buckets: [
    100_000,          // 100 KB
    500_000,          // 500 KB
    1_000_000,        // 1 MB
    5_000_000,        // 5 MB
    10_000_000,       // 10 MB
    25_000_000,       // 25 MB
    50_000_000,       // 50 MB
    100_000_000,      // 100 MB
  ],
});

// ── Queue gauges ───────────────────────────────────────────────────────────────

export const thumbnailQueueSize = new client.Gauge({
  name:       'gallerypack_thumbnail_queue_size',
  help:       'Current thumbnail queue depth',
  labelNames: ['priority'],  // sm | md
});

export const prerenderQueueSizeGauge = new client.Gauge({
  name: 'gallerypack_prerender_queue_size',
  help: 'Current prerender queue depth',
});

// ── tus upload lifecycle ───────────────────────────────────────────────────────

export const tusChecksumMismatchTotal = new client.Counter({
  name: 'gallerypack_tus_checksum_mismatch_total',
  help: 'Number of tus PATCH requests rejected due to Upload-Checksum mismatch',
});

export const tusIncompleteUploads = new client.Gauge({
  name: 'gallerypack_tus_incomplete_uploads',
  help: 'Number of tus uploads started but not yet finished',
});

// ── HTTP metrics ───────────────────────────────────────────────────────────────

export const httpRequestsTotal = new client.Counter({
  name:       'gallerypack_http_requests_total',
  help:       'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestDuration = new client.Histogram({
  name:       'gallerypack_http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// ── Registry ───────────────────────────────────────────────────────────────────

export const registry = client.register;
