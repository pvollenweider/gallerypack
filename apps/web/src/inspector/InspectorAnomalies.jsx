// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorAnomalies.jsx — anomaly list (Sprint 21)
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const SEV_COLOR = { error: '#f87171', warning: '#fbbf24', info: '#60a5fa' };
const TYPE_LABELS = {
  build_failed:     'Build failed',
  inbox_not_empty:  'Inbox not empty (> 24h)',
  stale_draft:      'Stale draft (> 30 days)',
  never_built:      'Never built',
};

const TYPES = Object.keys(TYPE_LABELS);

export default function InspectorAnomalies() {
  const [params, setParams] = useSearchParams();
  const [items,  setItems]  = useState(null);
  const [total,  setTotal]  = useState(0);
  const type = params.get('type') || '';

  useEffect(() => {
    const p = {};
    if (type) p.type = type;
    api.inspectorAnomalies(p)
      .then(r => { setItems(r.items); setTotal(r.total); })
      .catch(() => setItems([]));
  }, [type]);

  return (
    <div>
      <h2 style={s.pageTitle}>Anomalies {total > 0 && `(${total})`}</h2>

      {/* Filter bar */}
      <div style={s.filterBar}>
        <button style={{ ...s.filterBtn, ...(type === '' ? s.filterActive : {}) }} onClick={() => setParams({})}>
          All
        </button>
        {TYPES.map(t => (
          <button
            key={t}
            style={{ ...s.filterBtn, ...(type === t ? s.filterActive : {}) }}
            onClick={() => setParams({ type: t })}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {!items && <p style={{ color: '#555' }}>Loading…</p>}
      {items?.length === 0 && <p style={{ color: '#4ade80', fontSize: '0.88rem' }}>✓ No anomalies found.</p>}

      {items?.map((item, i) => (
        <div key={i} style={{ ...s.row, borderLeftColor: SEV_COLOR[item.severity] || '#333' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: SEV_COLOR[item.severity] || '#888', fontWeight: 600, marginRight: '0.5rem' }}>
              {item.severity}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#555', marginRight: '0.5rem' }}>
              {TYPE_LABELS[item.type] || item.type}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{item.target_label}</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#555', whiteSpace: 'nowrap' }}>
            {item.detected_at ? new Date(item.detected_at).toLocaleDateString() : ''}
          </span>
          {item.target_type === 'gallery' && (
            <Link to={`/inspector/galleries/${item.target_id}`} style={s.link}>View →</Link>
          )}
        </div>
      ))}
    </div>
  );
}

const s = {
  pageTitle:    { margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 600, color: '#eee' },
  filterBar:    { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' },
  filterBtn:    { padding: '0.3rem 0.7rem', background: 'none', border: '1px solid #2a2a2a', borderRadius: 4, color: '#888', cursor: 'pointer', fontSize: '0.78rem' },
  filterActive: { background: '#1e1e1e', color: '#eee', borderColor: '#444' },
  row:          { display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.6rem 0.75rem 0.6rem 0.85rem', background: '#1a1a1a', borderLeft: '3px solid', borderRadius: '0 5px 5px 0', marginBottom: '0.4rem' },
  link:         { color: '#7dd3fc', textDecoration: 'none', fontSize: '0.8rem', whiteSpace: 'nowrap' },
};
