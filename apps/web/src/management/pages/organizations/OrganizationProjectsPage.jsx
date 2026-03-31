// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { slugify } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminButton, AdminLoader, AdminEmptyState, AdminToast } from '../../../components/ui/index.js';

export default function OrganizationProjectsPage() {
  const t = useT();
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [coverProjectId, setCoverProjectId] = useState(null);
  const [toast,         setToast]         = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newP,       setNewP]       = useState({ name: '', slug: '', description: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    Promise.all([api.listProjects(orgId), api.getOrganization(orgId)])
      .then(([ps, org]) => {
        setProjects(ps);
        setCoverProjectId(org.coverProjectId ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [orgId]);

  async function setCover(projectId) {
    const next = coverProjectId === projectId ? null : projectId;
    setCoverProjectId(next);
    try { await api.updateOrganization(orgId, { coverProjectId: next }); } catch {}
  }

  function handleNameChange(e) {
    const name = e.target.value;
    setNewP(f => ({ ...f, name, slug: slugEdited ? f.slug : slugify(name) }));
  }

  function handleSlugChange(e) {
    setSlugEdited(true);
    setNewP(f => ({ ...f, slug: e.target.value }));
  }

  function resetForm() {
    setNewP({ name: '', slug: '', description: '' });
    setSlugEdited(false);
    setCreateErr('');
  }

  function openCreate() { resetForm(); setShowCreate(true); }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      const project = await api.createProject({ ...newP, orgId });
      resetForm();
      setShowCreate(false);
      navigate(`/admin/organizations/${orgId}/projects/${project.id}`);
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────
  const dragIdx = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [overIdx,    setOverIdx]    = useState(null);

  function onDragStart(e, idx) {
    dragIdx.current = idx;
    setDraggingId(projects[idx].id);
    e.dataTransfer.effectAllowed = 'move';
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:-9999px';
    document.body.appendChild(el);
    e.dataTransfer.setDragImage(el, 0, 0);
    setTimeout(() => document.body.removeChild(el), 0);
  }

  function onDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }

  function onDrop(e, idx) {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === idx) { cleanup(); return; }
    const next = [...projects];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setProjects(next);
    cleanup();
    api.reorderOrgProjects(orgId, next.map(p => p.id))
      .catch(() => setToast(t('build_all_error', { message: 'Reorder failed' })));
  }

  function onDragEnd() { cleanup(); }

  function cleanup() {
    dragIdx.current = null;
    setDraggingId(null);
    setOverIdx(null);
  }

  return (
    <AdminPage
      title={t('studio_projects_title')}
      maxWidth="100%"
      actions={
        <AdminButton size="sm" icon="fas fa-plus" onClick={openCreate}>
          {t('proj_new_btn')}
        </AdminButton>
      }
    >
      <AdminToast message={toast} onDone={() => setToast('')} />

      {showCreate && (
        <AdminCard title={t('proj_new_btn')} className="mb-3">
          <form onSubmit={create}>
            <div className="row">
              <div className="col-sm-4 mb-3">
                <AdminInput label={t('orgs_th_name')} value={newP.name} onChange={handleNameChange} required autoFocus className="mb-0" />
              </div>
              <div className="col-sm-4 mb-3">
                <AdminInput
                  label={t('orgs_th_slug')} value={newP.slug} onChange={handleSlugChange}
                  required pattern="[-a-z0-9]+" title={t('orgs_slug_hint')} className="mb-0"
                  hint={!slugEdited && newP.name ? t('slug_auto_hint') : undefined}
                />
              </div>
              <div className="col-sm-4 mb-3">
                <AdminInput label={t('field_description')} value={newP.description}
                  onChange={e => setNewP(f => ({ ...f, description: e.target.value }))} className="mb-0" />
              </div>
            </div>
            <AdminAlert message={createErr} />
            <div className="d-flex gap-2">
              <AdminButton type="submit" size="sm" loading={creating} loadingLabel={t('proj_creating')}>{t('create')}</AdminButton>
              <AdminButton variant="outline-secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>{t('cancel')}</AdminButton>
            </div>
          </form>
        </AdminCard>
      )}

      <AdminAlert message={error} />

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <AdminLoader />
          ) : projects.length === 0 ? (
            <AdminEmptyState
              icon="fas fa-folder-open"
              title={t('proj_no_projects')}
              action={<AdminButton size="sm" icon="fas fa-plus" onClick={openCreate}>{t('proj_new_btn')}</AdminButton>}
            />
          ) : (
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th style={{ width: '32px' }} title={t('proj_cover_project_hint')}><i className="fas fa-star" style={{ color: '#ccc', fontSize: '0.8rem' }} /></th>
                  <th>{t('orgs_th_name')}</th>
                  <th>{t('orgs_th_slug')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p, idx) => (
                  <tr
                    key={p.id}
                    draggable
                    onDragStart={e => onDragStart(e, idx)}
                    onDragOver={e => onDragOver(e, idx)}
                    onDrop={e => onDrop(e, idx)}
                    onDragEnd={onDragEnd}
                    style={{
                      opacity: draggingId === p.id ? 0.4 : 1,
                      borderTop: overIdx === idx && draggingId !== p.id ? '2px solid #0d6efd' : undefined,
                      cursor: 'grab',
                    }}
                  >
                    <td style={{ color: '#aaa', paddingLeft: '1rem' }}>
                      <i className="fas fa-grip-vertical" style={{ cursor: 'grab' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-link p-0"
                        title={t('proj_cover_project_hint')}
                        onClick={() => setCover(p.id)}
                        style={{ color: coverProjectId === p.id ? '#f59e0b' : '#d1d5db', fontSize: '0.85rem' }}
                      >
                        <i className="fas fa-star" />
                      </button>
                    </td>
                    <td>
                      <Link to={`/admin/organizations/${orgId}/projects/${p.id}`} className="fw-semibold text-body">{p.name}</Link>
                      {p.description && <small className="text-muted d-block">{p.description}</small>}
                    </td>
                    <td><code className="text-muted">{p.slug}</code></td>
                    <td className="text-end">
                      <Link to={`/admin/organizations/${orgId}/projects/${p.id}`} className="btn btn-sm btn-outline-secondary">
                        {t('gal_overview_manage')} <i className="fas fa-chevron-right ms-1" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
