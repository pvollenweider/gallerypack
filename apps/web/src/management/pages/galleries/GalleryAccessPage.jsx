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
import InheritedValue from '../../components/InheritedValue.jsx';

const GALLERY_MODES = ['portfolio', 'client_preview', 'client_delivery', 'archive'];

const MODE_WATERMARK = {
  portfolio: true, client_preview: true, client_delivery: true, archive: false,
};

const MODE_BADGE_COLOR = {
  portfolio:       { bg: '#e0f2fe', color: '#0369a1' },
  client_preview:  { bg: '#fef9c3', color: '#854d0e' },
  client_delivery: { bg: '#dcfce7', color: '#166534' },
  archive:         { bg: '#f3e8ff', color: '#6b21a8' },
};

const MODES = [
  { value: 'portfolio',       labelKey: 'gal_mode_portfolio',       descKey: 'gal_mode_portfolio_desc' },
  { value: 'client_preview',  labelKey: 'gal_mode_client_preview',  descKey: 'gal_mode_client_preview_desc' },
  { value: 'client_delivery', labelKey: 'gal_mode_client_delivery', descKey: 'gal_mode_client_delivery_desc' },
  { value: 'archive',         labelKey: 'gal_mode_archive',         descKey: 'gal_mode_archive_desc' },
];

