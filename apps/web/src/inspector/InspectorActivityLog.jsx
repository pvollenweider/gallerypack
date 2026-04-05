// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorActivityLog.jsx — unified platform activity feed (Sprint 23)
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

const LIMIT = 50;

const TYPE_META = {
  build:  { label: 'Build',  icon: 'fas fa-hammer',    bg: '#1e3a5f', color: '#60a5fa' },
  upload: { label: 'Upload', icon: 'fas fa-upload',    bg: '#3b2f0a', color: '#fbbf24' },
  admin:  { label: 'Admin',  icon: 'fas fa-shield-alt',bg: '#2d1b4e', color: '#c084fc' },
  email:  { label: 'Email',  icon: 'fas fa-envelope',  bg: '#1a2e1a', color: '#4ade80' },
};

const BUILD_STATUS_COLOR = {
  done:    '#4ade80',
  error:   '#f87171',
  running: '#60a5fa',
  queued:  '#fbbf24',
};

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

function TypeBadge({ type }) {
  const m = TYPE_META[type] || { label: type, icon: 'fas fa-circle', bg: '#222', color: '#aaa' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: m.bg, color: m.color, borderRadius: 4,
      padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      <i className={m.icon} style={{ fontSize: '0.65rem' }} />
      {m.label}
    </span>
  );
}

function BuildDetail({ detail, extra }) {
  const color = BUILD_STATUS_COLOR[detail] || '#aaa';
  return (
    <span>
      <span style={{ color, fontWeight: 600, fontSize: '0.78rem' }}>{detail}</span>
      {extra && detail === 'error' && (
        <span style={{ color: '#f87171', fontSize: '0.72rem', marginLeft: 6 }} title={extra}>
          {extra.slice(0, 80)}{extra.length > 80 ? '…' : ''}
        </span>
      )}
    </span>
  );
}

function ResourceLink({ type, resourceId, resourceName, resourceType }) {
  if (type === 'build' || type === 'upload') {
    return (
      <Link to={`/inspector/galleries/${resourceId}`} style={{ color: '#7dd3fc', fontSize: '0.82rem' }}>
        {resourceName || resourceId}
      </Link>
    );
  }
  if (type === 'admin') {
    const path = resourceType === 'gallery'
      ? `/inspector/galleries/${resourceId}`
      : resourceType === 'user'
      ? `/inspector/users/${resourceId}`
      : null;
    return path
      ? <Link to={path} style={{ color: '#c084fc', fontSize: '0.82rem' }}>{resourceType}: {resourceId?.slice(0, 8)}…</Link>
      : <span style={{ color: '#aaa', fontSize: '0.82rem' }}>{resourceType}: {resourceId?.slice(0, 8)}…</span>;
  }
  if (type === 'email') {
    return <span style={{ color: '#4ade80', fontSize: '0.82rem' }}>{resourceName}</span>;
  }
  return <span style={{ color: '#aaa', fontSize: '0.82rem' }}>{resourceName}</span>;
}

