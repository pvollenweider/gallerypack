// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminInput, AdminAlert } from '../../../components/ui/index.js';

export default function BrandingPage() {
  const t = useT();
  const [form,   setForm]   = useState({ siteTitle: '', baseUrl: '' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      setForm({ siteTitle: s.siteTitle || '', baseUrl: s.baseUrl || '' });
    }).catch(() => {});
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.saveSettings(form);
      setSaved(t('branding_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('branding_title')}>
      <div className="row">
        <div className="col-lg-7">

          <form onSubmit={save}>
            <AdminCard title={t('branding_identity_section')}>
              <AdminInput
                label={t('field_site_title')}
                value={form.siteTitle}
                onChange={set('siteTitle')}
                placeholder={t('branding_site_title_placeholder')}
                hint={t('site_title_hint')}
              />
              <AdminInput
                label={t('branding_base_url_label')}
                value={form.baseUrl}
                onChange={set('baseUrl')}
                placeholder={t('branding_base_url_placeholder')}
                hint={t('branding_base_url_hint')}
              />
            </AdminCard>

            <AdminCard title={t('branding_logo_section')}>
              <div className="text-muted">
                <i className="fas fa-hammer me-2" />{t('branding_logo_v2')}
              </div>
            </AdminCard>

            <AdminAlert variant="success" message={saved} />
            <AdminAlert message={error} />

            <AdminButton type="submit" className="mb-4" loading={saving} loadingLabel={t('saving')}>
              {t('save')}
            </AdminButton>
          </form>

        </div>
      </div>
    </AdminPage>
  );
}
