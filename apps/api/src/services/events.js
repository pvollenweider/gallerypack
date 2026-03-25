// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/events.js — business event dispatcher (Sprint 13)
// Fire-and-forget. No persistence in v1 — events go straight to notification handlers.
// Migrate to a persistent events table when volume requires it.

import { query } from '../db/database.js';
import { getSettings } from '../db/helpers.js';
import { sendEmail } from './email.js';

// ── Event type constants ───────────────────────────────────────────────────────

export const EVENTS = {
  PHOTO_UPLOADED:       'photo_uploaded',       // photographer uploaded via link
  PHOTO_VALIDATED:      'photo_validated',       // admin validated one or more photos
  PHOTO_REJECTED:       'photo_rejected',        // admin rejected one or more photos
  GALLERY_READY:        'gallery_ready',         // gallery has validated photos, not yet published
  GALLERY_PUBLISHED:    'gallery_published',     // build succeeded with at least one new photo
  GALLERY_BUILD_FAILED: 'gallery_build_failed',  // build job failed
};

// ── Notification helpers ───────────────────────────────────────────────────────

async function getStudioEditors(studioId) {
  const [rows] = await query(`
    SELECT u.email, u.name, sm.role,
           COALESCE(u.notify_on_upload,  1) AS notify_on_upload,
           COALESCE(u.notify_on_publish, 1) AS notify_on_publish
    FROM studio_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.studio_id = ? AND sm.role IN ('collaborator', 'admin', 'owner')
  `, [studioId]);
  return rows;
}

async function resolveBaseUrl(studioId) {
  const s = await getSettings(studioId);
  return (s?.base_url || process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function onPhotoUploaded({ studioId, galleryId, galleryTitle, uploadLinkLabel, photoCount }) {
  // Notify studio editors that new photos need review
  const editors = await getStudioEditors(studioId);
  if (!editors.length) return;

  const base = await resolveBaseUrl(studioId);
  const inboxUrl = `${base}/admin/#/galleries/${galleryId}?tab=inbox`;
  const source = uploadLinkLabel ? ` (via "${uploadLinkLabel}")` : '';

  for (const e of editors) {
    if (!e.notify_on_upload) continue;
    sendEmail({
      studioId,
      to: e.email,
      subject: `${photoCount} new photo${photoCount > 1 ? 's' : ''} to review — ${galleryTitle}`,
      text: `Hi,\n\nA photographer${source} uploaded ${photoCount} photo${photoCount > 1 ? 's' : ''} to "${galleryTitle}".\n\nReview them here:\n${inboxUrl}\n`,
      html: `<p>A photographer${source} uploaded <strong>${photoCount} photo${photoCount > 1 ? 's' : ''}</strong> to <strong>${galleryTitle}</strong>.</p><p><a href="${inboxUrl}">Review in inbox →</a></p>`,
      template: 'photo-uploaded',
    });
  }
}

async function onGalleryPublished({ studioId, galleryId, galleryTitle, gallerySlug, newPhotoCount }) {
  // Only notify if at least one photo is newly published
  if (!newPhotoCount || newPhotoCount < 1) return;

  const editors = await getStudioEditors(studioId);
  const base    = await resolveBaseUrl(studioId);
  const galleryUrl = `${base}/${gallerySlug}/`;

  for (const e of editors) {
    if (!e.notify_on_publish) continue;
    sendEmail({
      studioId,
      to: e.email,
      subject: `Gallery published — ${galleryTitle} (${newPhotoCount} new photo${newPhotoCount > 1 ? 's' : ''})`,
      text: `Hi,\n\n"${galleryTitle}" was published with ${newPhotoCount} new photo${newPhotoCount > 1 ? 's' : ''}.\n\nView it:\n${galleryUrl}\n`,
      html: `<p><strong>${galleryTitle}</strong> was published with <strong>${newPhotoCount} new photo${newPhotoCount > 1 ? 's' : ''}</strong>.</p><p><a href="${galleryUrl}">View gallery →</a></p>`,
      template: 'gallery-published',
    });
  }
}

async function onGalleryBuildFailed({ studioId, galleryId, galleryTitle, triggeredByUserId, errorMsg }) {
  // Only notify the user who triggered the build
  if (!triggeredByUserId) return;

  const [rows] = await query('SELECT email, name FROM users WHERE id = ?', [triggeredByUserId]);
  if (!rows[0]?.email) return;

  const base = await resolveBaseUrl(studioId);
  const galleryUrl = `${base}/admin/#/galleries/${galleryId}`;

  sendEmail({
    studioId,
    to: rows[0].email,
    subject: `Build failed — ${galleryTitle}`,
    text: `Hi,\n\nThe build for "${galleryTitle}" failed.\n\nError: ${errorMsg}\n\nView gallery:\n${galleryUrl}\n`,
    html: `<p>The build for <strong>${galleryTitle}</strong> failed.</p><p><code>${errorMsg}</code></p><p><a href="${galleryUrl}">View gallery →</a></p>`,
    template: 'build-failed',
  });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Emit a business event. Fire-and-forget — never throws.
 * @param {string} type — one of EVENTS.*
 * @param {object} payload
 */
export function emit(type, payload) {
  Promise.resolve().then(async () => {
    try {
      switch (type) {
        case EVENTS.PHOTO_UPLOADED:       return await onPhotoUploaded(payload);
        case EVENTS.GALLERY_PUBLISHED:    return await onGalleryPublished(payload);
        case EVENTS.GALLERY_BUILD_FAILED: return await onGalleryBuildFailed(payload);
        // PHOTO_VALIDATED, PHOTO_REJECTED, GALLERY_READY: no notifications in v1
        default: break;
      }
    } catch (err) {
      console.error(`[events] handler error for ${type}:`, err.message);
    }
  });
}
