// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/lib/sentry.js
//
// Sentry initialisation for the API.
// No-ops gracefully if SENTRY_DSN is not set.

import * as Sentry from '@sentry/node';
import { logger }  from './logger.js';

const DSN     = process.env.SENTRY_DSN;
const RELEASE = process.env.SENTRY_RELEASE || process.env.npm_package_version || '0.0.1';
const ENV     = process.env.NODE_ENV || 'production';

export function initSentry() {
  if (!DSN) {
    logger.debug('Sentry DSN not set — error tracking disabled');
    return;
  }
  Sentry.init({
    dsn:         DSN,
    release:     RELEASE,
    environment: ENV,
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,
    // Don't capture noisy 4xx client errors — only server errors
    beforeSend(event) {
      const status = event.contexts?.response?.status_code;
      if (status && status < 500) return null;
      return event;
    },
  });
  logger.info({ release: RELEASE, env: ENV }, 'Sentry initialised');
}

// Express error handler — call after all routes
export const sentryErrorHandler = Sentry.expressErrorHandler?.() ?? ((_err, _req, _res, next) => next(_err));
