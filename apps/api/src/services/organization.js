// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/organization.js — canonical organization service (Sprint 22 Phase 2)
//
// Organizations are the canonical model. The `studios` table and `studio_id` columns
// were removed in migration 003 (Phase 2 rename). All references now use organization_id.

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
    JOIN organization_domains sd ON sd.organization_id = o.id
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
      (SELECT COUNT(*) FROM organization_memberships sm WHERE sm.organization_id = o.id) AS member_count,
      (SELECT COUNT(*) FROM galleries g WHERE g.organization_id = o.id)            AS gallery_count
    FROM organizations o
    ORDER BY o.created_at ASC
  `);
  return rows;
}

/**
 * Create a new organization.
 * @param {{ name: string, slug: string, plan?: string, locale?: string, country?: string, isDefault?: boolean }} opts
 * @returns {Promise<object>} The created organization row.
 */
export async function createOrganization({ name, slug, plan = 'free', locale = null, country = null, isDefault = false }) {
  const id  = genId();
  const now = new Date();

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO organizations (id, slug, name, locale, country, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, slug, name, locale, country, isDefault ? 1 : 0, now, now]
    );

    if (isDefault) {
      await conn.execute('UPDATE organizations SET is_default = 0 WHERE id != ?', [id]);
    }
  });

  return getOrganization(id);
}

/**
 * Update an organization.
 * @param {string} id
 * @param {{ name?: string, slug?: string, plan?: string, locale?: string, country?: string }} patch
 * @returns {Promise<object>} Updated organization row.
 */
export async function updateOrganization(id, patch) {
  const sets = [];
  const vals = [];

  if (patch.name        !== undefined) { sets.push('name = ?');        vals.push(patch.name); }
  if (patch.description !== undefined) { sets.push('description = ?'); vals.push(patch.description ?? null); }
  if (patch.slug        !== undefined) { sets.push('slug = ?');        vals.push(patch.slug); }
  if (patch.locale      !== undefined) { sets.push('locale = ?');      vals.push(patch.locale); }
  if (patch.country     !== undefined) { sets.push('country = ?');     vals.push(patch.country); }

  if (!sets.length) return getOrganization(id);

  sets.push('updated_at = ?');
  vals.push(new Date());
  vals.push(id);
  await query(`UPDATE organizations SET ${sets.join(', ')} WHERE id = ?`, vals);

  return getOrganization(id);
}

/**
 * Delete an organization.
 * @param {string} id
 */
export async function deleteOrganization(id) {
  await query('DELETE FROM organizations WHERE id = ?', [id]);
}

/**
 * Set a specific organization as the platform default.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function setDefaultOrganization(id) {
  await query('UPDATE organizations SET is_default = 0');
  await query('UPDATE organizations SET is_default = 1 WHERE id = ?', [id]);
  return getOrganization(id);
}

// ── Members ───────────────────────────────────────────────────────────────────

/**
 * List all members of an organization with their roles and gallery access.
 * Delegates to the organization_memberships table.
 * @param {string} orgId
 * @returns {Promise<object[]>}
 */
export async function listOrgMembers(orgId) {
  const [memberRows] = await query(`
    SELECT sm.role, u.id, u.email, u.name, u.bio, u.role AS user_role, u.is_photographer, u.created_at
    FROM organization_memberships sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.organization_id = ?
    ORDER BY sm.created_at ASC
  `, [orgId]);

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
  // Memberships created via the invite flow use organization_id.
  // Both cases must be recognised so collaborators can access the org.
  const [rows] = await query(
    `SELECT role FROM organization_memberships
     WHERE user_id = ? AND organization_id = ?
     LIMIT 1`,
    [userId, orgId]
  );
  return rows[0]?.role ?? null;
}

/**
 * Add or update a member's role in an organization.
 * @param {string} orgId
 * @param {string} userId
 * @param {string} role
 */
export async function upsertOrgMember(orgId, userId, role) {
  const id  = genId();
  const now = Date.now();
  await query(`
    INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE role = VALUES(role)
  `, [id, orgId, userId, role, now]);
}

/**
 * Remove a member from an organization.
 * @param {string} orgId
 * @param {string} userId
 */
export async function removeOrgMember(orgId, userId) {
  await query(
    'DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?',
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
    'SELECT * FROM organization_domains WHERE organization_id = ? ORDER BY is_primary DESC, created_at ASC',
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
    `INSERT INTO organization_domains (id, organization_id, domain, is_primary, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id)`,
    [id, orgId, domain, isPrimary ? 1 : 0, now]
  );
}

/**
 * Remove a custom domain from an organization.
 * @param {string} orgId
 * @param {string} domain
 */
export async function removeOrgDomain(orgId, domain) {
  await query(
    'DELETE FROM organization_domains WHERE organization_id = ? AND domain = ?',
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
  const [rows] = await query('SELECT * FROM settings WHERE organization_id = ?', [orgId]);
  return rows[0] ?? {};
}

/**
 * Upsert settings for an organization.
 * @param {string} orgId
 * @param {object} fields
 * @returns {Promise<object>}
 */
export async function updateOrgSettings(orgId, fields) {
  // Delegate to existing upsertSettings logic
  const { upsertSettings } = await import('../db/helpers.js');
  return upsertSettings(orgId, fields);
}
