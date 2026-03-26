// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { AdminPage, AdminCard, AdminButton, AdminTextarea, AdminAlert } from '../../../components/ui/index.js';

const STATUS_BADGE = {
  license: <span className="badge bg-success">Active</span>,
  expired: <span className="badge bg-danger">Expired</span>,
  free:    <span className="badge bg-secondary">Free tier</span>,
};

const FEATURES = [
  { key: 'multi_organization', label: 'Multiple organizations',  icon: 'fas fa-building' },
  { key: 'custom_domain',      label: 'Custom domain',           icon: 'fas fa-globe' },
  { key: 'white_label',        label: 'White label',             icon: 'fas fa-paint-brush' },
  { key: 'api_access',         label: 'API access',              icon: 'fas fa-plug' },
];

const LIMITS = [
  { key: 'organization_limit',  label: 'Organizations' },
  { key: 'gallery_limit',       label: 'Galleries' },
  { key: 'storage_gb',          label: 'Storage (GB)' },
  { key: 'collaborator_limit',  label: 'Collaborators' },
];

export default function LicensePage() {
  const [license, setLicense]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [json,    setJson]      = useState('');
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState('');
  const [error,   setError]     = useState('');

  function load() {
    setLoading(true);
    api.getPlatformLicense()
      .then(setLicense)
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
      setSaved(`License installed for ${r.license?.licensee?.name ?? 'unknown'}.`);
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
    <AdminPage title="License">
      <div className="row">
        <div className="col-lg-7">

          {/* Current license */}
          <AdminCard title="Current license">
            {loading ? (
              <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
            ) : (
              <>
                <table className="table table-sm mb-0">
                  <tbody>
                    <tr>
                      <th style={{ width: 140 }}>Status</th>
                      <td>{STATUS_BADGE[license?.source] ?? STATUS_BADGE.free}</td>
                    </tr>
                    {license?.error && (
                      <tr><th>Error</th><td className="text-danger small">{license.error}</td></tr>
                    )}
                    {license?.licensee?.name && (
                      <tr><th>Licensee</th><td>{license.licensee.name}</td></tr>
                    )}
                    {license?.licensee?.email && (
                      <tr><th>Email</th><td>{license.licensee.email}</td></tr>
                    )}
                    {license?.issued_at && (
                      <tr><th>Issued</th><td>{new Date(license.issued_at).toLocaleDateString()}</td></tr>
                    )}
                    <tr>
                      <th>Expires</th>
                      <td>{license?.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Never'}</td>
                    </tr>
                  </tbody>
                </table>

                <hr className="my-3" />

                <p className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: '0.72rem', letterSpacing: '0.08em' }}>
                  Features
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
                  Limits
                </p>
                <div className="row g-2">
                  {LIMITS.map(({ key, label }) => {
                    const val = lim[key];
                    const display = val === undefined || val === null ? '∞' : val;
                    const unlimited = val === undefined || val === null;
                    return (
                      <div key={key} className="col-sm-6">
                        <div className="d-flex align-items-center justify-content-between px-3 py-2 rounded border bg-light">
                          <span className="text-muted" style={{ fontSize: '0.85rem' }}>{label}</span>
                          <span className={`fw-semibold ${unlimited ? 'text-success' : ''}`} style={{ fontSize: '0.9rem' }}>
                            {display}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </AdminCard>

          {/* Install new license */}
          <AdminCard title="Install new license">
            <form onSubmit={install}>
              <AdminTextarea
                label="License JSON"
                rows={8}
                value={json}
                onChange={e => setJson(e.target.value)}
                placeholder={'{\n  "id": "...",\n  "licensee": { ... },\n  ...\n}'}
                style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                hint="Paste the signed license JSON provided by GalleryPack."
              />

              <AdminAlert variant="success" message={saved} />
              <AdminAlert message={error} />

              <AdminButton type="submit" loading={saving} loadingLabel="Installing…" disabled={saving || !json.trim()}>
                Install license
              </AdminButton>
            </form>
          </AdminCard>

        </div>

        <div className="col-lg-5">
          <div className="card bg-light">
            <div className="card-body">
              <h6 className="text-muted mb-2"><i className="fas fa-info-circle me-1" />Notes</h6>
              <ul className="mb-0 ps-3" style={{ fontSize: '0.85rem' }}>
                <li>The license file is stored at <code>.gallerypack-license</code> in the deployment root.</li>
                <li>Installing a new license replaces the current one immediately — no restart required.</li>
                <li>License signatures are verified against the embedded public key.</li>
                <li>Contact GalleryPack to obtain or renew a license.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
