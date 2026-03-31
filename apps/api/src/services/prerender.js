// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/prerender.js — pre-generate static index.html files
// for / and /{projectSlug}/ so Caddy serves them directly without hitting Node.

import fs   from 'fs';
import path from 'path';
import { marked } from 'marked';

import { query }       from '../db/database.js';
import { getSettings } from '../db/helpers.js';
import { getCoverName, getPublicPhotoCount, getPublicDateRange } from '../routes/public.js';
import { renderProjectIndex, renderProjectListing } from '../views/landing.js';
import { DIST_ROOT } from '../../../../packages/engine/src/fs.js';
import { logger }    from '../lib/logger.js';

async function getSiteTitle() {
  const [rows] = await query('SELECT id FROM studios LIMIT 1');
  const settings = rows[0] ? await getSettings(rows[0].id) : null;
  return settings?.site_title || 'GalleryPack';
}

/** Write data/public/index.html — org root project listing */
export async function prerenderRoot() {
  const siteTitle = await getSiteTitle();
  const [orgRows] = await query('SELECT name, description FROM organizations WHERE is_default = 1 LIMIT 1');
  const org       = orgRows[0] ?? null;
  const orgName   = org?.name || siteTitle;
  const orgDescHtml = org?.description ? marked.parse(org.description) : '';

  const [projRows] = await query(
    `SELECT p.id, p.slug, p.name, p.description, p.sort_order, p.cover_gallery_id,
            COUNT(g.id) AS gallery_count,
            MIN(g.date) AS date_from,
            MAX(g.date) AS date_to,
            (SELECT g2.slug FROM galleries g2
             WHERE g2.project_id = p.id AND g2.access = 'public' AND g2.build_status = 'done'
             ORDER BY g2.date DESC, g2.created_at DESC LIMIT 1) AS fallback_gallery_slug,
            (SELECT g2.cover_photo FROM galleries g2
             WHERE g2.project_id = p.id AND g2.access = 'public' AND g2.build_status = 'done'
             ORDER BY g2.date DESC, g2.created_at DESC LIMIT 1) AS fallback_cover_photo
     FROM projects p
     JOIN galleries g ON g.project_id = p.id AND g.access = 'public' AND g.build_status = 'done'
     GROUP BY p.id
     ORDER BY p.sort_order ASC, date_to DESC, p.created_at DESC`
  );

  // Resolve cover gallery slug: prefer explicitly set cover_gallery_id
  const coverGalIds = projRows.filter(p => p.cover_gallery_id).map(p => p.cover_gallery_id);
  let coverGalMap = {};
  if (coverGalIds.length > 0) {
    const [cgRows] = await query(
      `SELECT id, slug, cover_photo FROM galleries WHERE id IN (${coverGalIds.map(() => '?').join(',')})`,
      coverGalIds
    );
    for (const r of cgRows) coverGalMap[r.id] = r;
  }

  const projects = await Promise.all(projRows.map(async p => {
    let coverGallerySlug, coverPhoto;
    if (p.cover_gallery_id && coverGalMap[p.cover_gallery_id]) {
      coverGallerySlug = coverGalMap[p.cover_gallery_id].slug;
      coverPhoto       = coverGalMap[p.cover_gallery_id].cover_photo;
    } else {
      coverGallerySlug = p.fallback_gallery_slug;
      coverPhoto       = p.fallback_cover_photo;
    }
    let coverName = null;
    if (coverGallerySlug) {
      const distSlug = `${p.slug}/${coverGallerySlug}`;
      coverName = await getCoverName({ cover_photo: coverPhoto }, distSlug);
    }
    const dateRange = (p.date_from || p.date_to)
      ? { from: p.date_from || p.date_to, to: p.date_to || p.date_from }
      : null;
    return {
      slug:         p.slug,
      name:         p.name,
      description:  p.description || null,
      galleryCount: Number(p.gallery_count),
      coverSlug:    coverGallerySlug,
      coverName,
      dateRange,
    };
  }));

  const html = renderProjectIndex(projects, siteTitle, false, orgName, orgDescHtml);
  const dest = path.join(DIST_ROOT, 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html, 'utf8');
  logger.info({ dest }, 'prerender: wrote root index.html');
}

