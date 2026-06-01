// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * Gallery policy resolver — single source of truth for access and download rules.
 *
 * When a gallery has a gallery_mode set, this module derives all low-level flags
 * from that mode. For legacy galleries (gallery_mode IS NULL) it reads the raw flags
 * directly, preserving backward compatibility.
 *
 * Usage:
 *   import { resolveGalleryPolicy, validateModeConstraints, applyModeDefaults, GALLERY_MODES } from '../services/galleryPolicy.js';
 */

export const GALLERY_MODES = ['portfolio', 'client_preview', 'client_delivery', 'archive'];

/**
 * Normalize a raw watermark config object (from config_json.watermark) into
 * a stable { mode, text } shape, handling both the old boolean `enabled` field
 * and the new `mode` string field.
 *
 * Old shape: { enabled: true,  text: 'X' }  → { mode: 'forced',       text: 'X' }
 * Old shape: { enabled: false }              → { mode: 'none',         text: '' }
 * New shape: { mode: 'forced', text: 'X' }   → { mode: 'forced',       text: 'X' }
 * New shape: { mode: 'photographer' }         → { mode: 'photographer', text: '' }
 * Missing / null                              → { mode: 'none',         text: '' }
 *
 * @param {object} gallery - DB row or serialized gallery object.
 * @returns {{ mode: 'none'|'forced'|'photographer', text: string }}
 */
export function resolveWatermarkConfig(gallery) {
  let cfg = {};
  try {
    cfg = JSON.parse(gallery.config_json || '{}');
  } catch {}
  const wm = cfg.watermark;
  if (!wm) return { mode: 'none', text: '' };

  // New shape: has an explicit `mode` string
  if (typeof wm.mode === 'string') {
    const mode = ['forced', 'photographer', 'none'].includes(wm.mode) ? wm.mode : 'none';
    return { mode, text: typeof wm.text === 'string' ? wm.text : '' };
  }

  // Old shape: boolean `enabled` field
  if (wm.enabled === true) {
    return { mode: 'forced', text: typeof wm.text === 'string' ? wm.text : '' };
  }
  return { mode: 'none', text: '' };
}

/**
 * Resolve the effective policy for a gallery row (DB row or camelCase object).
 * Accepts both snake_case DB rows and camelCase serialized objects.
 *
 * @param {object} gallery - DB row or serialized gallery object.
 * @returns {object} Resolved policy.
 */
export function resolveGalleryPolicy(gallery) {
  const mode = gallery.gallery_mode ?? gallery.galleryMode ?? null;

  switch (mode) {
    case 'portfolio':
      return {
        mode:                 'portfolio',
        access:               'public',
        requiresToken:        false,
        allowDownloadImage:   false,
        allowDownloadGallery: false,
        allowDownloadOriginal: false,
        downloadMode:         'none',
        watermarkEnabled:     true,
        watermarkMode:        'forced',
        watermarkText:        '',
        logAccess:            false,
        logDownload:          false,
        publicListed:         true,
      };

    case 'client_preview':
      return {
        mode:                 'client_preview',
        access:               'private',
        requiresToken:        true,
        allowDownloadImage:   false,
        allowDownloadGallery: false,
        allowDownloadOriginal: false,
        downloadMode:         'display',
        watermarkEnabled:     true,
        watermarkMode:        'forced',
        watermarkText:        '',
        logAccess:            true,
        logDownload:          false,
        publicListed:         false,
      };

    case 'client_delivery':
      return {
        mode:                 'client_delivery',
        access:               'private',
        requiresToken:        true,
        allowDownloadImage:   true,
        allowDownloadGallery: true,
        allowDownloadOriginal: false,
        downloadMode:         'display',
        watermarkEnabled:     true,
        watermarkMode:        'forced',
        watermarkText:        '',
        logAccess:            true,
        logDownload:          true,
        publicListed:         false,
      };

    case 'archive':
      return {
        mode:                 'archive',
        access:               'private',
        requiresToken:        false,
        allowDownloadImage:   true,
        allowDownloadGallery: true,
        allowDownloadOriginal: true,
        downloadMode:         'original',
        watermarkEnabled:     false,
        watermarkMode:        'none',
        watermarkText:        '',
        logAccess:            true,
        logDownload:          true,
        publicListed:         false,
      };

    default: {
      // Legacy: read raw flags — gallery_mode IS NULL
      const dlImage    = gallery.allow_download_image   ?? gallery.allowDownloadImage;
      const dlGallery  = gallery.allow_download_gallery ?? gallery.allowDownloadGallery;
      const dlOriginal = gallery.allow_download_original ?? gallery.allowDownloadOriginal;
      const dlMode     = gallery.download_mode ?? gallery.downloadMode ?? 'display';
      const access     = gallery.access ?? 'public';
      const wmCfg = resolveWatermarkConfig(gallery);
      return {
        mode:                 null,
        access,
        requiresToken:        false,
        allowDownloadImage:   !!dlImage,
        allowDownloadGallery: !!dlGallery,
        allowDownloadOriginal: !!dlOriginal,
        downloadMode:         dlMode,
        watermarkEnabled:     wmCfg.mode !== 'none',
        watermarkMode:        wmCfg.mode,
        watermarkText:        wmCfg.text,
        logAccess:            false,
        logDownload:          false,
        publicListed:         access === 'public',
      };
    }
  }
}

/**
 * Validate that a PATCH/POST payload does not violate the constraints of a given mode.
 *
 * @param {string|null} mode - The gallery_mode being set or already set.
 * @param {object} updates - CamelCase or snake_case update fields.
 * @returns {string|null} Error message, or null if valid.
 */
export function validateModeConstraints(mode, updates) {
  if (!mode) return null;

  const dlImage    = updates.allow_download_image    ?? updates.allowDownloadImage;
  const dlGallery  = updates.allow_download_gallery  ?? updates.allowDownloadGallery;
  const dlOriginal = updates.allow_download_original ?? updates.allowDownloadOriginal;

  if (mode === 'portfolio') {
    if (dlImage)    return 'Portfolio mode does not allow image downloads';
    if (dlGallery)  return 'Portfolio mode does not allow ZIP (gallery) downloads';
    if (dlOriginal) return 'Portfolio mode does not allow original file downloads';
  }

  if (mode === 'client_preview') {
    if (dlGallery)  return 'Client preview mode does not allow ZIP (gallery) downloads';
    if (dlOriginal) return 'Client preview mode does not allow original file downloads';
  }

  return null;
}

/**
 * Return the DB column values implied by a mode.
 * Used when setting gallery_mode to auto-populate the low-level flags.
 *
 * @param {string} mode
 * @returns {object} Snake-case DB fields.
 */
export function applyModeDefaults(mode) {
  const policy = resolveGalleryPolicy({ gallery_mode: mode });
  return {
    access:                policy.access,
    download_mode:         policy.downloadMode,
    allow_download_image:  policy.allowDownloadImage   ? 1 : 0,
    allow_download_gallery: policy.allowDownloadGallery ? 1 : 0,
    allow_download_original: policy.allowDownloadOriginal ? 1 : 0,
  };
}
