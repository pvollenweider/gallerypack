// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { AdminPage, AdminCard, AdminInput, AdminButton, AdminBadge, AdminAlert, AdminToast, AdminLoader } from '../../../components/ui/index.js';

export default function PlatformTeamPage() {
  const t = useT();
  const { user: me } = useAuth();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState('');
  const [error,   setError]   = useState('');

  // Add form
  const [searchEmail, setSearchEmail] = useState('');
  const [found,       setFound]       = useState(null); // user object or false
  const [granting,    setGranting]    = useState(false);

  function load() {
    setLoading(true);
    api.listPlatformUsers()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const superadmins = users.filter(u => u.platform_role === 'superadmin');

  function handleSearch(e) {
    e.preventDefault();
    const email = searchEmail.trim().toLowerCase();
    const match = users.find(u => u.email.toLowerCase() === email);
    setFound(match || false);
  }

  async function grant(userId) {
    setGranting(true);
    try {
      await api.updatePlatformUser(userId, { platformRole: 'superadmin' });
      setToast(t('platform_team_granted'));
      setSearchEmail('');
      setFound(null);
      load();
    } catch (err) { setError(err.message); }
    finally { setGranting(false); }
  }

  async function revoke(userId) {
    if (!confirm(t('platform_team_revoke_confirm'))) return;
    try {
      await api.updatePlatformUser(userId, { platformRole: null });
      setToast(t('platform_team_revoked'));
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <AdminPage title={t('platform_team_title')} maxWidth="100%">
      <AdminToast message={toast} onDone={() => setToast('')} />
      <AdminAlert message={error} />

      <div className="row">
        <div className="col-lg-8">

          {/* Current superadmins */}
          <AdminCard title={t('platform_team_admins_section')} noPadding>
            {loading ? <AdminLoader /> : superadmins.length === 0 ? (
              <div className="text-center text-muted py-4">{t('platform_team_no_admins')}</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>{t('inspector_th_name')}</th>
                      <th>{t('inspector_th_email')}</th>
                      <th>{t('team_th_role')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {superadmins.map(u => (
                      <tr key={u.id}>
                        <td>{u.name || '—'}</td>
                        <td className="text-muted" style={{ fontSize: '0.85rem' }}>{u.email}</td>
                        <td><AdminBadge color="danger">superadmin</AdminBadge></td>
                        <td className="text-end">
                          {u.id !== me?.id && (
                            <AdminButton
                              variant="outline-danger"
                              size="sm"
                              onClick={() => revoke(u.id)}
                            >
                              {t('platform_team_revoke_btn')}
                            </AdminButton>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminCard>

          {/* Add superadmin */}
          <AdminCard title={t('platform_team_add_section')}>
            <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
              {t('platform_team_add_hint')}
            </p>
            <form onSubmit={handleSearch}>
              <div className="d-flex gap-2 align-items-end">
                <div className="flex-grow-1">
                  <AdminInput
                    label={t('login_email')}
                    type="email"
                    value={searchEmail}
                    onChange={e => { setSearchEmail(e.target.value); setFound(null); }}
                    placeholder={t('org_team_invite_email_placeholder')}
                    className="mb-0"
                    required
                  />
                </div>
                <AdminButton type="submit" variant="outline-secondary" size="sm" style={{ marginBottom: '1rem' }}>
                  {t('platform_team_search_btn')}
                </AdminButton>
              </div>
            </form>

            {found === false && (
              <div className="text-danger mt-2" style={{ fontSize: '0.85rem' }}>
                <i className="fas fa-exclamation-circle me-1" />
                {t('platform_team_not_found')}
              </div>
            )}

            {found && (
              <div className="mt-3 p-3 rounded d-flex align-items-center justify-content-between"
                style={{ background: '#f8f9fa', border: '1px solid #dee2e6' }}>
                <div>
                  <div className="fw-semibold">{found.name || found.email}</div>
                  {found.name && <div className="text-muted" style={{ fontSize: '0.82rem' }}>{found.email}</div>}
                  {found.platform_role === 'superadmin' && (
                    <AdminBadge color="danger" className="mt-1">already superadmin</AdminBadge>
                  )}
                </div>
                {found.platform_role !== 'superadmin' && (
                  <AdminButton
                    loading={granting}
                    loadingLabel={t('saving')}
                    onClick={() => grant(found.id)}
                  >
                    {t('platform_team_grant_btn')}
                  </AdminButton>
                )}
              </div>
            )}
          </AdminCard>

        </div>
      </div>
    </AdminPage>
  );
}
