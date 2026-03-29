// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminToast } from '../../../components/ui/index.js';

export default function BrandingPage() {
  const t = useT();
  const [form,  setForm]  = useState({ siteTitle: '', baseUrl: '' });
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      setForm({ siteTitle: s.siteTitle || '', baseUrl: s.baseUrl || '' });
    }).catch(() => {});
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(patch) {
    setError('');
    try {
      await api.saveSettings(patch);
      setToast(t('branding_saved'));
    } catch (err) { setError(err.message); }
  }

  return (
    <AdminPage title={t('branding_title')}>
      <AdminToast message={toast} onDone={() => setToast('')} />
      <div className="row">
        <div className="col-lg-7">

          <AdminCard title={t('branding_identity_section')}>
            <AdminInput
              label={t('field_site_title')}
              value={form.siteTitle}
              onChange={set('siteTitle')}
              onBlur={() => save(form)}
              placeholder={t('branding_site_title_placeholder')}
              hint={t('site_title_hint')}
            />
            <AdminInput
              label={t('branding_base_url_label')}
              value={form.baseUrl}
              onChange={set('baseUrl')}
              onBlur={() => save(form)}
              placeholder={t('branding_base_url_placeholder')}
              hint={t('branding_base_url_hint')}
            />
          </AdminCard>

          <AdminCard title={t('branding_logo_section')}>
            <div className="text-muted">
              <i className="fas fa-hammer me-2" />{t('branding_logo_v2')}
            </div>
          </AdminCard>

          <AdminAlert message={error} />

        </div>
      </div>
    </AdminPage>
  );
}
