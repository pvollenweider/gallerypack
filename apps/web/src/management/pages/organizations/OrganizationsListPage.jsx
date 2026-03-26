// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useAuth } from '../../../lib/auth.jsx';

export default function OrganizationsListPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.platformRole === 'superadmin';

  const [orgs,    setOrgs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg,     setNewOrg]     = useState({ name: '', slug: '', locale: 'en', country: '' });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  function load() {
    setLoading(true);
    api.listOrganizations()
      .then(setOrgs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function setNew(field) {
    return e => setNewOrg(f => ({ ...f, [field]: e.target.value }));
  }

  async function create(e) {
    e.preventDefault();
    setCreating(true); setCreateErr('');
    try {
      await api.createOrganization(newOrg);
      setNewOrg({ name: '', slug: '', locale: 'en', country: '' });
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
            <div className="col-sm-6"><h1 className="m-0">Organizations</h1></div>
            {isSuperadmin && (
              <div className="col-sm-6 text-sm-end">
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(v => !v)}>
                  <i className="fas fa-plus me-1" />New organization
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">

          {showCreate && (
            <div className="card mb-3">
              <div className="card-header"><h3 className="card-title">New organization</h3></div>
              <div className="card-body">
                <form onSubmit={create}>
                  <div className="row">
                    <div className="col-sm-4 mb-3">
                      <label className="form-label">Name</label>
                      <input className="form-control" value={newOrg.name} onChange={setNew('name')} required />
                    </div>
                    <div className="col-sm-3 mb-3">
                      <label className="form-label">Slug</label>
                      <input className="form-control" value={newOrg.slug} onChange={setNew('slug')} required pattern="[a-z0-9-]+" title="Lowercase letters, numbers and hyphens only" />
                    </div>
                    <div className="col-sm-2 mb-3">
                      <label className="form-label">Locale</label>
                      <input className="form-control" value={newOrg.locale} onChange={setNew('locale')} placeholder="en" />
                    </div>
                    <div className="col-sm-3 mb-3">
                      <label className="form-label">Country</label>
                      <input className="form-control" value={newOrg.country} onChange={setNew('country')} placeholder="CH" maxLength={2} />
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
              ) : orgs.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="fas fa-building fa-2x mb-3" style={{ display: 'block' }} />
                  <p className="mb-0">No organizations yet.</p>
                </div>
              ) : (
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th>
                      <th>Slug</th>
                      <th>Locale</th>
                      <th>Country</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map(org => (
                      <tr key={org.id}>
                        <td>
                          <Link to={`/manage/organizations/${org.id}`} className="fw-semibold text-body">
                            {org.name}
                          </Link>
                          {org.is_default && <span className="badge bg-secondary ms-2" style={{ fontSize: '0.7rem' }}>default</span>}
                        </td>
                        <td><code className="text-muted">{org.slug}</code></td>
                        <td>{org.locale || '—'}</td>
                        <td>{org.country || '—'}</td>
                        <td className="text-end">
                          <Link to={`/manage/organizations/${org.id}`} className="btn btn-sm btn-outline-secondary">
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
