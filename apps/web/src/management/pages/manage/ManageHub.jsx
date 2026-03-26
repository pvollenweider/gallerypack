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
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';

const ACTION_PRIORITY = { build_failed: 0, photos_to_validate: 1, gallery_ready: 2, no_upload_link: 3 };
const STATUS_COLOR    = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

const ACTION_CONFIG = {
  build_failed:       { icon: 'fas fa-exclamation-circle text-danger',  bg: 'danger'  },
  photos_to_validate: { icon: 'fas fa-inbox text-warning',              bg: 'warning' },
  gallery_ready:      { icon: 'fas fa-check-circle text-success',       bg: 'success' },
  no_upload_link:     { icon: 'fas fa-link text-info',                  bg: 'info'    },
};

const ACTION_HREF = {
  build_failed:       a => `/jobs/${a.job_id}`,
  photos_to_validate: a => `/galleries/${a.gallery_id}?tab=inbox`,
  gallery_ready:      a => `/galleries/${a.gallery_id}`,
  no_upload_link:     a => `/galleries/${a.gallery_id}?tab=upload`,
};

export default function ManageHub() {
  const t = useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function actionLabel(a) {
    switch (a.type) {
      case 'build_failed':       return `${t('hub_action_build_failed')} — ${a.gallery_title}`;
      case 'photos_to_validate': return `${a.count} ${a.count > 1 ? t('hub_action_photos_plural') : t('hub_action_photos_singular')} — ${a.gallery_title}`;
      case 'gallery_ready':      return `${t('hub_action_ready')} — ${a.gallery_title}`;
      case 'no_upload_link':     return `${t('hub_action_no_link')} — ${a.gallery_title}`;
      default:                   return a.type;
    }
  }

  return (
    <AdminPage title={t('hub_title')} maxWidth="100%">

      {loading && (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-spinner fa-spin fa-2x" />
        </div>
      )}

      <AdminAlert message={error} />

      {data && (
        <>
          {/* Gallery stats */}
          <div className="row">
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-info"><i className="fas fa-images" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_total_galleries')}</span>
                  <span className="info-box-number">{data.galleries.total}</span>
                </div>
              </div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-secondary"><i className="fas fa-file-alt" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_draft')}</span>
                  <span className="info-box-number">{data.galleries.draft}</span>
                </div>
              </div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-warning"><i className="fas fa-clock" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_ready')}</span>
                  <span className="info-box-number">{data.galleries.ready}</span>
                </div>
              </div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-success"><i className="fas fa-check" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_published')}</span>
                  <span className="info-box-number">{data.galleries.published}</span>
                </div>
              </div>
            </div>
            {data.galleries.needs_rebuild > 0 && (
              <div className="col-md-3 col-sm-6">
                <div className="info-box">
                  <span className="info-box-icon bg-danger"><i className="fas fa-exclamation-triangle" /></span>
                  <div className="info-box-content">
                    <span className="info-box-text">{t('hub_needs_rebuild')}</span>
                    <span className="info-box-number">{data.galleries.needs_rebuild}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="row">

            {/* Actions needed */}
            {data.actions.length > 0 && (
              <div className="col-md-6">
                <AdminCard
                  title={<><i className="fas fa-tasks me-2" />{t('hub_actions_needed')}</>}
                  noPadding
                >
                  <ul className="list-group list-group-flush">
                    {data.actions.map((a, i) => {
                      const cfg = ACTION_CONFIG[a.type] || {};
                      return (
                        <li key={i} className="list-group-item list-group-item-action p-0">
                          <Link to={ACTION_HREF[a.type]?.(a) || '#'} className="d-flex align-items-center p-3 text-body text-decoration-none">
                            <i className={`${cfg.icon || 'fas fa-circle'} me-3`} />
                            <span style={{ flex: 1, fontSize: '0.875rem' }}>{actionLabel(a)}</span>
                            <i className="fas fa-chevron-right text-muted" style={{ fontSize: '0.75rem' }} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </AdminCard>
              </div>
            )}

            {/* Inbox */}
            {data.inbox.total_unvalidated > 0 && (
              <div className="col-md-6">
                <AdminCard
                  title={
                    <>
                      <i className="fas fa-inbox me-2" />
                      {t('hub_inbox_prefix')} <span className="badge bg-warning ms-1">{data.inbox.total_unvalidated}</span> {t('hub_pending')}
                    </>
                  }
                  noPadding
                >
                  <table className="table table-sm table-hover mb-0">
                    <tbody>
                      {data.inbox.by_gallery.map(g => (
                        <tr key={g.gallery_id}>
                          <td>
                            <Link to={`/galleries/${g.gallery_id}?tab=inbox`}>
                              {g.gallery_title || g.gallery_id}
                            </Link>
                          </td>
                          <td className="text-end text-warning fw-bold">{g.unvalidated_count} {t('hub_pending')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminCard>
              </div>
            )}

            {/* Recent builds */}
            <div className="col-12">
              <AdminCard
                title={<><i className="fas fa-hammer me-2" />{t('hub_recent_builds')}</>}
                noPadding
              >
                {data.builds.recent.length === 0 ? (
                  <div className="text-center text-muted py-4">{t('hub_no_builds')}</div>
                ) : (
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th>{t('hub_col_gallery')}</th>
                        <th>{t('hub_col_status')}</th>
                        <th>{t('hub_col_date')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.builds.recent.map(b => (
                        <tr key={b.job_id}>
                          <td><Link to={`/galleries/${b.gallery_id}`}>{b.gallery_title || b.gallery_id}</Link></td>
                          <td><span className={`badge bg-${STATUS_COLOR[b.status] || 'secondary'}`}>{b.status}</span></td>
                          <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(b.created_at).toLocaleString()}</td>
                          <td>
                            <Link to={`/jobs/${b.job_id}`} className="btn btn-sm btn-outline-secondary">
                              {t('hub_logs')} <i className="fas fa-arrow-right ms-1" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </AdminCard>
            </div>

          </div>
        </>
      )}

    </AdminPage>
  );
}
