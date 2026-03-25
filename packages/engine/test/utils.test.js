// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of GalleryPack.
//
// GalleryPack is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// GalleryPack is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

/**
 * @gallerypack/engine — utils unit tests
 * Run: npm test (from packages/engine/) or npm test --workspace=packages/engine
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';
import {
  slugify, titleFromSlug, toCamelCase,
  buildName, galleryDistName,
  generatePassword, validateConfig,
  MANIFEST_SCHEMA_VERSION, CONFIG_SCHEMA_VERSION,
} from '../src/utils.js';

// ── slugify ───────────────────────────────────────────────────────────────────

test('slugify: basic ASCII', () => assert.equal(slugify('Hello World'), 'hello-world'));
test('slugify: diacritics stripped', () => assert.equal(slugify('Été à Zürich'), 'ete-a-zurich'));
test('slugify: special chars → hyphen', () => assert.equal(slugify('foo!@bar'), 'foo-bar'));
test('slugify: leading/trailing hyphens removed', () => assert.equal(slugify('-foo-'), 'foo'));
test('slugify: empty/falsy → empty', () => assert.equal(slugify(''), ''));
test('slugify: numbers preserved', () => assert.equal(slugify('2025 shoot'), '2025-shoot'));

// ── titleFromSlug ─────────────────────────────────────────────────────────────

test('titleFromSlug: hyphenated', () => assert.equal(titleFromSlug('my-gallery'), 'My Gallery'));
test('titleFromSlug: underscore', () => assert.equal(titleFromSlug('my_shoot'), 'My Shoot'));
test('titleFromSlug: single word', () => assert.equal(titleFromSlug('portfolio'), 'Portfolio'));

// ── toCamelCase ───────────────────────────────────────────────────────────────

test('toCamelCase: simple name', () => assert.equal(toCamelCase('Jane Smith'), 'janeSmith'));
test('toCamelCase: diacritics stripped', () => assert.equal(toCamelCase('Léa Müller'), 'leaMuller'));
test('toCamelCase: empty string', () => assert.equal(toCamelCase(''), ''));

// ── buildName ─────────────────────────────────────────────────────────────────

test('buildName: full fields', () => {
  const name = buildName({ author: 'Jane Smith', title: 'Summer', date: '2025-07-01' }, 0);
  assert.ok(name.startsWith('janeSmith_summer_20250701_001'), `got: ${name}`);
});

test('buildName: index padding', () => {
  const name = buildName({ author: 'Jan', title: 'T', date: '2025-01-01' }, 99);
  assert.ok(name.endsWith('_100'), `got: ${name}`);
});

test('buildName: missing author omitted', () => {
  const name = buildName({ title: 'Shoot', date: '2025-01-01' }, 0);
  assert.ok(!name.includes('_undefined'), `got: ${name}`);
  assert.ok(name.startsWith('shoot_'), `got: ${name}`);
});

// ── galleryDistName ───────────────────────────────────────────────────────────

test('galleryDistName: uses title slug', () => {
  assert.equal(galleryDistName({ title: 'Summer 2025' }, 'summer-2025'), 'summer-2025');
});

test('galleryDistName: falls back to srcName', () => {
  assert.equal(galleryDistName({}, 'my-shoot'), 'my-shoot');
});

test('galleryDistName: private → 16-char hex hash', () => {
  const name = galleryDistName({ private: true, author: 'A', title: 'T', date: '2025-01-01' }, 'x');
  assert.equal(name.length, 16);
  assert.match(name, /^[0-9a-f]+$/);
});

test('galleryDistName: private hash is deterministic', () => {
  const a = galleryDistName({ private: true, author: 'A', title: 'T', date: '2025-01-01' }, 'x');
  const b = galleryDistName({ private: true, author: 'A', title: 'T', date: '2025-01-01' }, 'x');
  assert.equal(a, b);
});

// ── generatePassword ──────────────────────────────────────────────────────────

test('generatePassword: format word-word-NN', () => {
  assert.match(generatePassword(), /^[a-z]+-[a-z]+-\d{2}$/);
});

test('generatePassword: two words are different', () => {
  const pwd = generatePassword();
  const [w1, w2] = pwd.split('-');
  assert.notEqual(w1, w2);
});

// ── validateConfig ────────────────────────────────────────────────────────────

test('validateConfig: valid config → no warnings', () => {
  assert.deepEqual(validateConfig({ title: 'T', locale: 'en', access: 'public' }), []);
});

test('validateConfig: unknown field warns', () => {
  const warns = validateConfig({ foo: 'bar' });
  assert.ok(warns.some(w => w.includes('foo')));
});

test('validateConfig: invalid date warns', () => {
  const warns = validateConfig({ date: '01/01/2025' });
  assert.ok(warns.some(w => w.includes('date')));
});

test('validateConfig: null → error', () => {
  assert.ok(validateConfig(null).length > 0);
});

// ── schema versions ───────────────────────────────────────────────────────────

test('MANIFEST_SCHEMA_VERSION is semver-like', () => assert.match(MANIFEST_SCHEMA_VERSION, /^\d+\.\d+/));
test('CONFIG_SCHEMA_VERSION is semver-like', () => assert.match(CONFIG_SCHEMA_VERSION, /^\d+\.\d+/));
