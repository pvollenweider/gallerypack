// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { AdminPage, AdminCard, AdminInput, AdminBadge, AdminAlert, AdminButton, AdminLoader } from '../../../components/ui/index.js';

const ROLES = ['owner', 'admin', 'collaborator', 'photographer'];
const ROLE_BADGE = { owner: 'danger', admin: 'primary', collaborator: 'info', photographer: 'secondary' };

export default function OrganizationTeamPage() {
  const t = useT();
  const { orgId } = useParams();
  const { user } = useAuth();
  const canManage = ['admin', 'owner'].includes(user?.studioRole) || user?.platformRole === 'superadmin';
  const canAccess = canManage;
  const [members,     setMembers]     = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Invite form
  const [name,       setName]       = useState('');
  const [email,      setEmail]      = useState('');
  const [role,       setRole]       = useState('collaborator');
  const [inviting,    setInviting]    = useState(false);
  const [inviteMsg,   setInviteMsg]   = useState('');
  const [inviteErr,   setInviteErr]   = useState('');
  const [inviteLink,  setInviteLink]  = useState('');
  const [linkCopied,  setLinkCopied]  = useState(false);

  function load() {
    setLoading(true);
    Promise.all([api.getOrganization(orgId), api.getInvitations()])
      .then(([org, inv]) => { setMembers(org.members || []); setInvitations(inv || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [orgId]);

  async function invite(e) {
    e.preventDefault();
    setInviting(true); setInviteMsg(''); setInviteErr(''); setInviteLink(''); setLinkCopied(false);
    try {
      const inv = await api.createInvitation({ name, email, role });
      setInviteMsg(t('invite_sent_to', { email }));
      if (inv?.token) {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        setInviteLink(window.location.origin + base + '/invite/' + inv.token);
      }
      setName('');
      setEmail('');
      load();
    } catch (err) {
      setInviteErr(err.message);
    } finally {
      setInviting(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  async function revokeInvite(id) {
    try {
      await api.deleteInvitation(id);
      load();
    } catch {}
  }

  async function togglePhotographer(userId) {
    try {
      await api.toggleOrgPhotographer(orgId, userId);
      load();
    } catch {}
  }

  if (!canAccess) return <Navigate to={`/admin/organizations/${orgId}`} replace />;

  return (
    <AdminPage title={t('org_team_title')} maxWidth="100%">
      {loading ? (
        <AdminLoader />
      ) : (
        <div className="row">
          <div className="col-lg-8">

            {/* Members */}
            <AdminCard title={t('org_team_members_section')} noPadding>
              {members.length === 0 ? (
                <div className="text-center text-muted py-4">{t('org_team_no_members')}</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t('inspector_th_name')}</th>
                        <th>{t('inspector_th_email')}</th>
                        <th>{t('team_th_role')}</th>
                        <th>{t('team_th_photographer')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.id}>
                          <td>{m.name || '—'}</td>
                          <td className="text-muted" style={{ fontSize: '0.85rem' }}>{m.email}</td>
                          <td>
                            <AdminBadge color={ROLE_BADGE[m.role] || 'secondary'}>{m.role}</AdminBadge>
                          </td>
                          <td>
                            {canManage ? (
                              <button
                                type="button"
                                className={`btn btn-sm ${m.is_photographer ? 'btn-primary' : 'btn-outline-secondary'}`}
                                onClick={() => togglePhotographer(m.id)}
                                title={m.is_photographer ? t('team_remove_photographer') : t('team_make_photographer')}
                              >
                                <i className="fas fa-camera" />
                              </button>
                            ) : (
                              m.is_photographer ? <i className="fas fa-camera text-primary" /> : null
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminCard>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <AdminCard title={t('org_team_pending_section')} noPadding>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr><th>{t('inspector_th_email')}</th><th>{t('team_th_role')}</th><th>{t('team_th_since')}</th><th></th></tr>
                    </thead>
                    <tbody>
                      {invitations.map(inv => (
                        <tr key={inv.id}>
                          <td>{inv.email}</td>
                          <td><AdminBadge color={ROLE_BADGE[inv.role] || 'secondary'}>{inv.role}</AdminBadge></td>
                          <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                          {canManage && (
                          <td>
                            <AdminButton variant="outline-danger" size="sm" onClick={() => revokeInvite(inv.id)} aria-label={`Revoke invitation for ${inv.email}`}>
                              <i className="fas fa-times" aria-hidden="true" />
                            </AdminButton>
                          </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminCard>
            )}

            {/* Invite — admin/owner only */}
            {canManage && <AdminCard title={t('org_team_invite_section')}>
              <form onSubmit={invite}>
                <div className="row align-items-end">
                  <div className="col-sm-4 mb-3">
                    <AdminInput
                      label={t('profile_name')}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder={t('profile_name_placeholder')}
                      className="mb-0"
                    />
                  </div>
                  <div className="col-sm-4 mb-3">
                    <AdminInput
                      label={t('login_email')}
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder={t('org_team_invite_email_placeholder')}
                      className="mb-0"
                    />
                  </div>
                  <div className="col-sm-2 mb-3">
                    <label className="form-label">{t('team_th_role')}</label>
                    <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="col-sm-2 mb-3">
                    <AdminButton type="submit" loading={inviting} loadingLabel={t('saving')} className="w-100">
                      {t('org_team_send_invite_btn')}
                    </AdminButton>
                  </div>
                </div>
                <AdminAlert variant="success" message={inviteMsg} />
                <AdminAlert message={inviteErr} />
                {inviteLink && (
                  <div className="mt-2 p-2 rounded" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <div className="text-muted mb-1" style={{ fontSize: '0.78rem' }}>{t('team_invite_link_label')}</div>
                    <div className="d-flex align-items-center gap-2">
                      <code style={{ fontSize: '0.78rem', wordBreak: 'break-all', flex: 1 }}>{inviteLink}</code>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary flex-shrink-0"
                        onClick={copyLink}
                      >
                        <i className={`fas ${linkCopied ? 'fa-check text-success' : 'fa-copy'} me-1`} />
                        {linkCopied ? t('team_invite_link_copied') : t('team_invite_link_copy')}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </AdminCard>}

          </div>
        </div>
      )}
    </AdminPage>
  );
}
