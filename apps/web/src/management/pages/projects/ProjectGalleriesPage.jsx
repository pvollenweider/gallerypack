// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminButton, AdminBadge } from '../../../components/ui/index.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning', draft: 'secondary' };

export default function ProjectGalleriesPage() {
  const t = useT();
  const { projectId } = useParams();
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newG,       setNewG]       = useState({ title: '', slug: '' });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    api.getProjectGalleries(projectId)
      .then(setGalleries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

  function setNew(field) {
    return e => setNewG(f => ({ ...f, [field]: e.target.value }));
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      await api.createProjectGallery(projectId, newG);
      setNewG({ title: '', slug: '' });
      setShowCreate(false);
      load();
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminPage
      title={t('proj_galleries_title')}
      maxWidth="100%"
      actions={
        <AdminButton size="sm" onClick={() => setShowCreate(v => !v)} icon="fas fa-plus">
          {t('proj_new_gallery_btn')}
        </AdminButton>
      }
    >
      {showCreate && (
        <AdminCard title={t('proj_new_gallery_btn')} className="mb-3">
          <form onSubmit={create}>
            <div className="row">
              <div className="col-sm-5">
                <AdminInput
                  label={t('proj_th_title')}
                  value={newG.title}
                  onChange={setNew('title')}
                  required
                />
              </div>
              <div className="col-sm-4">
                <AdminInput
                  label={t('proj_th_slug')}
                  value={newG.slug}
                  onChange={setNew('slug')}
                  required
                  pattern="[a-z0-9-]+"
                />
              </div>
            </div>
            <AdminAlert message={createErr} />
            <div className="d-flex gap-2">
              <AdminButton type="submit" size="sm" loading={creating} loadingLabel={t('proj_creating')}>
                {t('create')}
              </AdminButton>
              <AdminButton variant="outline-secondary" size="sm" onClick={() => setShowCreate(false)}>
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
              <AdminButton variant="outline-primary" size="sm" onClick={() => setShowCreate(true)} icon="fas fa-plus">
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
                    <td><Link to={`/manage/galleries/${g.id}`} className="fw-semibold text-body">{g.title || g.slug}</Link></td>
                    <td><code className="text-muted">{g.slug}</code></td>
                    <td><AdminBadge color={STATUS_BADGE[g.build_status] || 'secondary'}>{g.build_status || t('proj_status_draft')}</AdminBadge></td>
                    <td className="text-end">
                      <Link to={`/manage/galleries/${g.id}`} className="btn btn-sm btn-outline-secondary">
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
