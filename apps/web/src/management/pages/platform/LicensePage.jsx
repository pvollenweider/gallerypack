// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminTextarea, AdminAlert } from '../../../components/ui/index.js';

export default function LicensePage() {
  const t = useT();
  const [license, setLicense]   = useState(null);
  const [usage,   setUsage]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [json,    setJson]      = useState('');
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState('');
  const [error,   setError]     = useState('');

  const STATUS_BADGE = {
    license: <span className="badge bg-success">{t('license_status_active')}</span>,
    expired: <span className="badge bg-danger">{t('license_status_expired')}</span>,
    free:    <span className="badge bg-secondary">{t('license_status_free')}</span>,
  };

  const FEATURES = [
    { key: 'multi_organization', label: t('license_feature_multi_org'),      icon: 'fas fa-building' },
    { key: 'custom_domain',      label: t('license_feature_custom_domain'),   icon: 'fas fa-globe' },
    { key: 'white_label',        label: t('license_feature_white_label'),     icon: 'fas fa-paint-brush' },
    { key: 'api_access',         label: t('license_feature_api'),             icon: 'fas fa-plug' },
  ];

  const LIMITS = [
    { key: 'organization_limit',  label: t('license_limit_orgs') },
    { key: 'gallery_limit',       label: t('license_limit_galleries') },
    { key: 'storage_gb',          label: t('license_limit_storage') },
    { key: 'collaborator_limit',  label: t('license_limit_collaborators') },
  ];

  const USAGE_KEY = {
    organization_limit: 'orgs',
    gallery_limit:      'galleries',
    storage_gb:         'storageGb',
    collaborator_limit: 'collaborators',
  };

  function load() {
    setLoading(true);
    Promise.all([
      api.getPlatformLicense(),
      api.getPlatformLicenseUsage().catch(() => null),
    ])
      .then(([lic, use]) => { setLicense(lic); setUsage(use); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function install(e) {
    e.preventDefault();
    if (!json.trim()) return;
    setSaving(true); setSaved(''); setError('');
    try {
      const r = await api.installPlatformLicense(json.trim());
      setSaved(t('license_installed_for', { name: r.license?.licensee?.name ?? t('license_unknown') }));
      setJson('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const lim = license?.limits ?? {};
  const features = license?.features ?? [];

  return (
    <AdminPage title={t('license_page_title')}>
      <div className="row">
        <div className="col-lg-7">

          <AdminCard title={t('license_current_section')}>
            {loading ? (
              <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : (
              <>
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr>
                      <th style={{ width: 140 }}>{t('license_status_label')}</th>
                      <td>{STATUS_BADGE[license?.source] ?? STATUS_BADGE.free}</td>
                    </tr>
                    {license?.error && (
                      <tr><th>{t('license_error_label')}</th><td className="text-danger small">{license.error}</td></tr>
                    )}
                    {license?.licensee?.name && (
                      <tr><th>{t('license_licensee_label')}</th><td>{license.licensee.name}</td></tr>
                    )}
                    {license?.licensee?.email && (
                      <tr><th>{t('license_email_label')}</th><td>{license.licensee.email}</td></tr>
                    )}
                    {license?.issued_at && (
                      <tr><th>{t('license_issued_label')}</th><td>{new Date(license.issued_at).toLocaleDateString()}</td></tr>
                    )}
                    <tr>
                      <th>{t('license_expires_label')}</th>
                      <td>{license?.expires_at ? new Date(license.expires_at).toLocaleDateString() : t('license_never_expires')}</td>
                    </tr>
                  </tbody>
                </table>

                <hr className="my-3" />

                <p className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.08em' }}>
                  {t('license_features_section')}
                </p>
                <div className="row g-2 mb-3">
                  {FEATURES.map(({ key, label, icon }) => {
                    const enabled = features.includes(key);
                    return (
                      <div key={key} className="col-sm-6">
                        <div className={`d-flex align-items-center gap-2 px-3 py-2 rounded border ${enabled ? 'border-success bg-success bg-opacity-10' : 'border-light bg-light'}`}>
                          <i className={`${icon} fa-fw ${enabled ? 'text-success' : 'text-muted'}`} style={{ fontSize: '0.9rem' }} />
                          <span style={{ fontSize: '0.85rem', color: enabled ? 'inherit' : '#adb5bd' }}>{label}</span>
                          <span className="ms-auto">
                            {enabled
                              ? <i className="fas fa-check-circle text-success" />
                              : <i className="fas fa-times-circle text-muted opacity-50" />
                            }
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.08em' }}>
                  {t('license_limits_section')}
                </p>
                <div className="row g-2">
                  {LIMITS.map(({ key, label }) => {
                    const val = lim[key];
                    const display = val === undefined || val === null ? '∞' : val;
                    const unlimited = val === undefined || val === null;
                    const currentUse = usage ? (usage[USAGE_KEY[key]] ?? 0) : null;
                    const pct = (!unlimited && val > 0 && currentUse !== null) ? Math.min(100, Math.round((currentUse / val) * 100)) : null;
                    const barColor = pct === null ? null : pct >= 90 ? '#dc3545' : pct >= 70 ? '#fd7e14' : '#198754';
                    return (
                      <div key={key} className="col-sm-6">
                        <div className="px-3 py-2 rounded border bg-light">
                          <div className="d-flex align-items-center justify-content-between mb-1">
                            <span className="text-muted" style={{ fontSize: '0.85rem' }}>{label}</span>
                            <span className={`fw-semibold ${unlimited ? 'text-success' : ''}`} style={{ fontSize: '0.9rem' }}>
                              {currentUse !== null && <span className="text-muted fw-normal me-1" style={{ fontSize: '0.8rem' }}>{currentUse} /</span>}{display}
                            </span>
                          </div>
                          {pct !== null && (
                            <div className="progress" style={{ height: 4 }}>
                              <div className="progress-bar" style={{ width: `${pct}%`, background: barColor }} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </AdminCard>

          <AdminCard title={t('license_install_section')}>
            <form onSubmit={install}>
              <AdminTextarea
                label={t('license_json_label')}
                rows={8}
                value={json}
                onChange={e => setJson(e.target.value)}
                placeholder={'{\n  "id": "...",\n  "licensee": { ... },\n  ...\n}'}
                style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                hint={t('license_json_hint')}
              />

              <AdminAlert variant="success" message={saved} />
              <AdminAlert message={error} />

              <AdminButton type="submit" loading={saving} loadingLabel={t('license_installing')} disabled={saving || !json.trim()}>
                {t('license_install_btn')}
              </AdminButton>
            </form>
          </AdminCard>

        </div>

        <div className="col-lg-5">
          <div className="card bg-light">
            <div className="card-body">
              <h6 className="text-muted mb-2"><i className="fas fa-info-circle me-1" />{t('license_notes_section')}</h6>
              <ul className="mb-0 ps-3" style={{ fontSize: '0.85rem' }}>
                <li>{t('license_note_file_location')}</li>
                <li>{t('license_note_no_restart')}</li>
                <li>{t('license_note_verification')}</li>
                <li>{t('license_note_contact')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
