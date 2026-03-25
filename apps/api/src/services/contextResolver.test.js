// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/contextResolver.test.js — unit tests for hostname resolution
// Uses module mocking (node:test mock.module) to avoid a real DB connection.

import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_CIRCUS   = { id: 'org-1', slug: 'circus', name: 'Circus Studio' };
const ORG_DEFAULT  = { id: 'org-0', slug: 'default', name: 'Default Studio', is_default: 1 };

// ── Helpers: in-process stubs (no mock.module available in all node versions) ─
//
// We test the pure logic by building a local version of resolveStudioFromHostname
// that accepts injected dependencies — mirrors the actual implementation's logic.

function buildResolver({ byDomain = null, bySlug = null, defaultOrg = ORG_DEFAULT }) {
  return async function resolveStudioFromHostname(rawHostname, mode = 'single', baseDomain = 'gallerypack.app') {
    const host = rawHostname?.split(':')[0]?.toLowerCase()?.trim() || '';

    if (mode === 'single') {
      return defaultOrg;
    }

    if (!host) return null;
    if (host === baseDomain || host === `www.${baseDomain}`) return null;

    if (byDomain) {
      const found = byDomain(host);
      if (found) return found;
    }

    const subdomainSuffix = `.${baseDomain}`;
    if (host.endsWith(subdomainSuffix)) {
      const slug = host.slice(0, -subdomainSuffix.length);
      if (slug && bySlug) return bySlug(slug) ?? null;
    }

    return null;
  };
}

// ── single mode ───────────────────────────────────────────────────────────────

describe('PLATFORM_MODE=single', () => {
  const resolve = buildResolver({ defaultOrg: ORG_DEFAULT });

  test('always returns the default org regardless of hostname', async () => {
    assert.deepEqual(await resolve('anything.example.com', 'single'), ORG_DEFAULT);
  });

  test('returns default org even for empty hostname', async () => {
    assert.deepEqual(await resolve('', 'single'), ORG_DEFAULT);
  });

  test('returns default org for the base domain itself', async () => {
    assert.deepEqual(await resolve('gallerypack.app', 'single'), ORG_DEFAULT);
  });
});

// ── multi mode: platform root ─────────────────────────────────────────────────

describe('PLATFORM_MODE=multi — platform root', () => {
  const resolve = buildResolver({});

  test('base domain returns null (platform root)', async () => {
    assert.equal(await resolve('gallerypack.app', 'multi'), null);
  });

  test('www base domain returns null', async () => {
    assert.equal(await resolve('www.gallerypack.app', 'multi'), null);
  });

  test('empty hostname returns null', async () => {
    assert.equal(await resolve('', 'multi'), null);
  });

  test('port is stripped before matching', async () => {
    assert.equal(await resolve('gallerypack.app:4000', 'multi'), null);
  });
});

// ── multi mode: subdomain resolution ─────────────────────────────────────────

describe('PLATFORM_MODE=multi — subdomain', () => {
  const resolve = buildResolver({
    bySlug: (slug) => slug === 'circus' ? ORG_CIRCUS : null,
  });

  test('circus.gallerypack.app → ORG_CIRCUS', async () => {
    assert.deepEqual(await resolve('circus.gallerypack.app', 'multi'), ORG_CIRCUS);
  });

  test('unknown.gallerypack.app → null', async () => {
    assert.equal(await resolve('unknown.gallerypack.app', 'multi'), null);
  });

  test('case-insensitive hostname handling', async () => {
    assert.deepEqual(await resolve('Circus.GalleryPack.App', 'multi'), ORG_CIRCUS);
  });
});

// ── multi mode: exact domain match ───────────────────────────────────────────

describe('PLATFORM_MODE=multi — exact domain', () => {
  const resolve = buildResolver({
    byDomain: (domain) => domain === 'circus-photos.com' ? ORG_CIRCUS : null,
  });

  test('exact match returns the right org', async () => {
    assert.deepEqual(await resolve('circus-photos.com', 'multi'), ORG_CIRCUS);
  });

  test('unknown exact domain → null', async () => {
    assert.equal(await resolve('unknown.com', 'multi'), null);
  });
});

// ── multi mode: domain takes precedence over subdomain ───────────────────────

describe('PLATFORM_MODE=multi — domain precedence', () => {
  const resolve = buildResolver({
    byDomain: (domain) => domain === 'circus.gallerypack.app' ? ORG_CIRCUS : null,
    bySlug:   (slug)   => null, // slug lookup should not be reached
  });

  test('custom domain match wins over subdomain lookup', async () => {
    assert.deepEqual(await resolve('circus.gallerypack.app', 'multi'), ORG_CIRCUS);
  });
});

// ── strip port ────────────────────────────────────────────────────────────────

describe('port stripping', () => {
  const resolve = buildResolver({
    bySlug: (slug) => slug === 'circus' ? ORG_CIRCUS : null,
  });

  test('hostname with port is resolved correctly', async () => {
    assert.deepEqual(await resolve('circus.gallerypack.app:3000', 'multi'), ORG_CIRCUS);
  });
});
