// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorUser.jsx — user list + detail (Sprint 19)
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export function InspectorUserList() {
  const [users, setUsers] = useState(null);

  useEffect(() => {
    api.inspectorUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  if (!users) return <p style={{ color: '#555' }}>Loading…</p>;

  return (
    <div>
      <h2 style={s.pageTitle}>Users — {users.length}</h2>
      {users.map(u => (
        <Link key={u.id} to={`/inspector/users/${u.id}`} style={s.row}>
          <span style={s.rowName}>{u.email}</span>
          <span style={s.rowMeta}>{u.name}</span>
          {u.platform_role === 'superadmin' && <span style={s.superBadge}>superadmin</span>}
        </Link>
      ))}
    </div>
  );
}

export function InspectorUserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.inspectorUser(id).then(setData).catch(() => {});
  }, [id]);

  if (!data) return <p style={{ color: '#555' }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={s.pageTitle}>{data.email}</h2>
      {data.name && <p style={s.meta}>{data.name}</p>}
      {data.platform_role && <span style={s.superBadge}>{data.platform_role}</span>}

      <section style={{ marginTop: '1.25rem' }}>
        <h3 style={s.sectionTitle}>Studio memberships</h3>
        {data.memberships?.length === 0 && <p style={{ color: '#555', fontSize: '0.82rem' }}>No studio memberships.</p>}
        {data.memberships?.map((m, i) => (
          <Link key={i} to={`/inspector/studios/${m.studio_id}`} style={s.row}>
            <span style={s.rowName}>{m.studio_name}</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#888' }}>{m.role}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

const s = {
  pageTitle:    { margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600, color: '#eee' },
  meta:         { margin: '0 0 0.5rem', color: '#555', fontSize: '0.82rem' },
  sectionTitle: { margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' },
  row:          { display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#1a1a1a', border: '1px solid #222', borderRadius: 5, marginBottom: '0.3rem', textDecoration: 'none', color: '#ccc', fontSize: '0.85rem' },
  rowName:      { fontWeight: 500, color: '#eee' },
  rowMeta:      { color: '#555', fontSize: '0.78rem' },
  superBadge:   { padding: '0.1rem 0.5rem', background: '#3b0764', color: '#c4b5fd', borderRadius: 3, fontSize: '0.7rem', fontWeight: 600 },
};
