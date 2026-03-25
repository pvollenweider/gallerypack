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

const SEV_COLOR = { error: '#f87171', warning: '#fbbf24', info: '#60a5fa' };
const SEV_ICON  = { error: '❌', warning: '⚠️', info: 'ℹ️' };
const BUILD_COLOR = { done: '#4ade80', error: '#f87171', running: '#60a5fa', queued: '#fbbf24' };

export default function InspectorGallery() {
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
    if (!confirm('Rebuild this gallery? This will overwrite the current static output.')) return;
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
    const msg = newActive
      ? 'Re-enable this gallery?'
      : 'Disable this gallery? It will stop being accessible to viewers and photographers.';
    if (!confirm(msg)) return;
    try {
      await api.inspectorSetActive(id, newActive);
      setData(d => ({ ...d, active: newActive }));
    } catch (e) { setToast(`Error: ${e.message}`); }
  }

  async function handleRevokeUploadLink(linkId) {
    if (!confirm('Revoke this upload link?')) return;
    try {
      await api.inspectorRevokeUploadLink(id, linkId);
      setData(d => ({ ...d, upload_links: d.upload_links.map(l => l.id === linkId ? { ...l, active: false } : l) }));
    } catch (e) { setToast(`Error: ${e.message}`); }
  }

  async function handleRevokeToken(tokenId) {
    if (!confirm('Revoke this viewer token?')) return;
    try {
      await api.inspectorRevokeToken(id, tokenId);
      setData(d => ({ ...d, viewer_tokens: d.viewer_tokens.map(t => t.id === tokenId ? { ...t, active: false } : t) }));
    } catch (e) { setToast(`Error: ${e.message}`); }
  }

  if (loading) return <p style={s.dim}>Loading…</p>;
  if (error)   return <p style={{ color: '#f87171' }}>{error}</p>;
  if (!data)   return null;

  return (
    <div style={s.page}>
      {toast && <div style={s.toast} onClick={() => setToast('')}>{toast}</div>}

      {/* Header */}
      <div style={s.header}>
        <div>
          <p style={s.breadcrumb}>
            <Link to={`/inspector/studios/${data.studio?.id}`} style={s.link}>{data.studio?.name}</Link>
            {data.project && <> / <Link to={`/inspector/projects/${data.project.id}`} style={s.link}>{data.project.name}</Link></>}
          </p>
          <h2 style={s.title}>{data.title || data.slug}</h2>
          <div style={s.meta}>
            <span style={{ ...s.badge, background: data.active ? '#14532d' : '#450a0a', color: data.active ? '#4ade80' : '#f87171' }}>
              {data.active ? 'Active' : 'Disabled'}
            </span>
            <span style={{ ...s.badge, background: '#1e1e1e', color: '#aaa' }}>{data.status}</span>
            <span style={{ ...s.badge, background: '#1e1e1e', color: BUILD_COLOR[data.build_status] || '#888' }}>{data.build_status || 'never built'}</span>
          </div>
        </div>
        <div style={s.headerActions}>
          <button style={s.btn} onClick={handleRebuild} disabled={rebuilding}>
            {rebuilding ? 'Queuing…' : '↺ Rebuild'}
          </button>
          <button style={{ ...s.btn, background: data.active ? '#450a0a' : '#14532d' }} onClick={handleToggleActive}>
            {data.active ? 'Disable' : 'Enable'}
          </button>
          <Link to={`/galleries/${id}`} style={s.btn}>Open in admin →</Link>
        </div>
      </div>

      {/* Health warnings */}
      {data.health?.warnings?.length > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Health</h3>
          {data.health.warnings.map((w, i) => (
            <div key={i} style={{ ...s.warningRow, borderColor: SEV_COLOR[w.severity] || '#333' }}>
              <span>{SEV_ICON[w.severity]} {w.message}</span>
              {w.code === 'inbox_not_empty' && <Link to={`/galleries/${id}?tab=inbox`} style={s.link}>Go to inbox →</Link>}
              {w.code === 'build_failed' && w.job_id && <Link to={`/jobs/${w.job_id}`} style={s.link}>See build →</Link>}
            </div>
          ))}
        </section>
      )}

      {/* Photos */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Photos — {data.photos?.total}</h3>
        <div style={s.statRow}>
          <Stat label="Uploaded (pending)" value={data.photos?.by_status?.uploaded} color="#fbbf24" />
          <Stat label="Validated"           value={data.photos?.by_status?.validated} color="#60a5fa" />
          <Stat label="Published"           value={data.photos?.by_status?.published} color="#4ade80" />
        </div>
      </section>

      {/* Last build */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Last build</h3>
        {!data.last_build
          ? <p style={s.dim}>Never built.</p>
          : <div style={s.card}>
              <Row label="Status"><span style={{ color: BUILD_COLOR[data.last_build.status] || '#888', fontWeight: 600 }}>{data.last_build.status}</span></Row>
              <Row label="Started">{data.last_build.started_at ? new Date(data.last_build.started_at).toLocaleString() : '—'}</Row>
              {data.last_build.error_message && <Row label="Error"><code style={{ color: '#f87171', fontSize: '0.8rem' }}>{data.last_build.error_message}</code></Row>}
              <Row label=""><Link to={`/jobs/${data.last_build.id}`} style={s.link}>View logs →</Link></Row>
            </div>
        }
      </section>

      {/* Upload links */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Upload links — {data.upload_links?.length}</h3>
        {data.upload_links?.length === 0 && <p style={s.dim}>No upload links.</p>}
        {data.upload_links?.map(l => (
          <div key={l.id} style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, fontSize: '0.85rem' }}>{l.label || '(no label)'}</span>
              <span style={{ fontSize: '0.75rem', color: l.active ? '#4ade80' : '#555' }}>{l.active ? 'active' : 'revoked'}</span>
              {l.expires_at && <span style={s.dim}>exp. {new Date(l.expires_at).toLocaleDateString()}</span>}
              {l.active && (
                <button style={s.dangerBtn} onClick={() => handleRevokeUploadLink(l.id)}>Revoke</button>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Viewer tokens */}
      {data.viewer_tokens?.length > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Viewer tokens — {data.viewer_tokens.length}</h3>
          {data.viewer_tokens.map(t => (
            <div key={t.id} style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{t.label || '(no label)'}</span>
                <span style={{ fontSize: '0.75rem', color: t.active ? '#4ade80' : '#555' }}>{t.active ? 'active' : 'revoked'}</span>
                {t.expires_at && <span style={s.dim}>exp. {new Date(t.expires_at).toLocaleDateString()}</span>}
                {t.active && (
                  <button style={s.dangerBtn} onClick={() => handleRevokeToken(t.id)}>Revoke</button>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Members */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Members</h3>
        {data.members?.length === 0 && <p style={s.dim}>No gallery-level members.</p>}
        {data.members?.map(m => (
          <div key={m.user_id} style={{ ...s.card, display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Link to={`/inspector/users/${m.user_id}`} style={s.link}>{m.email}</Link>
            <span style={s.dim}>{m.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#666' }}>{m.role}</span>
          </div>
        ))}
      </section>

      {/* Audit log */}
      <AuditLog targetType="gallery" targetId={id} />
    </div>
  );
}

function AuditLog({ targetType, targetId }) {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    api.inspectorAuditLog({ target_type: targetType, target_id: targetId, limit: 10 })
      .then(r => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [targetType, targetId]);

  if (!entries || entries.length === 0) return null;
  return (
    <section style={s.section}>
      <h3 style={s.sectionTitle}>Audit log</h3>
      {entries.map(e => (
        <div key={e.id} style={{ ...s.card, fontSize: '0.8rem', color: '#888' }}>
          <span style={{ color: '#ccc', fontWeight: 500 }}>{e.action}</span>
          {' — '}{e.actor_email || e.actor_id}
          {' — '}{new Date(e.created_at).toLocaleString()}
        </div>
      ))}
    </section>
  );
}

function Stat({ label, value, color = '#eee' }) {
  return (
    <div style={s.stat}>
      <span style={{ ...s.statValue, color }}>{value ?? 0}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
      <span style={{ width: 90, color: '#555', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#ccc' }}>{children}</span>
    </div>
  );
}

const s = {
  page:         { maxWidth: 780 },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' },
  breadcrumb:   { margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#555' },
  title:        { margin: '0 0 0.5rem', fontSize: '1.3rem', fontWeight: 600, color: '#eee' },
  meta:         { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  badge:        { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 },
  headerActions:{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' },
  btn:          { padding: '0.4rem 0.85rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: 5, color: '#ccc', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'none', whiteSpace: 'nowrap' },
  dangerBtn:    { padding: '0.25rem 0.6rem', background: 'none', border: '1px solid #7f1d1d', borderRadius: 4, color: '#f87171', cursor: 'pointer', fontSize: '0.75rem' },
  section:      { marginBottom: '1.5rem' },
  sectionTitle: { margin: '0 0 0.6rem', fontSize: '0.75rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
  warningRow:   { display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#111', border: '1px solid', borderRadius: 5, marginBottom: '0.4rem', fontSize: '0.85rem', color: '#ccc' },
  statRow:      { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  stat:         { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, padding: '0.75rem 1rem', minWidth: 90, textAlign: 'center' },
  statValue:    { display: 'block', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 },
  statLabel:    { display: 'block', fontSize: '0.7rem', color: '#555', marginTop: '0.25rem' },
  card:         { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '0.6rem 0.85rem', marginBottom: '0.4rem' },
  link:         { color: '#7dd3fc', textDecoration: 'none', fontSize: '0.85rem' },
  dim:          { color: '#555', fontSize: '0.8rem', margin: 0 },
  toast:        { position: 'fixed', bottom: '1rem', right: '1rem', background: '#1e3a5f', color: '#93c5fd', padding: '0.6rem 1rem', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer', zIndex: 100 },
};
