// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT, useLocale } from '../lib/I18nContext.jsx';
import { slugify, UI_LOCALE_OPTIONS } from '../lib/i18n.js';
import { useAuth } from '../lib/auth.jsx';
import { Toast } from '../components/Toast.jsx';

const LOCALES = UI_LOCALE_OPTIONS.map(o => o.value);
const ACCESS    = ['public','private','password'];

// Full ISO 3166-1 alpha-2 list
const COUNTRIES = [
  '','AF','AX','AL','DZ','AS','AD','AO','AI','AQ','AG','AR','AM','AW','AU','AT',
  'AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BM','BT','BO','BQ','BA','BW',
  'BV','BR','IO','BN','BG','BF','BI','CV','KH','CM','CA','KY','CF','TD','CL',
  'CN','CX','CC','CO','KM','CG','CD','CK','CR','CI','HR','CU','CW','CY','CZ',
  'DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FK','FO','FJ',
  'FI','FR','GF','PF','TF','GA','GM','GE','DE','GH','GI','GR','GL','GD','GP',
  'GU','GT','GG','GN','GW','GY','HT','HM','VA','HN','HK','HU','IS','IN','ID',
  'IR','IQ','IE','IM','IL','IT','JM','JP','JE','JO','KZ','KE','KI','KP','KR',
  'KW','KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MO','MG','MW','MY',
  'MV','ML','MT','MH','MQ','MR','MU','YT','MX','FM','MD','MC','MN','ME','MS',
  'MA','MZ','MM','NA','NR','NP','NL','NC','NZ','NI','NE','NG','NU','NF','MK',
  'MP','NO','OM','PK','PW','PS','PA','PG','PY','PE','PH','PN','PL','PT','PR',
  'QA','RE','RO','RU','RW','BL','SH','KN','LC','MF','PM','VC','WS','SM','ST',
  'SA','SN','RS','SC','SL','SG','SX','SK','SI','SB','SO','ZA','GS','SS','ES',
  'LK','SD','SR','SJ','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TK','TO',
  'TT','TN','TR','TM','TC','TV','UG','UA','AE','GB','US','UM','UY','UZ','VU',
  'VE','VN','VG','VI','WF','EH','YE','ZM','ZW',
];

function countryName(code, locale) {
  if (!code) return '—';
  try {
    const lang = locale?.split('-')[0] || 'en';
    return new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(code) || code;
  } catch { return code; }
}

