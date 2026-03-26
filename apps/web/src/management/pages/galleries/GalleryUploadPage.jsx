// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function GalleryUploadPage() {
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
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2"><div className="col-sm-6"><h1 className="m-0">Upload</h1></div></div>
        </div>
      </div>
      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-8">

              {/* Active links */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Upload links</h3></div>
                <div className="card-body p-0">
                  {loading ? (
                    <div className="text-center py-4 text-muted"><i className="fas fa-spinner fa-spin" /></div>
                  ) : links.length === 0 ? (
                    <div className="text-center py-4 text-muted">
                      <i className="fas fa-link fa-2x mb-2" style={{ display: 'block' }} />
                      <p className="mb-0">No upload links yet.</p>
                    </div>
                  ) : (
                    <table className="table table-sm table-hover mb-0">
                      <thead className="table-light">
                        <tr><th>Label</th><th>Token</th><th>Created</th><th></th></tr>
                      </thead>
                      <tbody>
                        {links.map(l => {
                          const uploadUrl = `${window.location.origin}/upload/${l.token}`;
                          return (
                            <tr key={l.id}>
                              <td>{l.label || <em className="text-muted">Unnamed</em>}</td>
                              <td>
                                <code style={{ fontSize: '0.78rem' }}>{l.token.slice(0, 12)}…</code>
                              </td>
                              <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                {new Date(l.created_at).toLocaleDateString()}
                              </td>
                              <td className="text-end">
                                <button
                                  className={`btn btn-sm btn-outline-secondary me-1`}
                                  onClick={() => copy(uploadUrl)}
                                  title="Copy upload URL"
                                >
                                  <i className={`fas ${copied === uploadUrl ? 'fa-check text-success' : 'fa-copy'}`} />
                                </button>
                                <button className="btn btn-sm btn-outline-danger" onClick={() => revoke(l.id)} title="Revoke link">
                                  <i className="fas fa-times" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Create link */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Create upload link</h3></div>
                <div className="card-body">
                  {error && <div className="alert alert-danger py-2">{error}</div>}
                  <form onSubmit={create} className="d-flex gap-2 align-items-end">
                    <div style={{ flex: 1 }}>
                      <label className="form-label">Label <span className="text-muted">(optional)</span></label>
                      <input className="form-control" value={label} onChange={e => setLabel(e.target.value)}
                        placeholder="e.g. Photographer A" />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={creating}>
                      {creating ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus me-1" />Create</>}
                    </button>
                  </form>
                  <div className="form-text mt-2">Each link generates a unique upload URL to share with contributors.</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
