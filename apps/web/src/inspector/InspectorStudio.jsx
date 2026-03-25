// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorStudio.jsx — studio list + detail (Sprint 19)
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export function InspectorStudioList() {
  const [studios, setStudios] = useState(null);

  useEffect(() => {
    api.inspectorStudios().then(setStudios).catch(() => setStudios([]));
  }, []);

  if (!studios) return <p style={{ color: '#555' }}>Loading…</p>;

  return (
    <div>
      <h2 style={s.pageTitle}>Studios — {studios.length}</h2>
      {studios.map(st => (
        <Link key={st.id} to={`/inspector/studios/${st.id}`} style={s.row}>
          <span style={s.rowName}>{st.name}</span>
          <span style={s.rowSlug}>{st.slug}</span>
          <span style={s.rowMeta}>{st.gallery_count} galleries · {st.member_count} members</span>
          {st.is_default === 1 && <span style={s.badge}>default</span>}
        </Link>
      ))}
    </div>
  );
}

export function InspectorStudioDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.inspectorStudio(id).then(setData).catch(() => {});
  }, [id]);

  if (!data) return <p style={{ color: '#555' }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={s.pageTitle}>{data.name}</h2>
      <p style={s.meta}>{data.slug} · {data.locale} · {data.country}</p>

      <section style={s.section}>
        <h3 style={s.sectionTitle}>Members — {data.members?.length}</h3>
        {data.members?.map(m => (
          <Link key={m.id} to={`/inspector/users/${m.id}`} style={s.row}>
            <span style={s.rowName}>{m.email}</span>
            <span style={s.rowMeta}>{m.name}</span>
            <span style={{ ...s.badge, marginLeft: 'auto' }}>{m.role}</span>
          </Link>
        ))}
      </section>

      <section style={s.section}>
        <h3 style={s.sectionTitle}>Projects — {data.projects?.length}</h3>
        {data.projects?.map(p => (
          <Link key={p.id} to={`/inspector/projects/${p.id}`} style={s.row}>
            <span style={s.rowName}>{p.name}</span>
            <span style={s.rowSlug}>{p.slug}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

const s = {
  pageTitle:    { margin: '0 0 1rem', fontSize: '1.2rem', fontWeight: 600, color: '#eee' },
  meta:         { margin: '0 0 1.25rem', color: '#555', fontSize: '0.82rem' },
  section:      { marginBottom: '1.5rem' },
  sectionTitle: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
  row:          { display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#1a1a1a', border: '1px solid #222', borderRadius: 5, marginBottom: '0.3rem', textDecoration: 'none', color: '#ccc', fontSize: '0.85rem' },
  rowName:      { fontWeight: 500, color: '#eee' },
  rowSlug:      { fontFamily: 'monospace', fontSize: '0.78rem', color: '#666' },
  rowMeta:      { color: '#555', fontSize: '0.78rem' },
  badge:        { padding: '0.1rem 0.4rem', background: '#222', borderRadius: 3, fontSize: '0.68rem', color: '#888' },
};
