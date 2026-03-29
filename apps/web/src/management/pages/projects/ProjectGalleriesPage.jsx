// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { slugify } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminButton, AdminBadge } from '../../../components/ui/index.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning', draft: 'secondary' };

export default function ProjectGalleriesPage() {
  const t = useT();
  const { orgId, projectId } = useParams();
  const navigate = useNavigate();
  const [project,   setProject]   = useState(null);
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newG,       setNewG]       = useState({ title: '', slug: '', description: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    Promise.all([api.getProject(projectId), api.getProjectGalleries(projectId)])
      .then(([p, g]) => { setProject(p); setGalleries(g); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

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

  return (
    <AdminPage
      title={project?.name || t('proj_galleries_title')}
      maxWidth="100%"
      actions={
        <AdminButton size="sm" onClick={openCreate} icon="fas fa-plus">
          {t('proj_new_gallery_btn')}
        </AdminButton>
      }
    >
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
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>{t('proj_th_title')}</th><th>{t('proj_th_slug')}</th><th>{t('proj_th_status')}</th><th></th></tr>
              </thead>
              <tbody>
                {galleries.map(g => (
                  <tr key={g.id}>
                    <td><Link to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${g.id}/photos`} className="fw-semibold text-body">{g.title || g.slug}</Link></td>
                    <td><code className="text-muted">{g.slug}</code></td>
                    <td><AdminBadge color={STATUS_BADGE[g.build_status] || 'secondary'}>{g.build_status || t('proj_status_draft')}</AdminBadge></td>
                    <td className="text-end">
                      <Link to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${g.id}/photos`} className="btn btn-sm btn-outline-secondary">
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
