// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';

export default function OrganizationDefaultsPage() {
  const [form,   setForm]   = useState({
    defaultAuthor: '', defaultAuthorEmail: '',
    defaultLocale: 'en', defaultAccess: 'public',
    defaultAllowDownloadImage: true, defaultAllowDownloadGallery: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getSettings().then(s => setForm({
      defaultAuthor:               s.defaultAuthor              || '',
      defaultAuthorEmail:          s.defaultAuthorEmail         || '',
      defaultLocale:               s.defaultLocale              || 'en',
      defaultAccess:               s.defaultAccess              || 'public',
      defaultAllowDownloadImage:   s.defaultAllowDownloadImage  !== false,
      defaultAllowDownloadGallery: !!s.defaultAllowDownloadGallery,
    })).catch(() => {});
  }, []);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.saveSettings(form);
      setSaved('Defaults saved.');
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
            <div className="col-sm-6"><h1 className="m-0">Defaults</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-8">
              <div className="alert alert-info py-2" style={{ fontSize: '0.875rem' }}>
                <i className="fas fa-info-circle me-2" />
                These values are inherited by projects and galleries unless explicitly overridden at a lower level.
              </div>

              <form onSubmit={save}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Photographer</h3></div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-sm-6 mb-3">
                        <label className="form-label">Default photographer name</label>
                        <input className="form-control" value={form.defaultAuthor} onChange={set('defaultAuthor')} placeholder="Jane Smith" />
                      </div>
                      <div className="col-sm-6 mb-3">
                        <label className="form-label">Default photographer email</label>
                        <input className="form-control" type="email" value={form.defaultAuthorEmail} onChange={set('defaultAuthorEmail')} placeholder="jane@example.com" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Access & Downloads</h3></div>
                  <div className="card-body">
                    <div className="mb-3">
                      <label className="form-label">Default access type</label>
                      <select className="form-select" value={form.defaultAccess} onChange={set('defaultAccess')}>
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                        <option value="password">Password protected</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="dlImg"
                          checked={form.defaultAllowDownloadImage} onChange={set('defaultAllowDownloadImage')} />
                        <label className="form-check-label" htmlFor="dlImg">Allow photo download</label>
                      </div>
                    </div>
                    <div className="mb-0">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="dlGal"
                          checked={form.defaultAllowDownloadGallery} onChange={set('defaultAllowDownloadGallery')} />
                        <label className="form-check-label" htmlFor="dlGal">Allow gallery ZIP download</label>
                      </div>
                    </div>
                  </div>
                </div>

                {saved && <div className="alert alert-success">{saved}</div>}
                {error && <div className="alert alert-danger">{error}</div>}

                <button type="submit" className="btn btn-primary mb-4" disabled={saving}>
                  {saving ? <><i className="fas fa-spinner fa-spin me-1" />Saving…</> : 'Save defaults'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
