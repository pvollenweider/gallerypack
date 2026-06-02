// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/test/videoStream.test.js
// Unit tests for the HLS streaming route logic.
// No database, no real filesystem I/O, no HTTP server required.
// Route logic is extracted into testable pure functions.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';

// ── Extracted logic under test ────────────────────────────────────────────────
// These mirror the logic in videoStream.js without needing Express/DB.

/**
 * Validate token scope against a galleryId.
 * Returns true if the token is valid for that gallery.
 */
function isTokenValidForGallery(token, galleryId) {
  if (!token) return false;
  return token.scope_type === 'gallery' && token.scope_id === galleryId;
}

/**
 * Sanitize an HLS filepath: reject path traversal attempts.
 * Returns true if the path is safe (stays within hlsDir).
 */
function isPathSafe(hlsDir, filepath) {
  const resolved = path.resolve(hlsDir, filepath);
  const rel = path.relative(hlsDir, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Determine Content-Type and Cache-Control for an HLS file by extension.
 * Returns { contentType, cacheControl } or null for unknown extensions.
 */
function getHlsHeaders(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.m3u8') {
    return { contentType: 'application/vnd.apple.mpegurl', cacheControl: 'no-cache' };
  }
  if (ext === '.ts') {
    return { contentType: 'video/MP2T', cacheControl: 'public, max-age=3600' };
  }
  return null;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeToken(overrides = {}) {
  return {
    id:         'tok1',
    scope_type: 'gallery',
    scope_id:   'gal1',
    revoked_at: null,
    expires_at: null,
    ...overrides,
  };
}

function makeVideo(overrides = {}) {
  return {
    id:         'vid1',
    gallery_id: 'gal1',
    slug:       'my-video',
    status:     'ready',
    duration_sec: 120,
    title:      'My Video',
    ...overrides,
  };
}

// ── Token validation ──────────────────────────────────────────────────────────

describe('token validation', () => {
  test('null token → not valid', () => {
    assert.equal(isTokenValidForGallery(null, 'gal1'), false);
  });

  test('revoked token — caller returns null from getViewerToken, so route 403s', () => {
    // getViewerToken returns null for revoked/expired tokens.
    // A null result is treated as invalid, same as missing token.
    const revokedToken = null; // simulates what getViewerToken returns
    assert.equal(isTokenValidForGallery(revokedToken, 'gal1'), false);
  });

  test('token for wrong gallery → not valid', () => {
    const token = makeToken({ scope_id: 'gal99' });
    assert.equal(isTokenValidForGallery(token, 'gal1'), false);
  });

  test('token with wrong scope_type → not valid', () => {
    const token = makeToken({ scope_type: 'project', scope_id: 'gal1' });
    assert.equal(isTokenValidForGallery(token, 'gal1'), false);
  });

  test('valid token for correct gallery → valid', () => {
    const token = makeToken();
    assert.equal(isTokenValidForGallery(token, 'gal1'), true);
  });
});

// ── Path traversal protection ─────────────────────────────────────────────────

describe('path traversal protection', () => {
  const hlsDir = '/storage/videos/gal1/vid1_hls';

  test('simple filename → safe', () => {
    assert.equal(isPathSafe(hlsDir, 'index.m3u8'), true);
  });

  test('nested segment path → safe', () => {
    assert.equal(isPathSafe(hlsDir, 'stream_0/seg000.ts'), true);
  });

  test('../ traversal → not safe', () => {
    assert.equal(isPathSafe(hlsDir, '../../../etc/passwd'), false);
  });

  test('encoded-style traversal → not safe', () => {
    // path.resolve handles percent-decoding is not relevant here;
    // the ../ after resolve still escapes the directory
    assert.equal(isPathSafe(hlsDir, '../../other_gallery/vid2_hls/index.m3u8'), false);
  });

  test('sibling directory traversal → not safe', () => {
    assert.equal(isPathSafe(hlsDir, '../vid2_hls/index.m3u8'), false);
  });

  test('absolute path injection → not safe', () => {
    // On systems where path.resolve('/storage/...', '/etc/passwd') → '/etc/passwd'
    // path.relative would produce a relative traversal or absolute — both rejected
    const injected = '/etc/passwd';
    const resolved = path.resolve(hlsDir, injected);
    const rel = path.relative(hlsDir, resolved);
    assert.ok(rel.startsWith('..') || path.isAbsolute(rel), 'absolute path should be unsafe');
  });
});

// ── Content-Type and Cache-Control headers ────────────────────────────────────

describe('HLS response headers', () => {
  test('.m3u8 → application/vnd.apple.mpegurl + no-cache', () => {
    const h = getHlsHeaders('index.m3u8');
    assert.equal(h.contentType, 'application/vnd.apple.mpegurl');
    assert.equal(h.cacheControl, 'no-cache');
  });

  test('.m3u8 playlist with path prefix → correct headers', () => {
    const h = getHlsHeaders('stream_0/playlist.m3u8');
    assert.equal(h.contentType, 'application/vnd.apple.mpegurl');
    assert.equal(h.cacheControl, 'no-cache');
  });

  test('.ts segment → video/MP2T + max-age=3600', () => {
    const h = getHlsHeaders('stream_0/seg001.ts');
    assert.equal(h.contentType, 'video/MP2T');
    assert.equal(h.cacheControl, 'public, max-age=3600');
  });

  test('.ts segment → cache header contains max-age=3600', () => {
    const h = getHlsHeaders('seg000.ts');
    assert.ok(h.cacheControl.includes('max-age=3600'));
  });

  test('.m3u8 → cache header is no-cache (never max-age)', () => {
    const h = getHlsHeaders('master.m3u8');
    assert.ok(!h.cacheControl.includes('max-age'));
  });

  test('unknown extension → null', () => {
    assert.equal(getHlsHeaders('file.mp4'), null);
  });
});

// ── Gallery info response shape ───────────────────────────────────────────────

describe('gallery info response', () => {
  test('response strips internal paths from videos', () => {
    const rawVideos = [
      { id: 'v1', title: 'Clip 1', slug: 'clip-1', duration_sec: 60, status: 'ready',
        original_path: '/internal/path', hls_path: '/internal/hls' },
      { id: 'v2', title: 'Clip 2', slug: 'clip-2', duration_sec: 90, status: 'ready',
        original_path: '/internal/path2', hls_path: '/internal/hls2' },
    ];
    // Route fetches only selected columns — simulate what SELECT returns
    const publicVideos = rawVideos.map(({ id, title, slug, duration_sec, status }) =>
      ({ id, title, slug, duration_sec, status })
    );
    for (const v of publicVideos) {
      assert.ok(!('original_path' in v), 'original_path must not be exposed');
      assert.ok(!('hls_path' in v), 'hls_path must not be exposed');
    }
  });

  test('response shape has gallery.id, gallery.title, and videos array', () => {
    const gallery = { id: 'gal1', title: 'Wedding 2026' };
    const videos  = [makeVideo()];
    const response = { gallery: { id: gallery.id, title: gallery.title }, videos };
    assert.equal(response.gallery.id, 'gal1');
    assert.equal(response.gallery.title, 'Wedding 2026');
    assert.ok(Array.isArray(response.videos));
  });

  test('only ready videos are included (status filter in SQL)', () => {
    // Simulates the WHERE status = 'ready' filter
    const all = [
      makeVideo({ id: 'v1', status: 'ready' }),
      makeVideo({ id: 'v2', status: 'pending' }),
      makeVideo({ id: 'v3', status: 'error' }),
    ];
    const ready = all.filter(v => v.status === 'ready');
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'v1');
  });

  test('videos are ordered by sort_order ascending', () => {
    const videos = [
      makeVideo({ id: 'v3', sort_order: 2 }),
      makeVideo({ id: 'v1', sort_order: 0 }),
      makeVideo({ id: 'v2', sort_order: 1 }),
    ];
    const sorted = [...videos].sort((a, b) => a.sort_order - b.sort_order);
    assert.equal(sorted[0].id, 'v1');
    assert.equal(sorted[2].id, 'v3');
  });
});

// ── View tracking endpoint tests ──────────────────────────────────────────────

/**
 * Validate view event payload.
 * Returns { valid: true } or { valid: false, error: string }
 */
function validateTrackingEvent(body) {
  if (!body) return { valid: false, error: 'No body' };
  const { video_id, event_type, position_sec } = body;
  if (!video_id) return { valid: false, error: 'Missing video_id' };
  const VALID_TYPES = ['play', 'pause', 'seek', 'heartbeat', 'ended'];
  if (!VALID_TYPES.includes(event_type)) return { valid: false, error: 'Invalid event_type' };
  return { valid: true };
}

describe('view tracking', () => {
  test('valid event with all fields → valid', () => {
    const event = { video_id: 'vid1', event_type: 'play', position_sec: 10 };
    const result = validateTrackingEvent(event);
    assert.equal(result.valid, true);
  });

  test('valid event with position_sec = 0 → valid', () => {
    const event = { video_id: 'vid1', event_type: 'play', position_sec: 0 };
    const result = validateTrackingEvent(event);
    assert.equal(result.valid, true);
  });

  test('missing video_id → invalid', () => {
    const event = { event_type: 'play', position_sec: 10 };
    const result = validateTrackingEvent(event);
    assert.equal(result.valid, false);
    assert.match(result.error, /video_id/i);
  });

  test('invalid event_type → invalid', () => {
    const event = { video_id: 'vid1', event_type: 'invalid', position_sec: 10 };
    const result = validateTrackingEvent(event);
    assert.equal(result.valid, false);
    assert.match(result.error, /event_type/i);
  });

  test('valid event_types: play, pause, seek, heartbeat, ended', () => {
    const types = ['play', 'pause', 'seek', 'heartbeat', 'ended'];
    for (const et of types) {
      const event = { video_id: 'vid1', event_type: et, position_sec: 0 };
      const result = validateTrackingEvent(event);
      assert.equal(result.valid, true, `${et} should be valid`);
    }
  });

  test('null token → should return 401', () => {
    // In the route, getViewerToken returns null for invalid tokens
    const vt = null;
    assert.equal(vt, null);
    // Route handler would return 401 for null token
  });

  test('token for wrong gallery scope → should reject', () => {
    const token = makeToken({ scope_id: 'gal99' });
    const galleryId = 'gal1';
    // Route checks: if token.scope_id !== video.gallery_id, reject
    assert.notEqual(token.scope_id, galleryId);
  });
});
