// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/middleware/uploadThrottle.js
//
// Optional upload bandwidth throttling middleware.
// Applies only to PATCH requests (tus chunk writes).
// Wraps the incoming request stream with a Throttle transform.
//
// Configuration:
//   UPLOAD_MAX_BANDWIDTH_MBPS  — cap in Mbit/s, 0 = unlimited (default 0)
//   UPLOAD_THROTTLE_PROFILE    — dev | staging | production
//                                dev: unlimited, staging: 10 Mbps, production: UPLOAD_MAX_BANDWIDTH_MBPS
//
// Note: throttling is applied per-connection (per-chunk request), not globally.
// For global rate limiting use a reverse proxy (Caddy rate_limit module).

import Throttle from 'throttle';
import { logger } from '../lib/logger.js';

const PROFILE = (process.env.UPLOAD_THROTTLE_PROFILE || 'dev').toLowerCase();

function resolveLimitBytesPerSec() {
  const explicitMbps = Number(process.env.UPLOAD_MAX_BANDWIDTH_MBPS);

  if (PROFILE === 'dev') return 0;
  if (PROFILE === 'staging') return explicitMbps > 0 ? explicitMbps * 125_000 : 10 * 125_000;  // 10 Mbps default
  if (PROFILE === 'production') return explicitMbps > 0 ? explicitMbps * 125_000 : 0;
  return 0;
}

const LIMIT_BYTES_PER_SEC = resolveLimitBytesPerSec();

if (LIMIT_BYTES_PER_SEC > 0) {
  logger.info(
    { profile: PROFILE, limit_mbps: LIMIT_BYTES_PER_SEC / 125_000 },
    'Upload throttle active',
  );
}

/**
 * Express middleware — throttles incoming PATCH request bodies.
 * Must be mounted before the tus handler.
 */
export function uploadThrottle(req, res, next) {
  // Only throttle PATCH (tus chunk upload) — not OPTIONS/HEAD/POST
  if (req.method !== 'PATCH' || LIMIT_BYTES_PER_SEC === 0) return next();

  const throttle = new Throttle(LIMIT_BYTES_PER_SEC);
  req.pipe(throttle);

  // Replace req.pipe so the tus handler reads from the throttled stream
  const originalPipe = req.pipe.bind(req);
  req.pipe = (dest, opts) => {
    // tus calls req.pipe(writableStream) for PATCH — intercept and route via throttle
    return throttle.pipe(dest, opts);
  };

  // Also forward unpipe and other stream events
  req.unpipe = (dest) => throttle.unpipe(dest);

  next();
}
