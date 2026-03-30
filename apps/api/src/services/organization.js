// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/organization.js — canonical organization service (Sprint 22 Phase 2)
//
// Organizations are the new canonical model introduced in Sprint 22.
// studios.id === organizations.id (same IDs, enforced by migration 013).
//
// Transitional strategy:
//   - All writes dual-write to both `organizations` and `studios` so that
//     older routes still using `studio_id` continue to work unchanged.
//   - Routes should migrate to use req.organizationId / orgId over time.
//   - sprint 23 will drop the studio_id columns after migration is complete.

import { query, withTransaction } from '../db/database.js';
import { genId } from '../db/helpers.js';

// ── Core CRUD ─────────────────────────────────────────────────────────────────

/**
 * Fetch a single organization by primary key.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getOrganization(id) {
  const [rows] = await query('SELECT * FROM organizations WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/**
 * Fetch a single organization by slug.
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function getOrganizationBySlug(slug) {
  const [rows] = await query('SELECT * FROM organizations WHERE slug = ?', [slug]);
  return rows[0] ?? null;
}

/**
 * Return the default organization (is_default = 1).
 * @returns {Promise<object|null>}
 */
export async function getDefaultOrganization() {
  const [rows] = await query('SELECT * FROM organizations WHERE is_default = 1 LIMIT 1');
  return rows[0] ?? null;
}

/**
 * Resolve an organization from an exact domain match in studio_domains.
 * @param {string} domain
 * @returns {Promise<object|null>}
 */
export async function getOrganizationByDomain(domain) {
  const [rows] = await query(`
    SELECT o.* FROM organizations o
    JOIN studio_domains sd ON sd.organization_id = o.id
    WHERE sd.domain = ?
  `, [domain]);
  return rows[0] ?? null;
}

/**
 * List all organizations with member + gallery counts.
 * @returns {Promise<object[]>}
 */
export async function listOrganizations() {
  const [rows] = await query(`
    SELECT o.*,
      (SELECT COUNT(*) FROM studio_memberships sm WHERE sm.organization_id = o.id) AS member_count,
      (SELECT COUNT(*) FROM galleries g WHERE g.organization_id = o.id)            AS gallery_count
    FROM organizations o
    ORDER BY o.created_at ASC
  `);
  return rows;
}

/**
 * Create a new organization.
 * Dual-writes to `studios` for backward compatibility.
 *
 * @param {{ name: string, slug: string, plan?: string, locale?: string, country?: string, isDefault?: boolean }} opts
 * @returns {Promise<object>} The created organization row.
 */
