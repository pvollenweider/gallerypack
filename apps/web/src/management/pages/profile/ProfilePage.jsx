// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useRef } from 'react';
import { api } from '../../../lib/api.js';
import { useT, useLocale } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { UI_LOCALE_OPTIONS } from '../../../lib/i18n.js';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminToast } from '../../../components/ui/index.js';

export default function ProfilePage() {
  const t = useT();
  const { user, setUser } = useAuth();
  const { setLocale } = useLocale();

  const [name,            setName]           = useState(user?.name || '');
  const [locale,          setLocaleSt]       = useState(user?.locale || '');
  const [notifyOnUpload,  setNotifyUpload]   = useState(user?.notifyOnUpload !== false);
  const [notifyOnPublish, setNotifyPublish]  = useState(user?.notifyOnPublish !== false);
  const [toast,           setToast]          = useState('');
  const [error,           setError]          = useState('');

  const [curPwd,    setCurPwd]    = useState('');
  const [newPwd,    setNewPwd]    = useState('');
  const [newPwd2,   setNewPwd2]   = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  // Debounce ref for name field
  const saveTimer = useRef(null);

  const STUDIO_ROLE_LABEL = {
    photographer: t('role_photographer'), editor: t('role_editor'),
    admin: t('role_admin'), owner: t('role_owner'), collaborator: t('role_collaborator') || 'Collaborator',
  };

  async function saveProfile(patch) {
    try {
      const updated = await api.updateMe(patch);
      setUser(updated);
      if (patch.locale) setLocale(patch.locale);
      setToast(t('profile_saved'));
    } catch (err) { setError(err.message); }
  }

  function handleNameBlur() {
    clearTimeout(saveTimer.current);
    saveProfile({ name, locale: locale || null, notifyOnUpload, notifyOnPublish });
  }

  function handleLocaleChange(e) {
    const val = e.target.value;
    setLocaleSt(val);
    saveProfile({ name, locale: val || null, notifyOnUpload, notifyOnPublish });
  }

  function handleNotifyUploadChange(e) {
    const val = e.target.checked;
    setNotifyUpload(val);
    saveProfile({ name, locale: locale || null, notifyOnUpload: val, notifyOnPublish });
  }

  function handleNotifyPublishChange(e) {
    const val = e.target.checked;
    setNotifyPublish(val);
    saveProfile({ name, locale: locale || null, notifyOnUpload, notifyOnPublish: val });
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (newPwd !== newPwd2) { setError(t('profile_passwords_mismatch')); return; }
    setPwdSaving(true); setError('');
    try {
      await api.changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setNewPwd2('');
      setToast(t('profile_password_updated'));
    } catch (err) { setError(err.message); }
    finally { setPwdSaving(false); }
  }

  return (
    <AdminPage title={t('profile_title')}>
      <AdminAlert message={error} />
      <AdminToast message={toast} onDone={() => setToast('')} />

      <div className="row">
        <div className="col-lg-7">

          <AdminCard title={t('profile_section_identity')} className="mb-3">
            <div className="mb-3 row">
              <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_name')}</label>
              <div className="col-sm-9">
                <input className="form-control form-control-sm" value={name} placeholder={t('profile_name_placeholder')}
                  onChange={e => setName(e.target.value)}
                  onBlur={handleNameBlur} />
              </div>
            </div>
            <div className="mb-3 row">
              <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_email_label')}</label>
              <div className="col-sm-9 d-flex align-items-center">
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>{user?.email}</span>
              </div>
            </div>
            <div className="mb-0 row">
              <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_role')}</label>
              <div className="col-sm-9 d-flex align-items-center">
                <strong style={{ fontSize: '0.875rem' }}>{STUDIO_ROLE_LABEL[user?.studioRole] || user?.studioRole}</strong>
              </div>
            </div>
          </AdminCard>

          <AdminCard title={t('profile_section_language')} className="mb-3">
            <div className="mb-3 row">
              <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_language_label')}</label>
              <div className="col-sm-9">
                <select className="form-control form-control-sm" style={{ maxWidth: 200 }} value={locale} onChange={handleLocaleChange}>
                  <option value="">— {t('field_language')} —</option>
                  {UI_LOCALE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <p className="text-muted mb-0" style={{ fontSize: '0.8rem' }}>{t('profile_language_desc')}</p>
          </AdminCard>

          <AdminCard title={t('profile_section_notifications')} className="mb-3">
            <div className="mb-3 row">
              <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_notify_upload')}</label>
              <div className="col-sm-9 d-flex align-items-center gap-2">
                <div className="form-check form-switch mb-0">
                  <input type="checkbox" className="form-check-input" id="notifyUp"
                    checked={notifyOnUpload} onChange={handleNotifyUploadChange} />
                  <label className="form-check-label" htmlFor="notifyUp"></label>
                </div>
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_upload_desc')}</span>
              </div>
            </div>
            <div className="mb-0 row">
              <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_notify_publish')}</label>
              <div className="col-sm-9 d-flex align-items-center gap-2">
                <div className="form-check form-switch mb-0">
                  <input type="checkbox" className="form-check-input" id="notifyPub"
                    checked={notifyOnPublish} onChange={handleNotifyPublishChange} />
                  <label className="form-check-label" htmlFor="notifyPub"></label>
                </div>
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_publish_desc')}</span>
              </div>
            </div>
          </AdminCard>

          <form onSubmit={handlePasswordChange}>
            <AdminCard title={t('profile_section_password')} className="mb-4">
              <div className="mb-3 row">
                <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_current_password')}</label>
                <div className="col-sm-9">
                  <input className="form-control form-control-sm" type="password" autoComplete="current-password"
                    value={curPwd} onChange={e => setCurPwd(e.target.value)} required />
                </div>
              </div>
              <div className="mb-3 row">
                <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_new_password')}</label>
                <div className="col-sm-9">
                  <input className="form-control form-control-sm" type="password" autoComplete="new-password" minLength={8}
                    value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
                </div>
              </div>
              <div className="mb-3 row">
                <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_confirm_password')}</label>
                <div className="col-sm-9">
                  <input className="form-control form-control-sm" type="password" autoComplete="new-password" minLength={8}
                    value={newPwd2} onChange={e => setNewPwd2(e.target.value)} required />
                </div>
              </div>
              <AdminButton variant="outline-warning" type="submit" loading={pwdSaving} loadingLabel={t('saving')}>
                {t('profile_change_password_btn')}
              </AdminButton>
            </AdminCard>
          </form>

        </div>
      </div>
    </AdminPage>
  );
}
