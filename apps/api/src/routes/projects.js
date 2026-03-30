// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/routes/projects.js — Project CRUD + membership management
// Projects sit between Studio and Gallery in the hierarchy.
import { Router } from 'express';
import fs   from 'fs';
import path from 'path';
import { requireAuth, requireStudioRole } from '../middleware/auth.js';
import galleryRouter from './projectGalleries.js';
import {
  getProject, getProjectBySlug, listProjectsByStudio,
  createProject, updateProject, archiveProject,
  getProjectRole, upsertProjectRole, removeProjectRole, listProjectMembers,
  PROJECT_ROLE_HIERARCHY,
  createViewerTokenDb, listViewerTokens, deleteViewerToken,
  getGalleryRole,
  audit,
} from '../db/helpers.js';
import { can } from '../authorization/index.js';
import { query } from '../db/database.js';
import { prerenderProject, prerenderRoot } from '../services/prerender.js';
import { randomUUID } from 'crypto';
import { SRC_ROOT, DIST_ROOT, INTERNAL_ROOT } from '../../../../packages/engine/src/fs.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function projectToJson(p) {
  if (!p) return null;
  return {
    id:               p.id,
    organizationId:   p.organization_id ?? p.studio_id,  // canonical (Sprint 22)
    studioId:         p.studio_id,                        // legacy alias
    slug:             p.slug,
    name:             p.name,
    description:      p.description,
    visibility:       p.visibility,
    standaloneDefault: !!p.standalone_default,
    startsAt:         p.starts_at,
    endsAt:           p.ends_at,
    status:           p.status,
    createdAt:        p.created_at,
    updatedAt:        p.updated_at,
  };
}

/**
 * Resolve the caller's effective role on a project.
 * Studio admins/owners implicitly have manager-level access.
 */
async function resolveProjectAccess(userId, studioRole, projectId) {
  if (studioRole === 'owner' || studioRole === 'admin') return 'manager';
  return await getProjectRole(userId, projectId);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/projects — list projects for resolved studio
// Superadmins may pass ?orgId=xxx to scope the query to a specific org.
router.get('/', async (req, res) => {
  let studioId = req.studioId;
  if (req.query.orgId && req.user?.platform_role === 'superadmin') {
    studioId = req.query.orgId;
  }
  const projects = await listProjectsByStudio(studioId);
  res.json(projects.map(projectToJson));
});

// POST /api/projects — create (admin+)
router.post('/', requireStudioRole('admin'), async (req, res) => {
  const { slug, name, description, visibility, startsAt, endsAt, orgId } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens only' });
  }

  const studioId = (orgId && req.user?.platform_role === 'superadmin') ? orgId : req.studioId;
  const existing = await getProjectBySlug(studioId, slug);
  if (existing) return res.status(409).json({ error: 'A project with this slug already exists' });

  const project = await createProject(studioId, { slug, name, description, visibility, startsAt, endsAt });
  try { await audit(req.studioId, req.userId, 'project.create', 'project', project.id, { slug }); } catch {}
  res.status(201).json(projectToJson(project));
});

// GET /api/projects/:id — detail
router.get('/:id', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });
  res.json(projectToJson(project));
});

// PATCH /api/projects/:id — update (manager+)
router.patch('/:id', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!effectiveRole || PROJECT_ROLE_HIERARCHY.indexOf(effectiveRole) < PROJECT_ROLE_HIERARCHY.indexOf('manager')) {
    return res.status(403).json({ error: 'Forbidden: requires project manager or studio admin' });
  }

  const camelToSnake = { startsAt: 'starts_at', endsAt: 'ends_at', standaloneDefault: 'standalone_default' };
  const allowed = ['slug', 'name', 'description', 'visibility', 'starts_at', 'ends_at', 'standalone_default'];
  const boolCols = new Set(['standalone_default']);
  const updates = {};
  for (const [key, val] of Object.entries(req.body || {})) {
    const col = camelToSnake[key] || key;
    if (allowed.includes(col)) updates[col] = boolCols.has(col) ? (val ? 1 : 0) : val;
  }

  if (updates.slug && updates.slug !== project.slug) {
    const conflict = await getProjectBySlug(req.studioId, updates.slug);
    if (conflict) return res.status(409).json({ error: 'A project with this slug already exists' });
  }

  const updated = await updateProject(project.id, updates);
  try { await audit(req.studioId, req.userId, 'project.update', 'project', project.id, {}); } catch {}
  const newSlug = updates.slug || project.slug;
  prerenderProject(newSlug).catch(() => {});
  prerenderRoot().catch(() => {});
  res.json(projectToJson(updated));
});

