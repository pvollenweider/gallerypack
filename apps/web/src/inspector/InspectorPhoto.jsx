// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorPhoto.jsx — photo detail view (Sprint 18)
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

const STATUS_COLOR = { uploaded: '#fbbf24', validated: '#60a5fa', published: '#4ade80' };
const SEV_ICON = { error: '❌', warning: '⚠️', info: 'ℹ️' };

export default function InspectorPhoto() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.inspectorPhoto(id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p style={{ color: '#555' }}>Loading…</p>;
  if (error)   return <p style={{ color: '#f87171' }}>{error}</p>;
  if (!data)   return null;

  return (
    <div style={s.page}>
      <p style={s.breadcrumb}>
        <Link to={`/inspector/studios/${data.studio?.id}`} style={s.link}>{data.studio?.name}</Link>
        {data.project && <> / <Link to={`/inspector/projects/${data.project.id}`} style={s.link}>{data.project.name}</Link></>}
        {' / '}
        <Link to={`/inspector/galleries/${data.gallery_id}`} style={s.link}>{data.gallery?.title || data.gallery_id}</Link>
      </p>

      <h2 style={s.title}>{data.filename}</h2>

      {/* Status badge */}
      <span style={{ ...s.badge, background: '#111', color: STATUS_COLOR[data.status] || '#888' }}>
        {data.status}
      </span>

      {/* Health warnings */}
      {data.health?.warnings?.map((w, i) => (
        <div key={i} style={s.warning}>
          {SEV_ICON[w.severity]} {w.message}
        </div>
      ))}

      {/* Preview */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Preview</h3>
        <img
          src={`/api/galleries/${data.gallery_id}/photos/${encodeURIComponent(data.filename)}/preview`}
          style={s.preview}
          alt={data.filename}
        />
      </section>

      {/* Metadata */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>File</h3>
        <Row label="Filename">{data.original_filename || data.filename}</Row>
        <Row label="Size">{data.size_bytes ? `${(data.size_bytes / 1024 / 1024).toFixed(2)} MB` : '—'}</Row>
        <Row label="Sort order">{data.sort_order}</Row>
        <Row label="Uploaded">{data.uploaded_at ? new Date(data.uploaded_at).toLocaleString() : '—'}</Row>
      </section>

      {/* Uploaded by */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Uploaded by</h3>
        {data.uploaded_by?.type === 'user' && (
          <Row label="User">
            <Link to={`/inspector/users/${data.uploaded_by.user_id}`} style={s.link}>
              {data.uploaded_by.email || data.uploaded_by.user_id}
            </Link>
          </Row>
        )}
        {data.uploaded_by?.type === 'upload_link' && (
          <Row label="Upload link">{data.uploaded_by.label || data.uploaded_by.link_id}</Row>
        )}
        {data.uploaded_by?.type === 'unknown' && (
          <Row label="">Unknown (legacy upload)</Row>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
      <span style={{ width: 100, color: '#555', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#ccc' }}>{children}</span>
    </div>
  );
}

const s = {
  page:         { maxWidth: 640 },
  breadcrumb:   { margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#555' },
  title:        { margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600, color: '#eee' },
  badge:        { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.75rem' },
  warning:      { padding: '0.4rem 0.75rem', background: '#1a1a1a', border: '1px solid #333', borderRadius: 5, marginBottom: '0.4rem', fontSize: '0.82rem', color: '#ccc' },
  section:      { marginBottom: '1.25rem' },
  sectionTitle: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
  preview:      { maxWidth: '100%', maxHeight: 400, borderRadius: 6, display: 'block', border: '1px solid #1e1e1e' },
  link:         { color: '#7dd3fc', textDecoration: 'none' },
};
