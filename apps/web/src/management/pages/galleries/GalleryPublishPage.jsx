// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

const STATUS_BADGE = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

export default function GalleryPublishPage() {
  const { galleryId } = useParams();
  const [gallery,  setGallery]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [building, setBuilding] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');
  const [error,    setError]    = useState('');

  function load() {
    setLoading(true);
    api.getGallery(galleryId)
      .then(setGallery)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [galleryId]);

  async function build(force = false) {
    setBuilding(true); setBuildMsg(''); setError('');
    try {
      const job = await api.triggerBuild(galleryId, force);
      setBuildMsg(`Build queued${job?.id ? ` — job ${job.id}` : ''}.`);
      setTimeout(load, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBuilding(false);
    }
  }

  const status = gallery?.buildStatus;

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6"><h1 className="m-0">Publish</h1></div>
            <div className="col-sm-6 text-sm-end">
              <button className="btn btn-primary btn-sm me-2" onClick={() => build(false)} disabled={building || loading}>
                {building ? <><i className="fas fa-spinner fa-spin me-1" />Building…</> : <><i className="fas fa-rocket me-1" />Publish</>}
              </button>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => build(true)} disabled={building || loading} title="Force full rebuild">
                <i className="fas fa-redo me-1" />Force rebuild
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
              <div className="col-lg-7">
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Build status</h3></div>
                  <div className="card-body">
                    <table className="table table-sm mb-0">
                      <tbody>
                        <tr>
                          <th style={{ width: 140 }}>Status</th>
                          <td>
                            {status
                              ? <span className={`badge bg-${STATUS_BADGE[status] || 'secondary'}`}>{status}</span>
                              : <span className="text-muted">Never built</span>
                            }
                          </td>
                        </tr>
                        {gallery.buildDate && (
                          <tr>
                            <th>Last build</th>
                            <td>{new Date(gallery.buildDate).toLocaleString()}</td>
                          </tr>
                        )}
                        {gallery.lastJobId && (
                          <tr>
                            <th>Last job</th>
                            <td>
                              <Link to={`/jobs/${gallery.lastJobId}`} className="font-monospace" style={{ fontSize: '0.85rem' }}>
                                {gallery.lastJobId} <i className="fas fa-arrow-right ms-1" />
                              </Link>
                            </td>
                          </tr>
                        )}
                        {gallery.baseUrl && (
                          <tr>
                            <th>Published URL</th>
                            <td>
                              <a href={gallery.baseUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem' }}>
                                {gallery.baseUrl} <i className="fas fa-external-link-alt ms-1" />
                              </a>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {status === 'error' && (
                  <div className="alert alert-danger">
                    <i className="fas fa-exclamation-triangle me-2" />
                    Last build failed.
                    {gallery.lastJobId && (
                      <> <Link to={`/jobs/${gallery.lastJobId}`}>View logs</Link> for details.</>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
