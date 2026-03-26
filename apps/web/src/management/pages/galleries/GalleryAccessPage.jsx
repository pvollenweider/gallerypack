// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import InheritedValue from '../../components/InheritedValue.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';

export default function GalleryAccessPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [form,        setForm]        = useState({ access: 'public', password: '' });
  const [orgDefault,  setOrgDefault]  = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.getSettings()]).then(([g, s]) => {
      setForm({ access: g.access || 'public', password: '' });
      setOrgDefault(s?.defaultAccess ?? null);
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
      setSaved(t('access_saved'));
      setForm(f => ({ ...f, password: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('gal_access_title')}>
      <div className="row">
        <div className="col-lg-7">
          <form onSubmit={save}>
            <AdminCard title={t('gal_access_visibility')}>
              {['public', 'private', 'password'].map(v => (
                <div key={v} className="form-check mb-2">
                  <input className="form-check-input" type="radio" name="access" id={`access-${v}`}
                    value={v} checked={form.access === v} onChange={set('access')} />
                  <label className="form-check-label" htmlFor={`access-${v}`}>
                    {v === 'public'   && t('access_public_full')}
                    {v === 'private'  && t('access_private_full')}
                    {v === 'password' && t('access_password_full')}
                  </label>
                </div>
              ))}

              {form.access === 'password' && (
                <div className="mt-3">
                  <label className="form-label">{t('field_password')}</label>
                  <input className="form-control" type="password" value={form.password}
                    onChange={set('password')} placeholder={t('gal_access_password_hint')}
                    autoComplete="new-password" style={{ maxWidth: 300 }} />
                </div>
              )}

              {orgDefault && (
                <InheritedValue label={t('org_default_label')}>{orgDefault}</InheritedValue>
              )}
            </AdminCard>

            <AdminAlert variant="success" message={saved} />
            <AdminAlert message={error} />
            <AdminButton type="submit" loading={saving} loadingLabel={t('saving')} className="mb-4">
              {t('save')}
            </AdminButton>
          </form>
        </div>
      </div>
    </AdminPage>
  );
}
