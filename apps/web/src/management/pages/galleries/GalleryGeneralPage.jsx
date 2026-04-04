// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { slugify } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast } from '../../../components/ui/index.js';

export default function GalleryGeneralPage() {
  const t = useT();
  const { orgId, projectId, galleryId } = useParams();
  const navigate = useNavigate();

  const [photographers, setPhotographers] = useState([]);

  const [form, setForm] = useState({
    title: '', slug: '', description: '', descriptionMd: '', locale: 'en',
    standalone: false, primaryPhotographerId: '', date: '', author: '',
  });

  const [slugEdited, setSlugEdited] = useState(false);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');
  const [photoCount, setPhotoCount] = useState(null);

  // Flush dist
  const [flushConfirm, setFlushConfirm] = useState(false);
  const [flushing,     setFlushing]     = useState(false);
  const [flushError,   setFlushError]   = useState('');

  // Delete gallery
  const [showDelete,   setShowDelete]   = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  // Upload links
  const [links,        setLinks]        = useState([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linkLabel,    setLinkLabel]    = useState('');
  const [creating,     setCreating]     = useState(false);
  const [linkError,    setLinkError]    = useState('');
  const [copied,       setCopied]       = useState('');

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.listOrgPhotographers(orgId)]).then(([g, pgs]) => {
      setForm({
        title: g.title || '', slug: g.slug || '', description: g.description || '',
        descriptionMd: g.descriptionMd || '',
        locale: g.locale || 'en', standalone: !!g.standalone,
        primaryPhotographerId: g.primaryPhotographerId || '', date: g.date || '',
        author: g.author || '',
      });
      setSlugEdited(true);
      setPhotographers(pgs);
    }).catch(() => {});
    api.listPhotos(galleryId).then(photos => setPhotoCount(photos.length)).catch(() => {});
    loadLinks();
  }, [galleryId, orgId]);

  function loadLinks() {
    setLinksLoading(true);
    api.listUploadLinks(galleryId).then(setLinks).catch(() => {}).finally(() => setLinksLoading(false));
  }

  function handleTitleChange(e) {
    const title = e.target.value;
    setForm(f => ({ ...f, title, slug: slugEdited ? f.slug : slugify(title) }));
  }

  function handleSlugChange(e) {
    setSlugEdited(true);
    setForm(f => ({ ...f, slug: e.target.value }));
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function saveGallery(patch) {
    setError('');
    const payload = {
      title: patch.title, slug: patch.slug, description: patch.description,
      descriptionMd: patch.descriptionMd ?? null,
      locale: patch.locale, standalone: patch.standalone,
      primaryPhotographerId: patch.primaryPhotographerId || null,
      date: patch.date || null,
    };
    try {
      await api.updateGallery(galleryId, payload);
      setToast(t('changes_saved'));
    } catch (err) {
      setError(err.message);
    }
  }

  const flushDist = useCallback(async () => {
    setFlushing(true); setFlushError('');
    try {
      await api.flushGalleryDist(galleryId);
      setFlushConfirm(false);
      navigate(0);
    } catch (err) {
      setFlushError(err.message);
    } finally {
      setFlushing(false);
    }
  }, [galleryId, navigate]);

  async function deleteGallery() {
    if (confirmTitle.trim() !== form.title) return;
    setDeleting(true); setDeleteError('');
    try {
      await api.deleteGallery(galleryId);
      navigate(`/admin/organizations/${orgId}/projects/${projectId}`);
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  async function createLink(e) {
    e.preventDefault();
    setCreating(true); setLinkError('');
    try {
      await api.createUploadLink(galleryId, { label: linkLabel.trim() || undefined });
      setLinkLabel('');
      loadLinks();
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function revokeLink(linkId) {
    try { await api.revokeUploadLink(galleryId, linkId); loadLinks(); } catch {}
  }

  function copy(url) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  const canDelete = confirmTitle.trim() === form.title;

  return (
    <AdminPage title={form.title ? t('gal_settings_title', { title: form.title }) : t('nav_settings')}>
      <AdminToast message={toast} onDone={() => setToast('')} />
      <div className="row">
        <div className="col-lg-7">
          <div>

            {/* Identity */}
            <AdminCard title={t('branding_identity_section')}>
              <div className="mb-3">
                <label className="form-label">{t('field_title')}</label>
                <input className="form-control" value={form.title} onChange={handleTitleChange}
                  onBlur={() => saveGallery(form)} required />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('orgs_th_slug')}</label>
                <div className="input-group">
                  <span className="input-group-text text-muted">/</span>
                  <input className="form-control" value={form.slug} onChange={handleSlugChange}
                    onBlur={() => saveGallery(form)} required pattern="[-a-z0-9]+" />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">{t('field_description')}</label>
                <textarea className="form-control" rows={2} value={form.description}
                  onChange={set('description')} onBlur={() => saveGallery(form)}
                  placeholder={t('gal_description_placeholder')} />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('gal_primary_photographer')}</label>
                <select className="form-select" value={form.primaryPhotographerId}
                  onChange={e => { const next = { ...form, primaryPhotographerId: e.target.value }; setForm(next); saveGallery(next); }}>
                  <option value="">{t('gal_no_primary_photographer')}</option>
                  {photographers.map(pg => (
                    <option key={pg.id} value={pg.id}>{pg.name}</option>
                  ))}
                </select>
                <div className="form-text">{t('gal_primary_photographer_hint')}</div>
              </div>
              <div className="mb-3">
                <label className="form-label">{t('field_locale')}</label>
                <input className="form-control" value={form.locale} onChange={set('locale')}
                  onBlur={() => saveGallery(form)} placeholder="en" />
              </div>
              <div className="mb-0">
                <label className="form-label">{t('field_date')}</label>
                <input className="form-control" type="date" value={form.date}
                  onChange={set('date')} onBlur={() => saveGallery(form)}
                  style={{ maxWidth: 220 }} />
                <div className="form-text">{t('gal_date_hint')}</div>
              </div>
            </AdminCard>

            {/* Long description (Markdown) */}
            <AdminCard title={t('gal_description_md_title')}>
              <p className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>{t('gal_description_md_hint')}</p>
              <MDEditor
                value={form.descriptionMd}
                onChange={val => setForm(f => ({ ...f, descriptionMd: val ?? '' }))}
                preview="edit"
                height={250}
              />
              <div className="d-flex justify-content-end mt-2">
                <AdminButton size="sm" onClick={() => saveGallery(form)}>
                  {t('save')}
                </AdminButton>
              </div>
            </AdminCard>

            {/* Build */}
            <AdminCard title={t('gal_general_build_section')}>
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" id="standalone-toggle"
                  checked={form.standalone}
                  onChange={e => { const next = { ...form, standalone: e.target.checked }; setForm(next); saveGallery(next); }} />
                <label className="form-check-label" htmlFor="standalone-toggle">
                  {t('gal_general_standalone_label')}
                </label>
                <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_general_standalone_hint')}</div>
              </div>
            </AdminCard>

            <AdminAlert message={error} />
          </div>

          {/* Upload links */}
          <AdminCard title={t('gal_upload_links_section')} className="mb-4">
            {linksLoading ? (
              <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : links.length === 0 ? (
              <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>{t('gal_upload_no_links')}</p>
            ) : (
              <div className="table-responsive">
              <table className="table table-sm table-hover mb-3">
                <thead className="table-light">
                  <tr>
                    <th>{t('gal_upload_th_label')}</th>
                    <th>{t('gal_upload_th_token')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map(l => {
                    const uploadUrl = l.uploadUrl || '';
                    const tokenPreview = uploadUrl ? uploadUrl.split('/').pop().slice(0, 12) : '—';
                    return (
                      <tr key={l.id}>
                        <td>{l.label || <em className="text-muted">{t('gal_upload_unnamed')}</em>}</td>
                        <td><code style={{ fontSize: '0.78rem' }}>{tokenPreview}…</code></td>
                        <td className="text-end">
                          <AdminButton variant="outline-secondary" size="sm" className="me-1"
                            onClick={() => copy(uploadUrl)} aria-label="Copy upload URL">
                            <i className={`fas ${copied === uploadUrl ? 'fa-check text-success' : 'fa-copy'}`} aria-hidden="true" />
                          </AdminButton>
                          <AdminButton variant="outline-danger" size="sm" onClick={() => revokeLink(l.id)} aria-label="Revoke link">
                            <i className="fas fa-times" aria-hidden="true" />
                          </AdminButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            <AdminAlert message={linkError} />
            <form onSubmit={createLink} className="d-flex gap-2 align-items-end">
              <div style={{ flex: 1 }}>
                <label className="form-label mb-1" style={{ fontSize: '0.85rem' }}>
                  {t('gal_upload_th_label')} <span className="text-muted">{t('gal_upload_label_optional')}</span>
                </label>
                <input className="form-control form-control-sm" value={linkLabel}
                  onChange={e => setLinkLabel(e.target.value)} placeholder={t('gal_upload_placeholder')} />
              </div>
              <AdminButton type="submit" size="sm" loading={creating} icon="fas fa-plus">
                {t('create')}
              </AdminButton>
            </form>
            <div className="form-text mt-2">{t('gal_upload_hint')}</div>
          </AdminCard>

          {/* Danger zone */}
          <h6 className="text-danger fw-bold mb-2" style={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
            <i className="fas fa-exclamation-triangle me-1" />{t('gal_general_danger_zone')}
          </h6>
          <div style={{ border: '1px solid #f87171', borderRadius: 8, marginBottom: '3rem' }}>

            {/* Flush dist */}
            <div className="d-flex align-items-center justify-content-between gap-3 p-3">
              <div>
                <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{t('gal_general_flush_title')}</div>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>{t('gal_general_flush_desc')}</div>
              </div>
              <AdminButton variant="outline-danger" size="sm" onClick={() => setFlushConfirm(true)}>
                {t('gal_general_flush_btn')}
              </AdminButton>
            </div>
            {flushError && <div className="px-3 pb-2"><AdminAlert message={flushError} className="mb-0" /></div>}

            {/* Delete gallery */}
            <div style={{ borderTop: '1px solid #fca5a5' }}>
              <div className="d-flex align-items-center justify-content-between gap-3 p-3">
                <div>
                  <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{t('gal_delete_title')}</div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>{t('gal_delete_desc')}</div>
                </div>
                <AdminButton variant="outline-danger" size="sm"
                  onClick={() => { setShowDelete(v => !v); setConfirmTitle(''); setDeleteError(''); }}>
                  {t('gal_delete_btn')}
                </AdminButton>
              </div>

              {showDelete && (
                <div style={{ borderTop: '1px solid #fca5a5', background: '#fff5f5', borderRadius: '0 0 7px 7px', padding: '1rem 1.25rem' }}>
                  {photoCount > 0 && (
                    <div className="mb-3 fw-semibold" style={{ fontSize: '0.82rem', color: '#b91c1c' }}>
                      <i className="fas fa-images me-1" />
                      {t('gal_delete_photos_warning', { n: photoCount })}
                    </div>
                  )}
                  <label className="form-label fw-semibold" style={{ fontSize: '0.82rem' }}>
                    {t('gal_delete_confirm_label', { title: form.title })}
                  </label>
                  <input
                    className="form-control form-control-sm mb-2"
                    style={{ borderColor: '#f87171', maxWidth: 320 }}
                    value={confirmTitle}
                    onChange={e => setConfirmTitle(e.target.value)}
                    placeholder={form.title}
                    autoFocus
                  />
                  {deleteError && <div className="text-danger small mb-2">{deleteError}</div>}
                  <div className="d-flex gap-2">
                    <AdminButton variant="danger" size="sm" disabled={!canDelete}
                      loading={deleting} loadingLabel={t('gal_deleting')} onClick={deleteGallery}>
                      <i className="fas fa-trash me-1" />{t('gal_delete_confirm_btn')}
                    </AdminButton>
                    <AdminButton variant="outline-secondary" size="sm"
                      onClick={() => setShowDelete(false)} disabled={deleting}>
                      {t('cancel')}
                    </AdminButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Flush confirmation modal */}
      {flushConfirm && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 1055 }}
          onClick={() => !flushing && setFlushConfirm(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header border-0">
                <h5 className="modal-title">{t('gal_general_flush_confirm_title')}</h5>
              </div>
              <div className="modal-body">
                <p>{t('gal_general_flush_warning', { title: form.title })}</p>
              </div>
              <div className="modal-footer border-0">
                <AdminButton variant="secondary" onClick={() => setFlushConfirm(false)} disabled={flushing}>{t('cancel')}</AdminButton>
                <AdminButton variant="danger" loading={flushing} loadingLabel={t('gal_general_flushing')} onClick={flushDist}>
                  {t('gal_general_flush_title')}
                </AdminButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
