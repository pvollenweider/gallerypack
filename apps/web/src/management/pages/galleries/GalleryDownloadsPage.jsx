// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

export default function GalleryDownloadsPage() {
  const { galleryId } = useParams();
  const [form,   setForm]   = useState({ allowDownloadImage: true, allowDownloadGallery: false });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getGallery(galleryId).then(g => {
      setForm({ allowDownloadImage: !!g.allowDownloadImage, allowDownloadGallery: !!g.allowDownloadGallery });
    }).catch(() => {});
  }, [galleryId]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.checked }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.updateGallery(galleryId, form);
      setSaved('Download settings saved.');
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
          <div className="row mb-2"><div className="col-sm-6"><h1 className="m-0">Downloads</h1></div></div>
        </div>
      </div>
      <div className="app-content-body">
        <div className="container-fluid">
          <div className="row">
            <div className="col-lg-6">
              <form onSubmit={save}>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Download permissions</h3></div>
                  <div className="card-body">
                    <div className="mb-3">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="dlImg"
                          checked={form.allowDownloadImage} onChange={set('allowDownloadImage')} />
                        <label className="form-check-label" htmlFor="dlImg">
                          Allow photo download
                          <small className="text-muted d-block">Visitors can download individual photos.</small>
                        </label>
                      </div>
                    </div>
                    <div className="mb-0">
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="dlGal"
                          checked={form.allowDownloadGallery} onChange={set('allowDownloadGallery')} />
                        <label className="form-check-label" htmlFor="dlGal">
                          Allow ZIP download
                          <small className="text-muted d-block">Visitors can download the entire gallery as a ZIP.</small>
                        </label>
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
