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
 * Focal-length bins (35 mm equivalent).
 * Each bin has a stable key, a display label, and the inclusive [min, max] range in mm.
 * max = Infinity for the last bucket.
 */
export const FOCAL_BINS = [
  { key: 'ultra_wide', label: '≤ 20 mm',    min: 0,   max: 20  },
  { key: 'wide',       label: '21–28 mm',   min: 21,  max: 28  },
  { key: 'wide_std',   label: '29–35 mm',   min: 29,  max: 35  },
  { key: 'normal',     label: '36–50 mm',   min: 36,  max: 50  },
  { key: 'portrait',   label: '51–85 mm',   min: 51,  max: 85  },
  { key: 'short_tele', label: '86–135 mm',  min: 86,  max: 135 },
  { key: 'tele',       label: '136–200 mm', min: 136, max: 200 },
  { key: 'super_tele', label: '> 200 mm',   min: 201, max: Infinity },
];

/**
 * Return the bin key for a focal length in mm (35 mm equivalent).
 * Returns null if mm is not a positive finite number.
 *
 * @param {number} mm
 * @returns {string|null}
 */
export function binFocalLength(mm) {
  if (typeof mm !== 'number' || !isFinite(mm) || mm <= 0) return null;
  for (const bin of FOCAL_BINS) {
    if (mm >= bin.min && mm <= bin.max) return bin.key;
  }
  return null;
}

/**
 * Parse the focal35 string produced by packages/engine/src/exif.js.
 * Format: "52mm (éq. 35mm)"  →  52
 * Returns null if unparseable.
 *
 * @param {string|undefined} focal35
 * @returns {number|null}
 */
export function parseFocal35(focal35) {
  if (!focal35) return null;
  const n = parseInt(focal35, 10);
  return isFinite(n) && n > 0 ? n : null;
}
