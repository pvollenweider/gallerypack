// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/pages/Dashboard.jsx — organization field dashboard
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

const ACTION_PRIORITY = { build_failed: 0, photos_to_validate: 1, gallery_ready: 2, no_upload_link: 3 };
const STATUS_COLOR = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

const ACTION_CONFIG = {
  build_failed:       { icon: 'fas fa-exclamation-circle text-danger',   bg: 'danger'  },
  photos_to_validate: { icon: 'fas fa-inbox text-warning',               bg: 'warning' },
  gallery_ready:      { icon: 'fas fa-check-circle text-success',        bg: 'success' },
  no_upload_link:     { icon: 'fas fa-link text-info',                   bg: 'info'    },
};

function makeActionLabels(t) {
  return {
    build_failed:       a => `${t('hub_action_build_failed')} — ${a.gallery_title}`,
    photos_to_validate: a => `${a.count} ${a.count > 1 ? t('hub_action_photos_plural') : t('hub_action_photos_singular')} — ${a.gallery_title}`,
    gallery_ready:      a => `${t('hub_action_ready')} — ${a.gallery_title}`,
    no_upload_link:     a => `${t('hub_action_no_link')} — ${a.gallery_title}`,
  };
}

const ACTION_HREF = {
  build_failed:       a => `/jobs/${a.job_id}`,
  photos_to_validate: a => `/galleries/${a.gallery_id}?tab=inbox`,
  gallery_ready:      a => `/galleries/${a.gallery_id}`,
  no_upload_link:     a => `/galleries/${a.gallery_id}?tab=upload`,
};

export default function Dashboard() {
  const t = useT();
  const ACTION_LABEL = makeActionLabels(t);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <h1 className="m-0">{t('nav_dashboard')}</h1>
        </div>
      </div>
      <section className="content">
        <div className="container-fluid text-center py-5 text-muted">
          <i className="fas fa-spinner fa-spin fa-2x" />
        </div>
      </section>
    </>
  );

  if (error) return (
    <>
      <div className="content-header"><div className="container-fluid"><h1 className="m-0">{t('nav_dashboard')}</h1></div></div>
      <section className="content"><div className="container-fluid">
        <div className="alert alert-danger">{error}</div>
      </div></section>
    </>
  );

  if (!data) return null;

  return (
    <>
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">{t('nav_dashboard')}</h1>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">

          {/* Gallery stats — info boxes */}
          <div className="row">
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-info elevation-1"><i className="fas fa-images" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_total_galleries')}</span>
                  <span className="info-box-number">{data.galleries.total}</span>
                </div>
              </div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-secondary elevation-1"><i className="fas fa-file-alt" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_draft')}</span>
                  <span className="info-box-number">{data.galleries.draft}</span>
                </div>
              </div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-warning elevation-1"><i className="fas fa-clock" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_ready')}</span>
                  <span className="info-box-number">{data.galleries.ready}</span>
                </div>
              </div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="info-box">
                <span className="info-box-icon bg-success elevation-1"><i className="fas fa-check" /></span>
                <div className="info-box-content">
                  <span className="info-box-text">{t('hub_published')}</span>
                  <span className="info-box-number">{data.galleries.published}</span>
                </div>
              </div>
            </div>
            {data.galleries.needs_rebuild > 0 && (
              <div className="col-md-3 col-sm-6">
                <div className="info-box">
                  <span className="info-box-icon bg-danger elevation-1"><i className="fas fa-exclamation-triangle" /></span>
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
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title"><i className="fas fa-tasks me-2" />{t('hub_actions_needed')}</h3>
                  </div>
                  <div className="card-body p-0">
                    <ul className="list-group list-group-flush">
                      {data.actions.map((a, i) => {
                        const cfg = ACTION_CONFIG[a.type] || {};
                        return (
                          <li key={i} className="list-group-item list-group-item-action p-0">
                            <Link to={ACTION_HREF[a.type]?.(a) || '#'} className="d-flex align-items-center p-3 text-body text-decoration-none">
                              <i className={`${cfg.icon || 'fas fa-circle'} me-3`} />
                              <span style={{ flex: 1, fontSize: '0.875rem' }}>{ACTION_LABEL[a.type]?.(a) || a.type}</span>
                              <i className="fas fa-chevron-right text-muted" style={{ fontSize: '0.75rem' }} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Inbox */}
            {data.inbox.total_unvalidated > 0 && (
              <div className="col-md-6">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <i className="fas fa-inbox me-2" />
                      {t('hub_inbox_prefix')} <span className="badge bg-warning">{data.inbox.total_unvalidated}</span> {t('hub_pending')}
                    </h3>
                  </div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                    <table className="table table-sm table-hover mb-0">
                      <tbody>
                        {data.inbox.by_gallery.map(g => (
                          <tr key={g.gallery_id}>
                            <td>
                              <Link to={`/galleries/${g.gallery_id}?tab=inbox`}>
                                {g.gallery_title || g.gallery_id}
                              </Link>
                            </td>
                            <td className="text-end text-warning fw-bold" style={{ whiteSpace: 'nowrap' }}>
                              {g.unvalidated_count} {t('hub_pending')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent builds */}
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title"><i className="fas fa-hammer me-2" />{t('hub_recent_builds')}</h3>
                </div>
                <div className="card-body p-0">
                  {data.builds.recent.length === 0 ? (
                    <div className="text-center text-muted py-4">{t('hub_no_builds')}</div>
                  ) : (
                    <div className="table-responsive">
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
                            <td>
                              <Link to={`/galleries/${b.gallery_id}`}>{b.gallery_title || b.gallery_id}</Link>
                            </td>
                            <td>
                              <span className={`badge bg-${STATUS_COLOR[b.status] || 'secondary'}`}>{b.status}</span>
                            </td>
                            <td className="text-muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {new Date(b.created_at).toLocaleString()}
                            </td>
                            <td>
                              <Link to={`/jobs/${b.job_id}`} className="btn btn-xs btn-outline-secondary">
                                {t('hub_logs')} <i className="fas fa-arrow-right ms-1" />
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
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
