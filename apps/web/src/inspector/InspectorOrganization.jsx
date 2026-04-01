// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/inspector/InspectorOrganization.jsx — organization list + detail (Sprint 19)
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';

export function InspectorOrganizationList() {
  const t = useT();
  const [organizations, setOrganizations] = useState(null);

  useEffect(() => {
    api.inspectorOrganizations().then(setOrganizations).catch(() => setOrganizations([]));
  }, []);

  return (
    <>
      <div className="content-header" style={s.header}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={s.pageTitle}>
                {t('inspector_studios_title')} {organizations && `— ${organizations.length}`}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid pt-3">
          {!organizations ? (
            <p style={{ color: '#555' }}>{t('loading')}</p>
          ) : (
            <div className="card" style={s.card}>
              <div className="card-body p-0">
                <table className="table table-sm table-hover mb-0" style={{ background: 'transparent' }}>
                  <thead>
                    <tr style={{ borderColor: '#2a2a3e' }}>
                      <th style={s.th}>{t('inspector_th_name')}</th>
                      <th style={s.th}>{t('inspector_th_slug')}</th>
                      <th style={s.th} className="text-center">{t('inspector_th_galleries')}</th>
                      <th style={s.th} className="text-center">{t('inspector_th_members')}</th>
                      <th style={s.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations.map(org => (
                      <tr key={org.id} style={{ borderColor: '#1e1e2e' }}>
                        <td style={s.td}>
                          <Link to={`/inspector/organizations/${org.id}`} style={s.link}>{org.name}</Link>
                        </td>
                        <td style={s.td}><code style={s.code}>{org.slug}</code></td>
                        <td style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>{org.gallery_count}</td>
                        <td style={{ ...s.td, textAlign: 'center', color: '#aaa' }}>{org.member_count}</td>
                        <td style={s.td}>
                          {org.is_default === 1 && (
                            <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>{t('inspector_default_badge')}</span>
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

export function InspectorOrganizationDetail() {
  const t = useT();
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.inspectorOrganization(id).then(setData).catch(() => {});
  }, [id]);

  return (
    <>
      <div className="content-header" style={s.header}>
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0" style={s.pageTitle}>{data?.name || '...'}</h1>
              {data && <p className="m-0" style={{ color: '#555', fontSize: '0.8rem' }}>{data.slug} · {data.locale} · {data.country}</p>}
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
              <div className="col-md-6">
                <div className="card" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>{t('inspector_th_members')} — {data.members?.length}</h3>
                  </div>
                  <div className="card-body p-0">
                    <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                      <tbody>
                        {data.members?.map(m => (
                          <tr key={m.id} style={{ borderColor: '#1e1e2e' }}>
                            <td style={s.td}>
                              <Link to={`/inspector/users/${m.id}`} style={s.link}>{m.email}</Link>
                              {m.name && <><br /><span style={{ fontSize: '0.72rem', color: '#555' }}>{m.name}</span></>}
                            </td>
                            <td style={{ ...s.td, textAlign: 'right' }}>
                              <span className="badge" style={{ background: '#2a2a3e', color: '#aaa', fontSize: '0.68rem' }}>{m.role}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card" style={s.card}>
                  <div className="card-header" style={s.cardHeader}>
                    <h3 className="card-title" style={s.cardTitle}>{t('inspector_nav_projects')} — {data.projects?.length}</h3>
                  </div>
                  <div className="card-body p-0">
                    <table className="table table-sm mb-0" style={{ background: 'transparent' }}>
                      <tbody>
                        {data.projects?.map(p => (
                          <tr key={p.id} style={{ borderColor: '#1e1e2e' }}>
                            <td style={s.td}>
                              <Link to={`/inspector/projects/${p.id}`} style={s.link}>{p.name}</Link>
                              <br /><code style={s.code}>{p.slug}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
  code:      { fontFamily: 'monospace', fontSize: '0.75rem', color: '#666', background: 'none' },
};
