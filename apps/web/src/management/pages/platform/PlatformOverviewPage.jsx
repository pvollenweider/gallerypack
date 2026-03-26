// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function PlatformOverviewPage() {
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
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">Platform Overview</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          {loading ? (
            <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
          ) : (
            <div className="row">

              {/* SMTP status */}
              <div className="col-md-4">
                <div className="card">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-envelope me-2" />SMTP</h3>
                    <Link to="/admin/platform/smtp" className="btn btn-sm btn-outline-secondary">Configure</Link>
                  </div>
                  <div className="card-body">
                    {settings?.smtpHost ? (
                      <>
                        <p className="mb-1"><span className="badge bg-success me-2">Configured</span></p>
                        <small className="text-muted d-block">Host: {settings.smtpHost}:{settings.smtpPort || 587}</small>
                        <small className="text-muted d-block">From: {settings.smtpFrom || settings.smtpUser || '—'}</small>
                        <small className="text-muted d-block">TLS: {settings.smtpSecure ? 'Yes' : 'No'}</small>
                      </>
                    ) : (
                      <p className="text-muted mb-0"><span className="badge bg-secondary me-2">Not configured</span>Email delivery disabled.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* License status */}
              <div className="col-md-4">
                <div className="card">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-certificate me-2" />License</h3>
                    <Link to="/admin/platform/license" className="btn btn-sm btn-outline-secondary">Manage</Link>
                  </div>
                  <div className="card-body">
                    {!license || license.source === 'free' ? (
                      <p className="mb-0"><span className="badge bg-secondary me-2">Free tier</span>{license?.error && <small className="text-danger d-block mt-1">{license.error}</small>}</p>
                    ) : license.source === 'expired' ? (
                      <p className="mb-0"><span className="badge bg-danger me-2">Expired</span><small className="text-muted d-block mt-1">{license.licensee?.name}</small></p>
                    ) : (
                      <>
                        <p className="mb-1"><span className="badge bg-success me-2">Active</span></p>
                        <small className="text-muted d-block">Licensee: {license.licensee?.name}</small>
                        <small className="text-muted d-block">
                          {license.expires_at ? `Expires: ${new Date(license.expires_at).toLocaleDateString()}` : 'Never expires'}
                        </small>
                        {license.features?.length > 0 && (
                          <small className="text-muted d-block">Features: {license.features.join(', ')}</small>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Branding status */}
              <div className="col-md-4">
                <div className="card">
                  <div className="card-header d-flex align-items-center justify-content-between">
                    <h3 className="card-title mb-0"><i className="fas fa-paint-brush me-2" />Branding</h3>
                    <Link to="/admin/platform/branding" className="btn btn-sm btn-outline-secondary">Configure</Link>
                  </div>
                  <div className="card-body">
                    <small className="text-muted d-block">Site title: {settings?.siteTitle || <em>Not set</em>}</small>
                    <small className="text-muted d-block">Base URL: {settings?.baseUrl || <em>Not set</em>}</small>
                    <small className="text-muted d-block mt-2 fst-italic">Logo and favicon — V2</small>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
