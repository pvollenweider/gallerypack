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

// packages/engine/src/exif.js — EXIF extraction and reverse geocoding
import exifr from 'exifr';
import fs    from 'fs';
import path  from 'path';

/**
 * Retourne un objet EXIF propre et sérialisable pour une image donnée.
 * Les champs absents sont omis.
 */
export async function extractExif(filePath) {
  try {
    const raw = await exifr.parse(filePath, {
      pick: [
        'Make', 'Model', 'LensModel',
        'DateTimeOriginal', 'CreateDate',
        'ExposureTime', 'FNumber', 'ISO',
        'FocalLength', 'FocalLengthIn35mmFormat',
        'Flash', 'WhiteBalance',
        'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef', 'GPSAltitude',
        'ImageWidth', 'ImageHeight',
        'Orientation',
        'Copyright', 'Artist',
      ],
    });

    if (!raw) return {};

    const fmt = (v) => (v !== undefined && v !== null ? v : undefined);

    // GPS: exifr may return [deg, min, sec] arrays or a decimal number depending on context.
    const toDec = (val) => {
      if (typeof val === 'number') return val;
      if (Array.isArray(val)) return val[0] + val[1] / 60 + val[2] / 3600;
      return undefined;
    };
    const rawLat = toDec(raw.GPSLatitude);
    const rawLng = toDec(raw.GPSLongitude);
    const lat = rawLat !== undefined && raw.GPSLatitudeRef  === 'S' ? -rawLat : rawLat;
    const lng = rawLng !== undefined && raw.GPSLongitudeRef === 'W' ? -rawLng : rawLng;

    let shutter;
    if (raw.ExposureTime) {
      if (raw.ExposureTime < 1) {
        shutter = `1/${Math.round(1 / raw.ExposureTime)}s`;
      } else {
        shutter = `${raw.ExposureTime}s`;
      }
    }

    const date = raw.DateTimeOriginal || raw.CreateDate;

    return {
      camera:    [raw.Make, raw.Model].filter(Boolean).join(' ') || undefined,
      lens:      fmt(raw.LensModel),
      date:      date ? date.toISOString() : undefined,
      shutter,
      aperture:  raw.FNumber ? `ƒ/${raw.FNumber}` : undefined,
      iso:       raw.ISO ? `ISO ${raw.ISO}` : undefined,
      focal:     raw.FocalLength ? `${raw.FocalLength}mm` : undefined,
      focal35:   raw.FocalLengthIn35mmFormat ? `${raw.FocalLengthIn35mmFormat}mm (éq. 35mm)` : undefined,
      width:     fmt(raw.ImageWidth),
      height:    fmt(raw.ImageHeight),
      location:  lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
      copyright: fmt(raw.Copyright),
    };
  } catch (_) {
    return {};
  }
}

// ── Inline logging helpers ────────────────────────────────────────────────────
const log  = (m) => process.stdout.write(m + '\n');
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);

// ── Reverse geocoding ─────────────────────────────────────────────────────────

/**
 * Convert GPS decimal coordinates to a human-readable place name using the
 * Nominatim reverse geocoding API (OpenStreetMap, no API key required).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} locale
 * @param {string} [version]
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(lat, lng, locale = 'en', version = '0.0.0') {
  try {
    const lang = locale.slice(0, 2).toLowerCase();
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=12&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': `GalleryPack/${version} (https://github.com/pvollenweider/gallerypack)`,
        'Accept-Language': `${lang},en;q=0.8`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '';
    const cc = (a.country_code || '').toUpperCase();
    let country = a.country || '';
    if (cc) {
      try { country = new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(cc) || country; }
      catch (_) {}
    }
    return [city, country].filter(Boolean).join(', ') || null;
  } catch (_) {
    return null;
  }
}

/**
 * Internal helper: load the existing dist/photos.json manifest, or return a blank structure.
 */
function _loadManifest(manifestPath) {
  if (fs.existsSync(manifestPath)) {
    try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch(_) {}
  }
  return { photos: {} };
}

/**
 * Resolve GPS coordinates in photo EXIF to human-readable place names.
 *
 * @param {Array}          results      - Photo metadata array (mutated in place).
 * @param {string}         manifestPath - Path to dist/photos.json.
 * @param {string}         locale       - Gallery locale.
 * @param {string}         [version]    - GalleryPack version string.
 * @param {Function|null}  [geocoder]   - Injectable geocoder (lat,lng,locale)=>Promise<string|null>.
 *                                        Pass null to skip geocoding entirely.
 *                                        Omit to use the default Nominatim implementation.
 */
export async function resolveGpsLocations(results, manifestPath, locale = 'en', version = '0.0.0', geocoder = undefined) {
  // null = caller explicitly opted out of geocoding
  if (geocoder === null) return;

  const toResolve = results.filter(p => p.exif?.location && typeof p.exif.location === 'object');
  if (!toResolve.length) return;

  // Resolve the geocoder: use injected function or fall back to Nominatim.
  const resolveOne = geocoder ?? ((lat, lng, loc) => reverseGeocode(lat, lng, loc, version));

  log('\n\x1b[1m🌍  Reverse geocoding\x1b[0m');

  const cache = new Map();

  for (const photo of toResolve) {
    const lat = Number(photo.exif.location.lat);
    const lng = Number(photo.exif.location.lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;

    if (!cache.has(key)) {
      if (cache.size > 0 && !geocoder) await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit
      const place = await resolveOne(lat, lng, locale);
      cache.set(key, place ?? `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`);
      ok(`GPS (${key}) → ${cache.get(key)}`);
    }

    photo.exif.gps = { lat, lng };
    photo.exif.location = cache.get(key);
  }

  // Persist resolved strings back into the manifest so next builds skip the API.
  const manifest = _loadManifest(manifestPath);
  for (const photo of toResolve) {
    if (manifest.photos[photo.exif.originalFile]) {
      manifest.photos[photo.exif.originalFile].exif.gps      = photo.exif.gps;
      manifest.photos[photo.exif.originalFile].exif.location = photo.exif.location;
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}
