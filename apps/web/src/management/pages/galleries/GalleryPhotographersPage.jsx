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

  const [photographers, setPhotographers] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [toast,         setToast]         = useState('');

  // Create / edit form
  const [editing,  setEditing]  = useState(null); // null = hidden, {} = new, {id,...} = edit
  const [form,     setForm]     = useState({ name: '', email: '', bio: '' });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);

  function load() {
    return api.listPhotographers(galleryId)
      .then(setPhotographers)
      .catch(e => setError(e.message));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [galleryId]); // eslint-disable-line

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
      await load();
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
      await load();
    } catch (err) {
      setToast(`${t('error')}: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

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

      {loading ? (
        <div className="text-center py-5 text-muted">
          <i className="fas fa-spinner fa-spin fa-2x" />
        </div>
      ) : (
        <div className="row">
          <div className="col-lg-5">
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
                  {photographers.map(pg => (
                    <li key={pg.id}
                      className="d-flex align-items-start gap-2 py-2"
                      style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{pg.name}</div>
                        {pg.email && (
                          <div className="text-muted" style={{ fontSize: '0.78rem' }}>{pg.email}</div>
                        )}
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {pg.photo_count ?? 0} {t('pg_photos_count')}
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
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
