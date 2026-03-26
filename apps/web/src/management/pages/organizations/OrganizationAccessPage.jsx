// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminSwitch, AdminAlert, AdminButton } from '../../../components/ui/index.js';

export default function OrganizationAccessPage() {
  const t = useT();
  const [form,   setForm]   = useState({ defaultAccess: 'public', defaultAllowDownloadImage: true, defaultAllowDownloadGallery: false });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getSettings().then(s => setForm({
      defaultAccess:               s.defaultAccess              || 'public',
      defaultAllowDownloadImage:   s.defaultAllowDownloadImage  !== false,
      defaultAllowDownloadGallery: !!s.defaultAllowDownloadGallery,
    })).catch(() => {});
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.saveSettings(form);
      setSaved(t('access_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('org_access_title')} maxWidth="100%">
      <div className="row">
        <div className="col-lg-7">
          <div className="alert alert-info py-2" style={{ fontSize: '0.875rem' }}>
            <i className="fas fa-info-circle me-2" />
            {t('org_access_hint')}
          </div>

          <form onSubmit={save}>
            <AdminCard title={t('org_access_visibility_section')}>
              <div className="mb-0">
                <label className="form-label">{t('org_access_type_label')}</label>
                {['public', 'private', 'password'].map(v => (
                  <div key={v} className="form-check">
                    <input className="form-check-input" type="radio" name="access" id={`access-${v}`}
                      value={v} checked={form.defaultAccess === v} onChange={set('defaultAccess')} />
                    <label className="form-check-label" htmlFor={`access-${v}`}>
                      {v === 'public'   && t('access_public_full')}
                      {v === 'private'  && t('access_private_full')}
                      {v === 'password' && t('access_password_full')}
                    </label>
                  </div>
                ))}
              </div>
            </AdminCard>

            <AdminCard title={t('org_downloads_section')}>
              <AdminSwitch
                label={t('allow_photo_download')}
                checked={form.defaultAllowDownloadImage}
                onChange={set('defaultAllowDownloadImage')}
              />
              <AdminSwitch
                label={t('allow_zip_download')}
                checked={form.defaultAllowDownloadGallery}
                onChange={set('defaultAllowDownloadGallery')}
                className="mb-0"
              />
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
