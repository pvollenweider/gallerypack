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
import { AdminPage, AdminCard, AdminInput, AdminAlert, AdminButton } from '../../../components/ui/index.js';

const LOCALES = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },   { value: 'ja', label: 'Japanese' },
];

export default function OrganizationGeneralPage() {
  const t = useT();
  const { orgId } = useParams();
  const [form,    setForm]    = useState({ name: '', slug: '', locale: 'en', country: '' });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState('');
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getOrganization(orgId).then(org => {
      setForm({ name: org.name || '', slug: org.slug || '', locale: org.locale || 'en', country: org.country || '' });
    }).catch(() => {});
  }, [orgId]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.updateOrganization(orgId, form);
      setSaved(t('changes_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('org_general_title')} maxWidth="100%">
      <div className="row">
        <div className="col-lg-7">
          <form onSubmit={save}>
            <AdminCard title={t('branding_identity_section')}>
              <AdminInput
                label={t('orgs_th_name')}
                value={form.name}
                onChange={set('name')}
                required
              />
              <AdminInput
                label={t('orgs_th_slug')}
                prefix="/"
                value={form.slug}
                onChange={set('slug')}
                pattern="[a-z0-9-]+"
                title={t('orgs_slug_hint')}
                required
                hint={t('org_slug_hint')}
              />
            </AdminCard>

            <AdminCard title={t('org_locale_label')}>
              <div className="row">
                <div className="col-sm-6 mb-3">
                  <label className="form-label">{t('field_language')}</label>
                  <select className="form-select" value={form.locale} onChange={set('locale')}>
                    {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="col-sm-6 mb-3">
                  <AdminInput
                    label={t('org_country_label')}
                    value={form.country}
                    onChange={set('country')}
                    placeholder={t('org_country_placeholder')}
                    maxLength={2}
                    style={{ textTransform: 'uppercase' }}
                    hint={t('org_country_hint')}
                    className="mb-0"
                  />
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
