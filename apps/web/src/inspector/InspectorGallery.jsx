// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorGallery.jsx — gallery detail view (Sprints 17-20)
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

const SEV_COLOR  = { error: '#f87171', warning: '#fbbf24', info: '#60a5fa' };
const SEV_BADGE  = { error: 'danger', warning: 'warning', info: 'info' };
const BUILD_COLOR = { done: '#4ade80', error: '#f87171', running: '#60a5fa', queued: '#fbbf24' };

export default function InspectorGallery() {
  const t = useT();
  const { id }       = useParams();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [rebuilding, setRebuilding] = useState(false);
  const [toast,      setToast]      = useState('');

  async function load() {
    setLoading(true);
    try { setData(await api.inspectorGallery(id)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  async function handleRebuild() {
    if (!confirm(t('inspector_rebuild_confirm'))) return;
    setRebuilding(true);
    try {
      const r = await api.inspectorRebuild(id);
      setToast(`Build queued — job ${r.job_id}`);
      load();
    } catch (e) { setToast(`Error: ${e.message}`); }
    finally { setRebuilding(false); }
  }

  async function handleToggleActive() {
    const newActive = !data.active;
    const msg = newActive ? t('inspector_reenable_confirm') : t('inspector_disable_confirm');
    if (!confirm(msg)) return;
    try {
      await api.inspectorSetActive(id, newActive);
      setData(d => ({ ...d, active: newActive }));
    } catch (e) { setToast(`Error: ${e.message}`); }
  }

  async function handleRevokeUploadLink(linkId) {
    if (!confirm(t('inspector_revoke_upload_confirm'))) return;
    try {
      await api.inspectorRevokeUploadLink(id, linkId);
      setData(d => ({ ...d, upload_links: d.upload_links.map(l => l.id === linkId ? { ...l, active: false } : l) }));
    } catch (e) { setToast(`Error: ${e.message}`); }
  }

  async function handleRevokeToken(tokenId) {
    if (!confirm(t('inspector_revoke_token_confirm'))) return;
    try {
      await api.inspectorRevokeToken(id, tokenId);
      setData(d => ({ ...d, viewer_tokens: d.viewer_tokens.map(tk => tk.id === tokenId ? { ...tk, active: false } : tk) }));
    } catch (e) { setToast(`Error: ${e.message}`); }
  }

  const title = data ? (data.title || data.slug) : '…';

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={s.toast} onClick={() => setToast('')}>{toast}</div>
      )}

      {/* Content Header */}
      <div className="content-header" style={s.header}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={s.pageTitle}>{title}</h1>
              {data && (
                <div className="mt-1" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span className={`badge bg-${data.active ? 'success' : 'danger'}`}>{data.active ? t('inspector_gallery_active') : t('inspector_gallery_disabled')}</span>
                  <span className="badge bg-secondary">{data.status}</span>
                  <span className="badge" style={{ background: '#1e1e2e', color: BUILD_COLOR[data.build_status] || '#888' }}>
                    {data.build_status || t('gal_list_never_built')}
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Action buttons */}
          {data && (
            <div className="row">
              <div className="col-12">
                <div className="btn-group btn-group-sm">
                  <button className="btn btn-secondary" style={s.actionBtn} onClick={handleRebuild} disabled={rebuilding}>
                    <i className="fas fa-sync me-1" />{rebuilding ? t('inspector_queuing') : t('inspector_rebuild_btn')}
                  </button>
                  <button
                    className={`btn btn-${data.active ? 'outline-danger' : 'outline-success'}`}
                    style={s.actionBtn}
                    onClick={handleToggleActive}
                  >
                    {data.active ? t('inspector_disable_btn') : t('inspector_enable_btn')}
                  </button>
                  <Link to={`/admin/galleries/${id}`} className="btn btn-secondary" style={s.actionBtn}>
                    <i className="fas fa-external-link-alt me-1" />{t('inspector_open_admin')}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">
          {loading && <p style={{ color: '#555' }}>{t('loading')}</p>}
          {error   && <div className="alert alert-danger">{error}</div>}
          {!loading && !error && data && (
            <>
              {/* Health warnings */}
              {data.health?.warnings?.length > 0 && (
                <div className="card" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>{t('inspector_health_warnings')}</h3>
                  </div>
                  <div className="card-body p-2">
                    {data.health.warnings.map((w, i) => (
                      <div key={i} className="callout" style={{ borderLeftColor: SEV_COLOR[w.severity] || '#333', background: '#111', margin: '0 0 0.4rem', padding: '0.4rem 0.75rem' }}>
                        <span className={`badge bg-${SEV_BADGE[w.severity] || 'secondary'} me-2`} style={{ fontSize: '0.65rem' }}>{w.severity}</span>
                        <span style={{ color: '#ccc', fontSize: '0.85rem' }}>{w.message}</span>
                        {w.code === 'inbox_not_empty' && <Link to={`/admin/galleries/${id}/inbox`} style={{ marginLeft: '0.75rem', color: '#7dd3fc', fontSize: '0.8rem' }}>{t('inspector_go_inbox')}</Link>}
                        {w.code === 'build_failed' && w.job_id && <Link to={`/admin/jobs/${w.job_id}`} style={{ marginLeft: '0.75rem', color: '#7dd3fc', fontSize: '0.8rem' }}>{t('inspector_see_build')}</Link>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="row">
                {/* Photos stats */}
                <div className="col-md-4">
                  <div className="card" style={s.card}>
                    <div className="card-header" style={s.cardHeader}>
                      <h3 className="card-title" style={s.cardTitle}>{t('tab_photos')} — {data.photos?.total}</h3>
                    </div>
                    <div className="card-body">
                      <StatRow label={t('inspector_photos_pending')}   value={data.photos?.by_status?.uploaded}  color="#fbbf24" />
                      <StatRow label={t('inspector_photos_validated')} value={data.photos?.by_status?.validated} color="#60a5fa" />
                      <StatRow label={t('inspector_photos_published')} value={data.photos?.by_status?.published} color="#4ade80" />
                    </div>
                  </div>
                </div>

                {/* Last build */}
                <div className="col-md-8">
                  <div className="card" style={s.card}>
                    <div className="card-header" style={s.cardHeader}>
                      <h3 className="card-title" style={s.cardTitle}>{t('inspector_last_build')}</h3>
                    </div>
                    <div className="card-body">
                      {!data.last_build ? (
                        <p style={{ color: '#555', fontSize: '0.82rem', margin: 0 }}>{t('inspector_never_built')}</p>
                      ) : (
                        <>
                          <KVRow label={t('inspector_th_status')}>
                            <span style={{ color: BUILD_COLOR[data.last_build.status] || '#888', fontWeight: 600 }}>{data.last_build.status}</span>
                          </KVRow>
                          <KVRow label={t('inspector_build_started')}>{data.last_build.started_at ? new Date(data.last_build.started_at).toLocaleString() : '—'}</KVRow>
                          {data.last_build.error_message && (
                            <KVRow label={t('inspector_build_error')}><code style={{ color: '#f87171', fontSize: '0.8rem', background: 'none' }}>{data.last_build.error_message}</code></KVRow>
                          )}
                          <KVRow label=""><Link to={`/admin/jobs/${data.last_build.id}`} style={s.link}>{t('inspector_view_logs')}</Link></KVRow>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                {/* Upload links */}
                <div className="col-md-6">
                  <div className="card" style={s.card}>
                    <div className="card-header" style={s.cardHeader}>
                      <h3 className="card-title" style={s.cardTitle}>{t('gal_upload_links_section')} — {data.upload_links?.length}</h3>
                    </div>
                    <div className="card-body p-0">
                      {data.upload_links?.length === 0 && <p style={{ color: '#555', fontSize: '0.82rem', margin: '0.75rem' }}>{t('inspector_no_upload_links')}</p>}
                      {data.upload_links?.map(l => (
                        <div key={l.id} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e1e2e', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ flex: 1, fontSize: '0.85rem', color: '#ccc' }}>{l.label || t('inspector_no_label')}</span>
                          <span style={{ fontSize: '0.75rem', color: l.active ? '#4ade80' : '#555' }}>{l.active ? t('inspector_active_badge') : t('inspector_revoked_badge')}</span>
                          {l.expires_at && <span style={{ fontSize: '0.72rem', color: '#555' }}>exp. {new Date(l.expires_at).toLocaleDateString()}</span>}
                          {l.active && <button style={s.dangerBtn} onClick={() => handleRevokeUploadLink(l.id)}>{t('inspector_revoke_btn')}</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Viewer tokens */}
                <div className="col-md-6">
                  {data.viewer_tokens?.length > 0 && (
                    <div className="card" style={s.card}>
                      <div className="card-header" style={s.cardHeader}>
                        <h3 className="card-title" style={s.cardTitle}>{t('inspector_viewer_tokens')} — {data.viewer_tokens.length}</h3>
                      </div>
                      <div className="card-body p-0">
                        {data.viewer_tokens.map(tk => (
                          <div key={tk.id} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e1e2e', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ flex: 1, fontSize: '0.85rem', color: '#ccc' }}>{tk.label || t('inspector_no_label')}</span>
                            <span style={{ fontSize: '0.75rem', color: tk.active ? '#4ade80' : '#555' }}>{tk.active ? t('inspector_active_badge') : t('inspector_revoked_badge')}</span>
                            {tk.expires_at && <span style={{ fontSize: '0.72rem', color: '#555' }}>exp. {new Date(tk.expires_at).toLocaleDateString()}</span>}
                            {tk.active && <button style={s.dangerBtn} onClick={() => handleRevokeToken(tk.id)}>{t('inspector_revoke_btn')}</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Members */}
              <div className="card" style={s.card}>
                <div className="card-header" style={s.cardHeader}>
                  <h3 className="card-title" style={s.cardTitle}>{t('inspector_th_members')}</h3>
                </div>
                <div className="card-body p-0">
                  {data.members?.length === 0 && <p style={{ color: '#555', fontSize: '0.82rem', margin: '0.75rem' }}>{t('inspector_no_members')}</p>}
                  {data.members?.map(m => (
                    <div key={m.user_id} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e1e2e', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <Link to={`/inspector/users/${m.user_id}`} style={s.link}>{m.email}</Link>
                      <span style={{ fontSize: '0.75rem', color: '#555' }}>{m.name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#666' }}>{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit log */}
              <AuditLog targetType="gallery" targetId={id} />
            </>
          )}
        </div>
      </section>
    </>
  );
}

function AuditLog({ targetType, targetId }) {
  const t = useT();
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    api.inspectorAuditLog({ target_type: targetType, target_id: targetId, limit: 10 })
      .then(r => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [targetType, targetId]);

  if (!entries || entries.length === 0) return null;
  return (
    <div className="card" style={s.card}>
      <div className="card-header" style={s.cardHeader}>
        <h3 className="card-title" style={s.cardTitle}>{t('inspector_audit_log')}</h3>
      </div>
      <div className="card-body p-0">
        {entries.map(e => (
          <div key={e.id} style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid #1e1e2e', fontSize: '0.8rem', color: '#666' }}>
            <span style={{ color: '#ccc', fontWeight: 500 }}>{e.action}</span>
            {' — '}{e.actor_email || e.actor_id}
            {' — '}{new Date(e.created_at).toLocaleString()}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.82rem' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || '#eee' }}>{value ?? 0}</span>
    </div>
  );
}

function KVRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
      <span style={{ width: 90, color: '#555', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#ccc' }}>{children}</span>
    </div>
  );
}

const s = {
  header:    { background: '#0f1117', borderBottom: '1px solid #1e1e2e' },
  pageTitle: { color: '#eee', fontSize: '1.3rem' },
  card:      { background: '#1a1a2e', border: '1px solid #2a2a3e' },
  cardHeader:{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' },
  cardTitle: { color: '#eee', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  link:      { color: '#7dd3fc', textDecoration: 'none' },
  actionBtn: { background: '#1e1e2e', border: '1px solid #2a2a3e', color: '#ccc', fontSize: '0.82rem' },
  dangerBtn: { padding: '0.2rem 0.5rem', background: 'none', border: '1px solid #7f1d1d', borderRadius: 4, color: '#f87171', cursor: 'pointer', fontSize: '0.72rem' },
  toast:     { position: 'fixed', bottom: '1rem', right: '1rem', background: '#1e3a5f', color: '#93c5fd', padding: '0.6rem 1rem', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer', zIndex: 100 },
};