export default function InspectorActivityLog() {
  const t = useT();
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [page,       setPage]       = useState(0);
  const [lastRefresh,setLastRefresh]= useState(null);

  const load = useCallback(async (p = page, tf = typeFilter) => {
    setLoading(true);
    try {
      const params = { limit: LIMIT, offset: p * LIMIT };
      if (tf) params.type = tf;
      const data = await api.inspectorActivityLog(params);
      setEvents(data.events || []);
      setLastRefresh(new Date());
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => { load(page, typeFilter); }, [page, typeFilter]);

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => load(page, typeFilter), 30_000);
    return () => clearInterval(id);
  }, [page, typeFilter, load]);

  function changeType(t) {
    setTypeFilter(t);
    setPage(0);
  }

  const FILTERS = ['', 'build', 'upload', 'admin', 'email'];

  return (
    <>
      <div className="content-header" style={{ background: '#0f1117', borderBottom: '1px solid #1e1e2e' }}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col">
              <h1 className="m-0" style={{ color: '#eee', fontSize: '1.3rem' }}>
                {t('inspector_activity_title')}
              </h1>
              {lastRefresh && (
                <span style={{ fontSize: '0.72rem', color: '#555' }}>
                  {t('inspector_activity_refreshed')} {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="col-auto d-flex gap-2 align-items-center">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => load(page, typeFilter)}
                disabled={loading}
                style={{ fontSize: '0.78rem' }}
              >
                <i className={`fas fa-sync-alt${loading ? ' fa-spin' : ''} me-1`} />
                {t('inspector_activity_refresh')}
              </button>
            </div>
          </div>

          {/* Type filter tabs */}
          <div className="d-flex gap-2 flex-wrap pb-2">
            {FILTERS.map(f => (
              <button
                key={f || 'all'}
                onClick={() => changeType(f)}
                style={{
                  background: typeFilter === f ? '#2a2a3e' : 'transparent',
                  border: `1px solid ${typeFilter === f ? '#4a4a6e' : '#2a2a3e'}`,
                  borderRadius: 4, padding: '3px 12px', fontSize: '0.75rem',
                  color: typeFilter === f ? '#eee' : '#666', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {f ? (
                  <><i className={`${TYPE_META[f]?.icon} me-1`} style={{ color: TYPE_META[f]?.color }} />{TYPE_META[f]?.label}</>
                ) : t('inspector_activity_all')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">
          {loading && events.length === 0 ? (
            <p style={{ color: '#555', fontSize: '0.85rem' }}>{t('loading')}</p>
          ) : events.length === 0 ? (
            <p style={{ color: '#555', fontSize: '0.85rem' }}>{t('inspector_activity_empty')}</p>
          ) : (
            <>
              <div className="card" style={{ background: '#1a1a2e', border: '1px solid #2a2a3e' }}>
                <div className="card-body p-0">
                  <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                    <thead>
                      <tr style={{ borderColor: '#2a2a3e' }}>
                        {['', t('inspector_activity_col_time'), t('inspector_activity_col_resource'),
                          t('inspector_activity_col_detail'), t('inspector_activity_col_org'),
                          t('inspector_activity_col_actor')].map((h, i) => (
                          <th key={i} style={{ background: '#111', color: '#555', fontSize: '0.68rem',
                            letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 0.75rem',
                            borderBottom: '1px solid #2a2a3e', fontWeight: 600 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e, i) => (
                        <tr key={`${e.type}-${e.id}-${i}`} style={{ borderColor: '#1e1e2e' }}>
                          <td style={tdStyle}>
                            <TypeBadge type={e.type} />
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#eee', fontSize: '0.8rem' }} title={new Date(e.created_at).toLocaleString()}>
                              {timeAgo(e.created_at)}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <ResourceLink
                              type={e.type}
                              resourceId={e.resource_id}
                              resourceName={e.resource_name}
                              resourceType={e.resource_type}
                            />
                          </td>
                          <td style={tdStyle}>
                            {e.type === 'build'
                              ? <BuildDetail detail={e.detail} extra={e.extra} />
                              : e.type === 'upload'
                              ? <span style={{ color: '#fbbf24', fontSize: '0.78rem' }}>{e.detail} photo{Number(e.detail) !== 1 ? 's' : ''}</span>
                              : e.type === 'admin'
                              ? <span style={{ color: '#c084fc', fontSize: '0.78rem' }}>{e.detail}</span>
                              : <span style={{ color: '#4ade80', fontSize: '0.78rem' }}>{e.detail}</span>
                            }
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: '0.75rem', color: '#666' }}>{e.org_name || '—'}</span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: '0.75rem', color: '#888' }}>{e.actor_name || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="d-flex gap-2 justify-content-end mt-2">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                  style={{ fontSize: '0.78rem' }}
                >
                  ← {t('inspector_activity_prev')}
                </button>
                <span style={{ lineHeight: '30px', fontSize: '0.78rem', color: '#666' }}>
                  {t('inspector_activity_page')} {page + 1}
                </span>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  disabled={events.length < LIMIT}
                  onClick={() => setPage(p => p + 1)}
                  style={{ fontSize: '0.78rem' }}
                >
                  {t('inspector_activity_next')} →
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

const tdStyle = {
  border: 'none', borderBottom: '1px solid #1e1e2e',
  padding: '0.45rem 0.75rem', verticalAlign: 'middle',
};
