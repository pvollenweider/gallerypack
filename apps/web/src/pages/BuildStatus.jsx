// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api }       from '../lib/api.js';
import { useT }      from '../lib/I18nContext.jsx';
import { BuildLog }  from '../components/BuildLog.jsx';

export default function BuildStatus() {
  const t           = useT();
  const { jobId }   = useParams();
  const navigate    = useNavigate();
  const [job,        setJob]        = useState(null);
  const [gallery,    setGallery]    = useState(null);
  const [done,       setDone]       = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancelJob() {
    setCancelling(true);
    try {
      await api.cancelJob(jobId);
      const j = await api.getJob(jobId);
      setJob(j);
      setDone(true);
    } catch {}
    setCancelling(false);
  }

  useEffect(() => {
    api.getJob(jobId)
      .then(j => { setJob(j); api.getGallery(j.galleryId).then(setGallery).catch(() => {}); })
      .catch(() => navigate('/'));
  }, [jobId]);

  function handleDone(finalStatus) {
    setDone(true);
    api.getJob(jobId).then(j => {
      setJob(j);
      api.getGallery(j.galleryId).then(setGallery).catch(() => {});
    });
  }

  return (
    <>
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0">{t('build_title', { id: jobId.slice(-8) })}</h1>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row justify-content-center">
            <div className="col-lg-10">

              {/* Build meta */}
              {job && (
                <div className="card">
                  <div className="card-body py-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div className="d-flex flex-wrap" style={{ gap: '1.5rem', fontSize: '0.85rem', color: '#666' }}>
                      <span><strong>{t('build_gallery')}:</strong> {gallery ? (gallery.title || gallery.slug) : job.galleryId}</span>
                      <span><strong>{t('build_triggered')}:</strong> {new Date(job.createdAt).toLocaleString()}</span>
                      {job.durationMs && <span><strong>{t('build_duration')}:</strong> {(job.durationMs / 1000).toFixed(1)}s</span>}
                    </div>
                    {['queued', 'running'].includes(job.status) && !done && (
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={cancelJob}
                        disabled={cancelling}
                      >
                        {cancelling
                          ? <><i className="fas fa-spinner fa-spin me-1" />…</>
                          : <><i className="fas fa-stop me-1" />{t('job_cancel')}</>
                        }
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Build log */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title"><i className="fas fa-terminal me-2" />{t('build_log')}</h3>
                </div>
                <div className="card-body p-0">
                  <BuildLog jobId={jobId} onDone={handleDone} />
                </div>
              </div>

              {/* Post-build actions */}
              {done && job && (
                <div className="d-flex" style={{ gap: '0.75rem' }}>
                  <Link to={`/galleries/${job.galleryId}`} className="btn btn-dark">
                    <i className="fas fa-arrow-left me-1" />{t('build_back_to_gallery')}
                  </Link>
                  {gallery && (() => {
                    const publicPath = (gallery.breadcrumb?.project?.slug && gallery.access !== 'password' && gallery.access !== 'private')
                      ? `/${gallery.breadcrumb.project.slug}/${gallery.slug}`
                      : `/${gallery.slug}`;
                    return (
                      <a href={`${publicPath}/`} target="_blank" rel="noreferrer" className="btn btn-success">
                        {t('build_view_gallery')} <i className="fas fa-external-link-alt ms-1" />
                      </a>
                    );
                  })()}
                </div>
              )}

            </div>
          </div>
        </div>
      </section>
    </>
  );
}
