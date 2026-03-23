// build/exif.js — extrait les métadonnées EXIF d'une image
import exifr from 'exifr';
import path from 'path';

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
