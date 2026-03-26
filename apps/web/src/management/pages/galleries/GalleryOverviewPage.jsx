// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

const STATUS_BADGE  = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };
const ACCESS_BADGE  = { public: 'success', private: 'secondary', password: 'warning' };

export default function GalleryOverviewPage() {
  const { galleryId } = useParams();
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');

  useEffect(() => {
    api.getGallery(galleryId)
      .then(setGallery)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

  async function rebuild() {
    setBuilding(true); setBuildMsg('');
    try {
      await api.triggerBuild(galleryId, true);
      setBuildMsg('Build triggered.');
      const g = await api.getGallery(galleryId);
      setGallery(g);
    } catch (err) {
      setBuildMsg(err.message);
    } finally {
      setBuilding(false);
    }
  }

  const base = `/manage/galleries/${galleryId}`;

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6"><h1 className="m-0">{gallery?.title || gallery?.slug || 'Gallery'}</h1></div>
            <div className="col-sm-6 text-sm-end">
              <button className="btn btn-primary btn-sm" onClick={rebuild} disabled={building || loading}>
                {building ? <><i className="fas fa-spinner fa-spin me-1" />Building…</> : <><i className="fas fa-rocket me-1" />Publish</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
          {error   && <div className="alert alert-danger">{error}</div>}
          {buildMsg && <div className="alert alert-info py-2">{buildMsg}</div>}

          {gallery && (
            <div className="row">

              <div className="col-md-3 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-lock me-2" />Access</h3>
                    <Link to={`${base}/access`} className="btn btn-sm btn-outline-secondary">Edit</Link>
                  </div>
                  <div className="card-body">
                    <span className={`badge bg-${ACCESS_BADGE[gallery.access] || 'secondary'}`}>{gallery.access || 'public'}</span>
                    {gallery.access === 'password' && <small className="text-muted d-block mt-1">Password set</small>}
                  </div>
                </div>
              </div>

              <div className="col-md-3 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-download me-2" />Downloads</h3>
                    <Link to={`${base}/downloads`} className="btn btn-sm btn-outline-secondary">Edit</Link>
                  </div>
                  <div className="card-body" style={{ fontSize: '0.85rem' }}>
                    <div><i className={`fas fa-${gallery.allowDownloadImage ? 'check text-success' : 'times text-muted'} me-2`} />Photo download</div>
                    <div><i className={`fas fa-${gallery.allowDownloadGallery ? 'check text-success' : 'times text-muted'} me-2`} />ZIP download</div>
                  </div>
                </div>
              </div>

              <div className="col-md-3 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-upload me-2" />Upload</h3>
                    <Link to={`${base}/upload`} className="btn btn-sm btn-outline-secondary">Manage</Link>
                  </div>
                  <div className="card-body">
                    <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>Upload links and contributor access.</p>
                  </div>
                </div>
              </div>

              <div className="col-md-3 mb-3">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-rocket me-2" />Publish</h3>
                    <Link to={`${base}/publish`} className="btn btn-sm btn-outline-secondary">Details</Link>
                  </div>
                  <div className="card-body">
                    {gallery.buildStatus
                      ? <span className={`badge bg-${STATUS_BADGE[gallery.buildStatus] || 'secondary'}`}>{gallery.buildStatus}</span>
                      : <span className="text-muted" style={{ fontSize: '0.85rem' }}>Never built</span>
                    }
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
