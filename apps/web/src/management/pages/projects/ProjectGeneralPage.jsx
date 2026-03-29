// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminInput, AdminSelect, AdminAlert, AdminButton, AdminToast } from '../../../components/ui/index.js';

export default function ProjectGeneralPage() {
  const t = useT();
  const { orgId, projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [form,    setForm]    = useState({ name: '', slug: '', description: '', visibility: 'public', standaloneDefault: false });
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState('');

  // Galleries list (for danger zone)
  const [galleries,    setGalleries]    = useState([]);
  const [galLoading,   setGalLoading]   = useState(true);

  // Danger zone state
  const [showDanger,   setShowDanger]   = useState(false);
  const [confirmName,  setConfirmName]  = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState('');

  useEffect(() => {
    api.getProject(projectId).then(p => {
      setProject(p);
      setForm({ name: p.name || '', slug: p.slug || '', description: p.description || '', visibility: p.visibility || 'public', standaloneDefault: !!p.standaloneDefault });
    }).catch(() => {});

    api.getProjectGalleries(projectId)
      .then(setGalleries)
      .catch(() => {})
      .finally(() => setGalLoading(false));
  }, [projectId]);

  async function save(patch) {
    setError('');
    try {
      await api.updateProject(projectId, patch);
      setToast(t('changes_saved'));
    } catch (err) { setError(err.message); }
  }

  function fieldBlur(field) {
    return () => save({ ...form, [field]: form[field] });
  }

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function setAndSave(field) {
    return e => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      const next = { ...form, [field]: val };
      setForm(next);
      save(next);
    };
  }

  async function deleteProject() {
    if (confirmName.trim() !== project?.name) return;
    setDeleting(true); setDeleteError('');
    try {
      await api.deleteProject(projectId);
      navigate(`/admin/organizations/${orgId}`);
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  const canDelete = confirmName.trim() === project?.name;

  return (
    <AdminPage title={t('proj_general_title')} maxWidth="100%">
      <AdminToast message={toast} onDone={() => setToast('')} />

      <div className="row">
        <div className="col-lg-7">

          {/* Settings */}
          <AdminCard title={t('branding_identity_section')}>
            <AdminInput
              label={t('orgs_th_name')}
              value={form.name}
              onChange={set('name')}
              onBlur={fieldBlur('name')}
              required
            />
            <AdminInput
              label={t('orgs_th_slug')}
              prefix="/"
              value={form.slug}
              onChange={set('slug')}
              onBlur={fieldBlur('slug')}
              required
              pattern="[-a-z0-9]+"
            />
            <AdminInput
              label={t('field_description')}
              value={form.description}
              onChange={set('description')}
              onBlur={fieldBlur('description')}
            />
            <AdminSelect
              label={t('proj_visibility_label')}
              value={form.visibility}
              onChange={setAndSave('visibility')}
            >
              <option value="public">{t('access_public')}</option>
              <option value="private">{t('access_private')}</option>
            </AdminSelect>
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                id="standalone-default-toggle"
                checked={form.standaloneDefault}
                onChange={setAndSave('standaloneDefault')}
              />
              <label className="form-check-label" htmlFor="standalone-default-toggle">
                {t('proj_standalone_default_label')}
              </label>
              <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{t('proj_standalone_default_hint')}</div>
            </div>
          </AdminCard>
          <AdminAlert message={error} />

          {/* Danger zone */}
          <div className="mt-4">
            <h6 className="text-danger fw-bold mb-2" style={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
              <i className="fas fa-exclamation-triangle me-1" />{t('proj_danger_zone')}
            </h6>
            <div style={{ border: '1px solid #f87171', borderRadius: 8 }}>
              <div className="d-flex align-items-center justify-content-between p-3 gap-3">
                <div>
                  <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{t('proj_delete_title')}</div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>{t('proj_delete_desc')}</div>
                </div>
                <AdminButton
                  variant="outline-danger"
                  size="sm"
                  onClick={() => { setShowDanger(v => !v); setConfirmName(''); setDeleteError(''); }}
                >
                  {t('proj_delete_btn')}
                </AdminButton>
              </div>

              {showDanger && (
                <div style={{ borderTop: '1px solid #fca5a5', background: '#fff5f5', borderRadius: '0 0 7px 7px', padding: '1rem 1.25rem' }}>
                  {!galLoading && galleries.length > 0 && (
                    <div className="mb-3">
                      <div className="fw-semibold mb-1" style={{ fontSize: '0.82rem', color: '#b91c1c' }}>
                        <i className="fas fa-images me-1" />
                        {t('proj_delete_galleries_warning', { n: galleries.length })}
                      </div>
                      <ul className="mb-0 ps-3" style={{ fontSize: '0.8rem', color: '#374151' }}>
                        {galleries.map(g => (
                          <li key={g.id}>
                            <span className="fw-medium">{g.title || g.slug}</span>
                            <code className="ms-1 text-muted" style={{ fontSize: '0.72rem' }}>{g.slug}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!galLoading && galleries.length === 0 && (
                    <div className="mb-3 text-muted" style={{ fontSize: '0.82rem' }}>
                      <i className="fas fa-info-circle me-1" />{t('proj_delete_no_galleries')}
                    </div>
                  )}
                  <label className="form-label fw-semibold" style={{ fontSize: '0.82rem' }}>
                    {t('proj_delete_confirm_label', { name: project?.name ?? '' })}
                  </label>
                  <input
                    className="form-control form-control-sm mb-2"
                    style={{ borderColor: '#f87171', maxWidth: 320 }}
                    value={confirmName}
                    onChange={e => setConfirmName(e.target.value)}
                    placeholder={project?.name ?? ''}
                    autoFocus
                  />
                  {deleteError && <div className="text-danger small mb-2">{deleteError}</div>}
                  <div className="d-flex gap-2">
                    <AdminButton
                      variant="danger" size="sm" disabled={!canDelete}
                      loading={deleting} loadingLabel={t('proj_deleting')} onClick={deleteProject}
                    >
                      <i className="fas fa-trash me-1" />{t('proj_delete_confirm_btn')}
                    </AdminButton>
                    <AdminButton
                      variant="outline-secondary" size="sm"
                      onClick={() => { setShowDanger(false); setConfirmName(''); }} disabled={deleting}
                    >
                      {t('cancel')}
                    </AdminButton>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </AdminPage>
  );
}
