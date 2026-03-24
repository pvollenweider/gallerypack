/**
 * GalleryPack v2 — server/invites.js
 * Invite-token store (JSON-backed, in-memory cache).
 */

import fs     from 'fs';
import path   from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE  = path.join(__DIR, 'invites.json');

let store = {};

function load() {
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { store = {}; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2) + '\n', 'utf8'); } catch (_) {}
}
load();

export function createInvite(label = '', prefill = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  store[token] = {
    token,
    label:      label.trim(),
    createdAt:  new Date().toISOString(),
    usageCount: 0,
    lastUsedAt: null,
    // Pre-fill data (all optional)
    singleDelivery:       prefill.singleDelivery       || false,  // if true, lock to one gallery only
    photographerName:     prefill.photographerName     || null,
    photographerEmail:    prefill.photographerEmail    || null,
    galleryTitle:         prefill.galleryTitle         || null,
    galleryDate:          prefill.galleryDate          || null,
    galleryLocation:      prefill.galleryLocation      || null,
    galleryLocale:        prefill.galleryLocale        || null,
    galleryAccess:        prefill.galleryAccess        || null,
    galleryPassword:      prefill.galleryPassword      || null,
    allowDownloadImage:   prefill.allowDownloadImage   != null ? prefill.allowDownloadImage   : null,
    allowDownloadGallery: prefill.allowDownloadGallery != null ? prefill.allowDownloadGallery : null,
  };
  save();
  return store[token];
}

export function getInvite(token) {
  return store[token] || null;
}

export function allInvites() {
  return Object.values(store).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt));
}

export function deleteInvite(token) {
  if (!store[token]) return false;
  delete store[token];
  save();
  return true;
}

export function incrementUsage(token) {
  if (!store[token]) return;
  store[token].usageCount = (store[token].usageCount || 0) + 1;
  store[token].lastUsedAt = new Date().toISOString();
  save();
}
