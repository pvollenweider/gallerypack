// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';

export default function GalleryUploadPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [links,    setLinks]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [label,    setLabel]    = useState('');
  const [error,    setError]    = useState('');
  const [copied,   setCopied]   = useState('');

  function load() {
    setLoading(true);
    api.listUploadLinks(galleryId)
      .then(setLinks)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [galleryId]);

  async function create(e) {
    e.preventDefault();
    setCreating(true); setError('');
    try {
      await api.createUploadLink(galleryId, { label: label.trim() || undefined });
      setLabel('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(linkId) {
    try { await api.revokeUploadLink(galleryId, linkId); load(); } catch {}
  }

  function copy(url) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  return (
    <AdminPage title={t('gal_upload_title')}>
      <div className="row">
        <div className="col-lg-8">

          {/* Active links */}
          <AdminCard title={t('gal_upload_links_section')} noPadding>
            {loading ? (
              <div className="text-center py-4 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : links.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <i className="fas fa-link fa-2x mb-2" style={{ display: 'block' }} />
                <p className="mb-0">{t('gal_upload_no_links')}</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-light">
                    <tr><th>{t('gal_upload_th_label')}</th><th>{t('gal_upload_th_token')}</th><th>{t('gal_upload_th_created')}</th><th></th></tr>
                  </thead>
                  <tbody>
                    {links.map(l => {
                      const uploadUrl = `${window.location.origin}/upload/${l.token}`;
                      return (
                        <tr key={l.id}>
                          <td>{l.label || <em className="text-muted">{t('gal_upload_unnamed')}</em>}</td>
                          <td>
                            <code style={{ fontSize: '0.78rem' }}>{l.token.slice(0, 12)}…</code>
                          </td>
                          <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {new Date(l.created_at).toLocaleDateString()}
                          </td>
                          <td className="text-end">
                            <AdminButton
                              variant="outline-secondary"
                              size="sm"
                              className="me-1"
                              onClick={() => copy(uploadUrl)}
                              aria-label="Copy upload URL"
                            >
                              <i className={`fas ${copied === uploadUrl ? 'fa-check text-success' : 'fa-copy'}`} aria-hidden="true" />
                            </AdminButton>
                            <AdminButton variant="outline-danger" size="sm" onClick={() => revoke(l.id)} aria-label="Revoke link">
                              <i className="fas fa-times" aria-hidden="true" />
                            </AdminButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>

          {/* Create link */}
          <AdminCard title={t('gal_upload_create_section')}>
            <AdminAlert message={error} />
            <form onSubmit={create} className="d-flex gap-2 align-items-end">
              <div style={{ flex: 1 }}>
                <label className="form-label">{t('gal_upload_th_label')} <span className="text-muted">{t('gal_upload_label_optional')}</span></label>
                <input className="form-control" value={label} onChange={e => setLabel(e.target.value)}
                  placeholder={t('gal_upload_placeholder')} />
              </div>
              <AdminButton type="submit" loading={creating} icon="fas fa-plus">
                {t('create')}
              </AdminButton>
            </form>
            <div className="form-text mt-2">{t('gal_upload_hint')}</div>
          </AdminCard>

        </div>
      </div>
    </AdminPage>
  );
}
