// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// Page d'un projet : liste + création des galeries
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';
import { GalleryCard } from '../components/GalleryCard.jsx';
import { Toast } from '../components/Toast.jsx';

function slugify(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function ProjectDetail() {
  const { id }     = useParams();
  const t          = useT();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const canAdmin   = ['admin','owner'].includes(user?.organizationRole) || user?.platformRole === 'superadmin';
  const canCreate  = ['collaborator','admin','owner'].includes(user?.organizationRole) || user?.platformRole === 'superadmin';

  const [project,   setProject]   = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState('');

  // New gallery form
  const [creating,    setCreating]    = useState(false);
  const [newTitle,    setNewTitle]    = useState('');
  const [newSlug,     setNewSlug]     = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  // Project settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editSlug,     setEditSlug]     = useState('');
  const [slugConfirm,  setSlugConfirm]  = useState('');
  const [saving,       setSaving]       = useState(false);
  const [slugSaving,   setSlugSaving]   = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([
        api.getProject(id),
        api.getProjectGalleries(id),
      ]);
      setProject(p);
      setGalleries(g);
      setEditName(p.name || '');
      setEditSlug(p.slug || '');
    } catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  function handleTitleChange(v) {
    setNewTitle(v);
    if (!slugTouched) setNewSlug(slugify(v));
  }

  async function handleCreate(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const slug  = newSlug || slugify(title);
    try {
      const g = await api.createProjectGallery(id, { slug, title });
      setCreating(false); setNewTitle(''); setNewSlug(''); setSlugTouched(false);
      navigate(`/galleries/${g.id}`);
    } catch (err) { setToast(err.message); }
  }

  async function handleBuild(galleryId) {
    try {
      const job = await api.triggerBuild(galleryId);
      navigate(`/jobs/${job.id}`);
    } catch (e) { setToast(e.message); }
  }

  async function handleDelete(galleryId) {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await api.deleteGallery(galleryId);
      setGalleries(gs => gs.filter(g => g.id !== galleryId));
    } catch (e) { setToast(e.message); }
  }

  async function handleRenameName(e) {
    e.preventDefault();
    if (!editName.trim() || editName.trim() === project.name) return;
    setSaving(true);
    try {
      const updated = await api.updateProject(id, { name: editName.trim() });
      setProject(updated);
      setToast(t('project_saved'));
    } catch (err) { setToast(err.message); }
    finally { setSaving(false); }
  }

  async function handleRenameSlug(e) {
    e.preventDefault();
    if (slugConfirm !== project.slug) { setToast(t('project_slug_confirm_mismatch')); return; }
    setSlugSaving(true);
    try {
      const updated = await api.updateProject(id, { slug: editSlug });
      setProject(updated);
      setEditSlug(updated.slug);
      setSlugConfirm('');
      setToast(t('project_saved'));
    } catch (err) { setToast(err.message); }
    finally { setSlugSaving(false); }
  }

  if (loading) return (
    <section className="content">
      <div className="container-fluid text-center py-5 text-muted">
        <i className="fas fa-spinner fa-spin fa-2x" />
      </div>
    </section>
  );

  return (
    <>
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6 d-flex align-items-center" style={{ gap: '0.5rem' }}>
              <h1 className="m-0">
                <Link to="/studio" className="text-muted me-2" style={{ fontSize: '0.875rem' }}>
                  {user?.organizationName || t('studio_back')}
                </Link>
                <span className="text-muted me-1">/</span>
                {project?.name || '…'}
              </h1>
              {canAdmin && (
                <button
                  className={`btn btn-sm ${settingsOpen ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setSettingsOpen(v => !v)}
                  title={t('settings')}
                >
                  <i className="fas fa-cog" />
                </button>
              )}
            </div>
            <div className="col-sm-6 mt-2 mt-sm-0 d-flex justify-content-sm-end justify-content-start align-items-center">
              {canCreate && (
                <button className="btn btn-primary btn-sm" onClick={() => setCreating(v => !v)}>
                  <i className="fas fa-plus me-1" />{t('new_gallery')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">

          {/* Settings panel */}
          {settingsOpen && (
            <div className="card card-warning card-outline mb-4">
              <div className="card-header">
                <h3 className="card-title"><i className="fas fa-cog me-2" />{t('settings')}</h3>
                <div className="card-tools">
                  <button className="btn btn-tool" onClick={() => setSettingsOpen(false)}>
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <form onSubmit={handleRenameName}>
                      <div className="mb-3">
                        <label className="text-muted text-uppercase" style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                          {t('project_name_label')}
                        </label>
                        <div className="input-group input-group-sm">
                          <input
                            className="form-control"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                          />
                          <button className="btn btn-primary" type="submit" disabled={saving || editName.trim() === project?.name}>
                            {saving ? t('saving') : t('save')}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                  <div className="col-md-6">
                    <form onSubmit={handleRenameSlug}>
                      <div className="mb-3">
                        <label className="text-danger text-uppercase" style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                          {t('section_danger')} — Slug
                        </label>
                        <p className="text-muted" style={{ fontSize: '0.78rem' }}>{t('project_slug_hint')}</p>
                        <div className="input-group input-group-sm mb-2">
                          <input
                            className="form-control font-monospace"
                            style={{ fontFamily: 'monospace' }}
                            value={editSlug}
                            onChange={e => setEditSlug(slugify(e.target.value) || e.target.value.toLowerCase())}
                            placeholder="slug-url"
                          />
                        </div>
                        <div className="input-group input-group-sm">
                          <input
                            className="form-control font-monospace"
                            style={{ fontFamily: 'monospace', borderColor: '#fca5a5' }}
                            value={slugConfirm}
                            onChange={e => setSlugConfirm(e.target.value)}
                            placeholder={t('project_slug_confirm_placeholder', { slug: project?.slug })}
                          />
                          <button
                            className="btn btn-danger" type="submit"
                            disabled={slugSaving || !editSlug || editSlug === project?.slug}
                          >
                            {slugSaving ? t('saving') : t('rename')}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New gallery form */}
          {creating && (
            <div className="card card-primary card-outline mb-4">
              <div className="card-body">
                <form onSubmit={handleCreate} className="row align-items-center">
                  <div className="col">
                    <input
                      className="form-control form-control-sm"
                      placeholder={t('gallery_title_placeholder')}
                      value={newTitle}
                      onChange={e => handleTitleChange(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="col-auto">
                    <input
                      className="form-control form-control-sm"
                      style={{ fontFamily: 'monospace', maxWidth: 200 }}
                      placeholder="slug"
                      value={newSlug}
                      onChange={e => { setNewSlug(e.target.value); setSlugTouched(true); }}
                    />
                  </div>
                  <div className="col-auto">
                    <button className="btn btn-primary btn-sm me-1" type="submit">{t('create')}</button>
                    <button className="btn btn-secondary btn-sm" type="button"
                      onClick={() => { setCreating(false); setNewTitle(''); setNewSlug(''); setSlugTouched(false); }}>
                      {t('cancel')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Galleries grid */}
          {galleries.length === 0 && !creating ? (
            <div className="text-center py-5 text-muted">
              <i className="fas fa-images fa-3x mb-3 d-block" style={{ opacity: 0.3 }} />
              <p>{t('no_galleries')}</p>
              {canCreate && (
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  {t('create_first_gallery')}
                </button>
              )}
            </div>
          ) : (
            <div style={s.grid}>
              {galleries.map(g => (
                <GalleryCard
                  key={g.id}
                  gallery={g}
                  onBuild={handleBuild}
                  onDelete={handleDelete}
                  canBuild={canCreate}
                />
              ))}
            </div>
          )}

        </div>
      </section>
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  );
}

const s = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' },
};
