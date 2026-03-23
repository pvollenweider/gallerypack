/**
 * GalleryPack — test/invariants.test.js
 *
 * Tests for pure utility functions in build/utils.js.
 * Run with: npm test
 *
 * Uses Node.js built-in test runner (Node >= 18).
 */

import { test }   from 'node:test';
import assert     from 'node:assert/strict';
import {
  slugify,
  titleFromSlug,
  toCamelCase,
  buildName,
  galleryDistName,
  generatePassword,
  validateConfig,
  MANIFEST_SCHEMA_VERSION,
  CONFIG_SCHEMA_VERSION,
} from '../build/utils.js';

// ── slugify ───────────────────────────────────────────────────────────────────

test('slugify: basic ASCII', () => {
  assert.equal(slugify('My Gallery'), 'my-gallery');
});

test('slugify: diacritics stripped', () => {
  assert.equal(slugify('Été à Zürich'), 'ete-a-zurich');
  assert.equal(slugify('Quelques spectacles'), 'quelques-spectacles');
  assert.equal(slugify('Léa Müller-Girard'), 'lea-muller-girard');
});

test('slugify: special characters collapsed to hyphen', () => {
  assert.equal(slugify('Summer in Zürich — Portraits & Landscapes'), 'summer-in-zurich-portraits-landscapes');
});

test('slugify: leading and trailing hyphens removed', () => {
  assert.equal(slugify('  --hello--  '), 'hello');
});

test('slugify: empty / falsy input returns empty string', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});

test('slugify: numbers preserved', () => {
  assert.equal(slugify('gallery-2025'), 'gallery-2025');
});

// ── titleFromSlug ─────────────────────────────────────────────────────────────

test('titleFromSlug: hyphenated slug', () => {
  assert.equal(titleFromSlug('my-gallery'), 'My Gallery');
});

test('titleFromSlug: underscore slug', () => {
  assert.equal(titleFromSlug('my_shoot_2025'), 'My Shoot 2025');
});

test('titleFromSlug: single word', () => {
  assert.equal(titleFromSlug('insects'), 'Insects');
});

test('titleFromSlug: empty string', () => {
  assert.equal(titleFromSlug(''), '');
});

// ── toCamelCase ───────────────────────────────────────────────────────────────

test('toCamelCase: simple name', () => {
  assert.equal(toCamelCase('Philippe Vollenweider'), 'philippeVollenweider');
});

test('toCamelCase: diacritics stripped', () => {
  assert.equal(toCamelCase('Léa Müller-Girard'), 'leaMullerGirard');
});

test('toCamelCase: title with dashes and special chars', () => {
  assert.equal(toCamelCase('Summer in Zürich — Portraits & Landscapes'), 'summerInZurichPortraitsLandscapes');
});

test('toCamelCase: single word lowercase', () => {
  assert.equal(toCamelCase('insects'), 'insects');
});

test('toCamelCase: empty string', () => {
  assert.equal(toCamelCase(''), '');
});

// ── buildName ─────────────────────────────────────────────────────────────────

test('buildName: full fields', () => {
  const project = { author: 'Léa Müller-Girard', title: 'Summer in Zürich', date: '2025-04-15' };
  const name = buildName(project, 0);
  assert.equal(name, 'leaMullerGirard_summerInZurich_20250415_001');
});

test('buildName: index padding', () => {
  const project = { author: 'Alice', title: 'Show', date: '2024-01-01' };
  assert.equal(buildName(project, 0),  'alice_show_20240101_001');
  assert.equal(buildName(project, 8),  'alice_show_20240101_009');
  assert.equal(buildName(project, 99), 'alice_show_20240101_100');
});

test('buildName: missing author omitted', () => {
  const project = { author: '', title: 'Insects', date: '2026-01-17' };
  const name = buildName(project, 0);
  assert.equal(name, 'insects_20260117_001');
});

test('buildName: date with slashes normalised', () => {
  const project = { author: 'Bob', title: 'Live', date: '2023/04/25' };
  const name = buildName(project, 0);
  assert.equal(name, 'bob_live_20230425_001');
});

// ── galleryDistName ───────────────────────────────────────────────────────────

test('galleryDistName: uses project.name when provided', () => {
  const project = { name: 'summer-2025', title: 'Summer', author: 'Bob', date: '2025-01-01' };
  assert.equal(galleryDistName(project, 'my-src'), 'summer-2025');
});

test('galleryDistName: falls back to slugified title', () => {
  const project = { title: 'Summer in Zürich — 2025', author: 'Bob', date: '2025-01-01' };
  assert.equal(galleryDistName(project, 'my-src'), 'summer-in-zurich-2025');
});

test('galleryDistName: falls back to srcName if title empty', () => {
  const project = { title: '', author: 'Bob', date: '2025-01-01' };
  assert.equal(galleryDistName(project, 'my-src'), 'my-src');
});

test('galleryDistName: private → 16-char hex hash', () => {
  const project = { author: 'Alice', title: 'Secret', date: '2025-06-01', private: true };
  const hash = galleryDistName(project, 'secret-src');
  assert.match(hash, /^[0-9a-f]{16}$/);
});

test('galleryDistName: private hash is deterministic', () => {
  const project = { author: 'Alice', title: 'Secret', date: '2025-06-01', private: true };
  assert.equal(galleryDistName(project, 'a'), galleryDistName(project, 'b'));
});

