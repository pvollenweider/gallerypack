// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorLayout.jsx — AdminLTE layout for superadmin inspector
import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

export default function InspectorLayout() {
  const t = useT();
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [q, setQ]        = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const timerRef = useRef();
  const inputRef = useRef();

  const NAV = [
    { label: t('inspector_nav_orgs'),      to: '/inspector/organizations',   icon: 'fas fa-building' },
    { label: t('inspector_nav_projects'),  to: '/inspector/projects',  icon: 'fas fa-folder' },
    { label: t('inspector_nav_galleries'), to: '/inspector/galleries', icon: 'fas fa-images' },
    { label: t('inspector_nav_users'),     to: '/inspector/users',     icon: 'fas fa-users' },
    { divider: true },
    { label: t('inspector_nav_anomalies'), to: '/inspector/anomalies', icon: 'fas fa-exclamation-triangle' },
    { label: t('inspector_nav_activity'),  to: '/inspector/activity',  icon: 'fas fa-stream' },
    { label: t('inspector_nav_dashboard'), to: '/inspector/dashboard', icon: 'fas fa-tachometer-alt' },
  ];

  // Guard
  useEffect(() => {
    if (user && user.platformRole !== 'superadmin') navigate('/', { replace: true });
  }, [user, navigate]);

  // Body classes
  useEffect(() => {
    document.body.classList.add('sidebar-mini', 'layout-fixed');
    return () => {
      document.body.classList.remove(
        'sidebar-mini', 'layout-fixed',
        'sidebar-collapse', 'sidebar-open'
      );
    };
  }, []);

  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapse');
    } else {
      document.body.classList.remove('sidebar-collapse');
    }
  }, [collapsed]);

  // Autofocus search on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSearch(val) {
    setQ(val);
    clearTimeout(timerRef.current);
    if (val.length < 2) { setResults(null); return; }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await api.inspectorSearch(val);
        setResults(r);
      } catch {
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 250);
  }

  function goTo(path) {
    setQ('');
    setResults(null);
    navigate(path);
  }

  if (!user || user.platformRole !== 'superadmin') return null;

  const hasResults = results && (
    results.organizations?.length || results.projects?.length ||
    results.galleries?.length || results.users?.length
  );

  const navCls = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;

  return (
    <div className="app-wrapper">
      {/* ── Top Navbar ── */}
      <nav className="app-header navbar navbar-expand" style={{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' }}>
        <div className="container-fluid">
          <ul className="navbar-nav">
            <li className="nav-item">
              <a className="nav-link text-white" role="button" style={{ cursor: 'pointer' }}
                onClick={() => setCollapsed(c => !c)}>
                <i className="fas fa-bars" />
              </a>
            </li>
            <li className="nav-item d-none d-sm-flex align-items-center">
              <span className="nav-link text-muted">
                <span className="badge bg-danger me-2">{t('inspector_superadmin')}</span>
                {t('inspector_title')}
              </span>
            </li>
          </ul>
          <ul className="navbar-nav ms-auto">
            <li className="nav-item">
              <Link to="/" className="nav-link text-white" title={t('inspector_admin')}>
                <i className="fas fa-arrow-left me-1" />
                <span className="d-none d-md-inline">{t('inspector_admin')}</span>
              </Link>
            </li>
            <li className="nav-item d-none d-sm-flex align-items-center">
              <span className="nav-link text-white" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                {user?.email}
              </span>
            </li>
            <li className="nav-item">
              <a className="nav-link text-white" role="button" style={{ cursor: 'pointer' }} onClick={logout}>
                <i className="fas fa-sign-out-alt" />
              </a>
            </li>
          </ul>
        </div>
      </nav>

      {/* ── Sidebar ── */}
      <aside className="app-sidebar" data-bs-theme="dark" style={{ background: '#1a1a2e' }}>
        <div className="sidebar-brand" style={{ background: '#1a1a2e' }}>
          <Link to="/inspector" className="brand-link">
            <span className="brand-text fw-bold" style={{ fontSize: '0.9rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {t('inspector_title')}
            </span>
          </Link>
        </div>
        <div className="sidebar-wrapper">
          {/* Search */}
          <div style={{ padding: '0.75rem' }}>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                className="form-control form-control-sm"
                style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', color: '#eee', fontSize: '0.82rem', paddingRight: '2rem' }}
                placeholder={t('inspector_search_placeholder')}
                value={q}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setQ(''), setResults(null))}
              />
              <span style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#888', pointerEvents: 'none' }}>
                {searching
                  ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '0.75rem' }} />
                  : <i className="fas fa-search" style={{ fontSize: '0.75rem' }} />
                }
              </span>
            </div>

            {/* Search results dropdown */}
            {q.length >= 2 && (
              <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, marginTop: 4, maxHeight: 300, overflowY: 'auto' }}>
                {!hasResults && !searching && (
                  <p style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#555', margin: 0 }}>{t('inspector_no_results')}</p>
                )}
                {[
                  ...(results?.organizations  || []).map(r => ({ ...r, type: t('inspector_result_org'),     path: `/inspector/organizations/${r.id}`,   label: r.name })),
                  ...(results?.projects || []).map(r => ({ ...r, type: t('inspector_result_project'), path: `/inspector/projects/${r.id}`,  label: r.name })),
                  ...(results?.galleries|| []).map(r => ({ ...r, type: t('inspector_result_gallery'), path: `/inspector/galleries/${r.id}`, label: r.title || r.slug })),
                  ...(results?.users    || []).map(r => ({ ...r, type: t('inspector_result_user'),    path: `/inspector/users/${r.id}`,     label: r.email })),
                ].map(r => (
                  <button key={r.path} style={sDropItem} onClick={() => goTo(r.path)}>
                    <span style={{ fontSize: '0.68rem', color: '#555', marginRight: '0.4rem', textTransform: 'uppercase' }}>{r.type}</span>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <nav className="mt-1">
            <ul className="nav sidebar-menu flex-column" role="menu">
              {NAV.map((n, i) =>
                n.divider
                  ? <li key={i} className="nav-header" style={{ fontSize: '0.65rem', color: '#555', padding: '0.5rem 1rem' }}>────</li>
                  : (
                    <li key={n.to} className="nav-item">
                      <NavLink to={n.to} className={navCls}>
                        <i className={`nav-icon ${n.icon}`} />
                        <p>{n.label}</p>
                      </NavLink>
                    </li>
                  )
              )}
            </ul>
          </nav>
        </div>
      </aside>

      {/* ── Content Wrapper ── */}
      <main className="app-main" style={{ background: '#0f1117' }}>
        <div className="app-content">
          <Outlet />
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <strong>{t('inspector_title')}</strong>
      </footer>
    </div>
  );
}

const sDropItem = {
  display: 'block', width: '100%', padding: '0.4rem 0.75rem',
  background: 'none', border: 'none', borderBottom: '1px solid #222',
  color: '#ccc', textAlign: 'left', cursor: 'pointer', fontSize: '0.82rem',
};
