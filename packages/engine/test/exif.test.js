/**
 * @gallerypack/engine — exif / geocoding unit tests
 * Verifies that resolveGpsLocations() respects the injectable geocoder contract.
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { resolveGpsLocations } from '../src/exif.js';
import { tmpdir } from 'os';
import { join }   from 'path';
import { writeFileSync } from 'fs';

// ── Geocoder injection ────────────────────────────────────────────────────────

test('resolveGpsLocations: null geocoder skips all geocoding', async () => {
  const results = [{
    exif: { originalFile: 'test.jpg', location: { lat: 47.37, lng: 8.54 } },
  }];
  const manifestPath = join(tmpdir(), `test-manifest-${Date.now()}.json`);
  writeFileSync(manifestPath, JSON.stringify({ photos: { 'test.jpg': { exif: {} } } }));

  await resolveGpsLocations(results, manifestPath, 'en', '0.0.0', null);

  // location should still be a {lat,lng} object — not resolved
  assert.deepEqual(results[0].exif.location, { lat: 47.37, lng: 8.54 });
});

test('resolveGpsLocations: injectable geocoder is called with correct args', async () => {
  const calls = [];
  const mockGeo = async (lat, lng, locale) => {
    calls.push({ lat, lng, locale });
    return 'Zürich, Switzerland';
  };

  const results = [{
    exif: { originalFile: 'img.jpg', location: { lat: 47.37, lng: 8.54 } },
  }];
  const manifestPath = join(tmpdir(), `test-manifest-${Date.now()}.json`);
  writeFileSync(manifestPath, JSON.stringify({ photos: { 'img.jpg': { exif: {} } } }));

  await resolveGpsLocations(results, manifestPath, 'fr', '1.0.0', mockGeo);

  assert.equal(calls.length, 1);
  assert.ok(Math.abs(calls[0].lat - 47.37) < 0.01);
  assert.ok(Math.abs(calls[0].lng - 8.54) < 0.01);
  assert.equal(calls[0].locale, 'fr');
  assert.equal(results[0].exif.location, 'Zürich, Switzerland');
  assert.deepEqual(results[0].exif.gps, { lat: 47.37, lng: 8.54 });
});

test('resolveGpsLocations: deduplicates calls for same coords (within 0.01°)', async () => {
  const calls = [];
  const mockGeo = async (lat, lng) => { calls.push({ lat, lng }); return 'Paris, France'; };

  const results = [
    { exif: { originalFile: 'a.jpg', location: { lat: 48.856613, lng: 2.352222 } } },
    { exif: { originalFile: 'b.jpg', location: { lat: 48.856999, lng: 2.352100 } } },  // same ~bucket
  ];
  const manifestPath = join(tmpdir(), `test-manifest-${Date.now()}.json`);
  writeFileSync(manifestPath, JSON.stringify({ photos: { 'a.jpg': { exif: {} }, 'b.jpg': { exif: {} } } }));

  await resolveGpsLocations(results, manifestPath, 'en', '0.0.0', mockGeo);

  assert.equal(calls.length, 1, 'should deduplicate identical ~bucket coords');
  assert.equal(results[0].exif.location, 'Paris, France');
  assert.equal(results[1].exif.location, 'Paris, France');
});

test('resolveGpsLocations: already-resolved string locations are skipped', async () => {
  const calls = [];
  const mockGeo = async () => { calls.push(1); return 'Somewhere'; };

  const results = [
    { exif: { originalFile: 'a.jpg', location: 'Already resolved string' } },
  ];
  const manifestPath = join(tmpdir(), `test-manifest-${Date.now()}.json`);
  writeFileSync(manifestPath, JSON.stringify({ photos: {} }));

  await resolveGpsLocations(results, manifestPath, 'en', '0.0.0', mockGeo);

  assert.equal(calls.length, 0, 'should not call geocoder for already-resolved strings');
  assert.equal(results[0].exif.location, 'Already resolved string');
});
