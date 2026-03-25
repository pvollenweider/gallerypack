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
 * GalleryPack — packages/engine/src/utils.js
 *
 * Pure utility functions shared between the build pipeline and tests.
 * No side effects, no I/O, no Node built-ins beyond `crypto`.
 * Every function here must be deterministic and independently testable.
 */

import crypto from 'crypto';

// ── String helpers ────────────────────────────────────────────────────────────

/**
 * Convert an arbitrary string to a URL-safe hyphenated slug.
 * Strips diacritics, lowercases, collapses non-alphanumeric runs to hyphens.
 * "Été à Zürich — 2025!" → "ete-a-zurich-2025"
 */
export function slugify(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a folder slug to a readable title.
 * "my-gallery" → "My Gallery",  "ete_a_zurich" → "Ete A Zurich"
 */
export function titleFromSlug(slug) {
  return String(slug || '').split(/[-_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Convert an arbitrary string to camelCase (for file-name segments).
 * Strips diacritics, replaces non-alphanumeric chars with spaces, then camelCases.
 * "Léa Müller-Girard" → "leaMullerGirard"
 */
export function toCamelCase(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim().split(/\s+/).filter(Boolean)
    .map((w, i) => i === 0
      ? w[0].toLowerCase() + w.slice(1)
      : w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

// ── Naming convention ─────────────────────────────────────────────────────────

/**
 * Build the output base-name for a photo at index `idx` (0-based).
 * Format: `<authorCamel>_<titleCamel>_<YYYYMMDD>_<NNN>`
 * Missing segments are omitted; NNN is always present.
 *
 * @param {{ author?: string, title?: string, date?: string }} project
 * @param {number} idx - Zero-based photo index.
 * @returns {string}   - Base filename without extension.
 */
export function buildName(project, idx) {
  const { author = '', title = '', date = '' } = project;
  const today    = new Date().toISOString().slice(0, 10);
  const num      = String(idx + 1).padStart(3, '0');
  const authorKey = toCamelCase(author);
  const titleKey  = toCamelCase(title);
  const dateKey   = (date || today).replace(/[^0-9]/g, '');
  return [authorKey, titleKey, dateKey, num].filter(Boolean).join('_');
}

/**
 * Compute the dist folder name for a gallery.
 *
 * Public:  slugify(project.name ?? project.title) or srcName fallback
 * Private: 16-char SHA-256 hash of "author|title|date" — deterministic & unguessable
 *
 * @param {{ name?: string, title?: string, author?: string, date?: string, private?: boolean }} project
 * @param {string} srcName - Source folder name (last-resort fallback).
 * @returns {string}
 */
export function galleryDistName(project, srcName) {
  if (project.private) {
    const seed = [project.author || '', project.title || '', project.date || ''].join('|');
    return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  }
  return slugify(project.name || project.title || '') || srcName;
}

// ── Access / password ─────────────────────────────────────────────────────────

const PASSWORD_WORDS = [
  'maple','cedar','birch','oak','pine','fern',
  'amber','coral','ivory','jade','onyx','ruby',
  'cloud','river','stone','field','brook','grove',
  'solar','lunar','polar','delta','sigma','kappa',
];

/**
 * Generate a memorable two-words + two-digit password.
 * Example: "amber-cloud-42"
 */
export function generatePassword() {
  const w1 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  let w2;
  do { w2 = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)]; } while (w2 === w1);
  const num = Math.floor(Math.random() * 90) + 10;
  return `${w1}-${w2}-${num}`;
}

// ── Config schema & validation ────────────────────────────────────────────────

/** Schema version stamped into every photos.json manifest. */
export const MANIFEST_SCHEMA_VERSION = '1.2';

/** Schema version stamped into gallery.config.json when written by the wizard. */
export const CONFIG_SCHEMA_VERSION = '1.2';

/**
 * Known top-level project fields.  Unknown fields trigger a warning.
 */
const KNOWN_PROJECT_FIELDS = new Set([
  'name','title','subtitle','author','authorEmail',
  'date','location','description','locale',
  'private','standalone','access','password',
  'allowDownloadImage','allowDownloadGallery','autoplay',
  'coverPhoto','legal',
]);

/**
 * Validate a project config object.
 * Returns an array of warning strings (empty → valid).
 * Does not throw — warnings are informational only.
 *
 * @param {object} project - The `project` block from gallery.config.json.
 * @returns {string[]}     - Array of human-readable warnings.
 */
export function validateConfig(project) {
  const warns = [];
  if (!project || typeof project !== 'object') {
    return ['project config is missing or not an object'];
  }

  // Unknown fields
  for (const key of Object.keys(project)) {
    if (!KNOWN_PROJECT_FIELDS.has(key)) {
      warns.push(`Unknown field "project.${key}" — will be ignored`);
    }
  }

  // Date format
  if (project.date && project.date !== 'auto') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(project.date)) {
      warns.push(`project.date "${project.date}" should be YYYY-MM-DD or "auto"`);
    }
  }

  // Locale
  const VALID_LOCALES = new Set(['fr','en','de','es','it','pt']);
  if (project.locale && !VALID_LOCALES.has(project.locale.slice(0, 2).toLowerCase())) {
    warns.push(`project.locale "${project.locale}" is not a supported locale (fr/en/de/es/it/pt)`);
  }

  // Access
  const VALID_ACCESS = new Set(['public', 'password']);
  if (project.access && !VALID_ACCESS.has(project.access)) {
    warns.push(`project.access "${project.access}" should be "public" or "password"`);
  }

  // Autoplay
  if (project.autoplay && typeof project.autoplay.slideshowInterval === 'number') {
    if (project.autoplay.slideshowInterval < 1 || project.autoplay.slideshowInterval > 60) {
      warns.push(`autoplay.slideshowInterval ${project.autoplay.slideshowInterval} is outside 1–60 seconds`);
    }
  }

  return warns;
}
