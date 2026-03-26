// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';

export default function OrganizationAccessPage() {
  const [form,   setForm]   = useState({ defaultAccess: 'public', defaultAllowDownloadImage: true, defaultAllowDownloadGallery: false });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getSettings().then(s => setForm({
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
      setSaved('Access settings saved.');
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
            <div className="col-sm-6"><h1 className="m-0">Access & Privacy</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">
              <div className="alert alert-info py-2" style={{ fontSize: '0.875rem' }}>
                <i className="fas fa-info-circle me-2" />
                These are organization-level defaults. Projects and galleries can override them individually.
              </div>

              <form onSubmit={save}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Visibility</h3></div>
                  <div className="card-body">
                    <div className="mb-0">
                      <label className="form-label">Access type</label>
                      {['public', 'private', 'password'].map(v => (
                        <div key={v} className="form-check">
                          <input className="form-check-input" type="radio" name="access" id={`access-${v}`}
                            value={v} checked={form.defaultAccess === v} onChange={set('defaultAccess')} />
                          <label className="form-check-label" htmlFor={`access-${v}`}>
                            {v === 'public'   && 'Public — anyone with the link can view'}
                            {v === 'private'  && 'Private — only invited members can view'}
                            {v === 'password' && 'Password protected — requires a password to access'}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Downloads</h3></div>
                  <div className="card-body">
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
