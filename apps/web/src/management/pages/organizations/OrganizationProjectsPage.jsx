// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function OrganizationProjectsPage() {
  const { orgId } = useParams();
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">Projects</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="card">
            <div className="card-body p-0">
              {loading ? (
                <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
              ) : projects.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="fas fa-folder-open fa-2x mb-3" style={{ display: 'block' }} />
                  <p className="mb-0">No projects yet.</p>
                </div>
              ) : (
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th>
                      <th>Slug</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/manage/projects/${p.id}`} className="fw-semibold text-body">{p.name}</Link>
                        </td>
                        <td><code className="text-muted">{p.slug}</code></td>
                        <td className="text-end">
                          <Link to={`/manage/projects/${p.id}`} className="btn btn-sm btn-outline-secondary">
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
