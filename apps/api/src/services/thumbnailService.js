// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/thumbnailService.js — static thumbnail generation for admin use
//
// Spec:
//   Sizes  : sm (160px max-dim), md (400px max-dim)
//   Format : WebP, quality 80, EXIF auto-rotation applied
//   Storage: <ROOT>/thumbnails/<size>/<photoId>.webp
//   URL    : /media/thumbnails/<size>/<photoId>.webp
//
// These thumbnails are generated at upload time so admin UIs never load originals.

import path              from 'node:path';
import fs                from 'node:fs/promises';
import { existsSync }    from 'node:fs';
import { ROOT } from '../../../../packages/engine/src/fs.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const THUMB_SIZES = { sm: 160, md: 400 };
const THUMB_ROOT = process.env.THUMB_ROOT || path.join(ROOT, 'thumbnails');

// ── Path / URL helpers ────────────────────────────────────────────────────────

/**
 * Absolute filesystem path for a thumbnail.
 * @param {string} photoId
 * @param {'sm'|'md'} size
 */
export function thumbPath(photoId, size) {
  return path.join(THUMB_ROOT, size, `${photoId}.webp`);
}

/**
 * Public URL for a thumbnail (served at /media/thumbnails/<size>/<photoId>.webp).
 * @param {string} photoId
 * @param {'sm'|'md'} size
 */
export function thumbUrl(photoId, size) {
  return `/media/thumbnails/${size}/${photoId}.webp`;
}

/**
 * Returns the thumbnail shape expected by API responses.
 * Each size is null if the file does not exist on disk.
 * @param {string} photoId
 * @returns {{ sm: string|null, md: string|null }}
 */
export function photoThumbnails(photoId) {
  const result = {};
  for (const size of Object.keys(THUMB_SIZES)) {
    try {
      const p = thumbPath(photoId, size);
      result[size] = existsSync(p) ? thumbUrl(photoId, size) : null;
    } catch {
      result[size] = null;
    }
  }
  return result;
}

// ── Generation ────────────────────────────────────────────────────────────────

/**
 * Generate sm and md WebP thumbnails from a source image.
 *
 * @param {string} srcPath   Absolute path to the source photo file
 * @param {string} photoId   DB photo ID (used as filename)
 * @returns {Promise<{ sm: string|null, md: string|null }>}
 *          Paths of generated files (null on per-size failure)
 */
export async function generateThumbnails(srcPath, photoId) {
  const { default: sharp } = await import('sharp');
  const result = { sm: null, md: null };

  for (const [size, maxDim] of Object.entries(THUMB_SIZES)) {
    const dest = thumbPath(photoId, size);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await sharp(srcPath)
        .rotate()                                              // honour EXIF orientation
        .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(dest);
      result[size] = dest;
    } catch (err) {
      // Log but don't abort — the photo record is still valid; thumbnails can be backfilled
      console.error(`[thumbnailService] failed to generate ${size} for ${photoId}: ${err.message}`);
    }
  }

  return result;
}
