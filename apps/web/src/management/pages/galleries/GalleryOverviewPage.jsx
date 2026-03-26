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
import { AdminPage, AdminCard, AdminButton, AdminBadge, AdminAlert } from '../../../components/ui/index.js';

const STATUS_BADGE  = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };
const ACCESS_BADGE  = { public: 'success', private: 'secondary', password: 'warning' };

export default function GalleryOverviewPage() {
  const t = useT();
  const { galleryId } = useParams();
  const { setEntityName } = useBreadcrumb();
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');

  useEffect(() => {
    api.getGallery(galleryId)
      .then(g => { setGallery(g); setEntityName(galleryId, g.title || g.slug); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

  async function rebuild() {
    setBuilding(true); setBuildMsg('');
    try {
      await api.triggerBuild(galleryId, true);
      setBuildMsg(t('build_triggered'));
      const g = await api.getGallery(galleryId);
      setGallery(g);
    } catch (err) {
      setBuildMsg(err.message);
    } finally {
      setBuilding(false);
    }
  }

  const base = `/manage/galleries/${galleryId}`;

  return (
    <AdminPage
      title={gallery?.title || gallery?.slug || 'Gallery'}
      actions={
        <AdminButton
          size="sm"
          icon="fas fa-rocket"
          loading={building}
          loadingLabel={t('gal_publish_building')}
          disabled={loading}
          onClick={rebuild}
        >
          {t('gal_publish_title')}
        </AdminButton>
      }
    >
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />
      <AdminAlert variant="info" message={buildMsg} className="py-2" />

      {gallery && (
        <div className="row">

          <div className="col-md-3 mb-3">
            <AdminCard
              title={<><i className="fas fa-lock me-2" />{t('gal_overview_access')}</>}
              headerRight={<Link to={`${base}/access`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_edit')}</Link>}
              className="h-100"
            >
              <AdminBadge color={ACCESS_BADGE[gallery.access] || 'secondary'}>{gallery.access || 'public'}</AdminBadge>
              {gallery.access === 'password' && <small className="text-muted d-block mt-1">{t('gal_overview_password_set')}</small>}
            </AdminCard>
          </div>

          <div className="col-md-3 mb-3">
            <AdminCard
              title={<><i className="fas fa-download me-2" />{t('gal_overview_downloads')}</>}
              headerRight={<Link to={`${base}/downloads`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_edit')}</Link>}
              className="h-100"
            >
              <div style={{ fontSize: '0.85rem' }}>
                <div><i className={`fas fa-${gallery.allowDownloadImage ? 'check text-success' : 'times text-muted'} me-2`} />{t('gal_overview_photo_dl')}</div>
                <div><i className={`fas fa-${gallery.allowDownloadGallery ? 'check text-success' : 'times text-muted'} me-2`} />{t('gal_overview_zip_dl')}</div>
              </div>
            </AdminCard>
          </div>

          <div className="col-md-3 mb-3">
            <AdminCard
              title={<><i className="fas fa-upload me-2" />{t('gal_overview_upload')}</>}
              headerRight={<Link to={`${base}/upload`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>}
              className="h-100"
            >
              <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>{t('gal_overview_upload_desc')}</p>
            </AdminCard>
          </div>

          <div className="col-md-3 mb-3">
            <AdminCard
              title={<><i className="fas fa-rocket me-2" />{t('gal_overview_publish')}</>}
              headerRight={<Link to={`${base}/publish`} className="btn btn-sm btn-outline-secondary">{t('gal_overview_details')}</Link>}
              className="h-100"
            >
              {gallery.buildStatus
                ? <AdminBadge color={STATUS_BADGE[gallery.buildStatus] || 'secondary'}>{gallery.buildStatus}</AdminBadge>
                : <span className="text-muted" style={{ fontSize: '0.85rem' }}>{t('gal_overview_never_built')}</span>
              }
            </AdminCard>
          </div>

        </div>
      )}
    </AdminPage>
  );
}
