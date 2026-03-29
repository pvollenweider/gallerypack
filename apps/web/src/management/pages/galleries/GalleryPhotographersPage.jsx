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
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast } from '../../../components/ui/index.js';

export default function GalleryPhotographersPage() {
  const t = useT();
  const { galleryId } = useParams();

  // Photographers list
  const [photographers, setPhotographers] = useState([]);
  const [loadingPg,     setLoadingPg]     = useState(true);

  // Photos list (for attribution grid)
  const [photos,        setPhotos]        = useState([]);
  const [loadingPh,     setLoadingPh]     = useState(true);

  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Create / edit form
  const [editing,   setEditing]   = useState(null); // null = hidden, {} = new, {id,...} = edit
  const [form,      setForm]      = useState({ name: '', email: '', bio: '' });
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null);

  // Attribution
  const [selected,    setSelected]    = useState(new Set());
  const [assigning,   setAssigning]   = useState(false);

  function loadPhotographers() {
    return api.listPhotographers(galleryId)
      .then(setPhotographers)
      .catch(e => setError(e.message));
  }

  function loadPhotos() {
    return api.listPhotos(galleryId)
      .then(setPhotos)
      .catch(() => {});
  }

  useEffect(() => {
    Promise.all([
      loadPhotographers().finally(() => setLoadingPg(false)),
      loadPhotos().finally(() => setLoadingPh(false)),
    ]);
  }, [galleryId]); // eslint-disable-line

  // ── Create / edit ────────────────────────────────────────────────────────────

  function openNew() {
    setEditing({});
    setForm({ name: '', email: '', bio: '' });
  }

  function openEdit(pg) {
    setEditing(pg);
    setForm({ name: pg.name || '', email: pg.email || '', bio: pg.bio || '' });
  }

  function cancelEdit() { setEditing(null); }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing?.id) {
        await api.updatePhotographer(galleryId, editing.id, form);
      } else {
        await api.createPhotographer(galleryId, form);
      }
      setEditing(null);
      await loadPhotographers();
      setToast(t('settings_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pgId) {
    if (!confirm(t('pg_delete_confirm'))) return;
    setDeleting(pgId);
    try {
      await api.deletePhotographer(galleryId, pgId);
      await loadPhotographers();
      await loadPhotos(); // refresh attribution indicators
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  // ── Attribution ──────────────────────────────────────────────────────────────

  function togglePhoto(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === photos.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(photos.map(p => p.id)));
    }
  }

  async function assign(pgId) {
    if (selected.size === 0) return;
    setAssigning(true);
    try {
      await api.bulkSetPhotographer(galleryId, {
        photoIds: [...selected],
        photographerId: pgId || null,
      });
      await loadPhotos();
      setSelected(new Set());
      setToast(t('settings_saved'));
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setAssigning(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function pgName(id) {
    return photographers.find(p => p.id === id)?.name ?? '—';
  }

  const loading = loadingPg || loadingPh;

  return (
    <AdminPage
      title={t('nav_photographers')}
      actions={
        !editing && (
          <AdminButton size="sm" icon="fas fa-user-plus" onClick={openNew}>
            {t('pg_add')}
          </AdminButton>
        )
      }
    >
      <AdminAlert message={error} onDismiss={() => setError('')} />
      <AdminToast message={toast} onDone={() => setToast('')} />

      {loading && (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-spinner fa-spin fa-2x" />
        </div>
      )}

      {!loading && (
        <div className="row g-4">
          {/* ── Left column: photographer list + form ── */}
          <div className="col-lg-4">
            {/* Create / edit form */}
            {editing !== null && (
              <AdminCard title={editing?.id ? t('pg_edit') : t('pg_add')} className="mb-3">
                <form onSubmit={handleSave}>
                  <div className="mb-3">
                    <label className="form-label">{t('pg_name')} *</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">{t('pg_email')}</label>
                    <input
                      className="form-control form-control-sm"
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">{t('pg_bio')}</label>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <AdminButton type="submit" size="sm" loading={saving} loadingLabel={t('saving')}>
                      {t('save')}
                    </AdminButton>
                    <AdminButton type="button" variant="outline-secondary" size="sm" onClick={cancelEdit}>
                      {t('cancel')}
                    </AdminButton>
                  </div>
                </form>
              </AdminCard>
            )}

            {/* Photographer list */}
            <AdminCard title={t('tab_photographers')}>
              {photographers.length === 0 ? (
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>{t('pg_none')}</p>
              ) : (
                <ul className="list-unstyled mb-0">
                  {photographers.map(pg => {
                    const photoCount = photos.filter(p => p.photographer_id === pg.id).length;
                    return (
                      <li key={pg.id}
                        className="d-flex align-items-start gap-2 py-2"
                        style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{pg.name}</div>
                          {pg.email && (
                            <div className="text-muted" style={{ fontSize: '0.78rem' }}>{pg.email}</div>
                          )}
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {photoCount} {t('pg_photos_count')}
                          </div>
                        </div>
                        <div className="d-flex gap-1 flex-shrink-0">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            style={{ padding: '2px 7px', fontSize: '0.75rem' }}
                            onClick={() => openEdit(pg)}
                            title={t('pg_edit')}
                          >
                            <i className="fas fa-pen" />
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            style={{ padding: '2px 7px', fontSize: '0.75rem' }}
                            onClick={() => handleDelete(pg.id)}
                            disabled={deleting === pg.id}
                            title={t('pg_delete')}
                          >
                            {deleting === pg.id
                              ? <i className="fas fa-spinner fa-spin" />
                              : <i className="fas fa-trash" />}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </AdminCard>
          </div>

          {/* ── Right column: photo attribution grid ── */}
          <div className="col-lg-8">
            <AdminCard
              title={t('pg_attribution_title')}
              headerRight={
                photos.length > 0 && (
                  <div className="d-flex align-items-center gap-2">
                    {selected.size > 0 && (
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                        {t('pg_selected', { n: selected.size })}
                      </span>
                    )}
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                      onClick={toggleAll}
                    >
                      {selected.size === photos.length ? t('pg_deselect_all') : t('pg_select_all')}
                    </button>
                  </div>
                )
              }
            >
              {/* Bulk assign bar */}
              {selected.size > 0 && (
                <div className="d-flex align-items-center gap-2 mb-3 p-2 rounded"
                  style={{ background: '#f0f7ff', border: '1px solid #c3dafe', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                  <span className="fw-medium">{t('pg_assign_to')}:</span>
                  {photographers.map(pg => (
                    <button
                      key={pg.id}
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '0.78rem', padding: '2px 10px' }}
                      onClick={() => assign(pg.id)}
                      disabled={assigning}
                    >
                      {pg.name}
                    </button>
                  ))}
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    style={{ fontSize: '0.78rem', padding: '2px 10px' }}
                    onClick={() => assign(null)}
                    disabled={assigning}
                  >
                    {t('pg_unassign')}
                  </button>
                </div>
              )}

              {photos.length === 0 ? (
                <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>{t('no_photos')}</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' }}>
                  {photos.map(p => {
                    const isSelected = selected.has(p.id);
                    const assignedPg = p.photographer_id ? pgName(p.photographer_id) : null;
                    return (
                      <div
                        key={p.id}
                        onClick={() => togglePhoto(p.id)}
                        style={{
                          position: 'relative',
                          border: `2px solid ${isSelected ? '#3b82f6' : '#dee2e6'}`,
                          borderRadius: 6,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          background: isSelected ? '#eff6ff' : '#fff',
                        }}
                      >
                        {/* Selection indicator */}
                        <div style={{
                          position: 'absolute', top: 4, left: 4, zIndex: 2,
                          width: 18, height: 18, borderRadius: '50%',
                          background: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.85)',
                          border: `2px solid ${isSelected ? '#3b82f6' : '#9ca3af'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isSelected && <i className="fas fa-check" style={{ fontSize: '0.55rem', color: '#fff' }} />}
                        </div>

                        {p.thumbnail?.sm ? (
                          <img
                            src={p.thumbnail.sm}
                            alt={p.file}
                            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                            loading="lazy"
                          />
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '4/3', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-image" style={{ color: '#9ca3af' }} />
                          </div>
                        )}

                        <div style={{ padding: '2px 4px', fontSize: '0.65rem', color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.file}
                        </div>
                        {assignedPg && (
                          <div style={{ padding: '0 4px 3px', fontSize: '0.65rem', color: '#2563eb', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <i className="fas fa-user me-1" style={{ fontSize: '0.6rem' }} />
                            {assignedPg}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </AdminCard>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
