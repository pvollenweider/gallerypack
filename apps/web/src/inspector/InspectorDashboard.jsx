// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorDashboard.jsx — system dashboard (Sprint 21)
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

const BUILD_COLOR = { done: '#4ade80', error: '#f87171', running: '#60a5fa', queued: '#fbbf24' };

export default function InspectorDashboard() {
  const t = useT();
  const [data,          setData]          = useState(null);
  const [rebuilding,    setRebuilding]    = useState(false);
  const [rebuildResult, setRebuildResult] = useState(null);

  useEffect(() => {
    api.inspectorDashboard().then(setData).catch(() => {});
  }, []);

  async function rebuildAll() {
    if (!window.confirm(t('inspector_rebuild_all_confirm'))) return;
    setRebuilding(true); setRebuildResult(null);
    try {
      const r = await api.inspectorRebuildAll();
      setRebuildResult(t('inspector_rebuild_all_done', { queued: r.queued, total: r.total }));
    } catch (err) {
      setRebuildResult(`Erreur : ${err.message}`);
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <>
      <div className="content-header" style={{ background: '#0f1117', borderBottom: '1px solid #1e1e2e' }}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={{ color: '#eee', fontSize: '1.3rem' }}>{t('inspector_dashboard_title')}</h1>
            </div>
            <div className="col-sm-6 text-end">
              <button
                className="btn btn-sm btn-warning"
                onClick={rebuildAll}
                disabled={rebuilding}
                style={{ fontSize: '0.8rem' }}
              >
                {rebuilding
                  ? <><i className="fas fa-spinner fa-spin me-1" />{t('inspector_rebuild_all_running')}</>
                  : <><i className="fas fa-sync-alt me-1" />{t('inspector_rebuild_all_btn')}</>
                }
              </button>
            </div>
          </div>
          {rebuildResult && (
            <div className="alert alert-info py-1 mb-2" style={{ fontSize: '0.82rem' }}>{rebuildResult}</div>
          )}
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">

          {!data ? (
            <p style={{ color: '#555' }}>{t('loading')}</p>
          ) : (
            <>
              {/* Stats row */}
              <div className="row">
                <StatBox label={t('inspector_dashboard_builds')}   value={data.builds.last_24h.total}            color="info"    icon="fas fa-hammer" />
                <StatBox label={t('inspector_dashboard_success')}  value={data.builds.last_24h.success}           color="success" icon="fas fa-check" />
                <StatBox label={t('inspector_dashboard_failed')}   value={data.builds.last_24h.failed}            color="danger"  icon="fas fa-times" />
                <StatBox label={t('inspector_dashboard_active')}   value={data.builds.last_24h.active}            color="primary" icon="fas fa-cog fa-spin" />
                <StatBox label={t('inspector_dashboard_photos')}   value={data.uploads.last_24h.photos}           color="warning" icon="fas fa-image" />
                <StatBox label={t('inspector_dashboard_galleries')}value={data.uploads.last_24h.galleries_active} color="info"    icon="fas fa-images" />
              </div>

              {/* Anomaly summary */}
              {(data.anomalies.build_failed + data.anomalies.inbox_old + data.anomalies.stale_draft) > 0 && (
                <div className="card" style={{ background: '#1a1a2e', border: '1px solid #2a2a3e' }}>
                  <div className="card-header" style={{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' }}>
                    <h3 className="card-title" style={{ color: '#eee', fontSize: '0.85rem' }}>{t('inspector_dashboard_anomalies')}</h3>
                  </div>
                  <div className="card-body p-2">
                    {data.anomalies.build_failed > 0 && (
                      <Link to="/inspector/anomalies?type=build_failed" style={s.anomalyRow}>
                        <i className="fas fa-times-circle me-2 text-danger" />
                        {data.anomalies.build_failed} {data.anomalies.build_failed > 1 ? t('inspector_failed_builds') : t('inspector_failed_build')} →
                      </Link>
                    )}
                    {data.anomalies.inbox_old > 0 && (
                      <Link to="/inspector/anomalies?type=inbox_not_empty" style={s.anomalyRow}>
                        <i className="fas fa-inbox me-2 text-warning" />
                        {data.anomalies.inbox_old} {data.anomalies.inbox_old > 1 ? t('inspector_inbox_plural') : t('inspector_inbox_singular')} {t('inspector_inbox_desc')} →
                      </Link>
                    )}
                    {data.anomalies.stale_draft > 0 && (
                      <Link to="/inspector/anomalies?type=stale_draft" style={s.anomalyRow}>
                        <i className="fas fa-moon me-2 text-info" />
                        {data.anomalies.stale_draft} {data.anomalies.stale_draft > 1 ? t('inspector_stale_drafts') : t('inspector_stale_draft')} →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <div className="row">
                <div className="col-md-6">
                  <div className="card" style={{ background: '#1a1a2e', border: '1px solid #2a2a3e' }}>
                    <div className="card-header" style={{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' }}>
                      <h3 className="card-title" style={{ color: '#eee', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inspector_recent_builds')}</h3>
                    </div>
                    <div className="card-body p-0">
                      <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                        <tbody>
                          {data.builds.recent.map(b => (
                            <tr key={b.job_id} style={{ borderColor: '#2a2a3e' }}>
                              <td style={{ border: 'none', borderBottom: '1px solid #1e1e2e', padding: '0.5rem 0.75rem' }}>
                                <Link to={`/inspector/galleries/${b.gallery_id}`} style={{ color: '#7dd3fc', fontSize: '0.82rem' }}>{b.gallery_title}</Link>
                                <br /><span style={{ fontSize: '0.72rem', color: '#555' }}>{b.studio}</span>
                              </td>
                              <td style={{ border: 'none', borderBottom: '1px solid #1e1e2e', textAlign: 'right', padding: '0.5rem 0.75rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: BUILD_COLOR[b.status] || '#888' }}>{b.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="card" style={{ background: '#1a1a2e', border: '1px solid #2a2a3e' }}>
                    <div className="card-header" style={{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' }}>
                      <h3 className="card-title" style={{ color: '#eee', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inspector_recent_uploads')}</h3>
                    </div>
                    <div className="card-body p-0">
                      {data.uploads.recent.length === 0
                        ? <p style={{ color: '#555', fontSize: '0.82rem', margin: '0.75rem' }}>{t('inspector_no_uploads')}</p>
                        : (
                          <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                            <tbody>
                              {data.uploads.recent.map((u, i) => (
                                <tr key={i} style={{ borderColor: '#2a2a3e' }}>
                                  <td style={{ border: 'none', borderBottom: '1px solid #1e1e2e', padding: '0.5rem 0.75rem' }}>
                                    <Link to={`/inspector/galleries/${u.gallery_id}`} style={{ color: '#7dd3fc', fontSize: '0.82rem' }}>{u.gallery_title}</Link>
                                    <br /><span style={{ fontSize: '0.72rem', color: '#555' }}>{u.studio}</span>
                                  </td>
                                  <td style={{ border: 'none', borderBottom: '1px solid #1e1e2e', textAlign: 'right', padding: '0.5rem 0.75rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fbbf24' }}>{u.count} {t('inspector_photos_label')}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </section>
    </>
  );
}

function StatBox({ label, value, color, icon }) {
  return (
    <div className="col-6 col-md-4 col-lg-2">
      <div className={`info-box bg-gradient-${color}`} style={{ marginBottom: '1rem' }}>
        <span className="info-box-icon"><i className={icon} /></span>
        <div className="info-box-content">
          <span className="info-box-text" style={{ fontSize: '0.72rem' }}>{label}</span>
          <span className="info-box-number">{value ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

const s = {
  anomalyRow: {
    display: 'block', padding: '0.4rem 0.75rem', marginBottom: '0.25rem',
    background: '#111', border: '1px solid #2a2a3e', borderRadius: 4,
    fontSize: '0.82rem', color: '#ccc', textDecoration: 'none',
  },
};
