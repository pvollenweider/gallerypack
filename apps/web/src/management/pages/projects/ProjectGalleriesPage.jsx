// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { slugify } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminButton, AdminBadge, AdminToast } from '../../../components/ui/index.js';

const STATUS_BADGE    = { done: 'success', error: 'danger', running: 'primary', queued: 'warning', draft: 'secondary' };
const MODE_BADGE      = { portfolio: 'primary', client_preview: 'info', client_delivery: 'success', archive: 'secondary' };
const ACCESS_ICON     = { public: 'fa-globe', private: 'fa-lock', password: 'fa-key' };

// Smart date formatting for gallery cards
const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function formatDateRange(dateRange) {
  if (!dateRange?.from) return null;
  const a = new Date(dateRange.from + 'T12:00:00');
  const b = dateRange.to ? new Date(dateRange.to + 'T12:00:00') : a;
  const diff = Math.round((b - a) / 86400000);
  const mA = MONTHS_FR[a.getMonth()], mB = MONTHS_FR[b.getMonth()];
  const y  = a.getFullYear();
  if (diff === 0) return `${a.getDate()} ${mA} ${y}`;
  if (diff === 1 && a.getMonth() === b.getMonth())
    return `Les ${a.getDate()} et ${b.getDate()} ${mA} ${y}`;
  if (diff <= 4) {
    if (a.getMonth() === b.getMonth()) return `Du ${a.getDate()} au ${b.getDate()} ${mA} ${y}`;
    return `Du ${a.getDate()} ${mA} au ${b.getDate()} ${mB} ${y}`;
  }
  if (a.getMonth() === b.getMonth()) return `${mA.charAt(0).toUpperCase()}${mA.slice(1)} ${y}`;
  return `${mA.charAt(0).toUpperCase()}${mA.slice(1)} – ${mB} ${y}`;
}