test('galleryDistName: different configs produce different hashes', () => {
  const p1 = { author: 'Alice', title: 'Secret', date: '2025-06-01', private: true };
  const p2 = { author: 'Alice', title: 'Secret 2', date: '2025-06-01', private: true };
  assert.notEqual(galleryDistName(p1, 'src'), galleryDistName(p2, 'src'));
});

// ── generatePassword ──────────────────────────────────────────────────────────

test('generatePassword: matches word-word-NN format', () => {
  for (let i = 0; i < 20; i++) {
    const pwd = generatePassword();
    assert.match(pwd, /^[a-z]+-[a-z]+-\d{2}$/,
      `Password "${pwd}" does not match word-word-NN format`);
  }
});

test('generatePassword: two words are different', () => {
  for (let i = 0; i < 20; i++) {
    const [w1, w2] = generatePassword().split('-');
    assert.notEqual(w1, w2, 'Both words in password should be different');
  }
});

test('generatePassword: number in range 10–99', () => {
  for (let i = 0; i < 20; i++) {
    const parts = generatePassword().split('-');
    const num = parseInt(parts[2], 10);
    assert.ok(num >= 10 && num <= 99, `Number ${num} out of range 10–99`);
  }
});

// ── validateConfig ────────────────────────────────────────────────────────────

test('validateConfig: valid minimal config has no warnings', () => {
  const warns = validateConfig({ title: 'My Gallery', locale: 'fr' });
  assert.deepEqual(warns, []);
});

test('validateConfig: unknown field produces warning', () => {
  const warns = validateConfig({ title: 'X', unknownField: true });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /unknownField/);
});

test('validateConfig: invalid date format produces warning', () => {
  const warns = validateConfig({ title: 'X', date: '15-04-2025' });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /YYYY-MM-DD/);
});

test('validateConfig: date "auto" is valid', () => {
  const warns = validateConfig({ title: 'X', date: 'auto' });
  assert.deepEqual(warns, []);
});

test('validateConfig: unknown locale produces warning', () => {
  const warns = validateConfig({ title: 'X', locale: 'zh' });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /locale/);
});

test('validateConfig: unknown access value produces warning', () => {
  const warns = validateConfig({ title: 'X', access: 'token' });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /access/);
});

test('validateConfig: slideshow interval out of range', () => {
  const warns = validateConfig({ title: 'X', autoplay: { slideshowInterval: 120 } });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /slideshowInterval/);
});

test('validateConfig: null/undefined returns error string', () => {
  assert.ok(validateConfig(null).length > 0);
  assert.ok(validateConfig(undefined).length > 0);
});

// ── Schema versions ───────────────────────────────────────────────────────────

test('MANIFEST_SCHEMA_VERSION is a semver-like string', () => {
  assert.match(MANIFEST_SCHEMA_VERSION, /^\d+\.\d+$/);
});

test('CONFIG_SCHEMA_VERSION is a semver-like string', () => {
  assert.match(CONFIG_SCHEMA_VERSION, /^\d+\.\d+$/);
});

// ── Edge cases & footguns ─────────────────────────────────────────────────────
// These tests document known behaviours that could silently produce wrong output.

test('buildName: date "auto" (unresolved) produces name without date segment', () => {
  // "auto" contains no digits → date segment is empty → omitted from name.
  // In production the build pipeline resolves "auto" to a real date before calling
  // buildName, so this never fires.  The test pins the behaviour so a future
  // refactor doesn't silently change it.
  const name = buildName({ author: 'Alice', title: 'Test', date: 'auto' }, 0);
  assert.equal(name, 'alice_test_001');
  assert.ok(!name.includes('auto'), 'raw "auto" token must not appear in file name');
});

test('buildName: empty date falls back to today (YYYYMMDD)', () => {
  const name = buildName({ author: 'Alice', title: 'Test', date: '' }, 0);
  // Should contain an 8-digit date-like segment derived from today
  assert.match(name, /alice_test_\d{8}_001/);
});

test('galleryDistName: private with all-empty fields still produces a 16-char hash', () => {
  // Degenerate case: no author / title / date → seed is "||" → still a valid hash
  const hash = galleryDistName({ private: true }, 'fallback');
  assert.match(hash, /^[0-9a-f]{16}$/);
});

test('validateConfig: access "password" with password field is valid', () => {
  const warns = validateConfig({ title: 'X', access: 'password', password: 'amber-cloud-42' });
  assert.deepEqual(warns, []);
});

test('validateConfig: invalid access value (e.g. the mode name itself) warns', () => {
  // Catches the real-world typo of setting access to a non-mode string.
  // The build continues (warns only) — this test documents that the warning fires.
  const warns = validateConfig({ title: 'X', access: 'bzz-bzz' });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /access/);
  assert.match(warns[0], /public.*password|password.*public/);
});

test('validateConfig: private: true does not trigger any warning', () => {
  const warns = validateConfig({ title: 'Secret', private: true });
  assert.deepEqual(warns, []);
});

test('slugify: non-Latin scripts collapse to empty string', () => {
  // Chinese / Arabic / Hebrew characters have no ASCII equivalent after NFD →
  // they collapse to "-" which is then trimmed.  Output is "".
  assert.equal(slugify('中文'), '');
  assert.equal(slugify('عربي'), '');
});

test('galleryDistName: public falls back through name → title → srcName', () => {
  // name wins
  assert.equal(galleryDistName({ name: 'n', title: 't' }, 's'), 'n');
  // no name → title
  assert.equal(galleryDistName({ title: 'My Title' }, 's'), 'my-title');
  // no name, no title → srcName
  assert.equal(galleryDistName({}, 'src-fallback'), 'src-fallback');
});
