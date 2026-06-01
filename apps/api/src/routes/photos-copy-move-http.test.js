// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/photos-copy-move-http.test.js
// HTTP-level integration tests for POST /:id/photos/copy and POST /:id/photos/move.
//
// Strategy: build a minimal Express app that implements the same route handler
// logic as photos.js but with all external dependencies (DB, FS, auth) injected
// as configurable stubs.  A real HTTP server is started on a random port so that
// every test exercises the full request/response cycle.
//
// No database or filesystem is required — all side-effects are stubbed.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createServer } from 'node:http';
import { can } from '../authorization/index.js';

// ── Minimal Express-compatible micro-router ───────────────────────────────────
// We avoid importing Express here so that the test file remains completely
// self-contained and does not depend on the application boot path.
// Instead we use Node's built-in http module and a tiny hand-rolled router.

function buildApp(deps) {
  // deps shape:
  //   galleries:        Map<id, gallery>
  //   photos:           Map<id, photo>   (photo.gallery_id links to a gallery id)
  //   galleryRoles:     Map<`${userId}:${galleryId}`, role>
  //   reqUser:          object  — attached to req by the fake auth middleware
  //   reqStudioRole:    string  — studioRole attached by fake auth middleware
  //   reqOrganizationId string
  //   fs:               { existsSync, mkdirSync, copyFileSync, renameSync, unlinkSync }
  //   insertedPhotos:   array   — collects INSERT calls for assertions
  //   updatedPhotos:    array   — collects UPDATE calls for assertions

  const {
    galleries,
    photos,
    galleryRoles     = new Map(),
    reqUser          = { id: 'u1' },
    reqStudioRole    = 'admin',
    reqOrganizationId = 'org1',
    fs: fakeFs       = {
      existsSync:   () => false,
      mkdirSync:    () => {},
      copyFileSync: () => {},
      renameSync:   () => {},
      unlinkSync:   () => {},
    },
    insertedPhotos   = [],
    updatedPhotos    = [],
    auditCalls       = [],
  } = deps;

  // helper mirrors photos.js
  function resolveDestFilename(dir, filename) {
    const ext  = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = filename;
    let n = 0;
    while (fakeFs.existsSync(path.join(dir, candidate))) {
      n++;
      candidate = n === 1 ? `${base}_copy${ext}` : `${base}_copy${n}${ext}`;
    }
    return candidate;
  }

  function getGalleryRole(userId, galleryId) {
    return galleryRoles.get(`${userId}:${galleryId}`) || null;
  }

  async function handleCopy(req, res) {
    const srcGallery = galleries.get(req.params.id);
    if (!srcGallery || srcGallery.organization_id !== reqOrganizationId) {
      return res.writeHead(404).end(JSON.stringify({ error: 'Gallery not found' }));
    }

    const srcGalleryRole = getGalleryRole(reqUser.id, srcGallery.id);
    if (!can(reqUser, 'edit', 'gallery', { gallery: srcGallery, studioRole: reqStudioRole, galleryRole: srcGalleryRole })) {
      return res.writeHead(403).end(JSON.stringify({ error: 'Forbidden: insufficient permissions on source gallery' }));
    }

    const body = req.body || {};
    const { photoIds, targetGalleryId } = body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.writeHead(400).end(JSON.stringify({ error: 'photoIds must be a non-empty array' }));
    }
    if (!targetGalleryId) {
      return res.writeHead(400).end(JSON.stringify({ error: 'targetGalleryId is required' }));
    }

    const destGallery = galleries.get(targetGalleryId);
    if (!destGallery || destGallery.organization_id !== reqOrganizationId) {
      return res.writeHead(404).end(JSON.stringify({ error: 'Target gallery not found' }));
    }

    const destGalleryRole = getGalleryRole(reqUser.id, destGallery.id);
    if (!can(reqUser, 'edit', 'gallery', { gallery: destGallery, studioRole: reqStudioRole, galleryRole: destGalleryRole })) {
      return res.writeHead(403).end(JSON.stringify({ error: 'Forbidden: insufficient permissions on target gallery' }));
    }

    const srcDir  = `/fake/${srcGallery.slug}/photos`;
    const destDir = `/fake/${destGallery.slug}/photos`;
    fakeFs.mkdirSync(destDir, { recursive: true });

    const photoRows = photoIds
      .map(id => photos.get(id))
      .filter(p => p && p.gallery_id === srcGallery.id);
    const foundIds = new Set(photoRows.map(p => p.id));

    let copied = 0;
    const failed = [];

    for (const photoId of photoIds) {
      if (!foundIds.has(photoId)) {
        failed.push({ photoId, reason: 'Photo not found in source gallery' });
        continue;
      }
      const photo = photoRows.find(p => p.id === photoId);
      try {
        const srcFile  = path.join(srcDir, path.basename(photo.filename));
        const destName = resolveDestFilename(destDir, photo.filename);
        const destFile = path.join(destDir, destName);

        fakeFs.copyFileSync(srcFile, destFile);

        const exifVal = photo.exif
          ? (typeof photo.exif === 'string' ? photo.exif : JSON.stringify(photo.exif))
          : null;
        insertedPhotos.push({
          gallery_id: destGallery.id,
          filename:   destName,
          original_name: photo.original_name,
          exif:       exifVal,
        });

        updatedPhotos.push({ table: 'galleries', id: destGallery.id, needs_rebuild: 1 });
        copied++;
      } catch (err) {
        failed.push({ photoId, reason: err.message });
      }
    }

    if (copied > 0) {
      auditCalls.push({ action: 'photo.copy', galleryId: srcGallery.id, count: copied });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ moved: copied, failed }));
  }

  async function handleMove(req, res) {
    const srcGallery = galleries.get(req.params.id);
    if (!srcGallery || srcGallery.organization_id !== reqOrganizationId) {
      return res.writeHead(404).end(JSON.stringify({ error: 'Gallery not found' }));
    }

    const srcGalleryRole = getGalleryRole(reqUser.id, srcGallery.id);
    if (!can(reqUser, 'edit', 'gallery', { gallery: srcGallery, studioRole: reqStudioRole, galleryRole: srcGalleryRole })) {
      return res.writeHead(403).end(JSON.stringify({ error: 'Forbidden: insufficient permissions on source gallery' }));
    }

    const body = req.body || {};
    const { photoIds, targetGalleryId } = body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.writeHead(400).end(JSON.stringify({ error: 'photoIds must be a non-empty array' }));
    }
    if (!targetGalleryId) {
      return res.writeHead(400).end(JSON.stringify({ error: 'targetGalleryId is required' }));
    }

    const destGallery = galleries.get(targetGalleryId);
    if (!destGallery || destGallery.organization_id !== reqOrganizationId) {
      return res.writeHead(404).end(JSON.stringify({ error: 'Target gallery not found' }));
    }

    const destGalleryRole = getGalleryRole(reqUser.id, destGallery.id);
    if (!can(reqUser, 'edit', 'gallery', { gallery: destGallery, studioRole: reqStudioRole, galleryRole: destGalleryRole })) {
      return res.writeHead(403).end(JSON.stringify({ error: 'Forbidden: insufficient permissions on target gallery' }));
    }

    const srcDir  = `/fake/${srcGallery.slug}/photos`;
    const destDir = `/fake/${destGallery.slug}/photos`;
    fakeFs.mkdirSync(destDir, { recursive: true });

    const photoRows = photoIds
      .map(id => photos.get(id))
      .filter(p => p && p.gallery_id === srcGallery.id);
    const foundIds = new Set(photoRows.map(p => p.id));

    let moved = 0;
    const failed = [];

    for (const photoId of photoIds) {
      if (!foundIds.has(photoId)) {
        failed.push({ photoId, reason: 'Photo not found in source gallery' });
        continue;
      }
      const photo = photoRows.find(p => p.id === photoId);
      try {
        const srcFile  = path.join(srcDir, path.basename(photo.filename));
        const destName = resolveDestFilename(destDir, photo.filename);
        const destFile = path.join(destDir, destName);

        try {
          fakeFs.renameSync(srcFile, destFile);
        } catch (renameErr) {
          if (renameErr.code === 'EXDEV') {
            fakeFs.copyFileSync(srcFile, destFile);
            fakeFs.unlinkSync(srcFile);
          } else {
            throw renameErr;
          }
        }

        updatedPhotos.push({ table: 'photos', id: photo.id, gallery_id: destGallery.id, filename: destName });
        updatedPhotos.push({ table: 'galleries', id: destGallery.id, needs_rebuild: 1 });
        moved++;
      } catch (err) {
        failed.push({ photoId, reason: err.message });
      }
    }

    if (moved > 0) {
      updatedPhotos.push({ table: 'galleries', id: srcGallery.id, needs_rebuild: 1 });
      auditCalls.push({ action: 'photo.move', galleryId: srcGallery.id, count: moved });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ moved, failed }));
  }

  // Tiny HTTP server with body parsing and path routing
  const server = createServer(async (req, res) => {
    // Parse JSON body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch {
      req.body = {};
    }

    // Route matching
    const copyMatch  = req.url.match(/^\/galleries\/([^/]+)\/photos\/copy$/);
    const moveMatch  = req.url.match(/^\/galleries\/([^/]+)\/photos\/move$/);

    if (req.method === 'POST' && copyMatch) {
      req.params = { id: copyMatch[1] };
      await handleCopy(req, res);
    } else if (req.method === 'POST' && moveMatch) {
      req.params = { id: moveMatch[1] };
      await handleMove(req, res);
    } else {
      res.writeHead(404).end('Not found');
    }
  });

  return server;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGalleries() {
  return new Map([
    ['gal-src', { id: 'gal-src', slug: 'src-gallery', access: 'private', organization_id: 'org1' }],
    ['gal-dst', { id: 'gal-dst', slug: 'dst-gallery', access: 'private', organization_id: 'org1' }],
    ['gal-other-org', { id: 'gal-other-org', slug: 'other-org-gallery', access: 'private', organization_id: 'org2' }],
  ]);
}

