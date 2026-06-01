// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/photos-copy-move.test.js
// Unit tests for copy/move helper: resolveDestFilename collision logic
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Inline the helper under test (same logic as in photos.js)
function resolveDestFilename(dir, filename) {
  const ext  = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let n = 0;
  while (fs.existsSync(path.join(dir, candidate))) {
    n++;
    candidate = n === 1 ? `${base}_copy${ext}` : `${base}_copy${n}${ext}`;
  }
  return candidate;
}

describe('resolveDestFilename', () => {
  let tmpDir;

  // Create a fresh temp dir before each describe block
  function mkTmp() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-test-'));
  }
  function touch(name) {
    fs.writeFileSync(path.join(tmpDir, name), '');
  }

  test('no collision — returns original filename', () => {
    mkTmp();
    const result = resolveDestFilename(tmpDir, 'photo.jpg');
    assert.equal(result, 'photo.jpg');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('single collision — returns basename_copy.ext', () => {
    mkTmp();
    touch('photo.jpg');
    const result = resolveDestFilename(tmpDir, 'photo.jpg');
    assert.equal(result, 'photo_copy.jpg');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('two collisions — returns basename_copy2.ext', () => {
    mkTmp();
    touch('photo.jpg');
    touch('photo_copy.jpg');
    const result = resolveDestFilename(tmpDir, 'photo.jpg');
    assert.equal(result, 'photo_copy2.jpg');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('three collisions — returns basename_copy3.ext', () => {
    mkTmp();
    touch('photo.jpg');
    touch('photo_copy.jpg');
    touch('photo_copy2.jpg');
    const result = resolveDestFilename(tmpDir, 'photo.jpg');
    assert.equal(result, 'photo_copy3.jpg');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('preserves multi-part extensions (.tiff)', () => {
    mkTmp();
    touch('img.tiff');
    const result = resolveDestFilename(tmpDir, 'img.tiff');
    assert.equal(result, 'img_copy.tiff');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('works when dest dir is empty', () => {
    mkTmp();
    const result = resolveDestFilename(tmpDir, 'abc-123.jpg');
    assert.equal(result, 'abc-123.jpg');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('filename without extension', () => {
    mkTmp();
    touch('noext');
    const result = resolveDestFilename(tmpDir, 'noext');
    assert.equal(result, 'noext_copy');
    fs.rmSync(tmpDir, { recursive: true });
  });
});
