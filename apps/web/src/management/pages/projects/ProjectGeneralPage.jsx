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
import { AdminPage, AdminCard, AdminInput, AdminSelect, AdminAlert, AdminButton } from '../../../components/ui/index.js';

export default function ProjectGeneralPage() {
  const t = useT();
  const { projectId } = useParams();
  const [form,   setForm]   = useState({ name: '', slug: '', description: '', visibility: 'public' });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState('');
  const [error,  setError]  = useState('');

  useEffect(() => {
    api.getProject(projectId).then(p => {
      setForm({ name: p.name || '', slug: p.slug || '', description: p.description || '', visibility: p.visibility || 'public' });
    }).catch(() => {});
  }, [projectId]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setSaved(''); setError('');
    try {
      await api.updateProject(projectId, form);
      setSaved(t('changes_saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={t('proj_general_title')} maxWidth="100%">
      <div className="row">
        <div className="col-lg-7">
          <form onSubmit={save}>
            <AdminCard title={t('branding_identity_section')}>
              <AdminInput
                label={t('orgs_th_name')}
                value={form.name}
                onChange={set('name')}
                required
              />
              <AdminInput
                label={t('orgs_th_slug')}
                prefix="/"
                value={form.slug}
                onChange={set('slug')}
                required
                pattern="[a-z0-9-]+"
              />
              <AdminInput
                label={t('field_description')}
                value={form.description}
                onChange={set('description')}
              />
              <AdminSelect
                label={t('proj_visibility_label')}
                value={form.visibility}
                onChange={set('visibility')}
                className="mb-0"
              >
                <option value="public">{t('access_public')}</option>
                <option value="private">{t('access_private')}</option>
              </AdminSelect>
            </AdminCard>
            <AdminAlert variant="success" message={saved} />
            <AdminAlert message={error} />
            <AdminButton type="submit" loading={saving} loadingLabel={t('saving')}>
              {t('save')}
            </AdminButton>
          </form>
        </div>
      </div>
    </AdminPage>
  );
}