export async function createOrganization({ name, slug, plan = 'free', locale = null, country = null, isDefault = false }) {
  const id  = genId();
  const now = new Date();

  await withTransaction(async (conn) => {
    // Write canonical organization
    await conn.execute(
      `INSERT INTO organizations (id, slug, name, locale, country, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, slug, name, locale, country, isDefault ? 1 : 0, now, now]
    );

    // Dual-write to studios (same ID, so existing studio_id references stay valid)
    await conn.execute(
      `INSERT INTO studios (id, name, slug, plan, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug), plan = VALUES(plan), updated_at = VALUES(updated_at)`,
      [id, name, slug, plan, isDefault ? 1 : 0, Date.now(), Date.now()]
    );

    if (isDefault) {
      // Clear existing default flags in both tables
      await conn.execute('UPDATE organizations SET is_default = 0 WHERE id != ?', [id]);
      await conn.execute('UPDATE studios SET is_default = 0 WHERE id != ?', [id]);
    }
  });

  return getOrganization(id);
}

/**
 * Update an organization.
 * Dual-writes to `studios`.
 *
 * @param {string} id
 * @param {{ name?: string, slug?: string, plan?: string, locale?: string, country?: string }} patch
 * @returns {Promise<object>} Updated organization row.
 */
export async function updateOrganization(id, patch) {
  const orgSets = [];
  const orgVals = [];
  const stuSets = [];
  const stuVals = [];

  if (patch.name        !== undefined) { orgSets.push('name = ?');        orgVals.push(patch.name);        stuSets.push('name = ?');    stuVals.push(patch.name); }
  if (patch.description !== undefined) { orgSets.push('description = ?'); orgVals.push(patch.description ?? null); }
  if (patch.slug        !== undefined) { orgSets.push('slug = ?');        orgVals.push(patch.slug);        stuSets.push('slug = ?');    stuVals.push(patch.slug); }
  if (patch.locale      !== undefined) { orgSets.push('locale = ?');      orgVals.push(patch.locale);      stuSets.push('locale = ?');  stuVals.push(patch.locale); }
  if (patch.country     !== undefined) { orgSets.push('country = ?');     orgVals.push(patch.country);     stuSets.push('country = ?'); stuVals.push(patch.country); }
  if (patch.plan        !== undefined) {                                                                     stuSets.push('plan = ?');    stuVals.push(patch.plan); }

  if (!orgSets.length && !stuSets.length) return getOrganization(id);

  const now = new Date();
  if (orgSets.length) {
    orgSets.push('updated_at = ?');
    orgVals.push(now);
    orgVals.push(id);
    await query(`UPDATE organizations SET ${orgSets.join(', ')} WHERE id = ?`, orgVals);
  }
  if (stuSets.length) {
    stuSets.push('updated_at = ?');
    stuVals.push(Date.now());
    stuVals.push(id);
    await query(`UPDATE studios SET ${stuSets.join(', ')} WHERE id = ?`, stuVals);
  }

  return getOrganization(id);
}

/**
 * Delete an organization and its studio mirror.
 * @param {string} id
 */
export async function deleteOrganization(id) {
  await query('DELETE FROM organizations WHERE id = ?', [id]);
  await query('DELETE FROM studios WHERE id = ?', [id]);
}

/**
 * Set a specific organization as the platform default.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function setDefaultOrganization(id) {
  await query('UPDATE organizations SET is_default = 0');
  await query('UPDATE studios SET is_default = 0');
  await query('UPDATE organizations SET is_default = 1 WHERE id = ?', [id]);
  await query('UPDATE studios SET is_default = 1 WHERE id = ?', [id]);
  return getOrganization(id);
}

// ── Members ───────────────────────────────────────────────────────────────────

/**
 * List all members of an organization with their roles and gallery access.
 * Delegates to the studio_memberships table (organization_id column).
 * @param {string} orgId
 * @returns {Promise<object[]>}
 */
export async function listOrgMembers(orgId) {
  const [memberRows] = await query(`
    SELECT sm.role, u.id, u.email, u.name, u.bio, u.role AS user_role, u.is_photographer, u.created_at
    FROM studio_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.organization_id = ? OR (sm.organization_id IS NULL AND sm.studio_id = ?)
    ORDER BY sm.created_at ASC
  `, [orgId, orgId]);

  const [galleryAccess] = await query(`
    SELECT gra.user_id, gra.role AS gallery_role, g.id AS gallery_id, g.title AS gallery_title
    FROM gallery_role_assignments gra
    JOIN galleries g ON g.id = gra.gallery_id
    WHERE g.organization_id = ?
  `, [orgId]);

  const byUser = {};
  for (const r of galleryAccess) {
    if (!byUser[r.user_id]) byUser[r.user_id] = [];
    byUser[r.user_id].push({ galleryId: r.gallery_id, galleryTitle: r.gallery_title, role: r.gallery_role });
  }

  return memberRows.map(m => ({ ...m, galleryAccess: byUser[m.id] || [] }));
}

/**
 * Get a single member's organization role.
 * @param {string} userId
 * @param {string} orgId
 * @returns {Promise<string|null>}
 */
export async function getOrgRole(userId, orgId) {
  // Memberships created via upsertOrgMember set organization_id = orgId.
  // Memberships created via upsertStudioMembership (invite flow) only set studio_id.
  // Both cases must be recognised so collaborators can access the org.
  const [rows] = await query(
    `SELECT role FROM studio_memberships
     WHERE user_id = ? AND (organization_id = ? OR (organization_id IS NULL AND studio_id = ?))
     LIMIT 1`,
    [userId, orgId, orgId]
  );
  return rows[0]?.role ?? null;
}

/**
 * Add or update a member's role in an organization.
 * Dual-writes studio_id for backward compat.
 * @param {string} orgId
 * @param {string} userId
 * @param {string} role
 */
export async function upsertOrgMember(orgId, userId, role) {
  const id  = genId();
  const now = Date.now();
  await query(`
    INSERT INTO studio_memberships (id, studio_id, organization_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE role = VALUES(role), organization_id = VALUES(organization_id)
  `, [id, orgId, orgId, userId, role, now]);
}

/**
 * Remove a member from an organization.
 * @param {string} orgId
 * @param {string} userId
 */
export async function removeOrgMember(orgId, userId) {
  await query(
    'DELETE FROM studio_memberships WHERE organization_id = ? AND user_id = ?',
    [orgId, userId]
  );
}

// ── Domains ───────────────────────────────────────────────────────────────────

/**
 * List custom domains for an organization.
 * @param {string} orgId
 * @returns {Promise<object[]>}
 */
export async function listOrgDomains(orgId) {
  const [rows] = await query(
    'SELECT * FROM studio_domains WHERE organization_id = ? ORDER BY is_primary DESC, created_at ASC',
    [orgId]
  );
  return rows;
}

/**
 * Add a custom domain to an organization.
 * @param {string} orgId
 * @param {string} domain
 * @param {boolean} isPrimary
 */
export async function addOrgDomain(orgId, domain, isPrimary = false) {
  const id  = genId();
  const now = Date.now();
  await query(
    `INSERT INTO studio_domains (id, studio_id, organization_id, domain, is_primary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id)`,
    [id, orgId, orgId, domain, isPrimary ? 1 : 0, now]
  );
}

/**
 * Remove a custom domain from an organization.
 * @param {string} orgId
 * @param {string} domain
 */
export async function removeOrgDomain(orgId, domain) {
  await query(
    'DELETE FROM studio_domains WHERE organization_id = ? AND domain = ?',
    [orgId, domain]
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Get settings for an organization.
 * @param {string} orgId
 * @returns {Promise<object>}
 */
export async function getOrgSettings(orgId) {
  const [rows] = await query('SELECT * FROM settings WHERE studio_id = ?', [orgId]);
  return rows[0] ?? {};
}

/**
 * Upsert settings for an organization.
 * @param {string} orgId
 * @param {object} fields
 * @returns {Promise<object>}
 */
export async function updateOrgSettings(orgId, fields) {
  // Delegate to existing upsertSettings logic (same PK: studio_id = org_id)
  const { upsertSettings } = await import('../db/helpers.js');
  return upsertSettings(orgId, fields);
}
