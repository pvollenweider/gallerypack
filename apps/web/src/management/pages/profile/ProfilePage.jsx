// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
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
  const [saving,          setSaving]         = useState(false);
  const [toast,           setToast]          = useState('');
  const [error,           setError]          = useState('');
  const [galleries,       setGalleries]      = useState(null);

  const [curPwd,    setCurPwd]    = useState('');
  const [newPwd,    setNewPwd]    = useState('');
  const [newPwd2,   setNewPwd2]   = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const STUDIO_ROLE_LABEL = {
    photographer: t('role_photographer'), editor: t('role_editor'),
    admin: t('role_admin'), owner: t('role_owner'), collaborator: t('role_collaborator') || 'Collaborator',
  };
  const GALLERY_ROLE_LABEL = {
    contributor: t('gallery_role_contributor'), editor: t('gallery_role_editor'),
    viewer: t('gallery_role_viewer'),
  };

  useEffect(() => {
    api.myGalleries().then(setGalleries).catch(() => setGalleries([]));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const updated = await api.updateMe({ name, locale: locale || null, notifyOnUpload, notifyOnPublish });
      setUser(updated);
      if (locale) setLocale(locale);
      setToast(t('profile_saved'));
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
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

          <form onSubmit={handleSave}>
            <AdminCard title={t('profile_section_identity')} className="mb-3">
              <div className="mb-3 row">
                <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{t('profile_name')}</label>
                <div className="col-sm-9">
                  <input className="form-control form-control-sm" value={name} placeholder={t('profile_name_placeholder')}
                    onChange={e => setName(e.target.value)} />
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
                  <select className="form-control form-control-sm" style={{ maxWidth: 200 }} value={locale} onChange={e => setLocaleSt(e.target.value)}>
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
                      checked={notifyOnUpload} onChange={e => setNotifyUpload(e.target.checked)} />
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
                      checked={notifyOnPublish} onChange={e => setNotifyPublish(e.target.checked)} />
                    <label className="form-check-label" htmlFor="notifyPub"></label>
                  </div>
                  <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_publish_desc')}</span>
                </div>
              </div>
            </AdminCard>

            <div className="mb-4">
              <AdminButton type="submit" loading={saving} loadingLabel={t('saving')}>
                {t('save')}
              </AdminButton>
            </div>
          </form>

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

          {user?.studioRole === 'photographer' && galleries && galleries.length > 0 && (
            <AdminCard title={t('profile_section_galleries')} noPadding>
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr>
                    <th>{t('profile_gallery_th')}</th>
                    <th style={{ width: 140 }}>{t('profile_access_th')}</th>
                  </tr>
                </thead>
                <tbody>
                  {galleries.map(g => (
                    <tr key={g.id}>
                      <td>{g.title} <span className="text-muted">/{g.slug}/</span></td>
                      <td><span className="badge bg-secondary">{GALLERY_ROLE_LABEL[g.role] || g.role}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminCard>
          )}

        </div>
      </div>
    </AdminPage>
  );
}
