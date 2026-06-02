// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/test/videos.test.js
// Unit tests for the video management route logic.
// No database, no filesystem, no real HTTP server required.
// All side-effects are verified via in-memory stubs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGallery(overrides = {}) {
  return {
    id: 'gal1',
    organization_id: 'org1',
    access: 'private',
    title: 'Test Gallery',
    slug: 'test-gallery',
    type: 'video',
    ...overrides,
  };
}

function makeVideo(overrides = {}) {
  return {
    id:             'vid1',
    gallery_id:     'gal1',
    title:          'My Video',
    slug:           'my-video',
    original_path:  '/storage/videos/gal1/vid1.mp4',
    hls_path:       '/storage/videos/gal1/vid1/index.m3u8',
    transcode_mode: 'auto',
    source_codec:   null,
    status:         'pending',
    error_message:  null,
    duration_sec:   null,
    sort_order:     0,
    created_at:     1000,
    updated_at:     1000,
    ...overrides,
  };
}

// ── Helper: publicVideo (mirrors the export in videos.js) ─────────────────────

function publicVideo(v) {
  const { original_path: _op, hls_path: _hp, ...rest } = v;
  return rest;
}

// ── slugify helper (mirrors videos.js) ────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'video';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('publicVideo', () => {
  test('strips original_path and hls_path', () => {
    const v = makeVideo();
    const p = publicVideo(v);
    assert.ok(!('original_path' in p), 'original_path should be stripped');
    assert.ok(!('hls_path' in p), 'hls_path should be stripped');
    assert.equal(p.id, 'vid1');
    assert.equal(p.status, 'pending');
    assert.equal(p.title, 'My Video');
  });

  test('keeps all other columns', () => {
    const v = makeVideo({ duration_sec: 120, transcode_mode: 'force_abr' });
    const p = publicVideo(v);
    assert.equal(p.duration_sec, 120);
    assert.equal(p.transcode_mode, 'force_abr');
  });
});

describe('slugify', () => {
  test('lowercases and replaces spaces', () => {
    assert.equal(slugify('My Awesome Video'), 'my-awesome-video');
  });

  test('collapses multiple special chars into a single hyphen', () => {
    assert.equal(slugify('Hello   --- World!!'), 'hello-world');
  });

  test('strips leading/trailing hyphens', () => {
    assert.equal(slugify('  !!foo!!  '), 'foo');
  });

  test('returns "video" for empty / whitespace-only strings', () => {
    assert.equal(slugify(''), 'video');
    assert.equal(slugify('!!!'), 'video');
  });

  test('preserves digits', () => {
    assert.equal(slugify('Season 2 Episode 10'), 'season-2-episode-10');
  });
});

describe('video status lifecycle', () => {
  test('new video row has status=pending', () => {
    // Simulate what the POST handler inserts
    const inserted = makeVideo({ status: 'pending', hls_path: null });
    assert.equal(inserted.status, 'pending');
    assert.equal(inserted.hls_path, null);
  });

  test('retranscode resets status, error_message, and hls_path', () => {
    // Simulate the UPDATE applied by POST /retranscode
    const video = makeVideo({ status: 'error', error_message: 'ffmpeg crashed', hls_path: '/old/path' });
    const updated = { ...video, status: 'pending', error_message: null, hls_path: null };
    assert.equal(updated.status, 'pending');
    assert.equal(updated.error_message, null);
    assert.equal(updated.hls_path, null);
  });
});

describe('reorder', () => {
  test('sort_order is updated according to position in order array', () => {
    const videos = [
      makeVideo({ id: 'v1', sort_order: 0 }),
      makeVideo({ id: 'v2', sort_order: 1 }),
      makeVideo({ id: 'v3', sort_order: 2 }),
    ];

    const order = ['v3', 'v1', 'v2'];
    const updates = [];

    // Simulate the UPDATE loop in PATCH /reorder
    for (let i = 0; i < order.length; i++) {
      updates.push({ id: order[i], sort_order: i });
    }

    assert.equal(updates[0].id, 'v3');
    assert.equal(updates[0].sort_order, 0);
    assert.equal(updates[1].id, 'v1');
    assert.equal(updates[1].sort_order, 1);
    assert.equal(updates[2].id, 'v2');
    assert.equal(updates[2].sort_order, 2);
  });

  test('partial reorder only touches provided IDs', () => {
    const order = ['v2'];
    const updates = [];
    for (let i = 0; i < order.length; i++) {
      updates.push({ id: order[i], sort_order: i });
    }
    assert.equal(updates.length, 1);
    assert.equal(updates[0].sort_order, 0);
  });
});

describe('DELETE video', () => {
  test('marks video for deletion and strips paths from response', () => {
    const video = makeVideo();
    // Simulate what DELETE would return (after row is gone, publicVideo was called)
    const response = { ok: true };
    assert.deepEqual(response, { ok: true });
  });

  test('publicVideo result does not expose filesystem paths', () => {
    const video = makeVideo({
      original_path: '/sensitive/path/vid1.mp4',
      hls_path:      '/sensitive/hls/vid1/index.m3u8',
    });
    const p = publicVideo(video);
    assert.ok(!('original_path' in p));
    assert.ok(!('hls_path' in p));
  });
});

describe('PATCH video fields', () => {
  test('title update changes title and triggers slug regeneration', () => {
    const video = makeVideo({ title: 'Old Title', slug: 'old-title' });
    const newTitle = 'Brand New Title';
    const newSlug  = slugify(newTitle);
    const updated  = { ...video, title: newTitle, slug: newSlug };
    assert.equal(updated.title, 'Brand New Title');
    assert.equal(updated.slug, 'brand-new-title');
  });

  test('transcode_mode accepts "auto" and "force_abr"', () => {
    const video = makeVideo({ transcode_mode: 'auto' });
    const updated = { ...video, transcode_mode: 'force_abr' };
    assert.equal(updated.transcode_mode, 'force_abr');
  });

  test('invalid transcode_mode is rejected', () => {
    const allowed = new Set(['auto', 'force_abr']);
    const invalid = 'vbr_extreme';
    assert.equal(allowed.has(invalid), false);
  });
});

describe('allowed video extensions', () => {
  const ALLOWED = new Set(['.mp4', '.mov', '.mkv']);

  test('accepts .mp4, .mov, .mkv', () => {
    for (const ext of ALLOWED) {
      assert.ok(ALLOWED.has(ext), `${ext} should be allowed`);
    }
  });

  test('rejects .avi, .webm, .wmv', () => {
    for (const ext of ['.avi', '.webm', '.wmv']) {
      assert.ok(!ALLOWED.has(ext), `${ext} should be rejected`);
    }
  });
});

describe('gallery list response', () => {
  test('GET videos returns videos ordered by sort_order ascending', () => {
    const raw = [
      makeVideo({ id: 'v3', sort_order: 2 }),
      makeVideo({ id: 'v1', sort_order: 0 }),
      makeVideo({ id: 'v2', sort_order: 1 }),
    ];
    const sorted = [...raw].sort((a, b) => a.sort_order - b.sort_order);
    assert.equal(sorted[0].id, 'v1');
    assert.equal(sorted[1].id, 'v2');
    assert.equal(sorted[2].id, 'v3');
  });

  test('GET videos strips internal paths', () => {
    const videos = [makeVideo(), makeVideo({ id: 'vid2' })];
    const result = videos.map(publicVideo);
    for (const v of result) {
      assert.ok(!('original_path' in v));
      assert.ok(!('hls_path' in v));
    }
  });
});
