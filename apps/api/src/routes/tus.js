// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/tus.js
//
// Single tus endpoint at /api/tus — galleryId is passed in Upload-Metadata.
//
// Client configuration (Uppy):
//   endpoint: '/api/tus'
//   allowedMetaFields: ['filename', 'galleryId']
//
// Authentication: session cookie (requireAuth middleware).
// Gallery ownership validated in onUploadCreate before any bytes are accepted.

import { Router }          from 'express';
import { requireAuth }     from '../middleware/auth.js';
import { createTusServer } from '../services/tusService.js';

// One tus server per studio context — lazily created and cached.
// Studio context is resolved from the session on each request (studioId on req).
const _tusServers = new Map();
function getTusServer(studioId) {
  if (!_tusServers.has(studioId)) {
    _tusServers.set(studioId, createTusServer(studioId));
  }
  return _tusServers.get(studioId);
}

const router = Router();
router.use(requireAuth);

const TUS_METHODS = ['OPTIONS', 'HEAD', 'POST', 'PATCH', 'DELETE'];

// Mount at /api/tus and /api/tus/:uploadId
router.all('/', handleTus);
router.all('/:uploadId', handleTus);

function handleTus(req, res) {
  if (!TUS_METHODS.includes(req.method)) {
    return res.status(405).set('Allow', TUS_METHODS.join(', ')).end();
  }
  req._tusUserId = req.userId;
  const server = getTusServer(req.organizationId);

  // Normalise URL: strip /api/tus prefix so tus-node-server sees / or /:uploadId
  req.url = req.originalUrl.replace(/^\/api\/tus/, '') || '/';

  server.handle(req, res);
}

export default router;
