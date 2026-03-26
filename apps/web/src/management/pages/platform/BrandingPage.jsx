// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';

export default function BrandingPage() {
  const [form,   setForm]   = useState({ siteTitle: '', baseUrl: '' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      setForm({ siteTitle: s.siteTitle || '', baseUrl: s.baseUrl || '' });
    }).catch(() => {});
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.saveSettings(form);
      setSaved('Branding saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">Branding</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">

              <form onSubmit={save}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Identity</h3></div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Site title</label>
                      <input className="form-control" value={form.siteTitle} onChange={set('siteTitle')}
                        placeholder="GalleryPack" />
                      <div className="form-text">Used in email subjects and page titles.</div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Base URL</label>
                      <input className="form-control" value={form.baseUrl} onChange={set('baseUrl')}
                        placeholder="https://gallery.example.com" />
                      <div className="form-text">Root URL of this deployment. Used for links in emails and QR codes.</div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Logo &amp; favicon</h3></div>
                  <div className="card-body text-muted">
                    <i className="fas fa-hammer me-2" />Logo and favicon upload — V2.
                  </div>
                </div>

                {saved && <div className="alert alert-success">{saved}</div>}
                {error && <div className="alert alert-danger">{error}</div>}

                <button type="submit" className="btn btn-primary mb-4" disabled={saving}>
                  {saving ? <><i className="fas fa-spinner fa-spin me-1" />Saving…</> : 'Save'}
                </button>
              </form>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
