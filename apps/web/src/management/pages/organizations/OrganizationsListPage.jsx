// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useAuth } from '../../../lib/auth.jsx';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminInput, AdminBadge, AdminAlert, AdminButton, AdminLoader } from '../../../components/ui/index.js';

export default function OrganizationsListPage() {
  const t = useT();
  const { user } = useAuth();
  const isSuperadmin = user?.platformRole === 'superadmin';

  const [orgs,    setOrgs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg,     setNewOrg]     = useState({ name: '', slug: '', locale: 'en', country: '' });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    api.listOrganizations()
      .then(setOrgs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function setNew(field) {
    return e => setNewOrg(f => ({ ...f, [field]: e.target.value }));
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      await api.createOrganization(newOrg);
      setNewOrg({ name: '', slug: '', locale: 'en', country: '' });
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
      title={t('orgs_page_title')}
      maxWidth="100%"
      actions={isSuperadmin && (
        <AdminButton size="sm" icon="fas fa-plus" onClick={() => setShowCreate(v => !v)}>
          {t('orgs_new_btn')}
        </AdminButton>
      )}
    >
      {showCreate && (
        <AdminCard title={t('orgs_new_btn')} className="mb-3">
          <form onSubmit={create}>
            <div className="row">
              <div className="col-sm-4 mb-3">
                <AdminInput
                  label={t('orgs_th_name')}
                  value={newOrg.name}
                  onChange={setNew('name')}
                  required
                  className="mb-0"
                />
              </div>
              <div className="col-sm-3 mb-3">
                <AdminInput
                  label={t('orgs_th_slug')}
                  value={newOrg.slug}
                  onChange={setNew('slug')}
                  required
                  pattern="[a-z0-9-]+"
                  title={t('orgs_slug_hint')}
                  className="mb-0"
                />
              </div>
              <div className="col-sm-2 mb-3">
                <AdminInput
                  label={t('orgs_th_locale')}
                  value={newOrg.locale}
                  onChange={setNew('locale')}
                  placeholder="en"
                  className="mb-0"
                />
              </div>
              <div className="col-sm-3 mb-3">
                <AdminInput
                  label={t('orgs_th_country')}
                  value={newOrg.country}
                  onChange={setNew('country')}
                  placeholder="CH"
                  maxLength={2}
                  className="mb-0"
                />
              </div>
            </div>
            <AdminAlert message={createErr} />
            <div className="d-flex gap-2">
              <AdminButton type="submit" size="sm" loading={creating} loadingLabel={t('orgs_creating')}>
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

      <AdminCard noPadding>
        {loading ? (
          <AdminLoader />
        ) : orgs.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="fas fa-building fa-2x mb-3" style={{ display: 'block' }} />
            <p className="mb-0">{t('studios_empty')}</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>{t('orgs_th_name')}</th>
                  <th>{t('orgs_th_slug')}</th>
                  <th>{t('orgs_th_locale')}</th>
                  <th>{t('orgs_th_country')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orgs.map(org => (
                  <tr key={org.id}>
                    <td>
                      <Link to={`/manage/organizations/${org.id}`} className="fw-semibold text-body">
                        {org.name}
                      </Link>
                      {org.is_default && <AdminBadge color="secondary" className="ms-2">{t('studios_default_badge')}</AdminBadge>}
                    </td>
                    <td><code className="text-muted">{org.slug}</code></td>
                    <td>{org.locale || '—'}</td>
                    <td>{org.country || '—'}</td>
                    <td className="text-end">
                      <Link to={`/manage/organizations/${org.id}`} className="btn btn-sm btn-outline-secondary">
                        {t('gal_overview_manage')} <i className="fas fa-chevron-right ms-1" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminPage>
  );
}
