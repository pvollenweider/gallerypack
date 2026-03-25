// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/pages/Dashboard.jsx — studio field dashboard (Sprint 14)
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const ACTION_PRIORITY = { build_failed: 0, photos_to_validate: 1, gallery_ready: 2, no_upload_link: 3 };
const STATUS_COLOR = { done: '#16a34a', error: '#dc2626', running: '#2563eb', queued: '#d97706' };

function ActionCard({ action }) {
  const icons = {
    build_failed:       '🔴',
    photos_to_validate: '📥',
    gallery_ready:      '✅',
    no_upload_link:     '🔗',
  };
  const labels = {
    build_failed:       (a) => `Build failed — ${a.gallery_title}`,
    photos_to_validate: (a) => `${a.count} photo${a.count > 1 ? 's' : ''} to review — ${a.gallery_title}`,
    gallery_ready:      (a) => `Ready to publish — ${a.gallery_title}`,
    no_upload_link:     (a) => `No upload link — ${a.gallery_title}`,
  };
  const hrefs = {
    build_failed:       (a) => `/jobs/${a.job_id}`,
    photos_to_validate: (a) => `/galleries/${a.gallery_id}?tab=inbox`,
    gallery_ready:      (a) => `/galleries/${a.gallery_id}`,
    no_upload_link:     (a) => `/galleries/${a.gallery_id}?tab=upload`,
  };

  return (
    <Link to={hrefs[action.type]?.(action) || '#'} style={s.actionCard}>
      <span style={s.actionIcon}>{icons[action.type] || '•'}</span>
      <span style={s.actionLabel}>{labels[action.type]?.(action) || action.type}</span>
      <span style={s.actionArrow}>→</span>
    </Link>
  );
}

export default function Dashboard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getDashboard()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.center}>Loading…</div>;
  if (error)   return <div style={s.center} className="error">{error}</div>;
  if (!data)   return null;

  return (
    <div style={s.page}>
      <h2 style={s.pageTitle}>Dashboard</h2>

      {/* Gallery stats */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Galleries</h3>
        <div style={s.statRow}>
          <Stat label="Total"     value={data.galleries.total} />
          <Stat label="Draft"     value={data.galleries.draft} color="#888" />
          <Stat label="Ready"     value={data.galleries.ready} color="#d97706" />
          <Stat label="Published" value={data.galleries.published} color="#16a34a" />
          {data.galleries.needs_rebuild > 0 && (
            <Stat label="Needs rebuild" value={data.galleries.needs_rebuild} color="#dc2626" />
          )}
        </div>
      </section>

      {/* Recommended actions */}
      {data.actions.length > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Actions needed</h3>
          <div style={s.actionList}>
            {data.actions.map((a, i) => <ActionCard key={i} action={a} />)}
          </div>
        </section>
      )}

      {/* Inbox */}
      {data.inbox.total_unvalidated > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>
            Inbox — {data.inbox.total_unvalidated} photo{data.inbox.total_unvalidated > 1 ? 's' : ''} pending review
          </h3>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <tbody>
                {data.inbox.by_gallery.map(g => (
                  <tr key={g.gallery_id} style={s.tableRow}>
                    <td style={s.tableCell}>
                      <Link to={`/galleries/${g.gallery_id}?tab=inbox`} style={s.link}>
                        {g.gallery_title || g.gallery_id}
                      </Link>
                    </td>
                    <td style={{ ...s.tableCell, textAlign: 'right', color: '#d97706', fontWeight: 600 }}>
                      {g.unvalidated_count} pending
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent builds */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Recent builds</h3>
        {data.builds.recent.length === 0
          ? <p style={s.dim}>No builds yet.</p>
          : <div style={s.tableWrap}>
              <table style={s.table}>
                <tbody>
                  {data.builds.recent.map(b => (
                    <tr key={b.job_id} style={s.tableRow}>
                      <td style={s.tableCell}>
                        <Link to={`/galleries/${b.gallery_id}`} style={s.link}>
                          {b.gallery_title || b.gallery_id}
                        </Link>
                      </td>
                      <td style={{ ...s.tableCell, color: STATUS_COLOR[b.status] || '#888', fontWeight: 500 }}>
                        {b.status}
                      </td>
                      <td style={{ ...s.tableCell, color: '#666', fontSize: '0.8rem' }}>
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td style={s.tableCell}>
                        <Link to={`/jobs/${b.job_id}`} style={{ ...s.link, fontSize: '0.8rem' }}>
                          Logs →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </section>
    </div>
  );
}

function Stat({ label, value, color = '#eee' }) {
  return (
    <div style={s.stat}>
      <span style={{ ...s.statValue, color }}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

const s = {
  page:        { padding: '1.5rem', maxWidth: 860, margin: '0 auto' },
  center:      { padding: '3rem', textAlign: 'center', color: '#888' },
  pageTitle:   { margin: '0 0 1.5rem', fontSize: '1.4rem', fontWeight: 600, color: '#eee' },
  section:     { marginBottom: '2rem' },
  sectionTitle:{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statRow:     { display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  stat:        { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '1rem 1.25rem', minWidth: 100, textAlign: 'center' },
  statValue:   { display: 'block', fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 },
  statLabel:   { display: 'block', fontSize: '0.75rem', color: '#666', marginTop: '0.35rem' },
  actionList:  { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  actionCard:  { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, textDecoration: 'none', color: '#ddd', transition: 'border-color 0.15s' },
  actionIcon:  { fontSize: '1rem', flexShrink: 0 },
  actionLabel: { flex: 1, fontSize: '0.88rem' },
  actionArrow: { color: '#444', fontSize: '0.9rem' },
  tableWrap:   { overflowX: 'auto' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  tableRow:    { borderBottom: '1px solid #1e1e1e' },
  tableCell:   { padding: '0.5rem 0.75rem', fontSize: '0.88rem', color: '#ccc' },
  link:        { color: '#7dd3fc', textDecoration: 'none' },
  dim:         { color: '#555', fontSize: '0.88rem', margin: 0 },
};
