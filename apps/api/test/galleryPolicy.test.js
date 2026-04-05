// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/test/galleryPolicy.test.js
// Unit tests for resolveGalleryPolicy() and validateModeConstraints().
// No database required — both functions are pure.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { resolveGalleryPolicy, validateModeConstraints, applyModeDefaults, GALLERY_MODES } =
  await import('../src/services/galleryPolicy.js');

// ── resolveGalleryPolicy — mode: portfolio ─────────────────────────────────────
describe('resolveGalleryPolicy — portfolio', () => {
  const policy = resolveGalleryPolicy({ gallery_mode: 'portfolio' });

  test('mode is portfolio',          () => assert.equal(policy.mode, 'portfolio'));
  test('access is public',           () => assert.equal(policy.access, 'public'));
  test('requiresToken is false',     () => assert.equal(policy.requiresToken, false));
  test('allowDownloadImage is false',   () => assert.equal(policy.allowDownloadImage, false));
  test('allowDownloadGallery is false', () => assert.equal(policy.allowDownloadGallery, false));
  test('allowDownloadOriginal is false',() => assert.equal(policy.allowDownloadOriginal, false));
  test('downloadMode is none',       () => assert.equal(policy.downloadMode, 'none'));
  test('watermarkEnabled is true',   () => assert.equal(policy.watermarkEnabled, true));
  test('publicListed is true',       () => assert.equal(policy.publicListed, true));
});

// ── resolveGalleryPolicy — mode: client_preview ───────────────────────────────
describe('resolveGalleryPolicy — client_preview', () => {
  const policy = resolveGalleryPolicy({ gallery_mode: 'client_preview' });

  test('mode is client_preview',         () => assert.equal(policy.mode, 'client_preview'));
  test('access is private',              () => assert.equal(policy.access, 'private'));
  test('requiresToken is true',          () => assert.equal(policy.requiresToken, true));
  test('allowDownloadImage is false',    () => assert.equal(policy.allowDownloadImage, false));
  test('allowDownloadGallery is false',  () => assert.equal(policy.allowDownloadGallery, false));
  test('allowDownloadOriginal is false', () => assert.equal(policy.allowDownloadOriginal, false));
  test('downloadMode is display',        () => assert.equal(policy.downloadMode, 'display'));
  test('watermarkEnabled is true',       () => assert.equal(policy.watermarkEnabled, true));
  test('logAccess is true',              () => assert.equal(policy.logAccess, true));
  test('publicListed is false',          () => assert.equal(policy.publicListed, false));
});

// ── resolveGalleryPolicy — mode: client_delivery ─────────────────────────────
describe('resolveGalleryPolicy — client_delivery', () => {
  const policy = resolveGalleryPolicy({ gallery_mode: 'client_delivery' });

  test('mode is client_delivery',       () => assert.equal(policy.mode, 'client_delivery'));
  test('access is private',             () => assert.equal(policy.access, 'private'));
  test('requiresToken is true',         () => assert.equal(policy.requiresToken, true));
  test('allowDownloadImage is true',    () => assert.equal(policy.allowDownloadImage, true));
  test('allowDownloadGallery is true',  () => assert.equal(policy.allowDownloadGallery, true));
  test('allowDownloadOriginal is false',() => assert.equal(policy.allowDownloadOriginal, false));
  test('watermarkEnabled is true',      () => assert.equal(policy.watermarkEnabled, true));
  test('logDownload is true',           () => assert.equal(policy.logDownload, true));
  test('publicListed is false',         () => assert.equal(policy.publicListed, false));
});

// ── resolveGalleryPolicy — mode: archive ─────────────────────────────────────
describe('resolveGalleryPolicy — archive', () => {
  const policy = resolveGalleryPolicy({ gallery_mode: 'archive' });

  test('mode is archive',                () => assert.equal(policy.mode, 'archive'));
  test('access is private',              () => assert.equal(policy.access, 'private'));
  test('allowDownloadImage is true',     () => assert.equal(policy.allowDownloadImage, true));
  test('allowDownloadGallery is true',   () => assert.equal(policy.allowDownloadGallery, true));
  test('allowDownloadOriginal is true',  () => assert.equal(policy.allowDownloadOriginal, true));
  test('downloadMode is original',       () => assert.equal(policy.downloadMode, 'original'));
  test('watermarkEnabled is false',      () => assert.equal(policy.watermarkEnabled, false));
  test('logAccess is true',              () => assert.equal(policy.logAccess, true));
  test('logDownload is true',            () => assert.equal(policy.logDownload, true));
  test('publicListed is false',          () => assert.equal(policy.publicListed, false));
});

