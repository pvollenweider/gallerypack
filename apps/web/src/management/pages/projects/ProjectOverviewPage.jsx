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
import { useBreadcrumb } from '../../context/BreadcrumbContext.jsx';
import { AdminPage, AdminCard, AdminAlert, AdminLoader, AdminButton } from '../../../components/ui/index.js';

export default function ProjectOverviewPage() {
  const t = useT();
  const { projectId } = useParams();
  const { setEntityName } = useBreadcrumb();
  const [project,    setProject]    = useState(null);
  const [galleries,  setGalleries]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    Promise.all([api.getProject(projectId), api.getProjectGalleries(projectId)])
      .then(([p, g]) => { setProject(p); setGalleries(g || []); setEntityName(projectId, p.name); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const base = `/manage/projects/${projectId}`;

  return (
    <AdminPage title={project?.name ?? 'Project'} maxWidth="100%">
      {loading && <AdminLoader />}
      <AdminAlert message={error} />

      {project && (
        <div className="row">

          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-info-circle me-2" />{t('proj_general_title')}</>}
              headerRight={
                <Link to={`${base}/general`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_edit')}</Link>
              }
              className="h-100"
            >
              <dl className="mb-0" style={{ fontSize: '0.875rem' }}>
                <dt className="text-muted">{t('orgs_th_slug')}</dt><dd><code>{project.slug}</code></dd>
                {project.description && <><dt className="text-muted">{t('field_description')}</dt><dd>{project.description}</dd></>}
                <dt className="text-muted">{t('proj_visibility_label')}</dt><dd>{project.visibility || 'public'}</dd>
              </dl>
            </AdminCard>
          </div>

          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-images me-2" />{t('proj_galleries_title')}</>}
              headerRight={
                <Link to={`${base}/galleries`} className="btn btn-sm btn-outline-secondary">{t('proj_overview_view_all')}</Link>
              }
              className="h-100"
            >
              <p className="mb-0" style={{ fontSize: '0.875rem' }}>
                <strong>{galleries.length}</strong> {galleries.length === 1 ? t('proj_overview_gallery') : t('proj_overview_galleries_pl')}
              </p>
              {galleries.slice(0, 3).map(g => (
                <div key={g.id} className="mt-1">
                  <Link to={`/manage/galleries/${g.id}`} style={{ fontSize: '0.85rem' }}>{g.title || g.slug}</Link>
                </div>
              ))}
              {galleries.length > 3 && <small className="text-muted">+{galleries.length - 3} more</small>}
            </AdminCard>
          </div>

          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-lock me-2" />{t('proj_access_title')}</>}
              headerRight={
                <Link to={`${base}/access`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>
              }
              className="h-100"
            >
              <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                {t('proj_overview_access_desc')}
              </p>
            </AdminCard>
          </div>

          <div className="col-md-4 mb-3">
            <AdminCard
              title={<><i className="fas fa-truck me-2" />{t('proj_delivery_title')}</>}
              headerRight={
                <Link to={`${base}/delivery`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>
              }
              className="h-100"
            >
              <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                {t('proj_overview_delivery_desc')}
              </p>
            </AdminCard>
          </div>

        </div>
      )}
    </AdminPage>
  );
}
