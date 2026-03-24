/**
 * GalleryPack v2 — server/mailer.js
 * Nodemailer-based email sender.
 * Gracefully no-ops if SMTP is not configured.
 */

import { getSetting } from './settings.js';

let nodemailer = null;
try {
  const mod = await import('nodemailer');
  nodemailer = mod.default ?? mod;
} catch (_) {
  console.warn('  ⚠  nodemailer not installed — email notifications disabled.');
}

function createTransport() {
  if (!nodemailer) return null;
  if (!getSetting('smtpEnabled', true)) return null;
  const host = getSetting('smtpHost');
  const user = getSetting('smtpUser');
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port:   getSetting('smtpPort', 587),
    secure: getSetting('smtpSecure', false),
    auth:   user ? { user, pass: getSetting('smtpPass', '') } : undefined,
  });
}

/**
 * Send an email. Returns true on success, false on failure/skip.
 * @param {object} opts  { to, subject, html, text }
 */
export async function sendMail({ to, subject, html, text }) {
  if (!to) return false;
  const transport = createTransport();
  if (!transport) return false;
  const from = getSetting('smtpFrom') || getSetting('smtpUser') || '';
  try {
    await transport.sendMail({ from, to, subject, html, text });
    return true;
  } catch (err) {
    console.error('  ✗  Email send failed:', err.message);
    return false;
  }
}

/**
 * Send gallery-ready notification to photographer and admin.
 */
export async function notifyGalleryReady({ galleryUrl, galleryTitle, photographerName, photographerEmail, manageUrl }) {
  const adminEmail = getSetting('adminEmail');
  const appName    = getSetting('appName', 'GalleryPack');

  const subject = `✓ Gallery ready — ${galleryTitle}`;
  const html = `
<p>Hello${photographerName ? ` ${photographerName}` : ''},</p>
<p>Your gallery <strong>${galleryTitle}</strong> has been built and is ready to view:</p>
<p><a href="${galleryUrl}">${galleryUrl}</a></p>
${manageUrl ? `<p>You can also manage your gallery (add/remove photos) here:<br>\n<a href="${manageUrl}">${manageUrl}</a></p>` : ''}
<p style="color:#888;font-size:12px">— ${appName}</p>`;
  const text = `Hello${photographerName ? ` ${photographerName}` : ''},\n\nYour gallery "${galleryTitle}" is ready:\n${galleryUrl}\n\n— ${appName}`;

  const results = [];
  if (photographerEmail) {
    results.push(await sendMail({ to: photographerEmail, subject, html, text }));
  }
  if (adminEmail && adminEmail !== photographerEmail) {
    const adminSubject = `[Admin] Gallery ready — ${galleryTitle}`;
    const adminHtml = html.replace('Hello', 'Gallery built for').replace(photographerName || 'Hello', photographerName || 'unknown photographer');
    results.push(await sendMail({ to: adminEmail, subject: adminSubject, html: adminHtml, text }));
  }
  return results;
}

/**
 * Send photographer access link (after revocation or initial grant).
 */
export async function notifyAccessGranted({ manageUrl, galleryTitle, photographerName, photographerEmail }) {
  if (!photographerEmail) return false;
  const appName = getSetting('appName', 'GalleryPack');
  const subject = `Your gallery management link — ${galleryTitle}`;
  const html = `
<p>Hello${photographerName ? ` ${photographerName}` : ''},</p>
<p>Here is your management link for gallery <strong>${galleryTitle}</strong>:</p>
<p><a href="${manageUrl}">${manageUrl}</a></p>
<p style="color:#888;font-size:12px">— ${appName}</p>`;
  const text = `Hello${photographerName ? ` ${photographerName}` : ''},\n\nHere is your management link for gallery "${galleryTitle}":\n${manageUrl}\n\n— ${appName}`;
  return sendMail({ to: photographerEmail, subject, html, text });
}

/**
 * Send invite link to photographer (and copy to admin).
 */
export async function notifyInviteCreated({ uploadUrl, photographerEmail, photographerName, label }) {
  if (!photographerEmail) return [];
  const adminEmail = getSetting('adminEmail');
  const appName    = getSetting('appName', 'GalleryPack');

  const subject = `Your gallery upload link`;
  const html = `
<p>Hello${photographerName ? ` ${photographerName}` : ''},</p>
<p>You have been invited to upload your photos${label ? ` for <strong>${label}</strong>` : ''}.</p>
<p>Use this link to upload your photos:</p>
<p><a href="${uploadUrl}">${uploadUrl}</a></p>
<p style="color:#888;font-size:12px">— ${appName}</p>`;
  const text = `Hello${photographerName ? ` ${photographerName}` : ''},\n\nUpload your photos${label ? ` for "${label}"` : ''} here:\n${uploadUrl}\n\n— ${appName}`;

  const results = [];
  results.push(await sendMail({ to: photographerEmail, subject, html, text }));
  if (adminEmail && adminEmail !== photographerEmail) {
    results.push(await sendMail({
      to: adminEmail,
      subject: `[Admin copy] Invite sent to ${photographerEmail}`,
      html, text,
    }));
  }
  return results;
}
