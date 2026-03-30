// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/middleware/uploadChecksum.js
//
// Per-chunk Upload-Checksum verification for tus PATCH requests.
//
// @tus/server does not natively implement the checksum extension, so we
// verify the header here before the request body reaches the tus handler.
//
// Flow:
//   1. If PATCH has no Upload-Checksum header  → pass through unchanged.
//   2. If header present:
//      a. Buffer the full chunk body from the raw req stream.
//      b. Compute the declared algorithm (sha1 / sha256 / md5) over the buffer.
//      c. Mismatch → 460 Checksum Mismatch + Prometheus counter.
//      d. Match   → replace req.pipe with a PassThrough backed by the buffer
//                   so downstream middleware (throttle + tus) can consume it.
//
// Placement: must be mounted BEFORE uploadThrottle, because throttle immediately
// starts consuming req via req.pipe(throttle). Once throttle runs, the raw
// req stream is no longer available to collect.
//
// Supported algorithms (tus spec §5): sha1, sha256, sha512, md5.
// Header format:  Upload-Checksum: sha1 <base64>

import crypto       from 'node:crypto';
import { PassThrough } from 'node:stream';
import { tusChecksumMismatchTotal } from '../lib/metrics.js';
import { uploadLogger as log }      from '../lib/logger.js';

const ALGO_MAP = {
  sha1:   'sha1',
  sha256: 'sha256',
  sha512: 'sha512',
  md5:    'md5',
};

export function uploadChecksum(req, res, next) {
  const header = req.headers['upload-checksum'];

  // Only intercept PATCH with a checksum header
  if (req.method !== 'PATCH' || !header) return next();

  const spaceIdx = header.indexOf(' ');
  if (spaceIdx === -1) {
    return res.status(400).set('Content-Type', 'text/plain').end('Invalid Upload-Checksum header');
  }

  const algo     = header.slice(0, spaceIdx).toLowerCase();
  const expected = header.slice(spaceIdx + 1).trim();
  const nodeAlgo = ALGO_MAP[algo];

  if (!nodeAlgo) {
    return res.status(400).set('Content-Type', 'text/plain').end(`Unsupported checksum algorithm: ${algo}`);
  }

  // Accumulate the request body.
  // Average chunk size is VITE_UPLOAD_CHUNK_SIZE_MB (default 8 MB) — buffering is acceptable.
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('error', err => next(err));
  req.on('end', () => {
    const body   = Buffer.concat(chunks);
    const actual = crypto.createHash(nodeAlgo).update(body).digest('base64');

    if (actual !== expected) {
      tusChecksumMismatchTotal.inc();
      log.warn({ algo, url: req.url, expected, actual }, 'Upload-Checksum mismatch — PATCH rejected (460)');
      return res
        .status(460)
        .set('Content-Type', 'text/plain')
        .end('Checksum Mismatch');
    }

    // Checksum verified — replay the buffer so throttle + tus can consume it normally.
    // PassThrough buffers writes until a consumer pipes from it, so the ordering is safe.
    const replay = new PassThrough();
    replay.end(body);

    req.pipe    = (dest, opts) => replay.pipe(dest, opts);
    req.unpipe  = (dest) => replay.unpipe(dest);

    log.debug({ algo, size: body.length, url: req.url }, 'Upload-Checksum verified');
    next();
  });
}
