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
import { useT } from '../lib/I18nContext.jsx';

const STATUS_COLOR = { uploaded: '#fbbf24', validated: '#60a5fa', published: '#4ade80' };
const SEV_BADGE    = { error: 'danger', warning: 'warning', info: 'info' };

export default function InspectorPhoto() {
  const t = useT();
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

  const filename = data?.filename || '…';

  return (
    <>
      <div className="content-header" style={s.header}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={s.pageTitle}>{filename}</h1>
              {data && (
                <span style={{ display: 'inline-block', marginTop: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, background: '#111', color: STATUS_COLOR[data.status] || '#888' }}>
                  {data.status}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">
          {loading && <p style={{ color: '#555' }}>{t('loading')}</p>}
          {error   && <div className="alert alert-danger">{error}</div>}
          {!loading && !error && data && (
            <div className="row">
              <div className="col-md-6">
                {/* Health warnings */}
                {data.health?.warnings?.map((w, i) => (
                  <div key={i} className={`alert alert-${SEV_BADGE[w.severity] || 'secondary'} py-2`} style={{ fontSize: '0.85rem' }}>
                    {w.message}
                  </div>
                ))}

                {/* Preview */}
                <div className="card" style={s.card}>
                  <div className="card-body p-2">
                    <img
                      src={data.thumbnail?.md ?? `/api/galleries/${data.gallery_id}/photos/${encodeURIComponent(data.filename)}/preview`}
                      style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4, display: 'block', border: '1px solid #1e1e2e' }}
                      alt={data.filename}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                {/* File metadata */}
                <div className="card" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>{t('tab_photos')}</h3>
                  </div>
                  <div className="card-body">
                    <KVRow label={t('inspector_photo_filename')}>{data.original_filename || data.filename}</KVRow>
                    <KVRow label={t('inspector_photo_size')}>{data.size_bytes ? `${(data.size_bytes / 1024 / 1024).toFixed(2)} MB` : '—'}</KVRow>
                    <KVRow label={t('inspector_photo_sort')}>{data.sort_order}</KVRow>
                    <KVRow label={t('inspector_photo_uploaded')}>{data.uploaded_at ? new Date(data.uploaded_at).toLocaleString() : '—'}</KVRow>
                  </div>
                </div>

                {/* Uploaded by */}
                <div className="card" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>{t('inspector_photo_by')}</h3>
                  </div>
                  <div className="card-body">
                    {data.uploaded_by?.type === 'user' && (
                      <KVRow label={t('inspector_photo_user')}>
                        <Link to={`/inspector/users/${data.uploaded_by.user_id}`} style={s.link}>
                          {data.uploaded_by.email || data.uploaded_by.user_id}
                        </Link>
                      </KVRow>
                    )}
                    {data.uploaded_by?.type === 'upload_link' && (
                      <KVRow label={t('inspector_photo_link')}>{data.uploaded_by.label || data.uploaded_by.link_id}</KVRow>
                    )}
                    {data.uploaded_by?.type === 'unknown' && (
                      <KVRow label="">{t('inspector_photo_legacy')}</KVRow>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
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
};
