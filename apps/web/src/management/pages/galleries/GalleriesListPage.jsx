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
import { AdminPage, AdminCard, AdminBadge, AdminAlert } from '../../../components/ui/index.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };
const ACCESS_BADGE = { public: 'success', private: 'secondary', password: 'warning' };

export default function GalleriesListPage() {
  const t = useT();
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.listGalleries()
      .then(setGalleries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminPage title={t('gal_list_title')}>
      <AdminAlert message={error} />
      <AdminCard noPadding>
        {loading ? (
          <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
        ) : galleries.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="fas fa-images fa-2x mb-3" style={{ display: 'block' }} />
            <p className="mb-0">{t('gal_list_no_galleries')}</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>{t('gal_list_th_gallery')}</th><th>{t('gal_list_th_access')}</th><th>{t('gal_list_th_build')}</th><th></th></tr>
              </thead>
              <tbody>
                {galleries.map(g => (
                  <tr key={g.id}>
                    <td>
                      <Link to={`/manage/galleries/${g.id}`} className="fw-semibold text-body">{g.title || g.slug}</Link>
                      <small className="text-muted d-block"><code>{g.slug}</code></small>
                    </td>
                    <td>
                      <AdminBadge color={ACCESS_BADGE[g.access] || 'secondary'}>{g.access || 'public'}</AdminBadge>
                    </td>
                    <td>
                      {g.buildStatus
                        ? <AdminBadge color={STATUS_BADGE[g.buildStatus] || 'secondary'}>{g.buildStatus}</AdminBadge>
                        : <span className="text-muted" style={{ fontSize: '0.8rem' }}>{t('gal_list_never_built')}</span>
                      }
                    </td>
                    <td className="text-end">
                      <Link to={`/manage/galleries/${g.id}`} className="btn btn-sm btn-outline-secondary">
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
