// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';

const STATUS_BADGE = {
  license: <span className="badge bg-success">Active</span>,
  expired: <span className="badge bg-danger">Expired</span>,
  free:    <span className="badge bg-secondary">Free tier</span>,
};

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
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">License</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">

              {/* Current license */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Current license</h3></div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-3 text-muted"><i className="fas fa-spinner fa-spin" /></div>
                  ) : (
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
                        {features.length > 0 && (
                          <tr>
                            <th>Features</th>
                            <td>{features.map(f => <span key={f} className="badge bg-info me-1">{f}</span>)}</td>
                          </tr>
                        )}
                        {Object.keys(lim).length > 0 && (
                          <tr>
                            <th>Limits</th>
                            <td>
                              {Object.entries(lim).map(([k, v]) => (
                                <span key={k} className="badge bg-light text-dark border me-1">{k}: {v === null ? '∞' : v}</span>
                              ))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Install new license */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Install new license</h3></div>
                <div className="card-body">
                  <form onSubmit={install}>
                    <div className="mb-3">
                      <label className="form-label">License JSON</label>
                      <textarea
                        className="form-control font-monospace"
                        rows={8}
                        value={json}
                        onChange={e => setJson(e.target.value)}
                        placeholder={'{\n  "id": "...",\n  "licensee": { ... },\n  ...\n}'}
                        style={{ fontSize: '0.78rem' }}
                      />
                      <div className="form-text">Paste the signed license JSON provided by GalleryPack.</div>
                    </div>

                    {saved && <div className="alert alert-success">{saved}</div>}
                    {error && <div className="alert alert-danger">{error}</div>}

                    <button type="submit" className="btn btn-primary" disabled={saving || !json.trim()}>
                      {saving ? <><i className="fas fa-spinner fa-spin me-1" />Installing…</> : 'Install license'}
                    </button>
                  </form>
                </div>
              </div>

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
        </div>
      </div>
    </>
  );
}
