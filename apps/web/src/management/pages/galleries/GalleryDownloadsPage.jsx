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

export default function GalleryDownloadsPage() {
  const t = useT();
  const { galleryId } = useParams();
  const [form,      setForm]      = useState({ allowDownloadImage: true, allowDownloadGallery: false });
  const [orgDef,    setOrgDef]    = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    Promise.all([api.getGallery(galleryId), api.getSettings()]).then(([g, s]) => {
      setForm({ allowDownloadImage: !!g.allowDownloadImage, allowDownloadGallery: !!g.allowDownloadGallery });
      if (s) setOrgDef({ img: !!s.allowDownloadImage, zip: !!s.allowDownloadGallery });
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
      setSaved(t('download_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('gal_downloads_title')}>
      <div className="row">
        <div className="col-lg-6">
          <form onSubmit={save}>
            <AdminCard title={t('gal_downloads_section')}>
              <div className="mb-3">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" id="dlImg"
                    checked={form.allowDownloadImage} onChange={set('allowDownloadImage')} />
                  <label className="form-check-label" htmlFor="dlImg">
                    {t('gal_downloads_photo_label')}
                    <small className="text-muted d-block">{t('gal_downloads_photo_hint')}</small>
                  </label>
                </div>
              </div>
              <div className="mb-0">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" id="dlGal"
                    checked={form.allowDownloadGallery} onChange={set('allowDownloadGallery')} />
                  <label className="form-check-label" htmlFor="dlGal">
                    {t('gal_downloads_zip_label')}
                    <small className="text-muted d-block">{t('gal_downloads_zip_hint')}</small>
                  </label>
                </div>
              </div>

              {orgDef && (
                <div className="mt-3 pt-3 border-top">
                  <InheritedValue label={t('org_default_label')}>
                    {t('allow_photo_download')}: {orgDef.img ? t('status_allowed') : t('status_disabled_val')} &nbsp;·&nbsp; {t('allow_zip_download')}: {orgDef.zip ? t('status_allowed') : t('status_disabled_val')}
                  </InheritedValue>
                </div>
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