export default function ProjectGalleriesPage() {
  const t = useT();
  const { orgId, projectId } = useParams();
  const navigate = useNavigate();
  const [project,        setProject]        = useState(null);
  const [galleries,      setGalleries]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [coverGalleryId, setCoverGalleryId] = useState(null);

  // Rebuild all
  const [buildingAll,  setBuildingAll]  = useState(false);
  const [buildAllToast, setBuildAllToast] = useState('');

  async function buildAll() {
    setBuildingAll(true);
    try {
      const r = await api.buildAllProjectGalleries(projectId);
      setBuildAllToast(t('build_all_queued', { queued: r.queued }));
    } catch (err) {
      setBuildAllToast(t('build_all_error', { message: err.message }));
    } finally {
      setBuildingAll(false);
    }
  }

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newG,       setNewG]       = useState({ title: '', slug: '', description: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    Promise.all([api.getProject(projectId), api.getProjectGalleries(projectId)])
      .then(([p, g]) => {
        setProject(p);
        setGalleries(g);
        setCoverGalleryId(p.coverGalleryId ?? null);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

  async function setCover(galleryId) {
    const next = coverGalleryId === galleryId ? null : galleryId;
    setCoverGalleryId(next);
    try { await api.updateProject(projectId, { coverGalleryId: next }); } catch {}
  }

  function handleTitleChange(e) {
    const title = e.target.value;
    setNewG(f => ({
      ...f,
      title,
      slug: slugEdited ? f.slug : slugify(title),
    }));
  }

  function handleSlugChange(e) {
    setSlugEdited(true);
    setNewG(f => ({ ...f, slug: e.target.value }));
  }

  function resetForm() {
    setNewG({ title: '', slug: '', description: '' });
    setSlugEdited(false);
    setCreateErr('');
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      const gallery = await api.createProjectGallery(projectId, newG);
      resetForm();
      setShowCreate(false);
      navigate(`/admin/organizations/${orgId}/projects/${projectId}/galleries/${gallery.id}/photos`);
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Drag-and-drop reorder ─────────────────────────────────────────────────
  const dragIdx = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [overIdx,    setOverIdx]    = useState(null);

  function onDragStart(e, idx) {
    dragIdx.current = idx;
    setDraggingId(galleries[idx].id);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag ghost
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
    const next = [...galleries];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    setGalleries(next);
    cleanup();
    api.reorderProjectGalleries(projectId, next.map(g => g.id))
      .catch(() => setBuildAllToast(t('build_all_error', { message: 'Reorder failed' })));
  }

  function onDragEnd() { cleanup(); }

  function cleanup() {
    dragIdx.current = null;
    setDraggingId(null);
    setOverIdx(null);
  }

  return (
    <AdminPage
      title={project?.name || t('proj_galleries_title')}
      maxWidth="100%"
      actions={
        <div className="d-flex gap-2">
          {project?.slug && (
            <a
              href={`/${project.slug}/`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-outline-success"
            >
              <i className="fas fa-external-link-alt me-1" />
              {t('public_page')}
            </a>
          )}
          {galleries.length > 0 && (
            <AdminButton
              variant="outline-secondary" size="sm"
              loading={buildingAll} loadingLabel={t('republishing')}
              onClick={buildAll} icon="fas fa-sync-alt"
            >
              {t('republish_all')}
            </AdminButton>
          )}
          <AdminButton size="sm" onClick={openCreate} icon="fas fa-plus">
            {t('proj_new_gallery_btn')}
          </AdminButton>
        </div>
      }
    >
      <AdminToast message={buildAllToast} onDone={() => setBuildAllToast('')} />
      {showCreate && (
        <AdminCard title={t('proj_new_gallery_btn')} className="mb-3">
          <form onSubmit={create}>
            <div className="row">
              <div className="col-sm-5 mb-3">
                <AdminInput
                  label={t('proj_th_title')}
                  value={newG.title}
                  onChange={handleTitleChange}
                  required
                  autoFocus
                  className="mb-0"
                />
              </div>
              <div className="col-sm-4 mb-3">
                <AdminInput
                  label={t('proj_th_slug')}
                  value={newG.slug}
                  onChange={handleSlugChange}
                  required
                  pattern="[-a-z0-9]+"
                  title={t('orgs_slug_hint')}
                  className="mb-0"
                  hint={!slugEdited && newG.title ? t('slug_auto_hint') : undefined}
                />
              </div>
              <div className="col-sm-12 mb-3">
                <AdminInput
                  label={t('proj_gallery_description_label')}
                  value={newG.description}
                  onChange={e => setNewG(f => ({ ...f, description: e.target.value }))}
                  className="mb-0"
                />
              </div>
            </div>
            <AdminAlert message={createErr} />
            <div className="d-flex gap-2">
              <AdminButton type="submit" size="sm" loading={creating} loadingLabel={t('proj_creating')}>
                {t('create')}
              </AdminButton>
              <AdminButton variant="outline-secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>
                {t('cancel')}
              </AdminButton>
            </div>
          </form>
        </AdminCard>
      )}

      <AdminAlert message={error} />

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
          ) : galleries.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="fas fa-images fa-2x mb-3" style={{ display: 'block' }} />
              <p className="mb-1">{t('proj_no_galleries')}</p>
              <AdminButton variant="outline-primary" size="sm" onClick={openCreate} icon="fas fa-plus">
                {t('proj_create_first_gallery')}
              </AdminButton>
            </div>
          ) : (
            <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th style={{ width: '32px' }} title={t('proj_cover_gallery_hint')}><i className="fas fa-star" style={{ color: '#ccc', fontSize: '0.8rem' }} /></th>
                  <th>{t('proj_th_title')}</th>
                  <th className="d-none d-sm-table-cell">{t('gal_mode_label')}</th>
                  <th>{t('proj_th_status')}</th>
                  <th className="d-none d-md-table-cell">Date</th>
                  <th className="d-none d-lg-table-cell">{t('th_photographers')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {galleries.map((g, idx) => (
                  <tr
                    key={g.id}
                    draggable
                    onDragStart={e => onDragStart(e, idx)}
                    onDragOver={e => onDragOver(e, idx)}
                    onDrop={e => onDrop(e, idx)}
                    onDragEnd={onDragEnd}
                    style={{
                      opacity: draggingId === g.id ? 0.4 : 1,
                      borderTop: overIdx === idx && draggingId !== g.id ? '2px solid #0d6efd' : undefined,
                      cursor: 'grab',
                    }}
                  >
                    <td style={{ color: '#aaa', paddingLeft: '1rem' }}>
                      <i className="fas fa-grip-vertical" style={{ cursor: 'grab' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-link p-0"
                        title={t('proj_cover_gallery_hint')}
                        onClick={() => setCover(g.id)}
                        style={{ color: coverGalleryId === g.id ? '#f59e0b' : '#d1d5db', fontSize: '0.85rem' }}
                      >
                        <i className="fas fa-star" />
                      </button>
                    </td>
                    <td>
                      <Link to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${g.id}/photos`} className="fw-semibold text-body">{g.title || g.slug}</Link>
                      <div><code className="text-muted" style={{ fontSize: '0.72rem' }}>{g.slug}</code></div>
                    </td>
                    <td className="d-none d-sm-table-cell">
                      {g.mode
                        ? <AdminBadge color={MODE_BADGE[g.mode] || 'secondary'}>{t(`gal_mode_${g.mode}`)}</AdminBadge>
                        : <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                      }
                    </td>
                    <td><AdminBadge color={STATUS_BADGE[g.buildStatus] || 'secondary'}>{g.buildStatus || t('proj_status_draft')}</AdminBadge></td>
                    <td className="d-none d-md-table-cell text-muted" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {formatDateRange(g.dateRange) || '—'}
                    </td>
                    <td className="d-none d-lg-table-cell text-muted" style={{ fontSize: '0.82rem' }}>
                      {g.photographers?.length > 0
                        ? g.photographers.join(' · ')
                        : '—'}
                    </td>
                    <td className="text-end">
                      <div className="d-flex gap-1 justify-content-end">
                        {g.access === 'public' && g.buildStatus === 'done' && project?.slug && (g.distName || g.slug) && (
                          <a
                            href={`/${project.slug}/${g.distName || g.slug}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-outline-success"
                            title={t('view_gallery_btn')}
                          >
                            <i className={`fas ${ACCESS_ICON.public}`} />
                          </a>
                        )}
                        {g.access === 'private' && (
                          <Link
                            to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${g.id}/general`}
                            className="btn btn-sm btn-outline-secondary"
                            title={t('gal_share_section')}
                          >
                            <i className={`fas ${ACCESS_ICON.private}`} />
                          </Link>
                        )}
                        {g.access === 'password' && (
                          <span className="btn btn-sm btn-outline-warning disabled" title={t('password_indicator')}>
                            <i className={`fas ${ACCESS_ICON.password}`} />
                          </span>
                        )}
                        <Link to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${g.id}/photos`} className="btn btn-sm btn-outline-secondary">
                          {t('gal_overview_manage')} <i className="fas fa-chevron-right ms-1" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
