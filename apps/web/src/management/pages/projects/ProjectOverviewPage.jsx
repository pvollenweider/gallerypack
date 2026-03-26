// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function ProjectOverviewPage() {
  const { projectId } = useParams();
  const [project,    setProject]    = useState(null);
  const [galleries,  setGalleries]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    Promise.all([api.getProject(projectId), api.getProjectGalleries(projectId)])
      .then(([p, g]) => { setProject(p); setGalleries(g || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const base = `/manage/projects/${projectId}`;

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">{project?.name ?? 'Project'}</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
          {error   && <div className="alert alert-danger">{error}</div>}

          {project && (
            <div className="row">

              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-info-circle me-2" />General</h3>
                    <Link to={`${base}/general`} className="btn btn-sm btn-outline-secondary">Edit</Link>
                  </div>
                  <div className="card-body">
                    <dl className="mb-0" style={{ fontSize: '0.875rem' }}>
                      <dt className="text-muted">Slug</dt><dd><code>{project.slug}</code></dd>
                      {project.description && <><dt className="text-muted">Description</dt><dd>{project.description}</dd></>}
                      <dt className="text-muted">Visibility</dt><dd>{project.visibility || 'public'}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-images me-2" />Galleries</h3>
                    <Link to={`${base}/galleries`} className="btn btn-sm btn-outline-secondary">View all</Link>
                  </div>
                  <div className="card-body">
                    <p className="mb-0" style={{ fontSize: '0.875rem' }}>
                      <strong>{galleries.length}</strong> gallery{galleries.length !== 1 ? 's' : ''}
                    </p>
                    {galleries.slice(0, 3).map(g => (
                      <div key={g.id} className="mt-1">
                        <Link to={`/manage/galleries/${g.id}`} style={{ fontSize: '0.85rem' }}>{g.title || g.slug}</Link>
                      </div>
                    ))}
                    {galleries.length > 3 && <small className="text-muted">+{galleries.length - 3} more</small>}
                  </div>
                </div>
              </div>

              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-lock me-2" />Access</h3>
                    <Link to={`${base}/access`} className="btn btn-sm btn-outline-secondary">Configure</Link>
                  </div>
                  <div className="card-body">
                    <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                      Access type and download policy — inherited from organization or overridden at project level.
                    </p>
                  </div>
                </div>
              </div>

              <div className="col-md-4 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-truck me-2" />Delivery</h3>
                    <Link to={`${base}/delivery`} className="btn btn-sm btn-outline-secondary">Configure</Link>
                  </div>
                  <div className="card-body">
                    <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>
                      Download and ZIP policies — inherited from organization or overridden at project level.
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
