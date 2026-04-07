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
import { useT } from '../lib/I18nContext.jsx';
import { UI_LOCALE_OPTIONS } from '../lib/i18n.js';

export function InspectorUserList() {
  const t = useT();
  const [users, setUsers] = useState(null);

  useEffect(() => {
    api.inspectorUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  return (
    <>
      <div className="content-header" style={s.header}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={s.pageTitle}>
                {t('inspector_users_title')} {users && `— ${users.length}`}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">
          {!users ? (
            <p style={{ color: '#555' }}>{t('loading')}</p>
          ) : (
            <div className="card" style={s.card}>
              <div className="card-body p-0">
                <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                  <thead>
                    <tr>
                      <th style={s.th}>{t('inspector_th_email')}</th>
                      <th style={s.th}>{t('inspector_th_name')}</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td style={s.td}>
                          <Link to={`/inspector/users/${u.id}`} style={s.link}>{u.email}</Link>
                        </td>
                        <td style={{ ...s.td, color: '#666' }}>{u.name}</td>
                        <td style={s.td}>
                          {u.platform_role === 'superadmin' && (
                            <span className="badge" style={{ background: '#3b0764', color: '#c4b5fd', fontSize: '0.65rem' }}>{t('inspector_superadmin_badge')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function InspectorUserDetail() {
  const t = useT();
  const { id } = useParams();
  const [data,    setData]    = useState(null);
  const [name,    setName]    = useState('');
  const [locale,  setLocale]  = useState('');
  const [notifyUp,  setNotifyUp]  = useState(true);
  const [notifyPub, setNotifyPub] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  function load() {
    api.inspectorUser(id).then(d => {
      setData(d);
      setName(d.name || '');
      setLocale(d.locale || '');
      setNotifyUp(d.notifyOnUpload !== false);
      setNotifyPub(d.notifyOnPublish !== false);
    }).catch(() => {});
  }

  useEffect(load, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setSaved(false); setError('');
    try {
      await api.inspectorUpdateUser(id, { name, locale: locale || null, notifyOnUpload: notifyUp, notifyOnPublish: notifyPub });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="content-header" style={s.header}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={s.pageTitle}>{data?.email || '…'}</h1>
              {data?.name && <p className="m-0" style={{ color: '#555', fontSize: '0.8rem' }}>{data.name}</p>}
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">
          {!data ? (
            <p style={{ color: '#555' }}>{t('loading')}</p>
          ) : (
            <div className="row">
              <div className="col-md-5">
                {data.platform_role && (
                  <span className="badge mb-3 d-inline-block" style={{ background: '#3b0764', color: '#c4b5fd', fontSize: '0.75rem' }}>
                    {data.platform_role}
                  </span>
                )}

                <div className="card mb-3" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>Profile settings</h3>
                  </div>
                  <div className="card-body">
                    <form onSubmit={handleSave}>
                      <div className="mb-3">
                        <label style={s.label}>Name</label>
                        <input
                          className="form-control form-control-sm"
                          style={s.input}
                          value={name}
                          onChange={e => setName(e.target.value)}
                          placeholder="Display name"
                        />
                      </div>
                      <div className="mb-3">
                        <label style={s.label}>Language</label>
                        <select
                          className="form-control form-control-sm"
                          style={{ ...s.input, maxWidth: 200 }}
                          value={locale}
                          onChange={e => setLocale(e.target.value)}
                        >
                          <option value="">— default —</option>
                          {UI_LOCALE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="mb-2">
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="notUp" checked={notifyUp} onChange={e => setNotifyUp(e.target.checked)} />
                          <label className="form-check-label" htmlFor="notUp" style={{ color: '#ccc', fontSize: '0.85rem' }}>Notify on upload</label>
                        </div>
                      </div>
                      <div className="mb-3">
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="notPub" checked={notifyPub} onChange={e => setNotifyPub(e.target.checked)} />
                          <label className="form-check-label" htmlFor="notPub" style={{ color: '#ccc', fontSize: '0.85rem' }}>Notify on publish</label>
                        </div>
                      </div>
                      {error && <p style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
                      {saved && <p style={{ color: '#4ade80', fontSize: '0.82rem' }}>Saved</p>}
                      <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="col-md-5">
                <div className="card" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>{t('inspector_user_studios')}</h3>
                  </div>
                  <div className="card-body p-0">
                    {data.memberships?.length === 0 ? (
                      <p style={{ color: '#555', fontSize: '0.82rem', margin: '0.75rem' }}>{t('inspector_no_memberships')}</p>
                    ) : (
                      <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                        <tbody>
                          {data.memberships?.map((m, i) => (
                            <tr key={i}>
                              <td style={s.td}>
                                <Link to={`/inspector/organizations/${m.organization_id}`} style={s.link}>{m.organization_name}</Link>
                              </td>
                              <td style={{ ...s.td, textAlign: 'right' }}>
                                <span className="badge" style={{ background: '#2a2a3e', color: '#aaa', fontSize: '0.68rem' }}>{m.role}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

const s = {
  header:    { background: '#0f1117', borderBottom: '1px solid #1e1e2e' },
  pageTitle: { color: '#eee', fontSize: '1.3rem' },
  card:      { background: '#1a1a2e', border: '1px solid #2a2a3e' },
  cardHeader:{ background: '#1a1a2e', borderBottom: '1px solid #2a2a3e' },
  cardTitle: { color: '#eee', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  th:        { background: '#111', color: '#666', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', border: 'none', borderBottom: '1px solid #2a2a3e', padding: '0.5rem 0.75rem' },
  td:        { border: 'none', borderBottom: '1px solid #1e1e2e', padding: '0.5rem 0.75rem', color: '#ccc', fontSize: '0.85rem' },
  link:      { color: '#7dd3fc', textDecoration: 'none' },
  label:     { color: '#888', fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' },
  input:     { background: '#111', border: '1px solid #2a2a3e', color: '#eee', fontSize: '0.85rem' },
};