// ── resolveGalleryPolicy — legacy (gallery_mode IS NULL) ─────────────────────
describe('resolveGalleryPolicy — legacy null mode', () => {
  test('reads raw flags from DB row (snake_case)', () => {
    const policy = resolveGalleryPolicy({
      gallery_mode: null,
      access: 'public',
      download_mode: 'display',
      allow_download_image: 1,
      allow_download_gallery: 0,
      allow_download_original: 0,
      config_json: '{}',
    });
    assert.equal(policy.mode, null);
    assert.equal(policy.access, 'public');
    assert.equal(policy.downloadMode, 'display');
    assert.equal(policy.allowDownloadImage, true);
    assert.equal(policy.allowDownloadGallery, false);
    assert.equal(policy.allowDownloadOriginal, false);
    assert.equal(policy.publicListed, true);
  });

  test('reads watermark from config_json', () => {
    const policy = resolveGalleryPolicy({
      gallery_mode: null,
      access: 'public',
      config_json: JSON.stringify({ watermark: { enabled: true } }),
    });
    assert.equal(policy.watermarkEnabled, true);
  });

  test('watermarkEnabled false when config_json has no watermark', () => {
    const policy = resolveGalleryPolicy({ gallery_mode: null, access: 'public', config_json: '{}' });
    assert.equal(policy.watermarkEnabled, false);
  });

  test('handles missing config_json gracefully', () => {
    const policy = resolveGalleryPolicy({ gallery_mode: null, access: 'private' });
    assert.equal(policy.watermarkEnabled, false);
    assert.equal(policy.mode, null);
  });

  test('handles malformed config_json gracefully', () => {
    const policy = resolveGalleryPolicy({ gallery_mode: null, access: 'public', config_json: 'invalid json' });
    assert.equal(policy.watermarkEnabled, false);
  });

  test('accepts camelCase galleryMode key', () => {
    const policy = resolveGalleryPolicy({ galleryMode: 'portfolio' });
    assert.equal(policy.mode, 'portfolio');
    assert.equal(policy.watermarkEnabled, true);
  });

  test('private legacy gallery is not publicListed', () => {
    const policy = resolveGalleryPolicy({ gallery_mode: null, access: 'private' });
    assert.equal(policy.publicListed, false);
  });
});

// ── validateModeConstraints ───────────────────────────────────────────────────
describe('validateModeConstraints', () => {
  test('returns null for null mode (no-op)', () => {
    assert.equal(validateModeConstraints(null, { allow_download_original: true }), null);
  });

  test('portfolio — rejects allow_download_image', () => {
    assert.match(
      validateModeConstraints('portfolio', { allow_download_image: true }),
      /portfolio/i
    );
  });

  test('portfolio — rejects allow_download_gallery', () => {
    assert.match(
      validateModeConstraints('portfolio', { allow_download_gallery: true }),
      /portfolio/i
    );
  });

  test('portfolio — rejects allow_download_original', () => {
    assert.match(
      validateModeConstraints('portfolio', { allow_download_original: true }),
      /portfolio/i
    );
  });

  test('portfolio — accepts no downloads', () => {
    assert.equal(
      validateModeConstraints('portfolio', { allow_download_image: false, allow_download_gallery: false }),
      null
    );
  });

  test('client_preview — rejects allow_download_gallery', () => {
    assert.match(
      validateModeConstraints('client_preview', { allow_download_gallery: true }),
      /client.preview/i
    );
  });

  test('client_preview — rejects allow_download_original', () => {
    assert.match(
      validateModeConstraints('client_preview', { allow_download_original: true }),
      /client.preview/i
    );
  });

  test('client_preview — allows allow_download_image', () => {
    assert.equal(
      validateModeConstraints('client_preview', { allow_download_image: true }),
      null
    );
  });

  test('client_delivery — no constraints violated', () => {
    assert.equal(
      validateModeConstraints('client_delivery', { allow_download_image: true, allow_download_gallery: true }),
      null
    );
  });

  test('archive — no constraints violated', () => {
    assert.equal(
      validateModeConstraints('archive', { allow_download_original: true }),
      null
    );
  });

  test('accepts camelCase keys', () => {
    assert.match(
      validateModeConstraints('portfolio', { allowDownloadImage: true }),
      /portfolio/i
    );
  });
});

// ── applyModeDefaults ─────────────────────────────────────────────────────────
describe('applyModeDefaults', () => {
  test('portfolio sets access=public and download_mode=none', () => {
    const d = applyModeDefaults('portfolio');
    assert.equal(d.access, 'public');
    assert.equal(d.download_mode, 'none');
    assert.equal(d.allow_download_image, 0);
    assert.equal(d.allow_download_gallery, 0);
    assert.equal(d.allow_download_original, 0);
  });

  test('archive sets access=private and download_mode=original', () => {
    const d = applyModeDefaults('archive');
    assert.equal(d.access, 'private');
    assert.equal(d.download_mode, 'original');
    assert.equal(d.allow_download_original, 1);
  });

  test('client_delivery sets access=private and allows image+gallery', () => {
    const d = applyModeDefaults('client_delivery');
    assert.equal(d.access, 'private');
    assert.equal(d.allow_download_image, 1);
    assert.equal(d.allow_download_gallery, 1);
    assert.equal(d.allow_download_original, 0);
  });
});

// ── GALLERY_MODES constant ────────────────────────────────────────────────────
describe('GALLERY_MODES', () => {
  test('contains exactly 4 modes', () => assert.equal(GALLERY_MODES.length, 4));
  test('contains portfolio',        () => assert.ok(GALLERY_MODES.includes('portfolio')));
  test('contains client_preview',   () => assert.ok(GALLERY_MODES.includes('client_preview')));
  test('contains client_delivery',  () => assert.ok(GALLERY_MODES.includes('client_delivery')));
  test('contains archive',          () => assert.ok(GALLERY_MODES.includes('archive')));
});
