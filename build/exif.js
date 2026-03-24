// build/exif.js — extrait les métadonnées EXIF d'une image
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

    // Formater la vitesse d'obturation lisiblement
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
      // GPS coordinates stored as {lat, lng} — resolved to a place name + Maps link at build time.
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

// VERSION is needed by reverseGeocode for the User-Agent header.
// It is passed in as a parameter to avoid importing from gallery.js (circular risk).
// The exported functions accept an optional version string.

/**
 * Convert GPS decimal coordinates to a human-readable place name using the
 * Nominatim reverse geocoding API (OpenStreetMap, no API key required).
 *
 * Returns "City, Country" (or the best available approximation), or null on
 * failure. Nominatim asks for a maximum of 1 request per second.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} locale
 * @param {string} [version] - GalleryPack version string for the User-Agent header.
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
    // Use Intl.DisplayNames to get the country name in the gallery's locale.
    // This avoids multilingual names like "Schweiz/Suisse/Svizzera/Svizra" that
    // Nominatim sometimes returns for countries with multiple official languages.
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
 * Duplicated here (also in build/images.js) to avoid a circular import.
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
 * Photos whose exif.location is already a string (resolved in a previous build
 * and cached in photos.json) are skipped entirely — no network calls.
 * Unique coordinates are deduplicated and looked up one-by-one, respecting the
 * Nominatim 1 req/s rate limit.  Results are saved back into the manifest so
 * subsequent builds are fully offline.
 *
 * @param {Array}  results      - Photo metadata array (mutated in place).
 * @param {string} manifestPath - Path to dist/photos.json.
 * @param {string} locale       - Gallery locale (e.g. 'fr', 'en') for place name language.
 * @param {string} [version]    - GalleryPack version string for the User-Agent header.
 */
export async function resolveGpsLocations(results, manifestPath, locale = 'en', version = '0.0.0') {
  const toResolve = results.filter(p => p.exif?.location && typeof p.exif.location === 'object');
  if (!toResolve.length) return;

  log('\n\x1b[1m🌍  Reverse geocoding\x1b[0m');

  // Deduplicate by rounded coords (~1 km precision) to avoid redundant calls.
  const cache = new Map();

  for (const photo of toResolve) {
    // Ensure lat/lng are actual numbers regardless of how they were stored.
    const lat = Number(photo.exif.location.lat);
    const lng = Number(photo.exif.location.lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;

    if (!cache.has(key)) {
      if (cache.size > 0) await new Promise(r => setTimeout(r, 1100)); // Nominatim rate limit
      const place = await reverseGeocode(lat, lng, locale, version);
      // Fall back to plain decimal coords if the API call fails.
      cache.set(key, place ?? `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`);
      ok(`GPS (${key}) → ${cache.get(key)}`);
    }

    // Keep raw coords in exif.gps so the frontend can generate a Maps link.
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