export default function GalleryAccessPage() {
  const t = useT();
  const { orgId, projectId, galleryId } = useParams();

  const [photographers, setPhotographers] = useState([]);
  const [orgDefault,    setOrgDefault]    = useState(null);

  const [form, setForm] = useState({
    galleryMode: null,
    access: 'public', password: '',
    downloadMode: 'display', allowDownloadGallery: false, apacheProtection: false,
    standalone: false, title: '', slug: '', primaryPhotographerId: '', author: '',
  });

  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText,    setWatermarkText]    = useState('');

  const [galleryMeta, setGalleryMeta] = useState({ distName: null, buildStatus: null });
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [rebuilding,   setRebuilding]   = useState(false);

  // Viewer tokens (client sharing)
  const [viewerTokens, setViewerTokens] = useState([]);
  const [vtLabel,      setVtLabel]      = useState('');
  const [vtExpiry,     setVtExpiry]     = useState('');
  const [vtCreating,   setVtCreating]   = useState(false);
  const [vtError,      setVtError]      = useState('');
  const [freshLink,    setFreshLink]    = useState(null);
  const [copiedVt,     setCopiedVt]     = useState(false);

  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Strip originals
  const [stripping,   setStripping]   = useState(false);
  const [stripResult, setStripResult] = useState(null);
  const [stripError,  setStripError]  = useState('');

  useEffect(() => {
    Promise.all([
      api.getGallery(galleryId),
      api.getSettings(),
      api.listOrgPhotographers(orgId),
    ]).then(([g, s, pgs]) => {
      setForm({
        galleryMode: g.mode ?? null,
        access: g.access || 'public', password: '',
        downloadMode: g.downloadMode || 'display',
        allowDownloadGallery: !!g.allowDownloadGallery,
        apacheProtection: !!g.apacheProtection,
        standalone: !!g.standalone,
        title: g.title || '', slug: g.slug || '',
        primaryPhotographerId: g.primaryPhotographerId || '',
        author: g.author || '',
      });
      setWatermarkEnabled(g.watermark?.enabled ?? false);
      setWatermarkText(g.watermark?.text || '');
      setOrgDefault(s?.defaultAccess ?? null);
      setPhotographers(pgs);
      setGalleryMeta({ distName: g.distName || g.slug, buildStatus: g.buildStatus });
    }).catch(() => {});
    loadViewerTokens();
  }, [galleryId, orgId]);

  function loadViewerTokens() {
    api.getViewerTokens(galleryId).then(setViewerTokens).catch(() => {});
  }

  function buildShareUrl(rawToken) {
    const name = galleryMeta.distName || form.slug;
    return `${window.location.origin}/${name}/?vt=${rawToken}`;
  }

  async function save(patch) {
    setError('');
    const payload = {
      galleryMode: patch.galleryMode ?? null,
      access: patch.access,
      downloadMode: patch.downloadMode,
      allowDownloadGallery: patch.allowDownloadGallery,
      apacheProtection: patch.apacheProtection,
    };
    if (patch.access === 'password' && patch.password?.trim()) payload.password = patch.password.trim();
    try {
      const updated = await api.updateGallery(galleryId, payload);
      setToast(t('changes_saved'));
      setForm(f => ({
        ...f,
        access:               updated.access               ?? f.access,
        downloadMode:         updated.downloadMode         ?? f.downloadMode,
        allowDownloadGallery: updated.allowDownloadGallery ?? f.allowDownloadGallery,
        ...(patch.password ? { password: '' } : {}),
      }));
      if (galleryMeta.buildStatus === 'done') setNeedsRebuild(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveWatermark(enabled, text) {
    setError('');
    try {
      await api.updateGallery(galleryId, { configJson: JSON.stringify({ watermark: { enabled, text } }) });
      setToast(t('changes_saved'));
      if (galleryMeta.buildStatus === 'done') setNeedsRebuild(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function triggerRebuild() {
    setRebuilding(true);
    try {
      await api.triggerBuild(galleryId, false);
      setNeedsRebuild(false);
      setGalleryMeta(m => ({ ...m, buildStatus: 'queued' }));
      setToast(t('build_action'));
    } catch (err) {
      setError(err.message);
    } finally {
      setRebuilding(false);
    }
  }

  async function stripOriginals() {
    setStripping(true); setStripError(''); setStripResult(null);
    try {
      const r = await api.stripDistOriginals(galleryId);
      setStripResult(r);
    } catch (err) {
      setStripError(err.message);
    } finally {
      setStripping(false);
    }
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

  // Confirmation helpers for sensitive actions
  function confirmDownloadOriginal() {
    return window.confirm(t('gal_confirm_download_original'));
  }
  function confirmMakePublic() {
    return window.confirm(t('gal_confirm_make_public'));
  }

  const modeLockedDownloads = !!form.galleryMode;
  const modeLockedWatermark = !!form.galleryMode;
  const modeWatermarkEnabled = form.galleryMode ? (MODE_WATERMARK[form.galleryMode] ?? false) : null;
  const downloadsDisabled = form.downloadMode === 'none';
  const showApacheToggle = form.standalone && form.access === 'password';
  const showShareSection = form.access === 'private';

  // Auto watermark text from photographer / author / title
  const autoWatermarkText = (() => {
    if (form.primaryPhotographerId) {
      const pg = photographers.find(p => p.id === form.primaryPhotographerId);
      if (pg?.name) return `© ${pg.name}`;
    }
    if (form.author) return `© ${form.author}`;
    return form.title ? `© ${form.title}` : '';
  })();

  return (
    <AdminPage title={t('gal_access_title')}>
      <AdminToast message={toast} onDone={() => setToast('')} />
      {needsRebuild && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between gap-3 mb-3" role="alert">
          <div className="d-flex align-items-center gap-2">
            <i className="fas fa-exclamation-triangle" />
            <span>{t('gal_settings_rebuild_warning')}</span>
          </div>
          <AdminButton
            size="sm" variant="warning" loading={rebuilding}
            loadingLabel={t('republishing')} onClick={triggerRebuild}
            icon="fas fa-sync-alt"
          >
            {t('build_now')}
          </AdminButton>
        </div>
      )}

      <div className="row">
        <div className="col-lg-7">

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
            <select
              className="form-select"
              value={form.galleryMode ?? ''}
              onChange={e => {
                const newMode = e.target.value || null;
                const next = { ...form, galleryMode: newMode };
                setForm(next);
                save(next);
                if (newMode) {
                  const shouldEnable = MODE_WATERMARK[newMode] ?? false;
                  if (shouldEnable !== watermarkEnabled) {
                    setWatermarkEnabled(shouldEnable);
                    saveWatermark(shouldEnable, watermarkText);
                  }
                }
              }}
            >
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

          {/* Access */}
          <AdminCard title={t('gal_access_visibility')}>
            {['public', 'private', 'password'].map(v => (
              <div key={v} className="form-check mb-2">
                <input
                  className="form-check-input" type="radio" name="access" id={`access-${v}`}
                  value={v} checked={form.access === v}
                  onChange={e => {
                    const newAccess = e.target.value;
                    if (newAccess === 'public' && form.access !== 'public' && !confirmMakePublic()) return;
                    const next = { ...form, access: newAccess };
                    setForm(next); save(next);
                  }}
                />
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
                <input
                  className="form-control" type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onBlur={() => { if (form.password) save(form); }}
                  placeholder={t('gal_access_password_hint')}
                  autoComplete="new-password" style={{ maxWidth: 300 }}
                />
              </div>
            )}
            {orgDefault && (
              <InheritedValue label={t('org_default_label')}>{orgDefault}</InheritedValue>
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
            <select
              className="form-select" value={form.downloadMode} disabled={modeLockedDownloads}
              onChange={e => {
                const newMode = e.target.value;
                if (newMode === 'original' && form.downloadMode !== 'original' && !confirmDownloadOriginal()) return;
                const next = { ...form, downloadMode: newMode };
                setForm(next); save(next);
              }}
            >
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
                <input
                  className="form-check-input" type="checkbox" id="allowDownloadGallery"
                  checked={form.allowDownloadGallery} disabled={modeLockedDownloads}
                  onChange={e => { const next = { ...form, allowDownloadGallery: e.target.checked }; setForm(next); save(next); }}
                />
                <label className="form-check-label" htmlFor="allowDownloadGallery">
                  {t('gal_downloads_zip_label')}
                </label>
                <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('gal_downloads_zip_hint')}</div>
              </div>
            )}
            {showApacheToggle && (
              <div className="form-check form-switch mt-3 mb-0">
                <input
                  className="form-check-input" type="checkbox" id="apacheProtection"
                  checked={form.apacheProtection}
                  onChange={e => { const next = { ...form, apacheProtection: e.target.checked }; setForm(next); save(next); }}
                />
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

          {/* Watermark */}
          <AdminCard title={t('gal_watermark_section')}>
            {modeLockedWatermark && (
              <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3" role="alert" style={{ fontSize: '0.82rem' }}>
                <i className="fas fa-lock" />
                {t('gal_mode_locked_hint')}
              </div>
            )}
            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input" type="checkbox" id="watermark-toggle"
                checked={modeLockedWatermark ? modeWatermarkEnabled : watermarkEnabled}
                disabled={modeLockedWatermark}
                onChange={e => {
                  const enabled = e.target.checked;
                  setWatermarkEnabled(enabled);
                  saveWatermark(enabled, watermarkText);
                }}
              />
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
                  value={watermarkText}
                  onChange={e => setWatermarkText(e.target.value)}
                  onBlur={() => saveWatermark(
                    modeLockedWatermark ? modeWatermarkEnabled : watermarkEnabled,
                    watermarkText
                  )}
                  placeholder={autoWatermarkText || '© Photographe'}
                  style={{ maxWidth: 360 }}
                />
                <div className="form-text">{t('gal_watermark_text_hint')}</div>
              </div>
            )}
          </AdminCard>

          <AdminAlert message={error} />
        </div>

        {/* Client sharing links — visible for private galleries */}
        {showShareSection && (
          <AdminCard title={t('gal_share_section')} className="mb-4">
            <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>{t('gal_share_hint')}</p>

            {freshLink && (
              <div className="alert alert-success mb-3" role="alert">
                <div className="fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>{t('gal_share_fresh_title')}</div>
                <div className="text-muted mb-2" style={{ fontSize: '0.8rem' }}>{t('gal_share_fresh_hint')}</div>
                <div className="d-flex gap-2 align-items-center">
                  <code className="flex-grow-1" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{freshLink.url}</code>
                  <AdminButton size="sm" variant={copiedVt ? 'success' : 'outline-success'}
                    onClick={() => { navigator.clipboard.writeText(freshLink.url); setCopiedVt(true); }}>
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
      </div>
    </AdminPage>
  );
}
