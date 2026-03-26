// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function GalleryAccessPage() {
  const { galleryId } = useParams();
  const [form,   setForm]   = useState({ access: 'public', password: '' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getGallery(galleryId).then(g => {
      setForm({ access: g.access || 'public', password: '' });
    }).catch(() => {});
  }, [galleryId]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    const payload = { access: form.access };
    if (form.access === 'password' && form.password.trim()) payload.password = form.password.trim();
    try {
      await api.updateGallery(galleryId, payload);
      setSaved('Access settings saved.');
      setForm(f => ({ ...f, password: '' }));
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
          <div className="row mb-2"><div className="col-sm-6"><h1 className="m-0">Access</h1></div></div>
        </div>
      </div>
      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-7">
              <form onSubmit={save}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Visibility</h3></div>
                  <div className="card-body">
                    {['public', 'private', 'password'].map(v => (
                      <div key={v} className="form-check mb-2">
                        <input className="form-check-input" type="radio" name="access" id={`access-${v}`}
                          value={v} checked={form.access === v} onChange={set('access')} />
                        <label className="form-check-label" htmlFor={`access-${v}`}>
                          {v === 'public'   && 'Public — anyone with the link can view'}
                          {v === 'private'  && 'Private — only invited members can view'}
                          {v === 'password' && 'Password protected — requires a password to access'}
                        </label>
                      </div>
                    ))}

                    {form.access === 'password' && (
                      <div className="mt-3">
                        <label className="form-label">Password</label>
                        <input className="form-control" type="password" value={form.password}
                          onChange={set('password')} placeholder="Leave blank to keep existing password"
                          autoComplete="new-password" style={{ maxWidth: 300 }} />
                      </div>
                    )}
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
