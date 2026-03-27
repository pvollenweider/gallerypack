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
import { AdminPage, AdminCard, AdminBadge, AdminAlert } from '../../../components/ui/index.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

export default function GalleryJobsPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.listJobs(galleryId)
      .then(setJobs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

  return (
    <AdminPage title={t('tab_jobs')}>
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />

      {!loading && (
        <AdminCard noPadding>
          {jobs.length === 0 ? (
            <div className="text-center text-muted py-5">{t('no_builds')}</div>
          ) : (
            <table className="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>{t('hub_col_status')}</th>
                  <th>{t('hub_col_date')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id}>
                    <td>
                      <AdminBadge color={STATUS_BADGE[j.status] || 'secondary'}>{j.status}</AdminBadge>
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="text-end">
                      <Link to={`/jobs/${j.id}`} className="btn btn-sm btn-outline-secondary">
                        {t('hub_logs')} <i className="fas fa-arrow-right ms-1" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminCard>
      )}
    </AdminPage>
  );
}