// DELETE /api/projects/:id — permanently delete project and all its galleries (admin+)
router.delete('/:id', requireStudioRole('admin'), async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  // Load all galleries in this project
  const [galleries] = await query(
    'SELECT id, slug FROM galleries WHERE project_id = ?',
    [project.id]
  );

  // For each gallery: collect photo IDs, delete thumbnails, delete src + dist dirs
  const THUMB_ROOT = path.join(INTERNAL_ROOT, 'thumbnails');
  for (const gallery of galleries) {
    // Collect photo IDs for thumbnail cleanup
    const [photos] = await query('SELECT id FROM photos WHERE gallery_id = ?', [gallery.id]);
    for (const photo of photos) {
      for (const size of ['sm', 'md']) {
        const p = path.join(THUMB_ROOT, size, `${photo.id}.webp`);
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
      }
    }
    // Delete source photos dir (private/<slug>)
    const srcDir = path.join(SRC_ROOT, gallery.slug);
    try { if (fs.existsSync(srcDir)) fs.rmSync(srcDir, { recursive: true, force: true }); } catch {}
    // Delete built dist dir (public/<project_slug>/<gallery_slug>)
    const distDir = path.join(DIST_ROOT, project.slug, gallery.slug);
    try { if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true }); } catch {}
  }

  // Delete all galleries (photos cascade via FK)
  if (galleries.length > 0) {
    const placeholders = galleries.map(() => '?').join(',');
    await query(`DELETE FROM galleries WHERE id IN (${placeholders})`, galleries.map(g => g.id));
  }

  // Delete project itself (role assignments, tokens cascade via FK)
  await query('DELETE FROM projects WHERE id = ?', [project.id]);

  try { await audit(req.studioId, req.userId, 'project.delete', 'project', project.id, { slug: project.slug, galleriesDeleted: galleries.length }); } catch {}
  res.json({ ok: true, galleriesDeleted: galleries.length });
});

// ── Project member routes ──────────────────────────────────────────────────────

// GET /api/projects/:id/members
router.get('/:id/members', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!effectiveRole) return res.status(403).json({ error: 'Forbidden' });

  res.json(await listProjectMembers(project.id));
});

// PUT /api/projects/:id/members/:userId — grant/update project role
router.put('/:id/members/:userId', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!effectiveRole || PROJECT_ROLE_HIERARCHY.indexOf(effectiveRole) < PROJECT_ROLE_HIERARCHY.indexOf('manager')) {
    return res.status(403).json({ error: 'Forbidden: requires project manager or studio admin' });
  }

  const { role } = req.body || {};
  if (!role || !PROJECT_ROLE_HIERARCHY.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${PROJECT_ROLE_HIERARCHY.join(', ')}` });
  }

  const assignment = await upsertProjectRole(project.id, req.params.userId, role, req.userId);
  try { await audit(req.studioId, req.userId, 'project.member_added', 'project', project.id, { userId: req.params.userId, role }); } catch {}
  res.json(assignment);
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!effectiveRole || PROJECT_ROLE_HIERARCHY.indexOf(effectiveRole) < PROJECT_ROLE_HIERARCHY.indexOf('manager')) {
    return res.status(403).json({ error: 'Forbidden: requires project manager or studio admin' });
  }

  await removeProjectRole(project.id, req.params.userId);
  try { await audit(req.studioId, req.userId, 'project.member_removed', 'project', project.id, { userId: req.params.userId }); } catch {}
  res.json({ ok: true });
});

// ── Project-level viewer token routes ─────────────────────────────────────────
// Viewer tokens scoped to a project grant read access to all galleries within it.

router.post('/:id/viewer-tokens', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!can(req.user, 'manageAccess', 'project', { studioRole: req.studioRole, projectRole: effectiveRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { label = null, expiresAt = null, email = null } = req.body || {};
  const token = await createViewerTokenDb('project', project.id, req.userId, { email, label, expiresAt });
  try { await audit(req.studioId, req.userId, 'viewer_token.created', 'project', project.id, { label }); } catch {}
  res.status(201).json(token);
});

router.get('/:id/viewer-tokens', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!can(req.user, 'manageAccess', 'project', { studioRole: req.studioRole, projectRole: effectiveRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(await listViewerTokens('project', project.id));
});

router.delete('/:id/viewer-tokens/:tokenId', async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project || project.studio_id !== req.studioId) return res.status(404).json({ error: 'Project not found' });

  const effectiveRole = await resolveProjectAccess(req.userId, req.studioRole, project.id);
  if (!can(req.user, 'manageAccess', 'project', { studioRole: req.studioRole, projectRole: effectiveRole })) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await deleteViewerToken(req.params.tokenId);
  try { await audit(req.studioId, req.userId, 'viewer_token.revoked', 'project', project.id, { tokenId: req.params.tokenId }); } catch {}
  res.json({ ok: true });
});

// ── Nested gallery routes ──────────────────────────────────────────────────────
// GET/POST /api/projects/:projectId/galleries
// GET/PATCH/DELETE /api/projects/:projectId/galleries/:id
router.use('/:projectId/galleries', galleryRouter);

export default router;
