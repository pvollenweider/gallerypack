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
import InheritedValue from '../../components/InheritedValue.jsx';

export default function GalleryGeneralPage() {
  const t = useT();
  const { orgId, projectId, galleryId } = useParams();
  const navigate = useNavigate();

  // Photographers list (for primary photographer selector)
  const [photographers, setPhotographers] = useState([]);

  // Main form — identity + access + downloads + build (all → api.updateGallery)
  const [form, setForm] = useState({
    title: '', slug: '', description: '', descriptionMd: '', locale: 'en', standalone: false,
    access: 'public', password: '',
    downloadMode: 'display', allowDownloadGallery: false, apacheProtection: false,
    primaryPhotographerId: '', date: '', galleryMode: null,
  });

  // Watermark (saved separately via configJson)
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText,    setWatermarkText]    = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error,      setError]      = useState('');
  const [toast,      setToast]      = useState('');
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

  // Gallery metadata (for share URL)
  const [galleryMeta, setGalleryMeta] = useState({ distName: null, projectSlug: null, buildStatus: null });

  // Viewer tokens (client sharing)
  const [viewerTokens,  setViewerTokens]  = useState([]);
  const [vtLabel,       setVtLabel]       = useState('');
  const [vtExpiry,      setVtExpiry]      = useState('');
  const [vtCreating,    setVtCreating]    = useState(false);
  const [vtError,       setVtError]       = useState('');
  const [freshLink,     setFreshLink]     = useState(null); // { url } — shown once
  const [copiedVt,      setCopiedVt]      = useState(false);

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.getSettings(), api.listOrgPhotographers(orgId)]).then(([g, s, pgs]) => {
      setForm({
        title: g.title || '', slug: g.slug || '', description: g.description || '',
        descriptionMd: g.descriptionMd || '',
        locale: g.locale || 'en', standalone: !!g.standalone,
        access: g.access || 'public', password: '',
        downloadMode: g.downloadMode || 'display', allowDownloadGallery: !!g.allowDownloadGallery, apacheProtection: !!g.apacheProtection,
        primaryPhotographerId: g.primaryPhotographerId || '', date: g.date || '',
        galleryMode: g.mode ?? null,
      });
      setWatermarkEnabled(g.watermark?.enabled ?? false);
      setWatermarkText(g.watermark?.text || (g.author ? `© ${g.author}` : g.title ? `© ${g.title}` : ''));
      setSlugEdited(true);
      setOrgDefault(s?.defaultAccess ?? null);
      setPhotographers(pgs);
      setGalleryMeta({
        distName:    g.distName || g.slug,
        projectSlug: g.breadcrumb?.project?.slug ?? null,
        buildStatus: g.buildStatus,
      });
    }).catch(() => {});
    api.listPhotos(galleryId).then(photos => setPhotoCount(photos.length)).catch(() => {});
    loadLinks();
    loadViewerTokens();
  }, [galleryId]);

  function loadLinks() {
    setLinksLoading(true);
    api.listUploadLinks(galleryId).then(setLinks).catch(() => {}).finally(() => setLinksLoading(false));
  }

  function loadViewerTokens() {
    api.getViewerTokens(galleryId).then(setViewerTokens).catch(() => {});
  }

  function buildShareUrl(rawToken) {
    const { distName, projectSlug } = galleryMeta;
    const name = distName || form.slug;
    const base = window.location.origin;
    const path = projectSlug ? `/${projectSlug}/${name}/` : `/${name}/`;
    return `${base}${path}?vt=${rawToken}`;
  }

  async function createViewerToken(e) {
    e.preventDefault();
    setVtCreating(true); setVtError('');
    try {
      const data = {};
      if (vtLabel.trim()) data.label = vtLabel.trim();
      if (vtExpiry) data.expiresAt = new Date(vtExpiry).getTime();
      const vt = await api.createViewerToken(galleryId, data);
      setViewerTokens(ts => [{ id: vt.id, label: vt.label, expires_at: vt.expires_at, created_at: vt.created_at }, ...ts]);
      setFreshLink({ url: buildShareUrl(vt.token), label: vt.label });
      setCopiedVt(false);
      setVtLabel('');
      setVtExpiry('');
    } catch (err) { setVtError(err.message); }
    finally { setVtCreating(false); }
  }

  async function revokeViewerToken(tokenId) {
    try {
      await api.deleteViewerToken(galleryId, tokenId);
      setViewerTokens(ts => ts.filter(t => t.id !== tokenId));
      if (freshLink) setFreshLink(null);
    } catch {}
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
      access: patch.access, downloadMode: patch.downloadMode,
      allowDownloadGallery: patch.allowDownloadGallery, apacheProtection: patch.apacheProtection,
      primaryPhotographerId: patch.primaryPhotographerId || null,
      date: patch.date || null,
      galleryMode: patch.galleryMode ?? null,
    };
    if (patch.access === 'password' && patch.password?.trim()) payload.password = patch.password.trim();
    try {
      await api.updateGallery(galleryId, payload);
      setToast(t('changes_saved'));
      if (patch.password) setForm(f => ({ ...f, password: '' }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveWatermark(enabled, text) {
    setError('');
    try {
      await api.updateGallery(galleryId, { configJson: JSON.stringify({ watermark: { enabled, text } }) });
      setToast(t('changes_saved'));
    } catch (err) {
      setError(err.message);
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
  const showShareSection = form.access === 'private';
  const downloadsDisabled = form.downloadMode === 'none';
  const modeLockedDownloads = !!form.galleryMode;
  const modeLockedWatermark = !!form.galleryMode;

  // Watermark enabled by policy for each mode (null = custom, no lock)
  const MODE_WATERMARK = { portfolio: false, client_preview: true, client_delivery: true, archive: false };
  const modeWatermarkEnabled = form.galleryMode ? (MODE_WATERMARK[form.galleryMode] ?? false) : null;

  // Auto-compute watermark text from primary photographer name, fallback to author/title
  const autoWatermarkText = (() => {
    if (form.primaryPhotographerId) {
      const pg = photographers.find(p => p.id === form.primaryPhotographerId);
      if (pg?.name) return `© ${pg.name}`;
    }
    if (form.author) return `© ${form.author}`;
    return form.title ? `© ${form.title}` : '';
  })();

  const MODES = [
    { value: 'portfolio',       labelKey: 'gal_mode_portfolio',       descKey: 'gal_mode_portfolio_desc' },
    { value: 'client_preview',  labelKey: 'gal_mode_client_preview',  descKey: 'gal_mode_client_preview_desc' },
    { value: 'client_delivery', labelKey: 'gal_mode_client_delivery', descKey: 'gal_mode_client_delivery_desc' },
    { value: 'archive',         labelKey: 'gal_mode_archive',         descKey: 'gal_mode_archive_desc' },
  ];

  const MODE_BADGE_COLOR = {
    portfolio:       { bg: '#e0f2fe', color: '#0369a1' },
    client_preview:  { bg: '#fef9c3', color: '#854d0e' },
    client_delivery: { bg: '#dcfce7', color: '#166534' },
    archive:         { bg: '#f3e8ff', color: '#6b21a8' },
  };

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

            {/* Access */}
            <AdminCard title={t('gal_access_visibility')}>
              {['public', 'private', 'password'].map(v => (
                <div key={v} className="form-check mb-2">
                  <input className="form-check-input" type="radio" name="access" id={`access-${v}`}
                    value={v} checked={form.access === v}
                    onChange={e => { const next = { ...form, access: e.target.value }; setForm(next); saveGallery(next); }} />
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
                    onChange={set('password')} onBlur={() => { if (form.password) saveGallery(form); }}
                    placeholder={t('gal_access_password_hint')}
                    autoComplete="new-password" style={{ maxWidth: 300 }} />
                </div>
              )}
              {orgDefault && (
                <InheritedValue label={t('org_default_label')}>{orgDefault}</InheritedValue>
              )}
            </AdminCard>

            {/* Gallery Mode */}
            <AdminCard title={t('gal_mode_section')}>
              {form.galleryMode && (() => {
                const { bg, color } = MODE_BADGE_COLOR[form.galleryMode] || {};
                return (
                  <div className="mb-3 d-flex align-items-center gap-2">
                    <span style={{ background: bg, color, borderRadius: 5, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {t(`gal_mode_${form.galleryMode}`)}
                    </span>
                  </div>
                );
              })()}
              <select className="form-select" value={form.galleryMode ?? ''}
                onChange={e => {
                  const newMode = e.target.value || null;
                  const next = { ...form, galleryMode: newMode };
                  setForm(next);
                  saveGallery(next);
                  // Sync watermark state when mode changes
                  if (newMode) {
                    const shouldEnable = MODE_WATERMARK[newMode] ?? false;
                    const text = shouldEnable ? (autoWatermarkText || watermarkText) : watermarkText;
                    if (shouldEnable !== watermarkEnabled || (shouldEnable && !watermarkText)) {
                      setWatermarkEnabled(shouldEnable);
                      if (shouldEnable && !watermarkText) setWatermarkText(text);
                      saveWatermark(shouldEnable, shouldEnable ? text : watermarkText);
                    }
                  }
                }}>
                <option value="">{t('gal_mode_none')}</option>
                {MODES.map(m => (
                  <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
                ))}
              </select>
              {form.galleryMode && (
                <div className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
                  {t(`gal_mode_${form.galleryMode}_desc`)}
                </div>
              )}
            </AdminCard>

            {/* Downloads */}
            <AdminCard title={t('gal_downloads_section')}>
              {modeLockedDownloads && (
                <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3" role="alert" style={{ fontSize: '0.82rem' }}>
                  <i className="fas fa-lock" />
                  {t('gal_mode_locked_hint')}
                </div>
              )}
              <label className="form-label">{t('download_mode_label')}</label>
              <select className="form-select" value={form.downloadMode} disabled={modeLockedDownloads}
                onChange={e => { const next = { ...form, downloadMode: e.target.value }; setForm(next); saveGallery(next); }}>
                <option value="none">{t('download_mode_none')}</option>
                <option value="display">{t('download_mode_display')}</option>
                <option value="original">{t('download_mode_original')}</option>
              </select>
              <div className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
                {form.downloadMode === 'none'     && t('download_mode_none_hint')}
                {form.downloadMode === 'display'  && t('download_mode_display_hint')}
                {form.downloadMode === 'original' && t('download_mode_original_hint')}
              </div>
              {form.downloadMode !== 'none' && (
                <div className="form-check form-switch mt-3 mb-0">
                  <input className="form-check-input" type="checkbox" id="allowDownloadGallery"
                    checked={form.allowDownloadGallery} disabled={modeLockedDownloads}
                    onChange={e => { const next = { ...form, allowDownloadGallery: e.target.checked }; setForm(next); saveGallery(next); }} />
                  <label className="form-check-label" htmlFor="allowDownloadGallery">
                    {t('gal_downloads_zip_label')}
                  </label>
                  <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_downloads_zip_hint')}</div>
                </div>
              )}
              {showApacheToggle && (
                <div className="form-check form-switch mt-3 mb-0">
                  <input className="form-check-input" type="checkbox" id="apacheProtection"
                    checked={form.apacheProtection}
                    onChange={e => { const next = { ...form, apacheProtection: e.target.checked }; setForm(next); saveGallery(next); }} />
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
                  onChange={e => { const next = { ...form, standalone: e.target.checked }; setForm(next); saveGallery(next); }} />
                <label className="form-check-label" htmlFor="standalone-toggle">
                  {t('gal_general_standalone_label')}
                </label>
                <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_general_standalone_hint')}</div>
              </div>
            </AdminCard>

            {/* Watermark */}
            <AdminCard title={t('gal_watermark_section')}>
              {modeLockedWatermark && (
                <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3" role="alert" style={{ fontSize: '0.82rem' }}>
                  <i className="fas fa-lock" />
                  {t('gal_mode_locked_hint')}
                </div>
              )}
              <div className="form-check form-switch mb-3">
                <input className="form-check-input" type="checkbox" id="watermark-toggle"
                  checked={modeLockedWatermark ? modeWatermarkEnabled : watermarkEnabled}
                  disabled={modeLockedWatermark}
                  onChange={e => {
                    const enabled = e.target.checked;
                    const text = watermarkText || (enabled ? autoWatermarkText : '');
                    setWatermarkEnabled(enabled);
                    if (text !== watermarkText) setWatermarkText(text);
                    saveWatermark(enabled, text);
                  }} />
                <label className="form-check-label" htmlFor="watermark-toggle">
                  {t('gal_watermark_enable_label')}
                </label>
                <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_watermark_enable_hint')}</div>
              </div>
              {(modeLockedWatermark ? modeWatermarkEnabled : watermarkEnabled) && (
                <div>
                  <label className="form-label">{t('gal_watermark_text_label')}</label>
                  <input
                    className="form-control"
                    value={watermarkText || autoWatermarkText}
                    onChange={e => setWatermarkText(e.target.value)}
                    onBlur={() => saveWatermark(
                      modeLockedWatermark ? modeWatermarkEnabled : watermarkEnabled,
                      watermarkText || autoWatermarkText
                    )}
                    placeholder={autoWatermarkText || "© Nom de l'auteur"}
                    style={{ maxWidth: 360 }}
                  />
                </div>
              )}
            </AdminCard>

            <AdminAlert message={error} />
          </div>

          {/* Client sharing links — visible for private galleries */}
          {showShareSection && (
            <AdminCard title={t('gal_share_section')} className="mb-4">
              <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>{t('gal_share_hint')}</p>

              {/* One-time fresh link banner */}
              {freshLink && (
                <div className="alert alert-success mb-3" role="alert">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>{t('gal_share_fresh_title')}</div>
                  <div className="text-muted mb-2" style={{ fontSize: '0.8rem' }}>{t('gal_share_fresh_hint')}</div>
                  <div className="d-flex gap-2 align-items-center">
                    <code className="flex-grow-1" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{freshLink.url}</code>
                    <AdminButton size="sm" variant={copiedVt ? 'success' : 'outline-success'}
                      onClick={() => {
                        navigator.clipboard.writeText(freshLink.url);
                        setCopiedVt(true);
                      }}>
                      <i className={`fas ${copiedVt ? 'fa-check' : 'fa-copy'} me-1`} />
                      {copiedVt ? t('gal_share_copied') : t('gal_share_copy')}
                    </AdminButton>
                    <AdminButton size="sm" variant="outline-secondary" onClick={() => setFreshLink(null)}>
                      {t('gal_share_dismiss')}
                    </AdminButton>
                  </div>
                </div>
              )}

              {galleryMeta.buildStatus !== 'done' && (
                <div className="alert alert-warning py-2 mb-3" style={{ fontSize: '0.82rem' }}>
                  <i className="fas fa-exclamation-triangle me-2" />{t('gal_share_not_built')}
                </div>
              )}

              {/* Token list */}
              {viewerTokens.length === 0 ? (
                <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>{t('gal_share_no_tokens')}</p>
              ) : (
                <div className="table-responsive mb-3">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t('gal_upload_th_label')}</th>
                        <th>{t('gal_share_expiry_label')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewerTokens.map(vt => (
                        <tr key={vt.id}>
                          <td>{vt.label || <em className="text-muted">{t('gal_upload_unnamed')}</em>}</td>
                          <td style={{ fontSize: '0.8rem' }}>
                            {vt.expires_at
                              ? new Date(vt.expires_at).toLocaleDateString()
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="text-end">
                            <AdminButton variant="outline-danger" size="sm" onClick={() => revokeViewerToken(vt.id)}>
                              {t('gal_share_revoke')}
                            </AdminButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <AdminAlert message={vtError} />
              <form onSubmit={createViewerToken} className="d-flex gap-2 align-items-end flex-wrap">
                <div style={{ flex: '1 1 160px' }}>
                  <label className="form-label mb-1" style={{ fontSize: '0.85rem' }}>{t('gal_upload_th_label')} <span className="text-muted">{t('gal_upload_label_optional')}</span></label>
                  <input className="form-control form-control-sm" value={vtLabel}
                    onChange={e => setVtLabel(e.target.value)} placeholder={t('gal_share_label_placeholder')} />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label className="form-label mb-1" style={{ fontSize: '0.85rem' }}>{t('gal_share_expiry_label')}</label>
                  <input className="form-control form-control-sm" type="date" value={vtExpiry}
                    onChange={e => setVtExpiry(e.target.value)} />
                </div>
                <AdminButton type="submit" size="sm" loading={vtCreating} icon="fas fa-link">
                  {t('gal_share_create_btn')}
                </AdminButton>
              </form>
            </AdminCard>
          )}

          {/* Upload links / Photographers */}
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
