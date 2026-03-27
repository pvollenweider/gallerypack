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

export default function GalleryGeneralPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [form,       setForm]       = useState({ title: '', slug: '', author: '', authorEmail: '', locale: 'en' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState('');
  const [error,      setError]      = useState('');
  const [flushConfirm, setFlushConfirm] = useState(false);
  const [flushing,     setFlushing]     = useState(false);
  const [flushError,   setFlushError]   = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.getGallery(galleryId).then(g => {
      setForm({ title: g.title || '', slug: g.slug || '', author: g.author || '', authorEmail: g.authorEmail || '', locale: g.locale || 'en' });
      setSlugEdited(true); // existing gallery: don't auto-update slug from title
    }).catch(() => {});
  }, [galleryId]);

  function handleTitleChange(e) {
    const title = e.target.value;
    setForm(f => ({
      ...f,
      title,
      slug: slugEdited ? f.slug : slugify(title),
    }));
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
    try {
      await api.updateGallery(galleryId, form);
      setSaved(t('changes_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const flushDist = useCallback(async () => {
    setFlushing(true); setFlushError('');
    try {
      await api.flushGalleryDist(galleryId);
      setFlushConfirm(false);
      navigate(0); // reload
    } catch (err) {
      setFlushError(err.message);
    } finally {
      setFlushing(false);
    }
  }, [galleryId, navigate]);

  return (
    <AdminPage title={t('gal_general_title')}>
      <div className="row">
        <div className="col-lg-7">
          <form onSubmit={save}>
            <AdminCard title={t('branding_identity_section')}>
              <div className="mb-3">
                <label className="form-label">{t('field_title')}</label>
                <input className="form-control" value={form.title} onChange={handleTitleChange} required />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('orgs_th_slug')}</label>
                <div className="input-group">
                  <span className="input-group-text text-muted">/</span>
                  <input className="form-control" value={form.slug} onChange={handleSlugChange} required pattern="[a-z0-9-]+" />
                </div>
              </div>
              <div className="mb-0">
                <label className="form-label">{t('field_locale')}</label>
                <input className="form-control" value={form.locale} onChange={set('locale')} placeholder="en" />
              </div>
            </AdminCard>

            <AdminCard title={t('gal_general_photographer_section')}>
              <div className="row">
                <div className="col-sm-6 mb-3">
                  <label className="form-label">{t('orgs_th_name')}</label>
                  <input className="form-control" value={form.author} onChange={set('author')} />
                </div>
                <div className="col-sm-6 mb-3">
                  <label className="form-label">{t('login_email')}</label>
                  <input className="form-control" type="email" value={form.authorEmail} onChange={set('authorEmail')} />
                </div>
              </div>
            </AdminCard>

            <AdminAlert variant="success" message={saved} />
            <AdminAlert message={error} />
            <AdminButton type="submit" loading={saving} loadingLabel={t('saving')} className="mb-4">
              {t('save')}
            </AdminButton>
          </form>
        </div>
      </div>
          {/* Danger zone */}
      <div className="row mt-4">
        <div className="col-lg-7">
          <AdminCard>
            <p className="text-uppercase fw-semibold text-danger mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.08em' }}>
              {t('gal_general_danger_zone')}
            </p>
            <div className="d-flex align-items-center justify-content-between gap-3">
              <div>
                <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{t('gal_general_flush_title')}</div>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {t('gal_general_flush_desc')}
                </div>
              </div>
              <AdminButton variant="outline-danger" size="sm" onClick={() => setFlushConfirm(true)}>
                {t('gal_general_flush_btn')}
              </AdminButton>
            </div>
            {flushError && <AdminAlert message={flushError} className="mt-2 mb-0" />}
          </AdminCard>
        </div>
      </div>

      {/* Flush confirmation modal */}
      {flushConfirm && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0, zIndex: 1055 }} onClick={() => !flushing && setFlushConfirm(false)}>
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
