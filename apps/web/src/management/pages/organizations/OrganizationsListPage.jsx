// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useAuth } from '../../../lib/auth.jsx';
import { useT } from '../../../lib/I18nContext.jsx';
import { slugify } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminInput, AdminBadge, AdminAlert, AdminButton, AdminLoader, AdminEmptyState, AdminToast } from '../../../components/ui/index.js';

export default function OrganizationsListPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperadmin = user?.platformRole === 'superadmin';

  const [orgs,    setOrgs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [prerendering, setPrerendering] = useState(false);
  const [prerenderToast, setPrerenderToast] = useState('');

  async function prerender() {
    setPrerendering(true);
    try {
      await api.prerenderAll();
      setPrerenderToast(t('prerender_pages_ok'));
    } catch (err) {
      setPrerenderToast(t('prerender_pages_err', { message: err.message }));
    } finally {
      setPrerendering(false);
    }
  }

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg,     setNewOrg]     = useState({ name: '', slug: '', locale: 'en', country: '' });
  const [slugEdited, setSlugEdited] = useState(false); // true = user manually edited slug
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

  function handleNameChange(e) {
    const name = e.target.value;
    setNewOrg(f => ({
      ...f,
      name,
      slug: slugEdited ? f.slug : slugify(name),
    }));
  }

  function handleSlugChange(e) {
    setSlugEdited(true);
    setNewOrg(f => ({ ...f, slug: e.target.value }));
  }

  function resetForm() {
    setNewOrg({ name: '', slug: '', locale: 'en', country: '' });
    setSlugEdited(false);
    setCreateErr('');
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      const org = await api.createOrganization(newOrg);
      resetForm();
      setShowCreate(false);
      navigate(`/admin/organizations/${org.id}`);
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  return (
    <AdminPage
      title={t('orgs_page_title')}
      maxWidth="100%"
      actions={
        <div className="d-flex gap-2">
          <AdminButton
            variant="outline-secondary" size="sm"
            loading={prerendering} loadingLabel={t('prerenderring')}
            onClick={prerender} icon="fas fa-file-code"
          >
            {t('prerender_pages')}
          </AdminButton>
          {isSuperadmin && (
            <AdminButton size="sm" icon="fas fa-plus" onClick={openCreate}>
              {t('orgs_new_btn')}
            </AdminButton>
          )}
        </div>
      }
    >
      <AdminToast message={prerenderToast} onDone={() => setPrerenderToast('')} />
      {showCreate && (
        <AdminCard title={t('orgs_new_btn')} className="mb-3">
          <form onSubmit={create}>
            <div className="row">
              <div className="col-sm-4 mb-3">
                <AdminInput
                  label={t('orgs_th_name')}
                  value={newOrg.name}
                  onChange={handleNameChange}
                  required
                  autoFocus
                  className="mb-0"
                />
              </div>
              <div className="col-sm-3 mb-3">
                <AdminInput
                  label={t('orgs_th_slug')}
                  value={newOrg.slug}
                  onChange={handleSlugChange}
                  required
                  pattern="[-a-z0-9]+"
                  title={t('orgs_slug_hint')}
                  className="mb-0"
                  hint={!slugEdited && newOrg.name ? t('slug_auto_hint') : undefined}
                />
              </div>
              <div className="col-sm-2 mb-3">
                <AdminInput
                  label={t('orgs_th_locale')}
                  value={newOrg.locale}
                  onChange={e => setNewOrg(f => ({ ...f, locale: e.target.value }))}
                  placeholder="en"
                  className="mb-0"
                />
              </div>
              <div className="col-sm-3 mb-3">
                <AdminInput
                  label={t('orgs_th_country')}
                  value={newOrg.country}
                  onChange={e => setNewOrg(f => ({ ...f, country: e.target.value }))}
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
          <AdminEmptyState
            icon="fas fa-building"
            title={t('studios_empty')}
            action={isSuperadmin && (
              <AdminButton size="sm" icon="fas fa-plus" onClick={openCreate}>
                {t('orgs_new_btn')}
              </AdminButton>
            )}
          />
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
                      <Link to={`/admin/organizations/${org.id}`} className="fw-semibold text-body">
                        {org.name}
                      </Link>
                      {org.is_default && <AdminBadge color="secondary" className="ms-2">{t('studios_default_badge')}</AdminBadge>}
                      {org.description && <small className="text-muted d-block">{org.description}</small>}
                    </td>
                    <td><code className="text-muted">{org.slug}</code></td>
                    <td>{org.locale || '—'}</td>
                    <td>{org.country || '—'}</td>
                    <td className="text-end">
                      <Link to={`/admin/organizations/${org.id}`} className="btn btn-sm btn-outline-secondary">
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