/** Write data/public/{projectSlug}/index.html — project gallery listing */
export async function prerenderProject(projectSlug) {
  const [projRows] = await query(
    'SELECT id, name, description FROM projects WHERE slug = ? LIMIT 1',
    [projectSlug]
  );
  const project = projRows[0];
  if (!project) {
    logger.warn({ projectSlug }, 'prerender: project not found, skipping');
    return;
  }
  const projectDescHtml = project.description ? marked.parse(project.description) : '';

  const [galRows] = await query(
    `SELECT g.id, g.slug, g.title, g.date, g.location, g.description, g.cover_photo
     FROM galleries g
     WHERE g.project_id = ? AND g.access = 'public' AND g.build_status = 'done'
     ORDER BY g.sort_order ASC, g.date DESC, g.created_at DESC`,
    [project.id]
  );

  const galIds = galRows.map(g => g.id);
  const pgMap  = {};
  if (galIds.length > 0) {
    const [pgRows] = await query(
      `SELECT p.gallery_id, u.name, COUNT(*) AS cnt
       FROM photos p JOIN users u ON u.id = p.photographer_id
       WHERE p.gallery_id IN (${galIds.map(() => '?').join(',')})
       GROUP BY p.gallery_id, p.photographer_id ORDER BY cnt DESC`,
      galIds
    );
    for (const r of pgRows) {
      if (!pgMap[r.gallery_id]) pgMap[r.gallery_id] = [];
      pgMap[r.gallery_id].push(r.name);
    }
  }

  const galleries = (await Promise.all(galRows.map(async g => {
    const distSlug = `${projectSlug}/${g.slug}`;
    const [coverName, photoCount, dateRange] = await Promise.all([
      getCoverName(g, distSlug),
      getPublicPhotoCount(g.slug),
      getPublicDateRange(distSlug),
    ]);
    return {
      slug: g.slug, title: g.title, date: g.date, location: g.location,
      description: g.description || null,
      photographers: pgMap[g.id] || [],
      coverName, photoCount, dateRange,
    };
  }))).sort((a, b) => {
    const da = a.dateRange?.to || a.dateRange?.from || a.date || '';
    const db = b.dateRange?.to || b.dateRange?.from || b.date || '';
    return da > db ? -1 : da < db ? 1 : 0;
  });

  const siteTitle = await getSiteTitle();
  const [orgRows] = await query('SELECT name FROM organizations WHERE is_default = 1 LIMIT 1');
  const orgName = orgRows[0]?.name || '';
  const html = renderProjectListing(projectSlug, project.name, galleries, siteTitle, false, projectDescHtml, orgName);
  const dest = path.join(DIST_ROOT, projectSlug, 'index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html, 'utf8');
  logger.info({ dest }, 'prerender: wrote project index.html');
}

/** Pre-render all projects of a given org + root */
export async function prerenderOrg(orgId) {
  try {
    const [projRows] = await query(
      'SELECT slug FROM projects WHERE organization_id = ?',
      [orgId]
    );
    await Promise.all([
      prerenderRoot(),
      ...projRows.map(p => prerenderProject(p.slug)),
    ]);
    logger.info({ orgId, count: projRows.length + 1 }, 'prerender: org pages written');
  } catch (err) {
    logger.warn({ err }, 'prerender: org prerender failed');
    throw err;
  }
}

/** Pre-render all projects + root at startup */
export async function prerenderAll() {
  try {
    const [projRows] = await query('SELECT slug FROM projects');
    await Promise.all([
      prerenderRoot(),
      ...projRows.map(p => prerenderProject(p.slug)),
    ]);
    logger.info({ count: projRows.length + 1 }, 'prerender: all pages written');
  } catch (err) {
    // Non-fatal — fall back to dynamic SSR
    logger.warn({ err }, 'prerender: failed (will fall back to SSR)');
  }
}
