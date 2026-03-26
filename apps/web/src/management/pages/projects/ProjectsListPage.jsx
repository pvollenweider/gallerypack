// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminButton, AdminBadge } from '../../../components/ui/index.js';

export default function ProjectsListPage() {
  const t = useT();
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newP,       setNewP]       = useState({ name: '', slug: '', description: '' });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    api.listProjects()
      .then(setProjects)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function setNew(field) {
    return e => setNewP(f => ({ ...f, [field]: e.target.value }));
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      await api.createProject(newP);
      setNewP({ name: '', slug: '', description: '' });
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
      title={t('projects_title')}
      maxWidth="100%"
      actions={
        <AdminButton size="sm" onClick={() => setShowCreate(v => !v)} icon="fas fa-plus">
          {t('proj_new_btn')}
        </AdminButton>
      }
    >
      {showCreate && (
        <AdminCard title={t('proj_new_btn')} className="mb-3">
          <form onSubmit={create}>
            <div className="row">
              <div className="col-sm-4">
                <AdminInput
                  label={t('orgs_th_name')}
                  value={newP.name}
                  onChange={setNew('name')}
                  required
                />
              </div>
              <div className="col-sm-4">
                <AdminInput
                  label={t('orgs_th_slug')}
                  value={newP.slug}
                  onChange={setNew('slug')}
                  required
                  pattern="[a-z0-9-]+"
                />
              </div>
              <div className="col-sm-4">
                <AdminInput
                  label={t('field_description')}
                  value={newP.description}
                  onChange={setNew('description')}
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
          ) : projects.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="fas fa-folder-open fa-2x mb-3" style={{ display: 'block' }} />
              <p className="mb-0">{t('proj_no_projects')}</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr><th>{t('orgs_th_name')}</th><th>{t('orgs_th_slug')}</th><th>{t('proj_th_visibility')}</th><th></th></tr>
                </thead>
                <tbody>
                  {projects.map(p => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/manage/projects/${p.id}`} className="fw-semibold text-body">{p.name}</Link>
                        {p.description && <small className="text-muted d-block">{p.description}</small>}
                      </td>
                      <td><code className="text-muted">{p.slug}</code></td>
                      <td><AdminBadge color="secondary" className="bg-light text-dark border">{p.visibility || 'public'}</AdminBadge></td>
                      <td className="text-end">
                        <Link to={`/manage/projects/${p.id}`} className="btn btn-sm btn-outline-secondary">
                          {t('gal_overview_manage')} <i className="fas fa-chevron-right ms-1" aria-hidden="true" />
                        </Link>
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
