// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminInput, AdminSwitch, AdminAlert, AdminButton } from '../../../components/ui/index.js';

export default function OrganizationDefaultsPage() {
  const t = useT();
  const [form,   setForm]   = useState({
    defaultAuthor: '', defaultAuthorEmail: '',
    defaultLocale: 'en', defaultAccess: 'public',
    defaultAllowDownloadImage: true, defaultAllowDownloadGallery: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getSettings().then(s => setForm({
      defaultAuthor:               s.defaultAuthor              || '',
      defaultAuthorEmail:          s.defaultAuthorEmail         || '',
      defaultLocale:               s.defaultLocale              || 'en',
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
      setSaved(t('defaults_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('org_defaults_title')} maxWidth="100%">
      <div className="row">
        <div className="col-lg-8">
          <div className="alert alert-info py-2" style={{ fontSize: '0.875rem' }}>
            <i className="fas fa-info-circle me-2" />
            {t('org_defaults_hint')}
          </div>

          <form onSubmit={save}>
            <AdminCard title={t('org_defaults_photographer_section')}>
              <div className="row">
                <div className="col-sm-6 mb-3">
                  <AdminInput
                    label={t('org_defaults_photo_name_label')}
                    value={form.defaultAuthor}
                    onChange={set('defaultAuthor')}
                    placeholder={t('org_defaults_photo_name_placeholder')}
                    className="mb-0"
                  />
                </div>
                <div className="col-sm-6 mb-3">
                  <AdminInput
                    label={t('org_defaults_photo_email_label')}
                    type="email"
                    value={form.defaultAuthorEmail}
                    onChange={set('defaultAuthorEmail')}
                    placeholder={t('org_defaults_photo_email_placeholder')}
                    className="mb-0"
                  />
                </div>
              </div>
            </AdminCard>

            <AdminCard title={t('org_defaults_access_section')}>
              <div className="mb-3">
                <label className="form-label">{t('org_defaults_access_label')}</label>
                <select className="form-select" value={form.defaultAccess} onChange={set('defaultAccess')}>
                  <option value="public">{t('access_public')}</option>
                  <option value="private">{t('access_private')}</option>
                  <option value="password">{t('field_password')}</option>
                </select>
              </div>
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
              {t('save_defaults_btn')}
            </AdminButton>
          </form>
        </div>
      </div>
    </AdminPage>
  );
}
