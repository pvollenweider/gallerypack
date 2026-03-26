// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function OrganizationOverviewPage() {
  const { orgId } = useParams();
  const [org,     setOrg]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getOrganization(orgId)
      .then(setOrg)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  const base = `/manage/organizations/${orgId}`;

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">{org?.name ?? 'Organization'}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
          {error   && <div className="alert alert-danger">{error}</div>}

          {org && (
            <div className="row">

              {/* General */}
              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-info-circle me-2" />General</h3>
                    <Link to={`${base}/general`} className="btn btn-sm btn-outline-secondary">Edit</Link>
                  </div>
                  <div className="card-body">
                    <dl className="mb-0" style={{ fontSize: '0.875rem' }}>
                      <dt className="text-muted">Slug</dt>
                      <dd><code>{org.slug}</code></dd>
                      <dt className="text-muted">Locale</dt>
                      <dd>{org.locale || '—'}</dd>
                      <dt className="text-muted">Country</dt>
                      <dd>{org.country || '—'}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              {/* Team */}
              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-users me-2" />Team</h3>
                    <Link to={`${base}/team`} className="btn btn-sm btn-outline-secondary">Manage</Link>
                  </div>
                  <div className="card-body">
                    {org.members?.length > 0 ? (
                      <>
                        <p className="mb-1" style={{ fontSize: '0.875rem' }}>
                          <strong>{org.members.length}</strong> member{org.members.length !== 1 ? 's' : ''}
                        </p>
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {org.members.slice(0, 5).map(m => (
                            <span key={m.user_id} className="badge bg-light text-dark border" style={{ fontSize: '0.75rem' }}>
                              {m.name || m.email}
                            </span>
                          ))}
                          {org.members.length > 5 && <span className="badge bg-light text-muted border">+{org.members.length - 5} more</span>}
                        </div>
                      </>
                    ) : (
                      <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>No members yet.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Projects */}
              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-folder-open me-2" />Projects</h3>
                    <Link to={`${base}/projects`} className="btn btn-sm btn-outline-secondary">View all</Link>
                  </div>
                  <div className="card-body">
                    <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                      View and manage projects in this organization.
                    </p>
                  </div>
                </div>
              </div>

              {/* Defaults */}
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-sliders-h me-2" />Defaults</h3>
                    <Link to={`${base}/defaults`} className="btn btn-sm btn-outline-secondary">Configure</Link>
                  </div>
                  <div className="card-body">
                    <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                      Default photographer, access type, and download policies inherited by projects and galleries.
                    </p>
                  </div>
                </div>
              </div>

              {/* Access */}
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-lock me-2" />Access & Privacy</h3>
                    <Link to={`${base}/access`} className="btn btn-sm btn-outline-secondary">Configure</Link>
                  </div>
                  <div className="card-body">
                    <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                      Organization-level access type and download policies. Can be overridden at project or gallery level.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
