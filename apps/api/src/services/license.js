// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/license.js — load and verify the GalleryPack license at startup

import { createVerify } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_KEY_PATH = join(__DIR, '../license/public.pem');

// ── Canonical JSON serialization (must match the generator) ──────────────────

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const sorted = Object.keys(obj).sort();
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

// ── Free-tier fallback ────────────────────────────────────────────────────────

function freeTier() {
  return {
    features: [],
    limits: {
      organization_limit: 1,
      gallery_limit:      10,
      storage_gb:         5,
      collaborator_limit: 3,
    },
    source: 'free',
  };
}

// ── Module state — resolved once at startup ───────────────────────────────────

let _capabilities = null;
let _licenseInfo   = null; // metadata for GET /api/platform/license

// ── Loader ────────────────────────────────────────────────────────────────────

export function loadLicense() {
  // Resolve the license file path
  const licensePath = process.env.LICENSE_FILE
    || join(__DIR, '../../../../../.gallerypack-license');

  if (!existsSync(licensePath)) {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free' };
    console.log('  ⚠  License: no license file found — running in free-tier mode');
    return;
  }

  let publicKey;
  try {
    publicKey = readFileSync(PUBLIC_KEY_PATH, 'utf8');
  } catch {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free', error: 'Public key not found' };
    console.warn('  ⚠  License: public key missing — running in free-tier mode');
    return;
  }

  let raw;
  try {
    raw = readFileSync(licensePath, 'utf8');
  } catch (err) {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free', error: 'Cannot read license file' };
    console.warn('  ⚠  License: cannot read license file — running in free-tier mode');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free', error: 'License file is not valid JSON' };
    console.warn('  ⚠  License: invalid JSON — running in free-tier mode');
    return;
  }

  const { payload, signature } = parsed;

  if (!payload || typeof payload !== 'object' || typeof signature !== 'string') {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free', error: 'License file is malformed' };
    console.warn('  ⚠  License: malformed license file — running in free-tier mode');
    return;
  }

  // Verify signature
  let signatureOk = false;
  try {
    const verifier = createVerify('SHA256');
    verifier.update(canonicalize(payload), 'utf8');
    verifier.end();
    signatureOk = verifier.verify(publicKey, signature, 'base64');
  } catch (err) {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free', error: 'Signature verification error: ' + err.message };
    console.warn('  ⚠  License: signature error — running in free-tier mode');
    return;
  }

  if (!signatureOk) {
    _capabilities = freeTier();
    _licenseInfo  = { source: 'free', error: 'Invalid signature — license may have been tampered with' };
    console.warn('  ⚠  License: invalid signature — running in free-tier mode');
    return;
  }

  // Check expiry
  const expired = payload.expires_at ? new Date(payload.expires_at) < new Date() : false;

  if (expired) {
    _capabilities = freeTier();
    _licenseInfo  = {
      source:      'expired',
      licensee:    payload.licensee,
      issued_at:   payload.issued_at,
      expires_at:  payload.expires_at,
      features:    payload.features ?? [],
      limits:      payload.limits   ?? {},
      expired:     true,
    };
    console.warn(`  ⚠  License: expired (${payload.expires_at}) for ${payload.licensee?.name} — running in free-tier mode`);
    return;
  }

  // Valid license
  _capabilities = {
    features: payload.features ?? [],
    limits:   payload.limits   ?? {},
    source:   'license',
  };
  _licenseInfo = {
    source:     'license',
    id:         payload.id,
    licensee:   payload.licensee,
    issued_at:  payload.issued_at,
    expires_at: payload.expires_at ?? null,
    features:   payload.features ?? [],
    limits:     payload.limits   ?? {},
    expired:    false,
  };

  console.log(`  ✓  License: valid — ${payload.licensee?.name} <${payload.licensee?.email}>`);
  if (payload.features?.length) console.log(`     Features: ${payload.features.join(', ')}`);
  const lim = payload.limits ?? {};
  if (Object.keys(lim).length) console.log(`     Limits:   ${Object.entries(lim).map(([k,v]) => `${k}=${v}`).join(', ')}`);
  if (payload.expires_at) console.log(`     Expires:  ${payload.expires_at}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Resolved capabilities. Falls back to free tier if license is absent/invalid. */
export function getCapabilities() {
  return _capabilities ?? freeTier();
}

/** Full license metadata for display in the platform UI. */
export function getLicenseInfo() {
  return _licenseInfo ?? { source: 'free' };
}

/**
 * Effective organization limit from the current capabilities.
 * `multi_organization` feature with no explicit limit → unlimited.
 * No feature → hard cap of 1.
 */
export function effectiveOrgLimit() {
  const caps = getCapabilities();
  if (caps.features.includes('multi_organization')) {
    return caps.limits.organization_limit ?? Infinity;
  }
  return 1;
}

/**
 * Verify and install a license from a JSON string.
 * Writes the file to disk and reloads the in-memory state.
 * Throws if the license is invalid.
 *
 * @param {string} licenseJson
 * @returns {{ ok: true, info: object }}
 */
export function installLicense(licenseJson) {
  let publicKey;
  try {
    publicKey = readFileSync(PUBLIC_KEY_PATH, 'utf8');
  } catch {
    throw new Error('Public key not found on server');
  }

  // Verify before writing
  let parsed;
  try { parsed = JSON.parse(licenseJson); } catch { throw new Error('Invalid JSON'); }

  const { payload, signature } = parsed;
  if (!payload || !signature) throw new Error('License is missing payload or signature');

  const canonical = canonicalize(payload);
  let ok = false;
  try {
    const v = createVerify('SHA256');
    v.update(canonical, 'utf8');
    v.end();
    ok = v.verify(publicKey, signature, 'base64');
  } catch (err) {
    throw new Error('Signature verification failed: ' + err.message);
  }
  if (!ok) throw new Error('Invalid signature — license may have been tampered with');

  // Write to disk
  const licensePath = process.env.LICENSE_FILE
    || join(__DIR, '../../../../../.gallerypack-license');

  writeFileSync(licensePath, licenseJson, 'utf8');

  // Reload in-memory state
  loadLicense();

  return { ok: true, info: getLicenseInfo() };
}
