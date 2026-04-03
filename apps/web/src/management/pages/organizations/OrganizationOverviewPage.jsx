// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useBreadcrumb } from '../../context/BreadcrumbContext.jsx';
import { AdminPage, AdminCard, AdminAlert, AdminLoader, AdminButton, AdminToast } from '../../../components/ui/index.js';

export default function OrganizationOverviewPage() {
  const t = useT();
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { setEntityName } = useBreadcrumb();
  const [org,          setOrg]          = useState(null);
  const [projectCount, setProjectCount] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [buildingAll,  setBuildingAll]  = useState(false);
  const [buildToast,   setBuildToast]   = useState('');
  const [prerendering, setPrerendering] = useState(false);

  async function prerender() {
    setPrerendering(true);
    try {
      await api.prerenderOrg(orgId);
      setBuildToast(t('prerender_pages_ok'));
    } catch (err) {
      setBuildToast(t('prerender_pages_err', { message: err.message }));
    } finally {
      setPrerendering(false);
    }
  }

  async function buildAll() {
    setBuildingAll(true);
    try {
      const r = await api.buildAllOrgGalleries(orgId);
      setBuildToast(t('build_all_queued_of', { queued: r.queued, total: r.total }));
    } catch (err) {
      setBuildToast(t('build_all_error', { message: err.message }));
    } finally {
      setBuildingAll(false);
    }
  }

  useEffect(() => {
    Promise.all([api.getOrganization(orgId), api.listProjects()])
      .then(([o, projects]) => {
        setOrg(o);
        setEntityName(orgId, o.name);
        setProjectCount(projects?.length ?? 0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  const base = `/admin/organizations/${orgId}`;

  return (
    <AdminPage
      title={org?.name ?? 'Organization'}
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
          <AdminButton
            variant="outline-secondary" size="sm"
            loading={buildingAll} loadingLabel={t('republishing')}
            onClick={buildAll} icon="fas fa-sync-alt"
          >
            {t('republish_all')}
          </AdminButton>
        </div>
      }
    >
      <AdminToast message={buildToast} onDone={() => setBuildToast('')} />
      {loading && <AdminLoader />}
      <AdminAlert message={error} />

      {!loading && projectCount === 0 && (
        <div className="alert alert-info d-flex align-items-center gap-3 mb-3">
          <i className="fas fa-lightbulb fa-lg" />
          <div style={{ flex: 1 }}>
            <strong>{t('cta_org_no_projects_title')}</strong>
            <div style={{ fontSize: '0.875rem' }}>{t('cta_org_no_projects_desc')}</div>
          </div>
          <AdminButton size="sm" icon="fas fa-plus" onClick={() => navigate(`${base}/projects`)}>
            {t('proj_new_btn')}
          </AdminButton>
        </div>
      )}

      {org && (
        <div className="row">

          {/* General */}
          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-info-circle me-2" />{t('org_general_title')}</>}
              headerRight={<Link to={`${base}/general`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_edit')}</Link>}
            >
              <dl className="mb-0" style={{ fontSize: '0.875rem' }}>
                <dt className="text-muted">{t('orgs_th_slug')}</dt>
                <dd><code>{org.slug}</code></dd>
                <dt className="text-muted">{t('orgs_th_locale')}</dt>
                <dd>{org.locale || '—'}</dd>
                <dt className="text-muted">{t('orgs_th_country')}</dt>
                <dd>{org.country || '—'}</dd>
              </dl>
            </AdminCard>
          </div>

          {/* Team */}
          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-users me-2" />{t('org_team_title')}</>}
              headerRight={<Link to={`${base}/team`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>}
            >
              {org.members?.length > 0 ? (
                <>
                  <p className="mb-1" style={{ fontSize: '0.875rem' }}>
                    <strong>{org.members.length}</strong> {org.members.length === 1 ? t('count_member') : t('count_members')}
                  </p>
                  <div className="d-flex flex-wrap gap-1 mt-2">
                    {org.members.slice(0, 5).map(m => (
                      <span key={m.user_id} className="badge bg-light text-dark border" style={{ fontSize: '0.75rem' }}>
                        {m.name || m.email}
                      </span>
                    ))}
                    {org.members.length > 5 && <span className="badge bg-light text-muted border">+{org.members.length - 5} more</span>}
                  </div>
                </>
              ) : (
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>{t('org_overview_no_members')}</p>
              )}
            </AdminCard>
          </div>

          {/* Projects */}
          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-folder-open me-2" />{t('studio_projects_title')}</>}
              headerRight={<Link to={`${base}/projects`} className="btn btn-sm btn-outline-secondary">{t('proj_overview_view_all')}</Link>}
            >
              <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                {t('org_overview_projects_desc')}
              </p>
            </AdminCard>
          </div>

          {/* Defaults */}
          <div className="col-md-6 mb-3">
            <AdminCard
              title={<><i className="fas fa-sliders-h me-2" />{t('org_defaults_title')}</>}
              headerRight={<Link to={`${base}/defaults`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>}
            >
              <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                {t('org_overview_defaults_desc')}
              </p>
            </AdminCard>
          </div>

          {/* Access */}
          <div className="col-md-6 mb-3">
            <AdminCard
              title={<><i className="fas fa-lock me-2" />{t('org_access_title')}</>}
              headerRight={<Link to={`${base}/access`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>}
            >
              <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                {t('org_overview_access_desc')}
              </p>
            </AdminCard>
          </div>

        </div>
      )}
    </AdminPage>
  );
}
