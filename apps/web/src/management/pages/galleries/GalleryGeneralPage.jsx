// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { slugify } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';
import InheritedValue from '../../components/InheritedValue.jsx';

export default function GalleryGeneralPage() {
  const t = useT();
  const { orgId, projectId, galleryId } = useParams();
  const navigate = useNavigate();

  // Main form — identity + access + downloads + build (all → api.updateGallery)
  const [form, setForm] = useState({
    title: '', slug: '', locale: 'en', standalone: false,
    access: 'public', password: '',
    downloadMode: 'display', apacheProtection: false,
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState('');
  const [error,   setError]   = useState('');
  const [orgDefault, setOrgDefault] = useState(null);
  const [photoCount, setPhotoCount] = useState(null);

  // Strip originals (downloads section)
  const [stripping,    setStripping]    = useState(false);
  const [stripResult,  setStripResult]  = useState(null);
  const [stripError,   setStripError]   = useState('');

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
  const [links,       setLinks]       = useState([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linkLabel,   setLinkLabel]   = useState('');
  const [creating,    setCreating]    = useState(false);
  const [linkError,   setLinkError]   = useState('');
  const [copied,      setCopied]      = useState('');

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.getSettings()]).then(([g, s]) => {
      setForm({
        title: g.title || '', slug: g.slug || '',
        locale: g.locale || 'en', standalone: !!g.standalone,
        access: g.access || 'public', password: '',
        downloadMode: g.downloadMode || 'display', apacheProtection: !!g.apacheProtection,
      });
      setSlugEdited(true);
      setOrgDefault(s?.defaultAccess ?? null);
    }).catch(() => {});
    api.listPhotos(galleryId).then(photos => setPhotoCount(photos.length)).catch(() => {});
    loadLinks();
  }, [galleryId]);

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

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    const payload = {
      title: form.title, slug: form.slug, locale: form.locale, standalone: form.standalone,
      access: form.access, downloadMode: form.downloadMode, apacheProtection: form.apacheProtection,
    };
    if (form.access === 'password' && form.password.trim()) payload.password = form.password.trim();
    try {
      await api.updateGallery(galleryId, payload);
      setSaved(t('changes_saved'));
      setForm(f => ({ ...f, password: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const stripOriginals = useCallback(async () => {
    setStripping(true); setStripError(''); setStripResult(null);
    try {
      const r = await api.stripDistOriginals(galleryId);
      setStripResult(r);
    } catch (err) {
      setStripError(err.message);
    } finally {
      setStripping(false);
    }
  }, [galleryId]);

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
  const showApacheToggle = form.standalone && form.access === 'password';
  const downloadsDisabled = form.downloadMode === 'none';

  return (
    <AdminPage title={form.title ? t('gal_settings_title', { title: form.title }) : t('nav_settings')}>
      <div className="row">
        <div className="col-lg-7">
          <form onSubmit={save}>

            {/* Identity */}
            <AdminCard title={t('branding_identity_section')}>
              <div className="mb-3">
                <label className="form-label">{t('field_title')}</label>
                <input className="form-control" value={form.title} onChange={handleTitleChange} required />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('orgs_th_slug')}</label>
                <div className="input-group">
                  <span className="input-group-text text-muted">/</span>
                  <input className="form-control" value={form.slug} onChange={handleSlugChange} required pattern="[-a-z0-9]+" />
                </div>
              </div>
              <div className="mb-0">
                <label className="form-label">{t('field_locale')}</label>
                <input className="form-control" value={form.locale} onChange={set('locale')} placeholder="en" />
              </div>
            </AdminCard>

            {/* Access */}
            <AdminCard title={t('gal_access_visibility')}>
              {['public', 'private', 'password'].map(v => (
                <div key={v} className="form-check mb-2">
                  <input className="form-check-input" type="radio" name="access" id={`access-${v}`}
                    value={v} checked={form.access === v} onChange={set('access')} />
                  <label className="form-check-label" htmlFor={`access-${v}`}>
                    {v === 'public'   && t('access_public_full')}
                    {v === 'private'  && t('access_private_full')}
                    {v === 'password' && t('access_password_full')}
                  </label>
                </div>
              ))}
              {form.access === 'password' && (
                <div className="mt-3">
                  <label className="form-label">{t('field_password')}</label>
                  <input className="form-control" type="password" value={form.password}
                    onChange={set('password')} placeholder={t('gal_access_password_hint')}
                    autoComplete="new-password" style={{ maxWidth: 300 }} />
                </div>
              )}
              {orgDefault && (
                <InheritedValue label={t('org_default_label')}>{orgDefault}</InheritedValue>
              )}
            </AdminCard>

            {/* Downloads */}
            <AdminCard title={t('gal_downloads_section')}>
              <label className="form-label">{t('download_mode_label')}</label>
              <select className="form-select" value={form.downloadMode}
                onChange={e => setForm(f => ({ ...f, downloadMode: e.target.value }))}>
                <option value="none">{t('download_mode_none')}</option>
                <option value="display">{t('download_mode_display')}</option>
                <option value="original">{t('download_mode_original')}</option>
              </select>
              <div className="text-muted mt-2 mb-0" style={{ fontSize: '0.8rem' }}>
                {form.downloadMode === 'none'     && t('download_mode_none_hint')}
                {form.downloadMode === 'display'  && t('download_mode_display_hint')}
                {form.downloadMode === 'original' && t('download_mode_original_hint')}
              </div>
              {showApacheToggle && (
                <div className="form-check form-switch mt-3 mb-0">
                  <input className="form-check-input" type="checkbox" id="apacheProtection"
                    checked={form.apacheProtection}
                    onChange={e => setForm(f => ({ ...f, apacheProtection: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="apacheProtection">
                    {t('gal_downloads_apache_label')}
                  </label>
                  <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_downloads_apache_hint')}</div>
                </div>
              )}
              {downloadsDisabled && (
                <div className="alert alert-warning d-flex align-items-start gap-3 mt-3 mb-0" role="alert">
                  <i className="fas fa-exclamation-triangle mt-1" />
                  <div style={{ flex: 1 }}>
                    <strong>{t('gal_downloads_disabled')}</strong>
                    <div className="mt-1" style={{ fontSize: '0.85rem' }}>{t('gal_downloads_strip_hint')}</div>
                    {stripResult && <div className="mt-1 text-success small">{stripResult.message}</div>}
                    {stripError  && <div className="mt-1 text-danger  small">{stripError}</div>}
                  </div>
                  <AdminButton variant="outline-warning" size="sm" loading={stripping}
                    loadingLabel={t('gal_downloads_stripping')} onClick={stripOriginals}>
                    {t('gal_downloads_strip_btn')}
                  </AdminButton>
                </div>
              )}
            </AdminCard>

            {/* Build */}
            <AdminCard title={t('gal_general_build_section')}>
              <div className="form-check form-switch mb-0">
                <input className="form-check-input" type="checkbox" id="standalone-toggle"
                  checked={form.standalone}
                  onChange={e => setForm(f => ({ ...f, standalone: e.target.checked }))} />
                <label className="form-check-label" htmlFor="standalone-toggle">
                  {t('gal_general_standalone_label')}
                </label>
                <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_general_standalone_hint')}</div>
              </div>
            </AdminCard>

            <AdminAlert variant="success" message={saved} />
            <AdminAlert message={error} />
            <AdminButton type="submit" loading={saving} loadingLabel={t('saving')} className="mb-5">
              {t('save')}
            </AdminButton>
          </form>

          {/* Upload links / Photographers */}
          <AdminCard title={t('gal_upload_links_section')} className="mb-4">
            {linksLoading ? (
              <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : links.length === 0 ? (
              <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>{t('gal_upload_no_links')}</p>
            ) : (
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
