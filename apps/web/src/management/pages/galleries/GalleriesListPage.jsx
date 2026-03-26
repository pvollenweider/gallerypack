// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };
const ACCESS_BADGE = { public: 'success', private: 'secondary', password: 'warning' };

export default function GalleriesListPage() {
  const [galleries, setGalleries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.listGalleries()
      .then(setGalleries)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">Galleries</h1></div>
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
              ) : galleries.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i className="fas fa-images fa-2x mb-3" style={{ display: 'block' }} />
                  <p className="mb-0">No galleries yet. Create one from a project.</p>
                </div>
              ) : (
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr><th>Gallery</th><th>Access</th><th>Build</th><th></th></tr>
                  </thead>
                  <tbody>
                    {galleries.map(g => (
                      <tr key={g.id}>
                        <td>
                          <Link to={`/manage/galleries/${g.id}`} className="fw-semibold text-body">{g.title || g.slug}</Link>
                          <small className="text-muted d-block"><code>{g.slug}</code></small>
                        </td>
                        <td>
                          <span className={`badge bg-${ACCESS_BADGE[g.access] || 'secondary'}`}>{g.access || 'public'}</span>
                        </td>
                        <td>
                          {g.buildStatus
                            ? <span className={`badge bg-${STATUS_BADGE[g.buildStatus] || 'secondary'}`}>{g.buildStatus}</span>
                            : <span className="text-muted" style={{ fontSize: '0.8rem' }}>never built</span>
                          }
                        </td>
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
