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
 * @gallerypack/shared — type definitions (JSDoc)
 *
 * These are the canonical input/output contracts for the engine package.
 * Used by the CLI, the API server, and the queue worker.
 */

/**
 * @typedef {'free'|'pro'|'agency'} Plan
 * @typedef {'admin'|'photographer'} UserRole
 * @typedef {'public'|'private'|'password'} GalleryAccess
 * @typedef {'pending'|'queued'|'running'|'done'|'error'} BuildStatus
 */

/**
 * Geocoder function injected into the engine to resolve GPS coordinates.
 * Return null to indicate failure; the engine will fall back to decimal notation.
 *
 * @callback Geocoder
 * @param {number} lat
 * @param {number} lng
 * @param {string} locale
 * @returns {Promise<string|null>}
 */

/**
 * Options passed to buildGallery() to control optional side-effects.
 *
 * @typedef {object} BuildOptions
 * @property {boolean}  [force=false]           - Force re-encode all images.
 * @property {boolean}  [webpOnly=false]         - Skip HTML/JS generation.
 * @property {boolean}  [generateApacheAuth=false] - Write .htaccess/.htpasswd for password-protected galleries.
 * @property {Geocoder|null} [geocoder]          - Reverse-geocoding function. null = skip geocoding. Omit = use default Nominatim.
 */

/**
 * Result returned by buildGallery().
 *
 * @typedef {object} BuildOutput
 * @property {string}      srcName      - Source gallery folder name.
 * @property {string}      distName     - Output folder name under dist/.
 * @property {object}      project      - Resolved project config.
 * @property {number}      photoCount   - Number of processed photos.
 * @property {string|null} firstPhoto   - Base name of the first processed photo (cover).
 * @property {number}      durationMs   - Total build time in milliseconds.
 * @property {object|null} authInfo     - { username, password, htaccess, htpasswd } if access=password, else null.
 */

export {};
