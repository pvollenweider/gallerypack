// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function GalleryGeneralPage() {
  const { galleryId } = useParams();
  const [form,   setForm]   = useState({ title: '', slug: '', author: '', authorEmail: '', locale: 'en' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getGallery(galleryId).then(g => {
      setForm({ title: g.title || '', slug: g.slug || '', author: g.author || '', authorEmail: g.authorEmail || '', locale: g.locale || 'en' });
    }).catch(() => {});
  }, [galleryId]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.updateGallery(galleryId, form);
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
          <div className="row mb-2"><div className="col-sm-6"><h1 className="m-0">General</h1></div></div>
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
                      <label className="form-label">Title</label>
                      <input className="form-control" value={form.title} onChange={set('title')} required />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Slug</label>
                      <div className="input-group">
                        <span className="input-group-text text-muted">/</span>
                        <input className="form-control" value={form.slug} onChange={set('slug')} required pattern="[a-z0-9-]+" />
                      </div>
                    </div>
                    <div className="mb-0">
                      <label className="form-label">Locale</label>
                      <input className="form-control" value={form.locale} onChange={set('locale')} placeholder="en" />
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">Photographer</h3></div>
                  <div className="card-body">
                    <div className="row">
                      <div className="col-sm-6 mb-3">
                        <label className="form-label">Name</label>
                        <input className="form-control" value={form.author} onChange={set('author')} />
                      </div>
                      <div className="col-sm-6 mb-3">
                        <label className="form-label">Email</label>
                        <input className="form-control" type="email" value={form.authorEmail} onChange={set('authorEmail')} />
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