export default function Settings() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useAuth();
  const { locale, setLocale } = useLocale();
  const isAdmin     = ['admin', 'owner'].includes(user?.studioRole) || user?.platformRole === 'superadmin';
  const isOwner     = user?.studioRole === 'owner' || user?.platformRole === 'superadmin';

  if (!isAdmin) return <ProfilePage user={user} setUser={setUser} />;

  // Studio settings
  const [studioForm,    setStudioForm]    = useState({ name: '', locale: '', country: '' });
  const [slugForm,      setSlugForm]      = useState('');
  const [slugConfirm,   setSlugConfirm]   = useState('');
  const [currentSlug,   setCurrentSlug]   = useState('');
  const [studioSaving,  setStudioSaving]  = useState(false);
  const [slugSaving,    setSlugSaving]    = useState(false);
  const [isDefault,     setIsDefault]     = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);

  useEffect(() => {
    api.getMyStudio().then(s => {
      setStudioForm({ name: s.name || '', locale: s.locale || '', country: s.country || '' });
      setSlugForm(s.slug || '');
      setCurrentSlug(s.slug || '');
      setIsDefault(!!s.is_default);
    }).catch(() => {});
  }, []);

  async function handleStudioSave(e) {
    e.preventDefault();
    setStudioSaving(true);
    try {
      await api.updateMyStudio({ name: studioForm.name, locale: studioForm.locale || null, country: studioForm.country || null });
      setToast(t('studio_settings_saved'));
    } catch (err) { setToast(err.message); }
    finally { setStudioSaving(false); }
  }

  async function handleSlugRename(e) {
    e.preventDefault();
    if (slugConfirm !== currentSlug) { setToast(t('studio_slug_confirm')); return; }
    setSlugSaving(true);
    try {
      const updated = await api.updateMyStudio({ slug: slugForm });
      setCurrentSlug(updated.slug);
      setSlugForm(updated.slug);
      setSlugConfirm('');
      setToast(t('studio_settings_saved'));
    } catch (err) { setToast(err.message); }
    finally { setSlugSaving(false); }
  }

  const [form, setForm] = useState({
    siteTitle: '', hostname: '',
    defaultAuthor: '', defaultAuthorEmail: '',
    defaultLocale: 'fr', defaultAccess: 'public',
    defaultAllowDownloadImage: true, defaultAllowDownloadGallery: false, defaultPrivate: false,
    defaultStandalone: false,
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '', smtpFrom: '', smtpSecure: false,
  });
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState('');
  const [smtpTesting,  setSmtpTesting]  = useState(false);
  const [smtpResult,   setSmtpResult]   = useState(null);

  // License (superadmin only)
  const [licenseInfo,   setLicenseInfo]  = useState(null);
  const [licensePasting,setLicensePaste] = useState(false);
  const [licenseJson,   setLicenseJson]  = useState('');
  const [licenseApplying, setLicenseApplying] = useState(false);
  const [licenseMsg,    setLicenseMsg]   = useState(null);

  // Profile (admin view)
  const [profileName,      setProfileName]    = useState(user?.name || '');
  const [profileLocale,    setProfileLocale]  = useState(user?.locale || '');
  const [profileNotifyUp,  setProfileNotifyUp]  = useState(user?.notifyOnUpload !== false);
  const [profileNotifyPub, setProfileNotifyPub] = useState(user?.notifyOnPublish !== false);
  const [profileSaving,    setProfileSaving]  = useState(false);
  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  // Active tab — driven by URL hash (#profile, #studio, #smtp, #license)
  const TABS = ['profile', 'studio', 'smtp', 'license'];
  const hashTab = location.hash.replace('#', '');
  const [activeTab, setActiveTab] = useState(
    () => TABS.includes(hashTab) ? hashTab : 'profile'
  );
  useEffect(() => {
    const tab = location.hash.replace('#', '');
    if (TABS.includes(tab)) setActiveTab(tab);
  }, [location.hash]);
  function switchTab(tab) {
    setActiveTab(tab);
    navigate('/settings#' + tab, { replace: true });
  }

  useEffect(() => {
    if (user?.platformRole === 'superadmin') {
      api.getPlatformLicense().then(setLicenseInfo).catch(() => {});
    }
    api.getSettings().then(s => {
      setForm({
        siteTitle:                   s.siteTitle                   || '',
        hostname:                    s.hostname                    || '',
        defaultAuthor:               s.defaultAuthor               || '',
        defaultAuthorEmail:          s.defaultAuthorEmail          || '',
        defaultLocale:               s.defaultLocale               || 'fr',
        defaultAccess:               s.defaultAccess               || 'public',
        defaultAllowDownloadImage:   s.defaultAllowDownloadImage   !== false,
        defaultAllowDownloadGallery: !!s.defaultAllowDownloadGallery,
        defaultPrivate:              !!s.defaultPrivate,
        defaultStandalone:           !!s.defaultStandalone,
        smtpHost:    s.smtpHost    || '',
        smtpPort:    s.smtpPort    || 587,
        smtpUser:    s.smtpUser    || '',
        smtpPass:    '',
        smtpFrom:    s.smtpFrom    || '',
        smtpSecure:  !!s.smtpSecure,
      });
      setSmtpPassSet(!!s.smtpPassSet);
    }).catch(() => {});
  }, []);

  async function handleSmtpTest() {
    setSmtpTesting(true);
    setSmtpResult(null);
    try {
      const r = await api.smtpTest();
      setSmtpResult({ ok: true, message: t('smtp_test_ok', { to: r.to }) });
    } catch (err) {
      setSmtpResult({ ok: false, message: err.message });
    } finally {
      setSmtpTesting(false);
    }
  }

  async function handleInstallLicense(e) {
    e.preventDefault();
    setLicenseApplying(true);
    setLicenseMsg(null);
    try {
      const res = await api.installPlatformLicense(licenseJson.trim());
      setLicenseInfo(res.license);
      setLicenseJson('');
      setLicensePaste(false);
      setLicenseMsg({ ok: true, text: t('license_install_success') });
    } catch (err) {
      setLicenseMsg({ ok: false, text: err.message });
    } finally {
      setLicenseApplying(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSettings(form);
      setToast(t('settings_saved'));
    } catch (err) { setToast(t('settings_error', { msg: err.message })); }
    finally { setSaving(false); }
  }

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const updated = await api.updateMe({ name: profileName, locale: profileLocale || null, notifyOnUpload: profileNotifyUp, notifyOnPublish: profileNotifyPub });
      setUser(updated);
      if (profileLocale) setLocale(profileLocale);
      setToast(t('profile_saved'));
    } catch (err) { setToast(err.message); }
    finally { setProfileSaving(false); }
  }

  async function handleProfilePasswordChange(e) {
    e.preventDefault();
    if (newPwd !== newPwd2) { setToast(t('profile_passwords_mismatch')); return; }
    setPwdSaving(true);
    try {
      await api.changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setNewPwd2('');
      setToast(t('profile_password_updated'));
    } catch (err) { setToast(err.message); }
    finally { setPwdSaving(false); }
  }

  const set = key => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [key]: val }));
  };

  const multiOrgAllowed = (() => {
    if (!licenseInfo) return false;
    const explicitLimit = licenseInfo.limits?.organization_limit;
    const limit = explicitLimit != null
      ? explicitLimit
      : licenseInfo.features?.includes('multi_organization') ? Infinity : 1;
    return limit > 1;
  })();

  return (
    <>
      {/* Content Header */}
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0">{
                activeTab === 'studio'  ? t('settings_org_title') :
                activeTab === 'smtp'    ? t('section_smtp') :
                activeTab === 'license' ? t('section_license') :
                t('profile_title')
              }</h1>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">

          <div className="row">
            <div className="col-lg-8">

              {activeTab === 'profile' && <>

              {/* ── Identity ── */}
              <form onSubmit={handleProfileSave}>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_identity')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('profile_name')}>
                      <input className="form-control form-control-sm" value={profileName}
                        placeholder={t('profile_name_placeholder')}
                        onChange={e => setProfileName(e.target.value)} />
                    </FormRow>
                    <FormRow label={t('profile_email_label')}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>{user?.email}</span>
                    </FormRow>
                    <FormRow label={t('profile_role')}>
                      {(() => {
                        const role = user?.studioRole;
                        const platformRole = user?.platformRole;
                        const COLORS = { owner: '#7c3aed', admin: '#2563eb', collaborator: '#0891b2', photographer: '#059669', superadmin: '#dc2626' };
                        const label = platformRole === 'superadmin'
                          ? 'Superadmin'
                          : t(`role_${role}`) || role;
                        const color = COLORS[platformRole === 'superadmin' ? 'superadmin' : role] || '#6c757d';
                        return (
                          <span className="badge" style={{ backgroundColor: color, fontSize: '0.8rem', padding: '0.35em 0.65em' }}>
                            {label}
                          </span>
                        );
                      })()}
                    </FormRow>
                    <FormRow label={t('profile_language_label')}>
                      <select className="form-control form-control-sm" style={{ maxWidth: 180 }} value={profileLocale}
                        onChange={e => setProfileLocale(e.target.value)}>
                        <option value="">— {t('field_language')} —</option>
                        {['fr','en','de','es','it','pt','nl','jp'].map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </FormRow>
                    <FormRow label={t('profile_notify_upload')}>
                      <label className="d-flex align-items-center" style={{ gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="pNotifyUp"
                            checked={profileNotifyUp} onChange={e => setProfileNotifyUp(e.target.checked)} />
                          <label className="form-check-label" htmlFor="pNotifyUp"></label>
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_upload_desc')}</span>
                      </label>
                    </FormRow>
                    <FormRow label={t('profile_notify_publish')}>
                      <label className="d-flex align-items-center" style={{ gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="pNotifyPub"
                            checked={profileNotifyPub} onChange={e => setProfileNotifyPub(e.target.checked)} />
                          <label className="form-check-label" htmlFor="pNotifyPub"></label>
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_publish_desc')}</span>
                      </label>
                    </FormRow>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-primary" type="submit" disabled={profileSaving}>
                      {profileSaving ? t('saving') : t('save')}
                    </button>
                  </div>
                </div>
              </form>

              {/* ── Password ── */}
              <form onSubmit={handleProfilePasswordChange}>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_password')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('profile_current_password')}>
                      <input className="form-control form-control-sm" type="password" autoComplete="current-password"
                        value={curPwd} onChange={e => setCurPwd(e.target.value)} />
                    </FormRow>
                    <FormRow label={t('profile_new_password')}>
                      <input className="form-control form-control-sm" type="password" autoComplete="new-password"
                        value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                    </FormRow>
                    <FormRow label={t('profile_confirm_password')}>
                      <input className="form-control form-control-sm" type="password" autoComplete="new-password"
                        value={newPwd2} onChange={e => setNewPwd2(e.target.value)} />
                    </FormRow>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-primary" type="submit" disabled={pwdSaving || !curPwd || !newPwd}>
                      {pwdSaving ? t('saving') : t('save')}
                    </button>
                  </div>
                </div>
              </form>

              </>}

              {activeTab === 'studio' && <>

              {/* ── Studio settings ── */}
              <div className="card mb-3">
                <div className="card-header">
                  <h3 className="card-title">{t('section_studio')}</h3>
                </div>
                <form onSubmit={handleStudioSave}>
                  <div className="card-body">
                    <FormRow label={t('field_studio_name')}>
                      <input className="form-control form-control-sm" value={studioForm.name}
                        onChange={e => setStudioForm(f => ({ ...f, name: e.target.value }))} />
                    </FormRow>
                    <FormRow label={t('field_studio_locale')}>
                      <select className="form-control form-control-sm" style={{ maxWidth: 140 }} value={studioForm.locale}
                        onChange={e => setStudioForm(f => ({ ...f, locale: e.target.value }))}>
                        <option value="">—</option>
                        {UI_LOCALE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </FormRow>
                    <FormRow label={t('field_studio_country')}>
                      <select className="form-control form-control-sm" style={{ maxWidth: 140 }} value={studioForm.country}
                        onChange={e => setStudioForm(f => ({ ...f, country: e.target.value }))}>
                        {COUNTRIES.map(c => <option key={c} value={c}>{c ? countryName(c, locale) : '—'}</option>)}
                      </select>
                    </FormRow>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-primary" type="submit" disabled={studioSaving}>
                      {studioSaving ? t('saving') : t('save')}
                    </button>
                  </div>
                </form>
              </div>

              {/* ── Danger zone — slug ── */}
              {isOwner && (
                <div className="card card-danger card-outline mb-3">
                  <div className="card-header">
                    <h3 className="card-title text-danger">{t('section_danger')}</h3>
                  </div>
                  <form onSubmit={handleSlugRename}>
                    <div className="card-body">
                      <FormRow label={t('field_studio_slug')}>
                        <input className="form-control form-control-sm" style={{ fontFamily: 'monospace' }} value={slugForm}
                          onChange={e => setSlugForm(slugify(e.target.value) || e.target.value.toLowerCase())} />
                      </FormRow>
                      <p className="text-muted" style={{ fontSize: '0.8rem' }}>{t('studio_slug_hint')}</p>
                      <FormRow label={t('studio_slug_confirm')}>
                        <input className="form-control form-control-sm" style={{ fontFamily: 'monospace' }} value={slugConfirm}
                          placeholder={currentSlug}
                          onChange={e => setSlugConfirm(e.target.value)} />
                      </FormRow>
                    </div>
                    <div className="card-footer">
                      <button className="btn btn-danger" type="submit" disabled={slugSaving || slugForm === currentSlug}>
                        {slugSaving ? t('saving') : t('field_studio_slug')}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ── Set as default (superadmin + multi-org license only) ── */}
              {user?.platformRole === 'superadmin' && multiOrgAllowed && !isDefault && (
                <div className="card card-info card-outline">
                  <div className="card-header">
                    <h3 className="card-title">{t('section_platform')}</h3>
                  </div>
                  <div className="card-body">
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('studio_set_default_hint')}</p>
                    <button
                      className="btn btn-info"
                      disabled={settingDefault}
                      onClick={async () => {
                        setSettingDefault(true);
                        try {
                          await api.setDefaultStudio(user.studioId);
                          setIsDefault(true);
                          setToast(t('studios_toast_set_default'));
                        } catch (e) { setToast(e.message); }
                        finally { setSettingDefault(false); }
                      }}
                      type="button"
                    >
                      {settingDefault ? t('saving') : t('studios_set_default')}
                    </button>
                  </div>
                </div>
              )}

              </>}

              {/* ── License (superadmin only) ── */}
              {activeTab === 'license' && user?.platformRole === 'superadmin' && (
                <div className="card" id="license">
                  <div className="card-header">
                    <h3 className="card-title"><i className="fas fa-certificate me-2" />{t('section_license')}</h3>
                  </div>
                  <div className="card-body">
                    {licenseInfo && (() => {
                      const isValid   = licenseInfo.source === 'license';
                      const isExpired = licenseInfo.source === 'expired';
                      return (
                        <div className="mb-3">
                          <div className="d-flex align-items-center mb-2" style={{ gap: '0.75rem' }}>
                            <span className={`badge ${isValid ? 'g-success' : isExpired ? 'g-warning' : 'g-secondary'}`} style={{ fontSize: '0.8rem', padding: '0.35em 0.65em' }}>
                              {isValid ? t('license_status_valid') : isExpired ? t('license_status_expired') : t('license_status_free')}
                            </span>
                            {isValid && licenseInfo.licensee && (
                              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                {licenseInfo.licensee.name}
                                {licenseInfo.expires_at && (
                                  <span className="ms-2">· {t('license_expires_at')} {new Date(licenseInfo.expires_at).toLocaleDateString()}</span>
                                )}
                              </span>
                            )}
                          </div>
                          {isValid && (licenseInfo.features?.length > 0) && (
                            <div className="d-flex flex-wrap" style={{ gap: '0.35rem' }}>
                              {licenseInfo.features.map(f => (
                                <span key={f} className="badge bg-light border" style={{ color: '#1d4ed8', background: '#eff6ff', fontWeight: 500 }}>
                                  {f.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                          {(licenseInfo.source === 'free' || isExpired) && (
                            <p className="text-muted mt-2 mb-0" style={{ fontSize: '0.8rem' }}>{t('license_install_hint')}</p>
                          )}
                        </div>
                      );
                    })()}

                    {licenseMsg && (
                      <div className={`alert ${licenseMsg.ok ? 'alert-success' : 'alert-danger'} py-2 px-3 mb-3`} style={{ fontSize: '0.85rem' }}>
                        {licenseMsg.ok ? '✓ ' : '✗ '}{licenseMsg.text}
                      </div>
                    )}

                    {!licensePasting ? (
                      <button className="btn btn-primary" type="button"
                        onClick={() => { setLicensePaste(true); setLicenseMsg(null); }}>
                        <i className="fas fa-upload me-1" />
                        {licenseInfo?.source === 'license' ? t('license_update_btn') : t('license_install_btn')}
                      </button>
                    ) : (
                      <form onSubmit={handleInstallLicense}>
                        <div className="mb-3">
                          <textarea
                            className="form-control"
                            style={{ fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5 }}
                            rows={8}
                            placeholder={'{\n  "payload": { ... },\n  "signature": "..."\n}'}
                            value={licenseJson}
                            onChange={e => setLicenseJson(e.target.value)}
                            autoFocus
                            spellCheck={false}
                          />
                        </div>
                        <div className="d-flex" style={{ gap: '0.5rem' }}>
                          <button className="btn btn-primary" type="submit" disabled={!licenseJson.trim() || licenseApplying}>
                            {licenseApplying ? t('license_installing') : t('license_apply_btn')}
                          </button>
                          <button className="btn btn-secondary" type="button"
                            onClick={() => { setLicensePaste(false); setLicenseJson(''); setLicenseMsg(null); }}>
                            {t('cancel')}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'studio' && <form onSubmit={handleSave}>

                <div className="card mb-3">
                  <div className="card-header">
                    <h3 className="card-title">{t('section_site')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('field_site_title')}>
                      <input className="form-control form-control-sm" value={form.siteTitle} placeholder="GalleryPack"
                        onChange={set('siteTitle')} />
                    </FormRow>
                    <p className="text-muted mb-2" style={{ fontSize: '0.8rem', marginLeft: 216 }}>{t('site_title_hint')}</p>
                    <FormRow label={t('field_hostname')}>
                      <input className="form-control form-control-sm" style={{ fontFamily: 'monospace' }}
                        value={form.hostname}
                        placeholder={`https://${currentSlug || 'my-org'}.mydomain.com`}
                        onChange={set('hostname')} />
                    </FormRow>
                    <p className="text-muted mb-0" style={{ fontSize: '0.8rem', marginLeft: 216 }}>{t('field_hostname_hint')}</p>
                  </div>
                </div>

                <div className="card mb-3">
                  <div className="card-header">
                    <h3 className="card-title">{t('section_photographer')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('field_author_name')}>
                      <input className="form-control form-control-sm" value={form.defaultAuthor} placeholder={t('profile_name_placeholder')}
                        onChange={set('defaultAuthor')} />
                    </FormRow>
                    <FormRow label={t('field_author_email')}>
                      <input className="form-control form-control-sm" type="email" value={form.defaultAuthorEmail} placeholder="you@example.com"
                        onChange={set('defaultAuthorEmail')} />
                    </FormRow>
                  </div>
                </div>

                <div className="card mb-3">
                  <div className="card-header">
                    <h3 className="card-title">{t('section_gallery_defaults')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('field_language')}>
                      <select className="form-control form-control-sm" style={{ maxWidth: 140 }} value={form.defaultLocale} onChange={set('defaultLocale')}>
                        {LOCALES.map(l => <option key={l}>{l}</option>)}
                      </select>
                    </FormRow>
                    <FormRow label={t('field_access_default')}>
                      <select className="form-control form-control-sm" style={{ maxWidth: 140 }} value={form.defaultAccess} onChange={set('defaultAccess')}>
                        {ACCESS.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </FormRow>
                    <FormRow label={t('field_allow_dl_image_default')}>
                      <div className="form-check form-switch">
                        <input type="checkbox" className="form-check-input" id="dlImg"
                          checked={form.defaultAllowDownloadImage} onChange={set('defaultAllowDownloadImage')} />
                        <label className="form-check-label" htmlFor="dlImg"></label>
                      </div>
                    </FormRow>
                    <FormRow label={t('field_allow_dl_gallery_default')}>
                      <div className="form-check form-switch">
                        <input type="checkbox" className="form-check-input" id="dlGal"
                          checked={form.defaultAllowDownloadGallery} onChange={set('defaultAllowDownloadGallery')} />
                        <label className="form-check-label" htmlFor="dlGal"></label>
                      </div>
                    </FormRow>
                    <FormRow label={t('field_private_default')}>
                      <div className="form-check form-switch">
                        <input type="checkbox" className="form-check-input" id="defPriv"
                          checked={form.defaultPrivate} onChange={set('defaultPrivate')} />
                        <label className="form-check-label" htmlFor="defPriv"></label>
                      </div>
                    </FormRow>
                    <FormRow label={t('field_standalone_build')}>
                      <div className="form-check form-switch">
                        <input type="checkbox" className="form-check-input" id="defStandalone"
                          checked={form.defaultStandalone} onChange={set('defaultStandalone')} />
                        <label className="form-check-label" htmlFor="defStandalone"></label>
                      </div>
                    </FormRow>
                    <p className="text-muted mb-0" style={{ fontSize: '0.8rem', marginLeft: 216 }}>{t('field_standalone_hint')}</p>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-primary" type="submit" disabled={saving}>
                      {saving ? t('saving') : t('save_settings_btn')}
                    </button>
                  </div>
                </div>

              </form>}

              {activeTab === 'smtp' && <form onSubmit={handleSave}>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('section_smtp')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('smtp_host')}>
                      <input className="form-control form-control-sm" value={form.smtpHost} placeholder="smtp.example.com"
                        onChange={set('smtpHost')} />
                    </FormRow>
                    <FormRow label={t('smtp_port')}>
                      <input className="form-control form-control-sm" style={{ maxWidth: 90 }} type="number" value={form.smtpPort}
                        onChange={set('smtpPort')} />
                    </FormRow>
                    <FormRow label={t('smtp_user')}>
                      <input className="form-control form-control-sm" value={form.smtpUser} placeholder="user@example.com"
                        onChange={set('smtpUser')} autoComplete="off" />
                    </FormRow>
                    <FormRow label={t('smtp_password')}>
                      <input className="form-control form-control-sm" type="password" value={form.smtpPass}
                        placeholder={smtpPassSet ? t('smtp_password_set') : t('smtp_password')}
                        onChange={set('smtpPass')} autoComplete="new-password" />
                    </FormRow>
                    <FormRow label={t('smtp_from')}>
                      <input className="form-control form-control-sm" value={form.smtpFrom} placeholder="GalleryPack <noreply@example.com>"
                        onChange={set('smtpFrom')} />
                    </FormRow>
                    <FormRow label={t('smtp_tls')}>
                      <div className="d-flex align-items-center" style={{ gap: '0.5rem' }}>
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="smtpTls"
                            checked={form.smtpSecure} onChange={set('smtpSecure')} />
                          <label className="form-check-label" htmlFor="smtpTls"></label>
                        </div>
                        <small className="text-muted">{t('smtp_tls_hint')}</small>
                      </div>
                    </FormRow>
                    <div className="mt-3 ms-auto d-flex align-items-center" style={{ gap: '0.75rem' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={handleSmtpTest} disabled={smtpTesting}>
                        {smtpTesting ? t('sending') : t('smtp_test_btn')}
                      </button>
                      {smtpResult && (
                        <span className={smtpResult.ok ? 'text-success' : 'text-danger'} style={{ fontSize: '0.82rem' }}>
                          {smtpResult.ok ? '✓ ' : '✗ '}{smtpResult.message}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-primary" type="submit" disabled={saving}>
                      {saving ? t('saving') : t('save_settings_btn')}
                    </button>
                  </div>
                </div>

              </form>}

            </div>
          </div>
        </div>
      </section>
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  );
}

function FormRow({ label, children }) {
  return (
    <div className="mb-3 row mb-2">
      <label className="col-sm-3 col-form-label col-form-label-sm text-muted">{label}</label>
      <div className="col-sm-9 d-flex align-items-center">{children}</div>
    </div>
  );
}

// UI_LOCALE_OPTIONS imported above via i18n.js

function ProfilePage({ user, setUser }) {
  const t = useT();
  const navigate = useNavigate();
  const { setLocale } = useLocale();
  const [name,             setName]          = useState(user?.name || '');
  const [locale,           setLocaleSt]      = useState(user?.locale || '');
  const [notifyOnUpload,   setNotifyUpload]  = useState(user?.notifyOnUpload !== false);
  const [notifyOnPublish,  setNotifyPublish] = useState(user?.notifyOnPublish !== false);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState('');
  const [galleries, setGalleries] = useState(null);

  const [curPwd,    setCurPwd]    = useState('');
  const [newPwd,    setNewPwd]    = useState('');
  const [newPwd2,   setNewPwd2]   = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    api.myGalleries().then(setGalleries).catch(() => setGalleries([]));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateMe({ name, locale: locale || null, notifyOnUpload, notifyOnPublish });
      setUser(updated);
      if (locale) setLocale(locale);
      setToast(t('profile_saved'));
    } catch (err) { setToast(t('settings_error', { msg: err.message })); }
    finally { setSaving(false); }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (newPwd !== newPwd2) { setToast(t('profile_passwords_mismatch')); return; }
    setPwdSaving(true);
    try {
      await api.changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setNewPwd2('');
      setToast(t('profile_password_updated'));
    } catch (err) { setToast(t('settings_error', { msg: err.message })); }
    finally { setPwdSaving(false); }
  }

  const STUDIO_ROLE_LABEL = {
    photographer: t('role_photographer'), editor: t('role_editor'),
    admin: t('role_admin'), owner: t('role_owner'),
  };
  const STUDIO_ROLE_DESC = {
    photographer: t('role_photographer_desc'), editor: t('role_editor_desc'),
    admin: t('role_admin_desc'), owner: t('role_owner_desc'),
  };
  const GALLERY_ROLE_LABEL = {
    contributor: t('gallery_role_contributor'), editor: t('gallery_role_editor'),
    viewer: t('gallery_role_viewer'),
  };
  const GALLERY_ROLE_DESC = {
    contributor: t('gallery_role_contributor_desc'), editor: t('gallery_role_editor_desc'),
    viewer: t('gallery_role_viewer_desc'),
  };

  return (
    <>
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2 align-items-center">
            <div className="col-sm-6">
              <h1 className="m-0">{t('profile_title')}</h1>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">

              <form onSubmit={handleSave}>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_identity')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('profile_name')}>
                      <input className="form-control form-control-sm" value={name} placeholder={t('profile_name_placeholder')}
                        onChange={e => setName(e.target.value)} />
                    </FormRow>
                    <FormRow label={t('profile_email_label')}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>{user?.email}</span>
                    </FormRow>
                    <FormRow label={t('profile_role')}>
                      <div>
                        <strong style={{ fontSize: '0.875rem' }}>{STUDIO_ROLE_LABEL[user?.studioRole] || user?.studioRole}</strong>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>{STUDIO_ROLE_DESC[user?.studioRole]}</div>
                      </div>
                    </FormRow>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_language')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('profile_language_label')}>
                      <select className="form-control form-control-sm" style={{ maxWidth: 180 }} value={locale} onChange={e => setLocaleSt(e.target.value)}>
                        <option value="">— {t('field_language')} —</option>
                        {UI_LOCALE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </FormRow>
                    <p className="text-muted" style={{ fontSize: '0.8rem' }}>{t('profile_language_desc')}</p>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_notifications')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('profile_notify_upload')}>
                      <label className="d-flex align-items-center" style={{ gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="notifyUp"
                            checked={notifyOnUpload} onChange={e => setNotifyUpload(e.target.checked)} />
                          <label className="form-check-label" htmlFor="notifyUp"></label>
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_upload_desc')}</span>
                      </label>
                    </FormRow>
                    <FormRow label={t('profile_notify_publish')}>
                      <label className="d-flex align-items-center" style={{ gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                        <div className="form-check form-switch">
                          <input type="checkbox" className="form-check-input" id="notifyPub"
                            checked={notifyOnPublish} onChange={e => setNotifyPublish(e.target.checked)} />
                          <label className="form-check-label" htmlFor="notifyPub"></label>
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.875rem' }}>{t('profile_notify_publish_desc')}</span>
                      </label>
                    </FormRow>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-primary" type="submit" disabled={saving}>
                      {saving ? t('saving') : t('save')}
                    </button>
                  </div>
                </div>
              </form>

              <form onSubmit={handlePasswordChange}>
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_password')}</h3>
                  </div>
                  <div className="card-body">
                    <FormRow label={t('profile_current_password')}>
                      <input className="form-control form-control-sm" type="password" autoComplete="current-password"
                        value={curPwd} onChange={e => setCurPwd(e.target.value)} required />
                    </FormRow>
                    <FormRow label={t('profile_new_password')}>
                      <input className="form-control form-control-sm" type="password" autoComplete="new-password" minLength={8}
                        value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
                    </FormRow>
                    <FormRow label={t('profile_confirm_password')}>
                      <input className="form-control form-control-sm" type="password" autoComplete="new-password" minLength={8}
                        value={newPwd2} onChange={e => setNewPwd2(e.target.value)} required />
                    </FormRow>
                  </div>
                  <div className="card-footer">
                    <button className="btn btn-warning" type="submit" disabled={pwdSaving}>
                      {pwdSaving ? t('saving') : t('profile_change_password_btn')}
                    </button>
                  </div>
                </div>
              </form>

              {user?.studioRole === 'photographer' && galleries && galleries.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('profile_section_galleries')}</h3>
                  </div>
                  <div className="card-body p-0">
                    <table className="table table-sm table-hover mb-0">
                      <thead>
                        <tr>
                          <th>{t('profile_gallery_th')}</th>
                          <th style={{ width: 180 }}>{t('profile_access_th')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {galleries.map(g => (
                          <tr key={g.id}>
                            <td>
                              {g.title} <span className="text-muted">/{g.slug}/</span>
                            </td>
                            <td>
                              <span className={`badge ${g.role === 'editor' ? 'g-primary' : g.role === 'contributor' ? 'g-success' : 'g-secondary'}`}>
                                {GALLERY_ROLE_LABEL[g.role] || g.role}
                              </span>
                              <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                                {GALLERY_ROLE_DESC[g.role]}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </section>
      <Toast message={toast} onDone={() => setToast('')} />
    </>
  );
}
