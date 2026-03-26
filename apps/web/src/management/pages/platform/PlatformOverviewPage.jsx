// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminLoader } from '../../../components/ui/index.js';

export default function PlatformOverviewPage() {
  const t = useT();
  const [settings, setSettings] = useState(null);
  const [license,  setLicense]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getPlatformLicense()])
      .then(([s, l]) => { setSettings(s); setLicense(l); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminPage title={t('platform_overview_title')} maxWidth="100%">
      {loading ? (
        <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
      ) : (
        <div className="row">

          {/* SMTP status */}
          <div className="col-md-4">
            <AdminCard
              title={<><i className="fas fa-envelope me-2" />{t('platform_smtp_section')}</>}
              headerRight={
                <Link to="/admin/platform/smtp" className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>
              }
            >
              {settings?.smtpHost ? (
                <>
                  <p className="mb-1"><span className="badge bg-success me-2">{t('platform_smtp_configured')}</span></p>
                  <small className="text-muted d-block">Host: {settings.smtpHost}:{settings.smtpPort || 587}</small>
                  <small className="text-muted d-block">From: {settings.smtpFrom || settings.smtpUser || '—'}</small>
                  <small className="text-muted d-block">TLS: {settings.smtpSecure ? 'Yes' : 'No'}</small>
                </>
              ) : (
                <p className="text-muted mb-0"><span className="badge bg-secondary me-2">{t('platform_smtp_not_configured')}</span>{t('platform_smtp_disabled')}</p>
              )}
            </AdminCard>
          </div>

          {/* License status */}
          <div className="col-md-4">
            <AdminCard
              title={<><i className="fas fa-certificate me-2" />{t('license_page_title')}</>}
              headerRight={
                <Link to="/admin/platform/license" className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>
              }
            >
              {!license || license.source === 'free' ? (
                <p className="mb-0"><span className="badge bg-secondary me-2">{t('license_status_free')}</span>{license?.error && <small className="text-danger d-block mt-1">{license.error}</small>}</p>
              ) : license.source === 'expired' ? (
                <p className="mb-0"><span className="badge bg-danger me-2">{t('license_status_expired')}</span><small className="text-muted d-block mt-1">{license.licensee?.name}</small></p>
              ) : (
                <>
                  <p className="mb-1"><span className="badge bg-success me-2">{t('platform_license_active')}</span></p>
                  <small className="text-muted d-block">{t('license_licensee')}: {license.licensee?.name}</small>
                  <small className="text-muted d-block">
                    {license.expires_at ? `${t('license_expires_at')}: ${new Date(license.expires_at).toLocaleDateString()}` : t('platform_license_never_expires')}
                  </small>
                  {license.features?.length > 0 && (
                    <small className="text-muted d-block">{t('license_features')}: {license.features.join(', ')}</small>
                  )}
                </>
              )}
            </AdminCard>
          </div>

          {/* Branding status */}
          <div className="col-md-4">
            <AdminCard
              title={<><i className="fas fa-paint-brush me-2" />{t('platform_branding_section')}</>}
              headerRight={
                <Link to="/admin/platform/branding" className="btn btn-sm btn-outline-secondary">{t('gal_overview_manage')}</Link>
              }
            >
              <small className="text-muted d-block">{t('field_site_title')}: {settings?.siteTitle || <em>{t('error')}</em>}</small>
              <small className="text-muted d-block">{t('branding_base_url_label')}: {settings?.baseUrl || <em>{t('error')}</em>}</small>
              <small className="text-muted d-block mt-2 fst-italic">{t('platform_branding_logo_v2')}</small>
            </AdminCard>
          </div>

        </div>
      )}
    </AdminPage>
  );
}
