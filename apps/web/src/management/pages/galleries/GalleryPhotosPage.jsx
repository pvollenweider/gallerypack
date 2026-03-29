// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { UploadZone } from '../../../components/UploadZone.jsx';
import { BuildLog } from '../../../components/BuildLog.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast, AdminBadge } from '../../../components/ui/index.js';

const CAN_EDIT_ROLES = ['collaborator', 'admin', 'owner'];
const STATUS_BADGE   = { done: 'success', error: 'danger', running: 'primary', queued: 'warning' };

export default function GalleryPhotosPage() {
  const t = useT();
  const { galleryId } = useParams();
  const { user } = useAuth();
  const canEdit = CAN_EDIT_ROLES.includes(user?.studioRole) || user?.platformRole === 'superadmin';

  const [gallery,    setGallery]    = useState(null);
  const [photos,     setPhotos]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');
  const [dragIdx,    setDragIdx]    = useState(null);
  const [reordering, setReordering] = useState(false);
  const [sortAsc,    setSortAsc]    = useState(true);
  const [deleting,   setDeleting]   = useState(null);

  // Publish state
  const [building,    setBuilding]    = useState(false);
  const [buildError,  setBuildError]  = useState('');
  const [activeJobId, setActiveJobId] = useState(null);

  // Thumbnail regen + EXIF
  const [reanalyzing,    setReanalyzing]    = useState(false);
  const [reanalyzeResult, setReanalyzeResult] = useState(null);

  // Disk sync (reconcile)
  const [reconciling,    setReconciling]    = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);

  const pollRef = useRef(null);

  function loadGallery() {
    return api.getGallery(galleryId).then(g => { setGallery(g); return g; });
  }

  function refreshPhotos() {
    return api.listPhotos(galleryId).then(p => { setPhotos(p); return p; });
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      api.listPhotos(galleryId).then(p => {
        setPhotos(p);
        if (!p.some(x => !x.thumbnail?.sm)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }).catch(() => {});
    }, 2000);
  }

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.listPhotos(galleryId)])
      .then(([g, p]) => {
        setGallery(g);
        setPhotos(p);
        if (p.some(x => !x.thumbnail?.sm)) startPolling();
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    return () => { clearInterval(pollRef.current); pollRef.current = null; };
  }, [galleryId]); // eslint-disable-line

  async function build(force = false) {
    setBuilding(true); setBuildError(''); setActiveJobId(null);
    try {
      const job = await api.triggerBuild(galleryId, force);
      if (job?.id) setActiveJobId(job.id);
      // Reload gallery state after short delay so status badge updates
      setTimeout(loadGallery, 1500);
    } catch (err) {
      setBuildError(err.message);
    } finally {
      setBuilding(false);
    }
  }

  async function reanalyze() {
    setReanalyzing(true); setReanalyzeResult(null); setReconcileResult(null);
    try {
      const r = await api.reanalyzePhotos(galleryId);
      setReanalyzeResult(r);
      refreshPhotos().then(p => { if (p.some(x => !x.thumbnail?.sm)) startPolling(); });
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setReanalyzing(false);
    }
  }

  async function reconcile() {
    setReconciling(true); setReconcileResult(null); setReanalyzeResult(null);
    try {
      const r = await api.reconcilePhotos(galleryId);
      setReconcileResult(r);
      refreshPhotos().then(p => { if (p.some(x => !x.thumbnail?.sm)) startPolling(); });
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setReconciling(false);
    }
  }

  async function handleDelete(filename) {
    if (!confirm(t('delete_photo_confirm', { file: filename }))) return;
    setDeleting(filename);
    try {
      await api.deletePhoto(galleryId, filename);
      setPhotos(p => p.filter(f => f.file !== filename));
    } catch (e) { setToast(`${t('error')}: ${e.message}`); }
    finally { setDeleting(null); }
  }

  async function sortPhotos(dir) {
    const sorted = [...photos].sort((a, b) =>
      dir === 'asc' ? a.file.localeCompare(b.file) : b.file.localeCompare(a.file));
    setPhotos(sorted);
    try {
      await api.reorderPhotos(galleryId, sorted.map(p => p.file));
    } catch (e) { setToast(e.message); }
  }

  function onDragStart(i) { setDragIdx(i); }
  function onDragOver(e, i) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const next = [...photos];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setPhotos(next);
    setDragIdx(i);
  }
  async function onDragEnd() {
    setDragIdx(null);
    setReordering(true);
    try {
      await api.reorderPhotos(galleryId, photos.map(p => p.file));
    } catch (e) { setToast(e.message); }
    finally { setReordering(false); }
  }

  // Compute public gallery URL
  function galleryPublicUrl(g) {
    if (!g || g.buildStatus !== 'done' || g.access === 'private') return null;
    // distName is the authoritative built path (may already include project prefix, e.g. "projet-1/gallery-1").
    // When it's set, use it directly. When absent, fall back to building the path from projSlug + slug.
    if (g.distName) return `${window.location.origin}/${g.distName}/`;
    const projSlug = g.breadcrumb?.project?.slug;
    const path     = projSlug ? `/${projSlug}/${g.slug}/` : `/${g.slug}/`;
    return window.location.origin + path;
  }

  const publicUrl = gallery ? galleryPublicUrl(gallery) : null;
  const buildStatus = gallery?.buildStatus;

  return (
    <AdminPage
      title={t('tab_photos')}
      actions={
        <div className="d-flex gap-2 align-items-center">
          {reordering && <span className="text-muted" style={{ fontSize: '0.8rem' }}>{t('saving')}</span>}
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon={`fas fa-sort-alpha-${sortAsc ? 'down' : 'up'}`}
            onClick={() => { const next = !sortAsc; setSortAsc(next); sortPhotos(next ? 'asc' : 'desc'); }}
          >
            {sortAsc ? t('gal_photos_sort_asc') : t('gal_photos_sort_desc')}
          </AdminButton>
          <AdminButton
            size="sm"
            icon="fas fa-rocket"
            loading={building}
            loadingLabel={t('gal_publish_building')}
            disabled={loading}
            onClick={() => build(false)}
          >
            {t('gal_publish_title')}
          </AdminButton>
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon="fas fa-redo"
            disabled={building || loading}
            onClick={() => build(true)}
            title={t('gal_publish_force')}
          />
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon="fas fa-folder-open"
            loading={reconciling}
            loadingLabel="…"
            disabled={loading}
            onClick={reconcile}
            title={t('gal_reconcile_title')}
          />
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon="fas fa-images"
            loading={reanalyzing}
            loadingLabel="…"
            disabled={loading}
            onClick={reanalyze}
            title={t('gal_reanalyze_title')}
          />
        </div>
      }
    >
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />
      <AdminToast message={toast} onDone={() => setToast('')} />

      {!loading && gallery && (
        <>
          {/* Publish status bar */}
          <div className="d-flex align-items-center gap-3 mb-4 p-3 rounded"
            style={{ background: '#f8f9fa', border: '1px solid #dee2e6', flexWrap: 'wrap' }}>
            <div className="d-flex align-items-center gap-2">
              {buildStatus
                ? <AdminBadge color={STATUS_BADGE[buildStatus] || 'secondary'}>{buildStatus}</AdminBadge>
                : <span className="text-muted" style={{ fontSize: '0.85rem' }}>{t('gal_publish_never_built')}</span>
              }
              {gallery.builtAt && (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {new Date(gallery.builtAt).toLocaleString()}
                </span>
              )}
            </div>
            {publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer"
                className="btn btn-sm btn-success">
                <i className="fas fa-external-link-alt me-1" />
                {t('view_gallery_btn')}
              </a>
            )}
            {gallery.lastJobId && buildStatus === 'error' && (
              <Link to={`/admin/jobs/${gallery.lastJobId}`} className="text-danger small">
                <i className="fas fa-exclamation-triangle me-1" />{t('gal_publish_view_logs')}
              </Link>
            )}
          </div>

          {buildError && <AdminAlert message={buildError} className="mb-3" />}

          {/* Maintenance results */}
          {reconcileResult && (
            <div className="d-flex align-items-start gap-2 mb-3 p-3 rounded"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.85rem' }}>
              <i className="fas fa-check-circle text-success mt-1" style={{ flexShrink: 0 }} />
              <div className="flex-grow-1">
                <strong>{t('gal_reconcile_title')}</strong>
                <span className="ms-2 text-muted">
                  {t('gal_reconcile_result', { added: reconcileResult.added, purged: reconcileResult.purged, total: reconcileResult.total })}
                </span>
                {reconcileResult.corruptFiles?.length > 0 && (
                  <div className="text-danger mt-1">
                    {t('gal_reconcile_corrupt', { n: reconcileResult.corruptFiles.length })}: {reconcileResult.corruptFiles.join(', ')}
                  </div>
                )}
              </div>
              <button type="button" className="btn-close btn-close-sm ms-1" onClick={() => setReconcileResult(null)} />
            </div>
          )}

          {reanalyzeResult && (
            <div className="d-flex align-items-start gap-2 mb-3 p-3 rounded"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.85rem' }}>
              <i className="fas fa-check-circle text-success mt-1" style={{ flexShrink: 0 }} />
              <div className="flex-grow-1">
                <strong>{t('gal_reanalyze_title')}</strong>
                <span className="ms-2 text-muted">
                  {t('gal_reanalyze_result', { thumbs: reanalyzeResult.thumbsGenerated, exif: reanalyzeResult.exifExtracted })}
                </span>
                {reanalyzeResult.deleted?.length > 0 && (
                  <div className="text-danger mt-1">
                    {t('gal_reconcile_corrupt', { n: reanalyzeResult.deleted.length })}: {reanalyzeResult.deleted.join(', ')}
                  </div>
                )}
              </div>
              <button type="button" className="btn-close btn-close-sm ms-1" onClick={() => setReanalyzeResult(null)} />
            </div>
          )}

          {activeJobId && (
            <div className="mb-4">
              <BuildLog
                jobId={activeJobId}
                onDone={(finalStatus) => {
                  loadGallery();
                  setActiveJobId(null);
                }}
              />
              <div className="mt-2">
                <Link to={`/admin/jobs/${activeJobId}`} className="small text-muted">
                  <i className="fas fa-external-link-alt me-1" />{t('gal_publish_view_logs')}
                </Link>
              </div>
            </div>
          )}

          {/* Upload zone */}
          <AdminCard title={t('upload_photos')} className="mb-4">
            <UploadZone
              galleryId={galleryId}
              onDone={() => refreshPhotos().then(p => { if (p.some(x => !x.thumbnail?.sm)) startPolling(); })}
            />
          </AdminCard>

          {/* Photo grid */}
          <AdminCard title={t('photos_list_title', { n: photos.length })} noPadding>
            {photos.length === 0 ? (
              <div className="text-center text-muted py-5">{t('no_photos')}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', padding: '1rem' }}>
                {photos.map((p, i) => (
                  <div
                    key={p.file}
                    style={{ position: 'relative', border: '1px solid #dee2e6', borderRadius: 6, overflow: 'hidden', cursor: 'grab', opacity: dragIdx === i ? 0.5 : 1 }}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDragEnd={onDragEnd}
                  >
                    {p.thumbnail?.sm ? (
                      <img
                        src={p.thumbnail.sm}
                        alt={p.file}
                        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '4/3', background: 'linear-gradient(135deg,#e5e7eb,#d1d5db)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fas fa-image" style={{ fontSize: '1.5rem', color: '#9ca3af' }} />
                      </div>
                    )}
                    <div style={{ padding: '0.25rem 0.4rem', fontSize: '0.7rem', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.file}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(p.file)}
                        disabled={deleting === p.file}
                        title={t('delete')}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}
                      >
                        <i className="fas fa-times" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </>
      )}
    </AdminPage>
  );
}
