// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning', draft: 'secondary' };

export default function ProjectGalleriesPage() {
  const { projectId } = useParams();
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newG,       setNewG]       = useState({ title: '', slug: '' });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    api.getProjectGalleries(projectId)
      .then(setGalleries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

  function setNew(field) {
    return e => setNewG(f => ({ ...f, [field]: e.target.value }));
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      await api.createProjectGallery(projectId, newG);
      setNewG({ title: '', slug: '' });
      setShowCreate(false);
      load();
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6"><h1 className="m-0">Galleries</h1></div>
            <div className="col-sm-6 text-sm-end">
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(v => !v)}>
                <i className="fas fa-plus me-1" />New gallery
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">

          {showCreate && (
            <div className="card mb-3">
              <div className="card-header"><h3 className="card-title">New gallery</h3></div>
              <div className="card-body">
                <form onSubmit={create}>
                  <div className="row">
                    <div className="col-sm-5 mb-3">
                      <label className="form-label">Title</label>
                      <input className="form-control" value={newG.title} onChange={setNew('title')} required />
                    </div>
                    <div className="col-sm-4 mb-3">
                      <label className="form-label">Slug</label>
                      <input className="form-control" value={newG.slug} onChange={setNew('slug')} required pattern="[a-z0-9-]+" />
                    </div>
                  </div>
                  {createErr && <div className="alert alert-danger py-2">{createErr}</div>}
                  <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                      {creating ? <><i className="fas fa-spinner fa-spin me-1" />Creating…</> : 'Create'}
                    </button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          <div className="card">
            <div className="card-body p-0">
              {loading ? (
                <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
              ) : galleries.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="fas fa-images fa-2x mb-3" style={{ display: 'block' }} />
                  <p className="mb-1">No galleries yet.</p>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => setShowCreate(true)}>
                    <i className="fas fa-plus me-1" />Create the first gallery
                  </button>
                </div>
              ) : (
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr><th>Title</th><th>Slug</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {galleries.map(g => (
                      <tr key={g.id}>
                        <td><Link to={`/manage/galleries/${g.id}`} className="fw-semibold text-body">{g.title || g.slug}</Link></td>
                        <td><code className="text-muted">{g.slug}</code></td>
                        <td><span className={`badge bg-${STATUS_BADGE[g.build_status] || 'secondary'}`}>{g.build_status || 'draft'}</span></td>
                        <td className="text-end">
                          <Link to={`/manage/galleries/${g.id}`} className="btn btn-sm btn-outline-secondary">
                            Manage <i className="fas fa-chevron-right ms-1" />
                          </Link>
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
    </>
  );
}
