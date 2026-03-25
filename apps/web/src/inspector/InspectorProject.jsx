// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorProject.jsx — project list (stub) + detail (Sprint 19)
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_COLOR = { published: '#4ade80', ready: '#fbbf24', draft: '#555' };

export function InspectorProjectList() {
  return (
    <div>
      <h2 style={s.pageTitle}>Projects</h2>
      <p style={{ color: '#555', fontSize: '0.85rem' }}>Use search or navigate via a studio to find a project.</p>
    </div>
  );
}

export function InspectorProjectDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.inspectorProject(id).then(setData).catch(() => {});
  }, [id]);

  if (!data) return <p style={{ color: '#555' }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 700 }}>
      <p style={s.breadcrumb}>
        <Link to={`/inspector/studios/${data.studio_id}`} style={s.link}>{data.studio_name}</Link>
      </p>
      <h2 style={s.pageTitle}>{data.name}</h2>
      <p style={s.meta}>{data.slug}</p>

      <section>
        <h3 style={s.sectionTitle}>Galleries — {data.galleries?.length}</h3>
        {data.galleries?.map(g => (
          <Link key={g.id} to={`/inspector/galleries/${g.id}`} style={s.row}>
            <span style={s.rowName}>{g.title || g.slug}</span>
            <span style={s.rowSlug}>{g.slug}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, color: STATUS_COLOR[g.status] || '#666' }}>{g.status}</span>
            {!g.active && <span style={{ fontSize: '0.72rem', color: '#f87171' }}>disabled</span>}
          </Link>
        ))}
      </section>
    </div>
  );
}

const s = {
  pageTitle:    { margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600, color: '#eee' },
  breadcrumb:   { margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#555' },
  meta:         { margin: '0 0 1.25rem', color: '#555', fontSize: '0.82rem' },
  sectionTitle: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
  row:          { display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#1a1a1a', border: '1px solid #222', borderRadius: 5, marginBottom: '0.3rem', textDecoration: 'none', color: '#ccc', fontSize: '0.85rem' },
  rowName:      { fontWeight: 500, color: '#eee' },
  rowSlug:      { fontFamily: 'monospace', fontSize: '0.78rem', color: '#666' },
  link:         { color: '#7dd3fc', textDecoration: 'none' },
};
