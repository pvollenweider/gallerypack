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
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';

export default function GalleryGeneralPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [form,   setForm]   = useState({ title: '', slug: '', author: '', authorEmail: '', locale: 'en' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getGallery(galleryId).then(g => {
      setForm({ title: g.title || '', slug: g.slug || '', author: g.author || '', authorEmail: g.authorEmail || '', locale: g.locale || 'en' });
    }).catch(() => {});
  }, [galleryId]);

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

  return (
    <AdminPage title={t('gal_general_title')}>
      <div className="row">
        <div className="col-lg-7">
          <form onSubmit={save}>
            <AdminCard title={t('branding_identity_section')}>
              <div className="mb-3">
                <label className="form-label">{t('field_title')}</label>
                <input className="form-control" value={form.title} onChange={set('title')} required />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('orgs_th_slug')}</label>
                <div className="input-group">
                  <span className="input-group-text text-muted">/</span>
                  <input className="form-control" value={form.slug} onChange={set('slug')} required pattern="[a-z0-9-]+" />
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
    </AdminPage>
  );
}