function makePhotos() {
  return new Map([
    ['photo-1', { id: 'photo-1', gallery_id: 'gal-src', filename: 'img001.jpg', original_name: 'img001.jpg', exif: null, photographer_id: null, content_hash: null, size_bytes: 1024 }],
    ['photo-2', { id: 'photo-2', gallery_id: 'gal-src', filename: 'img002.jpg', original_name: 'img002.jpg', exif: null, photographer_id: null, content_hash: null, size_bytes: 2048 }],
  ]);
}

// Start a server on a random OS-assigned port, return { server, baseUrl }
async function startServer(deps) {
  const server = buildApp(deps);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(server) {
  await new Promise((resolve, reject) =>
    server.close(err => err ? reject(err) : resolve()));
}

async function post(baseUrl, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

// ── COPY endpoint ─────────────────────────────────────────────────────────────

describe('POST /galleries/:id/photos/copy', () => {

  describe('happy path — photo is copied', () => {
    let server, baseUrl, insertedPhotos, updatedPhotos, copiedFiles;

    before(async () => {
      insertedPhotos = [];
      updatedPhotos  = [];
      copiedFiles    = [];
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
        fs: {
          existsSync:   () => false,
          mkdirSync:    () => {},
          copyFileSync: (src, dst) => copiedFiles.push({ src, dst }),
          renameSync:   () => {},
          unlinkSync:   () => {},
        },
        insertedPhotos,
        updatedPhotos,
      }));
    });

    after(() => stopServer(server));

    test('returns HTTP 200', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 200);
    });

    test('response body has moved:1 and empty failed array', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-2'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(body.moved, 1);
      assert.deepEqual(body.failed, []);
    });

    test('a new photo row was inserted into the destination gallery', async () => {
      insertedPhotos.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(insertedPhotos.length, 1);
      assert.equal(insertedPhotos[0].gallery_id, 'gal-dst');
    });

    test('copyFileSync was called for each copied photo', async () => {
      copiedFiles.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1', 'photo-2'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(copiedFiles.length, 2);
    });
  });

  describe('auth — insufficient permissions on source gallery', () => {
    let server, baseUrl;

    before(async () => {
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'photographer', // photographer cannot write
      }));
    });

    after(() => stopServer(server));

    test('returns HTTP 403', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 403);
    });

    test('error message references source gallery', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.match(body.error, /source gallery/i);
    });
  });

  describe('auth — insufficient permissions on target gallery', () => {
    let server, baseUrl;

    before(async () => {
      // studioRole 'admin' can write src, but we give only gallery viewer
      // role on the destination so write is denied there
      const galleryRoles = new Map([
        ['u1:gal-dst', 'viewer'],  // viewer cannot write
      ]);
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'photographer', // cannot write anything via studioRole
        galleryRoles,
        // For src gallery, grant editor so source auth passes
        // We need to set studioRole low and rely on gallery role for src
      }));
    });

    after(() => stopServer(server));

    // This test uses a separate config where source passes but dest fails
    test('returns HTTP 403 when user lacks write on target gallery', async () => {
      // Build a fresh server: src role = admin (passes), dest role = viewer (fails)
      const galleryRoles = new Map([
        ['u1:gal-dst', 'viewer'], // viewer cannot write
      ]);
      const galleries = new Map([
        ['gal-src', { id: 'gal-src', slug: 'src-gallery', access: 'private', organization_id: 'org1' }],
        ['gal-dst', { id: 'gal-dst', slug: 'dst-gallery', access: 'private', organization_id: 'org1' }],
      ]);
      const { server: s2, baseUrl: b2 } = await startServer({
        galleries,
        photos:       makePhotos(),
        reqStudioRole: 'photographer', // cannot write via studioRole
        galleryRoles,
      });

      // Override: give src gallery a direct editor role so source passes
      galleryRoles.set('u1:gal-src', 'editor');

      try {
        const { status, body } = await post(b2, '/galleries/gal-src/photos/copy', {
          photoIds:       ['photo-1'],
          targetGalleryId: 'gal-dst',
        });
        assert.equal(status, 403);
        assert.match(body.error, /target gallery/i);
      } finally {
        await stopServer(s2);
      }
    });
  });

  describe('filename collision — dest gets _copy suffix', () => {
    let server, baseUrl, copiedFiles;

    before(async () => {
      copiedFiles = [];
      // The destination directory already contains img001.jpg
      const existingFiles = new Set(['/fake/dst-gallery/photos/img001.jpg']);
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
        fs: {
          existsSync:   (p) => existingFiles.has(p),
          mkdirSync:    () => {},
          copyFileSync: (src, dst) => copiedFiles.push({ src, dst }),
          renameSync:   () => {},
          unlinkSync:   () => {},
        },
        insertedPhotos: [],
        updatedPhotos:  [],
      }));
    });

    after(() => stopServer(server));

    test('returns 200', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 200);
    });

    test('destination filename has _copy suffix to avoid collision', async () => {
      copiedFiles.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(copiedFiles.length, 1);
      assert.ok(
        copiedFiles[0].dst.endsWith('img001_copy.jpg'),
        `Expected dst to end with img001_copy.jpg, got: ${copiedFiles[0].dst}`,
      );
    });
  });

  describe('non-existent photoId is returned in failed array', () => {
    let server, baseUrl;

    before(async () => {
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
        fs: {
          existsSync:   () => false,
          mkdirSync:    () => {},
          copyFileSync: () => {},
          renameSync:   () => {},
          unlinkSync:   () => {},
        },
        insertedPhotos: [],
        updatedPhotos:  [],
      }));
    });

    after(() => stopServer(server));

    test('returns HTTP 200 even when some photoIds do not exist', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1', 'no-such-photo'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 200);
    });

    test('moved count reflects only found photos', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1', 'no-such-photo'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(body.moved, 1);
    });

    test('missing photoId appears in failed array', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       ['photo-1', 'no-such-photo'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(body.failed.length, 1);
      assert.equal(body.failed[0].photoId, 'no-such-photo');
    });
  });

  describe('validation', () => {
    let server, baseUrl;

    before(async () => {
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
      }));
    });

    after(() => stopServer(server));

    test('missing photoIds returns 400', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 400);
    });

    test('empty photoIds array returns 400', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds:       [],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 400);
    });

    test('missing targetGalleryId returns 400', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/copy', {
        photoIds: ['photo-1'],
      });
      assert.equal(status, 400);
    });
  });
});

