// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TokenStatusBadge({ token, t }) {
  if (token.revokedAt) return <span className="badge bg-danger">{t('token_status_revoked')}</span>;
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return <span className="badge bg-warning text-dark">{t('token_status_expired')}</span>;
  return <span className="badge bg-success">{t('token_status_active')}</span>;
}

function RevealModal({ raw, onClose, t }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(raw).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title">
              <i className="fas fa-key text-warning me-2" />
              {t('token_reveal_title')}
            </h5>
          </div>
          <div className="modal-body">
            <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.82rem' }}>
              <i className="fas fa-exclamation-triangle me-1" />
              {t('token_reveal_warning')}
            </div>
            <div className="input-group">
              <input
                type="text"
                readOnly
                value={raw}
                className="form-control font-monospace"
                style={{ fontSize: '0.82rem' }}
                onFocus={e => e.target.select()}
              />
              <button type="button" className="btn btn-outline-secondary" onClick={copy}>
                {copied ? <i className="fas fa-check text-success" /> : <i className="fas fa-copy" />}
              </button>
            </div>
            <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.78rem' }}>
              {t('token_reveal_usage', { token: raw })}
            </p>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('token_reveal_confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateTokenForm({ onCreated, onCancel, t }) {
  const [name, setName]           = useState('');
  const [scopeType, setScopeType] = useState('gallery');
  const [scopeId, setScopeId]     = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [scopes, setScopes]       = useState([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    setScopeId('');
    if (scopeType === 'gallery') {
      api.listGalleries().then(d => setScopes(d.galleries || [])).catch(() => {});
    } else {
      api.listProjects().then(d => setScopes(d.projects || [])).catch(() => {});
    }
  }, [scopeType]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !scopeId) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.createToken({ name: name.trim(), scopeType, scopeId, expiresAt: expiresAt || null });
      onCreated(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <AdminCard title={t('token_create_section')} className="mb-3">
      <form onSubmit={handleSubmit}>
        <div className="row g-2 mb-2">
          <div className="col-12 col-md-4">
            <label className="form-label small mb-1">{t('token_name_label')}</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder={t('token_name_placeholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              required
              maxLength={128}
              autoFocus
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">{t('token_scope_type_label')}</label>
            <select className="form-select form-select-sm" value={scopeType} onChange={e => setScopeType(e.target.value)}>
              <option value="gallery">{t('token_scope_gallery')}</option>
              <option value="project">{t('token_scope_project')}</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1">{scopeType === 'gallery' ? t('token_scope_gallery') : t('token_scope_project')}</label>
            <select className="form-select form-select-sm" value={scopeId} onChange={e => setScopeId(e.target.value)} required>
              <option value="">{t('token_scope_select')}</option>
              {scopes.map(s => (
                <option key={s.id} value={s.id}>{s.title || s.name || s.slug}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1">{t('token_expires_label')}</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </div>
        {error && <div className="text-danger small mb-2">{error}</div>}
        <div className="d-flex gap-2">
          <AdminButton type="submit" size="sm" loading={saving} loadingLabel={t('token_creating')} disabled={!name.trim() || !scopeId}>
            {t('token_create_btn')}
          </AdminButton>
          <AdminButton type="button" variant="outline-secondary" size="sm" onClick={onCancel}>
            {t('cancel')}
          </AdminButton>
        </div>
      </form>
    </AdminCard>
  );
}

export default function TokensPage() {
  const t = useT();
  const [tokens, setTokens]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [revealed, setRevealed]   = useState(null);
  const [revoking, setRevoking]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listTokens()
      .then(d => setTokens(d.tokens || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(result) {
    setShowForm(false);
    setRevealed(result.raw);
    load();
  }

  async function handleRevoke(token) {
    if (!window.confirm(t('token_revoke_confirm', { name: token.name }))) return;
    setRevoking(token.id);
    try {
      await api.revokeToken(token.id);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setRevoking(null);
    }
  }

  const active   = tokens.filter(tk => !tk.revokedAt && (!tk.expiresAt || new Date(tk.expiresAt) >= new Date()));
  const inactive = tokens.filter(tk => tk.revokedAt || (tk.expiresAt && new Date(tk.expiresAt) < new Date()));

  return (
    <AdminPage
      title={t('token_page_title')}
      maxWidth="100%"
      actions={!showForm && (
        <AdminButton size="sm" icon="fas fa-plus" onClick={() => setShowForm(true)}>
          {t('token_new_btn')}
        </AdminButton>
      )}
    >
      {revealed && <RevealModal raw={revealed} onClose={() => setRevealed(null)} t={t} />}

      <div className="alert alert-info py-2 mb-3" style={{ fontSize: '0.82rem' }}>
        <i className="fas fa-info-circle me-1" />
        {t('token_intro_text')}
        <code className="mt-1 d-block">{t('token_example_command')}</code>
      </div>

      {showForm && <CreateTokenForm onCreated={handleCreated} onCancel={() => setShowForm(false)} t={t} />}

      {loading ? (
        <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
      ) : tokens.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-key fa-2x mb-2 opacity-25" style={{ display: 'block' }} />
          <p className="mb-0">{t('token_empty_text')}</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <AdminCard title={t('token_active_section')} noPadding className="mb-3">
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>{t('token_th_name')}</th>
                      <th>{t('token_th_prefix')}</th>
                      <th>{t('token_th_scope')}</th>
                      <th>{t('token_th_created')}</th>
                      <th>{t('token_th_last_used')}</th>
                      <th>{t('token_th_expires')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map(tk => (
                      <tr key={tk.id}>
                        <td>{tk.name}</td>
                        <td><code>gp_{tk.prefix}…</code></td>
                        <td>
                          <span className="badge bg-secondary me-1">{tk.scopeType}</span>
                          <code style={{ fontSize: '0.72rem' }}>{tk.scopeId.slice(0, 8)}…</code>
                        </td>
                        <td>{formatDate(tk.createdAt)}</td>
                        <td>{formatDate(tk.lastUsedAt)}</td>
                        <td>{formatDate(tk.expiresAt)}</td>
                        <td>
                          <AdminButton
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleRevoke(tk)}
                            loading={revoking === tk.id}
                            loadingLabel="…"
                          >
                            {t('token_revoke_btn')}
                          </AdminButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          )}

          {inactive.length > 0 && (
            <details className="mt-2">
              <summary className="text-muted small" style={{ cursor: 'pointer' }}>
                {t('token_show_inactive', { n: inactive.length })}
              </summary>
              <AdminCard noPadding className="mt-2" style={{ opacity: 0.6 }}>
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t('token_th_name')}</th>
                        <th>{t('token_th_prefix')}</th>
                        <th>{t('token_th_scope')}</th>
                        <th>{t('hub_col_status')}</th>
                        <th>{t('token_th_created')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inactive.map(tk => (
                        <tr key={tk.id}>
                          <td>{tk.name}</td>
                          <td><code>gp_{tk.prefix}…</code></td>
                          <td><span className="badge bg-secondary">{tk.scopeType}</span></td>
                          <td><TokenStatusBadge token={tk} t={t} /></td>
                          <td>{formatDate(tk.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminCard>
            </details>
          )}
        </>
      )}
    </AdminPage>
  );
}
