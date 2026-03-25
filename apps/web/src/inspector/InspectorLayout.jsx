// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorLayout.jsx — persistent sidebar + superadmin guard
import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

const NAV = [
  { label: 'Studios',    to: '/inspector/studios' },
  { label: 'Projects',   to: '/inspector/projects' },
  { label: 'Galleries',  to: '/inspector/galleries' },
  { label: 'Users',      to: '/inspector/users' },
  { label: '─────',      to: null },
  { label: 'Anomalies',  to: '/inspector/anomalies' },
  { label: 'Dashboard',  to: '/inspector/dashboard' },
];

export default function InspectorLayout() {
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const [q, setQ]     = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef();
  const inputRef = useRef();

  // Guard
  useEffect(() => {
    if (user && user.platformRole !== 'superadmin') navigate('/', { replace: true });
  }, [user, navigate]);

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
    results.studios?.length || results.projects?.length ||
    results.galleries?.length || results.users?.length
  );

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.brand}>Inspector</div>

        {/* Search */}
        <div style={s.searchWrap}>
          <input
            ref={inputRef}
            style={s.searchInput}
            placeholder="Search anything…"
            value={q}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && (setQ(''), setResults(null))}
          />
          {searching && <span style={s.searchSpinner}>…</span>}
        </div>

        {/* Search results dropdown */}
        {(q.length >= 2) && (
          <div style={s.dropdown}>
            {!hasResults && !searching && <p style={s.dropEmpty}>No results</p>}
            {results?.studios?.map(r => (
              <button key={r.id} style={s.dropItem} onClick={() => goTo(`/inspector/studios/${r.id}`)}>
                <span style={s.dropType}>Studio</span> {r.name}
              </button>
            ))}
            {results?.projects?.map(r => (
              <button key={r.id} style={s.dropItem} onClick={() => goTo(`/inspector/projects/${r.id}`)}>
                <span style={s.dropType}>Project</span> {r.name}
              </button>
            ))}
            {results?.galleries?.map(r => (
              <button key={r.id} style={s.dropItem} onClick={() => goTo(`/inspector/galleries/${r.id}`)}>
                <span style={s.dropType}>Gallery</span> {r.title || r.slug}
              </button>
            ))}
            {results?.users?.map(r => (
              <button key={r.id} style={s.dropItem} onClick={() => goTo(`/inspector/users/${r.id}`)}>
                <span style={s.dropType}>User</span> {r.email}
              </button>
            ))}
          </div>
        )}

        {/* Nav */}
        <nav style={s.nav}>
          {NAV.map((n, i) => n.to
            ? <NavLink key={n.to} to={n.to} style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navActive : {}) })}>
                {n.label}
              </NavLink>
            : <div key={i} style={s.navDivider} />
          )}
        </nav>
      </aside>

      {/* Main panel */}
      <main style={s.main}>
        <Outlet />
      </main>
    </div>
  );
}

const s = {
  root:         { display: 'flex', minHeight: '100vh', background: '#0d0d0d', color: '#ddd' },
  sidebar:      { width: 220, flexShrink: 0, background: '#111', borderRight: '1px solid #1e1e1e', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  brand:        { padding: '1rem 1rem 0.5rem', fontWeight: 700, fontSize: '0.95rem', color: '#eee', letterSpacing: '0.05em', textTransform: 'uppercase' },
  searchWrap:   { position: 'relative', padding: '0 0.75rem 0.5rem' },
  searchInput:  { width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.6rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 5, color: '#eee', fontSize: '0.82rem', outline: 'none' },
  searchSpinner:{ position: 'absolute', right: '1.1rem', top: '0.4rem', fontSize: '0.75rem', color: '#555' },
  dropdown:     { margin: '0 0.75rem 0.5rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 5, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' },
  dropEmpty:    { padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#555', margin: 0 },
  dropItem:     { display: 'block', width: '100%', padding: '0.4rem 0.75rem', background: 'none', border: 'none', color: '#ccc', textAlign: 'left', cursor: 'pointer', fontSize: '0.82rem', borderBottom: '1px solid #222' },
  dropType:     { fontSize: '0.68rem', color: '#555', marginRight: '0.4rem', textTransform: 'uppercase' },
  nav:          { padding: '0.25rem 0', flex: 1 },
  navItem:      { display: 'block', padding: '0.45rem 1rem', fontSize: '0.85rem', color: '#888', textDecoration: 'none', transition: 'color 0.1s' },
  navActive:    { color: '#eee', background: '#1a1a1a' },
  navDivider:   { height: 1, background: '#1e1e1e', margin: '0.4rem 1rem' },
  main:         { flex: 1, padding: '1.5rem', overflowY: 'auto' },
};
