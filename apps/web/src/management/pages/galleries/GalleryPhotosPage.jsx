// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { UploadZone } from '../../../components/UploadZone.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast } from '../../../components/ui/index.js';

const CAN_EDIT_ROLES = ['collaborator', 'admin', 'owner'];

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

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.listPhotos(galleryId)])
      .then(([g, p]) => { setGallery(g); setPhotos(p); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [galleryId]);

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

  const publicPath = (gallery?.breadcrumb?.project?.slug && gallery?.access !== 'password' && gallery?.access !== 'private')
    ? `/${gallery.breadcrumb.project.slug}/${gallery.slug}`
    : `/${gallery?.slug}`;

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
            title={sortAsc ? t('gal_photos_sort_asc') : t('gal_photos_sort_desc')}
            onClick={() => { const next = !sortAsc; setSortAsc(next); sortPhotos(next ? 'asc' : 'desc'); }}
          >
            {sortAsc ? t('gal_photos_sort_asc') : t('gal_photos_sort_desc')}
          </AdminButton>
        </div>
      }
    >
      {loading && <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>}
      <AdminAlert message={error} />
      <AdminToast message={toast} onDone={() => setToast('')} />

      {!loading && gallery && (
        <>
          <AdminCard title={t('upload_photos')} className="mb-4">
            <UploadZone
              galleryId={galleryId}
              onDone={() => api.listPhotos(galleryId).then(setPhotos)}
            />
          </AdminCard>

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
                    <img
                      src={p.thumb
                        ? `${publicPath}/img/grid/${p.thumb}.webp`
                        : `/api/galleries/${galleryId}/photos/${encodeURIComponent(p.file)}/preview`}
                      alt={p.file}
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                    />
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
