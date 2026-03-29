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

  // Identity form → api.updateOrganization
  const [identity,        setIdentity]        = useState({ name: '', slug: '', locale: 'en', country: '' });
  const [savingIdentity,  setSavingIdentity]  = useState(false);
  const [savedIdentity,   setSavedIdentity]   = useState('');
  const [errorIdentity,   setErrorIdentity]   = useState('');

  // Defaults form → api.saveSettings
  const [defaults,       setDefaults]       = useState({ defaultAccess: 'public', defaultDownloadMode: 'display', defaultAuthor: '', defaultAuthorEmail: '' });
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [savedDefaults,  setSavedDefaults]  = useState('');
  const [errorDefaults,  setErrorDefaults]  = useState('');

  useEffect(() => {
    api.getOrganization(orgId).then(org => {
      setIdentity({ name: org.name || '', slug: org.slug || '', locale: org.locale || 'en', country: org.country || '' });
    }).catch(() => {});
    api.getSettings().then(s => {
      setDefaults({
        defaultAccess:       s?.defaultAccess       || 'public',
        defaultDownloadMode: s?.defaultDownloadMode || 'display',
        defaultAuthor:       s?.defaultAuthor       || '',
        defaultAuthorEmail:  s?.defaultAuthorEmail  || '',
      });
    }).catch(() => {});
  }, [orgId]);

  function setId(field) {
    return e => setIdentity(f => ({ ...f, [field]: e.target.value }));
  }

  function setDef(field) {
    return e => setDefaults(f => ({ ...f, [field]: e.target.value }));
  }

  async function saveIdentity(e) {
    e.preventDefault();
    setSavingIdentity(true); setSavedIdentity(''); setErrorIdentity('');
    try {
      await api.updateOrganization(orgId, identity);
      setSavedIdentity(t('changes_saved'));
    } catch (err) {
      setErrorIdentity(err.message);
    } finally {
      setSavingIdentity(false);
    }
  }

  async function saveDefaults(e) {
    e.preventDefault();
    setSavingDefaults(true); setSavedDefaults(''); setErrorDefaults('');
    try {
      await api.saveSettings(defaults);
      setSavedDefaults(t('changes_saved'));
    } catch (err) {
      setErrorDefaults(err.message);
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <AdminPage title={identity.name ? t('org_settings_title', { name: identity.name }) : '…'} maxWidth="100%">
      <div className="row">
        <div className="col-lg-7">

          {/* Identity */}
          <form onSubmit={saveIdentity}>
            <AdminCard title={t('branding_identity_section')}>
              <AdminInput label={t('orgs_th_name')} value={identity.name} onChange={setId('name')} required />
              <AdminInput
                label={t('orgs_th_slug')} prefix="/" value={identity.slug} onChange={setId('slug')}
                pattern="[-a-z0-9]+" title={t('orgs_slug_hint')} required hint={t('org_slug_hint')}
              />
            </AdminCard>

            <AdminCard title={t('org_locale_label')}>
              <div className="row">
                <div className="col-sm-6 mb-3">
                  <label className="form-label">{t('field_language')}</label>
                  <select className="form-select" value={identity.locale} onChange={setId('locale')}>
                    {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="col-sm-6 mb-3">
                  <AdminInput
                    label={t('org_country_label')} value={identity.country} onChange={setId('country')}
                    placeholder={t('org_country_placeholder')} maxLength={2}
                    style={{ textTransform: 'uppercase' }} hint={t('org_country_hint')} className="mb-0"
                  />
                </div>
              </div>
            </AdminCard>

            <AdminAlert variant="success" message={savedIdentity} />
            <AdminAlert message={errorIdentity} />
            <AdminButton type="submit" loading={savingIdentity} loadingLabel={t('saving')} className="mb-5">
              {t('save')}
            </AdminButton>
          </form>

          {/* Gallery Defaults */}
          <form onSubmit={saveDefaults}>
            <AdminCard title={t('org_defaults_title')}>
              <p className="text-muted mb-4" style={{ fontSize: '0.875rem' }}>{t('org_defaults_hint')}</p>

              <h6 className="fw-semibold mb-3" style={{ fontSize: '0.85rem' }}>{t('org_defaults_photographer_section')}</h6>
              <div className="row mb-4">
                <div className="col-sm-6">
                  <label className="form-label">{t('org_defaults_photo_name_label')}</label>
                  <input className="form-control" value={defaults.defaultAuthor}
                    onChange={setDef('defaultAuthor')} placeholder={t('org_defaults_photo_name_placeholder')} />
                </div>
                <div className="col-sm-6">
                  <label className="form-label">{t('org_defaults_photo_email_label')}</label>
                  <input className="form-control" type="email" value={defaults.defaultAuthorEmail}
                    onChange={setDef('defaultAuthorEmail')} placeholder={t('org_defaults_photo_email_placeholder')} />
                </div>
              </div>

              <h6 className="fw-semibold mb-3" style={{ fontSize: '0.85rem' }}>{t('org_defaults_access_section')}</h6>
              <div className="row mb-0">
                <div className="col-sm-6 mb-3">
                  <label className="form-label">{t('org_defaults_access_label')}</label>
                  <select className="form-select" value={defaults.defaultAccess} onChange={setDef('defaultAccess')}>
                    <option value="public">{t('access_public')}</option>
                    <option value="private">{t('access_private')}</option>
                    <option value="password">{t('access_password_full')}</option>
                  </select>
                </div>
                <div className="col-sm-6 mb-3">
                  <label className="form-label">{t('download_mode_label')}</label>
                  <select className="form-select" value={defaults.defaultDownloadMode} onChange={setDef('defaultDownloadMode')}>
                    <option value="none">{t('download_mode_none')}</option>
                    <option value="display">{t('download_mode_display')}</option>
                    <option value="original">{t('download_mode_original')}</option>
                  </select>
                </div>
              </div>
            </AdminCard>

            <AdminAlert variant="success" message={savedDefaults} />
            <AdminAlert message={errorDefaults} />
            <AdminButton type="submit" loading={savingDefaults} loadingLabel={t('saving')} className="mb-4">
              {t('save')}
            </AdminButton>
          </form>

        </div>
      </div>
    </AdminPage>
  );
}
