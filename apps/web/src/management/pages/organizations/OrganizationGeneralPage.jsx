// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

const LOCALES = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },   { value: 'ja', label: 'Japanese' },
];

export default function OrganizationGeneralPage() {
  const { orgId } = useParams();
  const [form,    setForm]    = useState({ name: '', slug: '', locale: 'en', country: '' });
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState('');
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.getOrganization(orgId).then(org => {
      setForm({ name: org.name || '', slug: org.slug || '', locale: org.locale || 'en', country: org.country || '' });
    }).catch(() => {});
  }, [orgId]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.updateOrganization(orgId, form);
      setSaved('Changes saved.');
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
            <div className="col-sm-6"><h1 className="m-0">General</h1></div>
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
                      <label className="form-label">Name</label>
                      <input className="form-control" value={form.name} onChange={set('name')} required />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Slug</label>
                      <div className="input-group">
                        <span className="input-group-text text-muted">/</span>
                        <input className="form-control" value={form.slug} onChange={set('slug')}
                          pattern="[a-z0-9-]+" title="Lowercase letters, numbers and hyphens only" required />
                      </div>
                      <div className="form-text">Used in URLs. Lowercase letters, numbers, and hyphens only.</div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Locale</h3></div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-sm-6 mb-3">
                        <label className="form-label">Default language</label>
                        <select className="form-select" value={form.locale} onChange={set('locale')}>
                          {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      </div>
                      <div className="col-sm-6 mb-3">
                        <label className="form-label">Country</label>
                        <input className="form-control" value={form.country} onChange={set('country')}
                          placeholder="CH" maxLength={2} style={{ textTransform: 'uppercase' }} />
                        <div className="form-text">ISO 3166-1 alpha-2 (e.g. CH, FR, US)</div>
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