// ── MOVE endpoint ─────────────────────────────────────────────────────────────

describe('POST /galleries/:id/photos/move', () => {

  describe('happy path — gallery_id updated, file moved', () => {
    let server, baseUrl, updatedPhotos, renamedFiles;

    before(async () => {
      updatedPhotos = [];
      renamedFiles  = [];
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
        fs: {
          existsSync:   () => false,
          mkdirSync:    () => {},
          copyFileSync: () => {},
          renameSync:   (src, dst) => renamedFiles.push({ src, dst }),
          unlinkSync:   () => {},
        },
        insertedPhotos: [],
        updatedPhotos,
      }));
    });

    after(() => stopServer(server));

    test('returns HTTP 200', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 200);
    });

    test('response body has moved:1 and empty failed array', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-2'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(body.moved, 1);
      assert.deepEqual(body.failed, []);
    });

    test('gallery_id update recorded for the moved photo', async () => {
      updatedPhotos.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      const photoUpdate = updatedPhotos.find(u => u.table === 'photos' && u.id === 'photo-1');
      assert.ok(photoUpdate, 'Expected an UPDATE for the photo row');
      assert.equal(photoUpdate.gallery_id, 'gal-dst');
    });

    test('renameSync was called (atomic move)', async () => {
      renamedFiles.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(renamedFiles.length, 1);
    });

    test('both galleries are marked needs_rebuild after move', async () => {
      updatedPhotos.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      const rebuildEntries = updatedPhotos.filter(u => u.table === 'galleries' && u.needs_rebuild === 1);
      const ids = rebuildEntries.map(u => u.id);
      assert.ok(ids.includes('gal-dst'), 'dest gallery should be rebuilt');
      assert.ok(ids.includes('gal-src'), 'src gallery should be rebuilt');
    });
  });

  describe('cross-device fallback — EXDEV triggers copy+delete', () => {
    let server, baseUrl, copiedFiles, deletedFiles;

    before(async () => {
      copiedFiles  = [];
      deletedFiles = [];
      const exdevError = Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
        fs: {
          existsSync:   () => false,
          mkdirSync:    () => {},
          copyFileSync: (src, dst) => copiedFiles.push({ src, dst }),
          renameSync:   () => { throw exdevError; },
          unlinkSync:   (f) => deletedFiles.push(f),
        },
        insertedPhotos: [],
        updatedPhotos:  [],
      }));
    });

    after(() => stopServer(server));

    test('returns 200 on EXDEV rename error', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 200);
    });

    test('copyFileSync called as fallback', async () => {
      copiedFiles.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(copiedFiles.length, 1);
    });

    test('unlinkSync removes source file after copy', async () => {
      deletedFiles.length = 0;
      await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(deletedFiles.length, 1);
    });
  });

  describe('auth — insufficient permissions on source gallery', () => {
    let server, baseUrl;

    before(async () => {
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'photographer', // cannot write
      }));
    });

    after(() => stopServer(server));

    test('returns HTTP 403', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 403);
    });

    test('error message references source gallery', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1'],
        targetGalleryId: 'gal-dst',
      });
      assert.match(body.error, /source gallery/i);
    });
  });

  describe('auth — insufficient permissions on target gallery', () => {
    test('returns HTTP 403 when user lacks write on target gallery', async () => {
      const galleryRoles = new Map([
        ['u1:gal-src', 'editor'],  // can write src
        ['u1:gal-dst', 'viewer'],  // cannot write dst
      ]);
      const { server: s, baseUrl: b } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'photographer', // no studio-level write
        galleryRoles,
      });
      try {
        const { status, body } = await post(b, '/galleries/gal-src/photos/move', {
          photoIds:       ['photo-1'],
          targetGalleryId: 'gal-dst',
        });
        assert.equal(status, 403);
        assert.match(body.error, /target gallery/i);
      } finally {
        await stopServer(s);
      }
    });
  });

  describe('non-existent photoId is returned in failed array', () => {
    let server, baseUrl;

    before(async () => {
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
        fs: {
          existsSync:   () => false,
          mkdirSync:    () => {},
          copyFileSync: () => {},
          renameSync:   () => {},
          unlinkSync:   () => {},
        },
        insertedPhotos: [],
        updatedPhotos:  [],
      }));
    });

    after(() => stopServer(server));

    test('returns HTTP 200 even when some photoIds do not exist', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1', 'no-such-photo'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 200);
    });

    test('moved count reflects only found photos', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['photo-1', 'no-such-photo'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(body.moved, 1);
    });

    test('missing photoId appears in failed array', async () => {
      const { body } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds:       ['no-such-photo'],
        targetGalleryId: 'gal-dst',
      });
      assert.equal(body.failed.length, 1);
      assert.equal(body.failed[0].photoId, 'no-such-photo');
    });
  });

  describe('validation', () => {
    let server, baseUrl;

    before(async () => {
      ({ server, baseUrl } = await startServer({
        galleries:    makeGalleries(),
        photos:       makePhotos(),
        reqStudioRole: 'admin',
      }));
    });

    after(() => stopServer(server));

    test('missing photoIds returns 400', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        targetGalleryId: 'gal-dst',
      });
      assert.equal(status, 400);
    });

    test('missing targetGalleryId returns 400', async () => {
      const { status } = await post(baseUrl, '/galleries/gal-src/photos/move', {
        photoIds: ['photo-1'],
      });
      assert.equal(status, 400);
    });
  });
});
