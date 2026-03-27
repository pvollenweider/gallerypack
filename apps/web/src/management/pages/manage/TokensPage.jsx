// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/management/pages/manage/TokensPage.jsx
// Personal upload tokens — list, create (one-time reveal), revoke.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../../lib/api.js';

const SCOPE_LABELS = { gallery: 'Gallery', project: 'Project' };

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TokenStatusBadge({ token }) {
  if (token.revokedAt) return <span className="badge bg-danger">Revoked</span>;
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return <span className="badge bg-warning text-dark">Expired</span>;
  return <span className="badge bg-success">Active</span>;
}

// Modal to show the raw token once after creation
function RevealModal({ raw, onClose }) {
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
              Your new upload token
            </h5>
          </div>
          <div className="modal-body">
            <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.82rem' }}>
              <i className="fas fa-exclamation-triangle me-1" />
              <strong>Copy this token now.</strong> It will never be shown again.
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
              Use it as: <code>Authorization: Bearer {raw}</code>
            </p>
          </div>
          <div className="modal-footer border-0 pt-0">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done — I've saved my token
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Create token form
function CreateTokenForm({ onCreated, onCancel }) {
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
      const result = await api.createToken({
        name: name.trim(),
        scopeType,
        scopeId,
        expiresAt: expiresAt || null,
      });
      onCreated(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="card card-body mb-3">
      <h6 className="mb-3"><i className="fas fa-plus-circle me-1" /> New upload token</h6>
      <form onSubmit={handleSubmit}>
        <div className="row g-2 mb-2">
          <div className="col-12 col-md-4">
            <label className="form-label small mb-1">Token name</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g. Lightroom plugin"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              maxLength={128}
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1">Scope type</label>
            <select className="form-select form-select-sm" value={scopeType} onChange={e => setScopeType(e.target.value)}>
              <option value="gallery">Gallery</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-1">{SCOPE_LABELS[scopeType]}</label>
            <select className="form-select form-select-sm" value={scopeId} onChange={e => setScopeId(e.target.value)} required>
              <option value="">— select —</option>
              {scopes.map(s => (
                <option key={s.id} value={s.id}>{s.title || s.name || s.slug}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small mb-1">Expires (optional)</label>
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
          <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !name.trim() || !scopeId}>
            {saving ? 'Creating…' : 'Create token'}
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function TokensPage() {
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
    if (!window.confirm(`Revoke token "${token.name}"? This cannot be undone.`)) return;
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

  const active  = tokens.filter(t => !t.revokedAt && (!t.expiresAt || new Date(t.expiresAt) >= new Date()));
  const inactive = tokens.filter(t => t.revokedAt || (t.expiresAt && new Date(t.expiresAt) < new Date()));

  return (
    <div className="app-content-body">
      {revealed && (
        <RevealModal raw={revealed} onClose={() => setRevealed(null)} />
      )}

      <div className="app-content-header py-3">
        <div className="container-fluid">
          <div className="row g-2 align-items-center">
            <div className="col">
              <h2 className="page-title mb-0">
                <i className="fas fa-key me-2 text-muted" />
                Upload Tokens
              </h2>
            </div>
            <div className="col-auto">
              {!showForm && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                  <i className="fas fa-plus me-1" />
                  New token
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="app-content">
        <div className="container-fluid">

          <div className="row mb-3">
            <div className="col">
              <div className="alert alert-info py-2" style={{ fontSize: '0.82rem' }}>
                <i className="fas fa-info-circle me-1" />
                Personal upload tokens let you upload photos via curl or scripts without logging in.
                Tokens are scoped to a single gallery or project and shown only once on creation.
                <br />
                <code className="mt-1 d-block">
                  curl -X POST https://example.com/api/upload/token?gallery_id=&lt;uuid&gt; \<br />
                  &nbsp;&nbsp;-H "Authorization: Bearer gp_…" \<br />
                  &nbsp;&nbsp;-F "photos=@photo.jpg"
                </code>
              </div>
            </div>
          </div>

          {showForm && (
            <CreateTokenForm
              onCreated={handleCreated}
              onCancel={() => setShowForm(false)}
            />
          )}

          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : tokens.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="fas fa-key fa-2x mb-2 opacity-25" />
              <p className="mb-0">No tokens yet. Create one to upload via API.</p>
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <div className="card mb-3">
                  <div className="card-header py-2">
                    <span className="fw-semibold">Active tokens</span>
                  </div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-sm mb-0 table-responsive-stack">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Prefix</th>
                            <th>Scope</th>
                            <th>Created</th>
                            <th>Last used</th>
                            <th>Expires</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {active.map(t => (
                            <tr key={t.id}>
                              <td data-label="Name">{t.name}</td>
                              <td data-label="Prefix"><code>gp_{t.prefix}…</code></td>
                              <td data-label="Scope">
                                <span className="badge bg-secondary me-1">{t.scopeType}</span>
                                <code style={{ fontSize: '0.72rem' }}>{t.scopeId.slice(0, 8)}…</code>
                              </td>
                              <td data-label="Created">{formatDate(t.createdAt)}</td>
                              <td data-label="Last used">{formatDate(t.lastUsedAt)}</td>
                              <td data-label="Expires">{formatDate(t.expiresAt)}</td>
                              <td>
                                <button
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleRevoke(t)}
                                  disabled={revoking === t.id}
                                >
                                  {revoking === t.id ? '…' : 'Revoke'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {inactive.length > 0 && (
                <details className="mt-2">
                  <summary className="text-muted small" style={{ cursor: 'pointer' }}>
                    Show {inactive.length} revoked / expired token{inactive.length > 1 ? 's' : ''}
                  </summary>
                  <div className="card mt-2 opacity-50">
                    <div className="card-body p-0">
                      <div className="table-responsive">
                        <table className="table table-sm mb-0">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Prefix</th>
                              <th>Scope</th>
                              <th>Status</th>
                              <th>Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inactive.map(t => (
                              <tr key={t.id}>
                                <td>{t.name}</td>
                                <td><code>gp_{t.prefix}…</code></td>
                                <td><span className="badge bg-secondary">{t.scopeType}</span></td>
                                <td><TokenStatusBadge token={t} /></td>
                                <td>{formatDate(t.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
