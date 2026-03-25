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

const BUILD_COLOR = { done: '#4ade80', error: '#f87171', running: '#60a5fa', queued: '#fbbf24' };

export default function InspectorDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.inspectorDashboard().then(setData).catch(() => {});
  }, []);

  if (!data) return <p style={{ color: '#555' }}>Loading…</p>;

  return (
    <div>
      <h2 style={s.pageTitle}>System — last 24 h</h2>

      <div style={s.statRow}>
        <Stat label="Builds"   value={data.builds.last_24h.total} />
        <Stat label="Success"  value={data.builds.last_24h.success} color="#4ade80" />
        <Stat label="Failed"   value={data.builds.last_24h.failed}  color="#f87171" />
        <Stat label="Active"   value={data.builds.last_24h.active}  color="#60a5fa" />
        <Stat label="Photos uploaded" value={data.uploads.last_24h.photos} />
        <Stat label="Galleries active" value={data.uploads.last_24h.galleries_active} />
      </div>

      {/* Anomaly summary */}
      {(data.anomalies.build_failed + data.anomalies.inbox_old + data.anomalies.stale_draft) > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Anomalies</h3>
          {data.anomalies.build_failed > 0 && (
            <Link to="/inspector/anomalies?type=build_failed" style={s.anomalyRow}>
              ❌ {data.anomalies.build_failed} failed build{data.anomalies.build_failed > 1 ? 's' : ''} →
            </Link>
          )}
          {data.anomalies.inbox_old > 0 && (
            <Link to="/inspector/anomalies?type=inbox_not_empty" style={s.anomalyRow}>
              📥 {data.anomalies.inbox_old} inbox{data.anomalies.inbox_old > 1 ? 'es' : ''} with old unvalidated photos →
            </Link>
          )}
          {data.anomalies.stale_draft > 0 && (
            <Link to="/inspector/anomalies?type=stale_draft" style={s.anomalyRow}>
              💤 {data.anomalies.stale_draft} stale draft{data.anomalies.stale_draft > 1 ? 's' : ''} →
            </Link>
          )}
        </section>
      )}

      <div style={s.cols}>
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Recent builds</h3>
          {data.builds.recent.map(b => (
            <div key={b.job_id} style={s.row}>
              <Link to={`/inspector/galleries/${b.gallery_id}`} style={s.link}>{b.gallery_title}</Link>
              <span style={{ color: '#555', fontSize: '0.75rem' }}>{b.studio}</span>
              <span style={{ marginLeft: 'auto', color: BUILD_COLOR[b.status] || '#888', fontSize: '0.75rem', fontWeight: 600 }}>{b.status}</span>
            </div>
          ))}
        </section>

        <section style={s.section}>
          <h3 style={s.sectionTitle}>Recent uploads</h3>
          {data.uploads.recent.map((u, i) => (
            <div key={i} style={s.row}>
              <Link to={`/inspector/galleries/${u.gallery_id}`} style={s.link}>{u.gallery_title}</Link>
              <span style={{ color: '#555', fontSize: '0.75rem' }}>{u.studio}</span>
              <span style={{ marginLeft: 'auto', color: '#fbbf24', fontSize: '0.75rem', fontWeight: 600 }}>{u.count} photos</span>
            </div>
          ))}
          {data.uploads.recent.length === 0 && <p style={{ color: '#555', fontSize: '0.82rem', margin: 0 }}>No uploads in the last 24 h.</p>}
        </section>
      </div>
    </div>
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

const s = {
  pageTitle:    { margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 600, color: '#eee' },
  statRow:      { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' },
  stat:         { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 7, padding: '0.75rem 1rem', minWidth: 90, textAlign: 'center' },
  statValue:    { display: 'block', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 },
  statLabel:    { display: 'block', fontSize: '0.68rem', color: '#555', marginTop: '0.25rem' },
  section:      { marginBottom: '1.25rem', flex: 1 },
  sectionTitle: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
  cols:         { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' },
  row:          { display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #1e1e1e', fontSize: '0.82rem' },
  link:         { color: '#7dd3fc', textDecoration: 'none', flex: 1 },
  anomalyRow:   { display: 'block', padding: '0.4rem 0.75rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 5, marginBottom: '0.35rem', fontSize: '0.82rem', color: '#ccc', textDecoration: 'none' },
};
