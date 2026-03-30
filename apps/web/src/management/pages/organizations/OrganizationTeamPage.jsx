// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { useAuth } from '../../../lib/auth.jsx';
import { AdminPage, AdminCard, AdminInput, AdminBadge, AdminAlert, AdminButton, AdminLoader } from '../../../components/ui/index.js';

const ROLES = ['owner', 'admin', 'collaborator', 'photographer'];
const ROLE_BADGE = { owner: 'danger', admin: 'primary', collaborator: 'info', photographer: 'secondary' };

const MDE_OPTIONS = {
  spellChecker: false,
  status: false,
  toolbar: ['heading-2', 'heading-3', '|', 'bold', 'italic', '|', 'unordered-list', 'link', '|', 'preview'],
};

export default function OrganizationTeamPage() {
  const t = useT();
  const { orgId } = useParams();
  const { user } = useAuth();
  const canManage = ['admin', 'owner'].includes(user?.studioRole) || user?.platformRole === 'superadmin';
  const canAccess = canManage;

  const [members,     setMembers]     = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // ── Edit member ───────────────────────────────────────────────────────────
  const [editing,     setEditing]     = useState(null); // member object
  const [editForm,    setEditForm]    = useState({ name: '', bio: '', isPhotographer: false, role: 'collaborator' });
  const [editSaving,  setEditSaving]  = useState(false);
  const [editMsg,     setEditMsg]     = useState('');
  const [editErr,     setEditErr]     = useState('');

  const mdeOptions = useMemo(() => MDE_OPTIONS, []);

  // ── Add member ────────────────────────────────────────────────────────────
  const [addMode,     setAddMode]     = useState('invite'); // 'invite' | 'create'

  // Invite form
  const [invName,     setInvName]     = useState('');
  const [invEmail,    setInvEmail]    = useState('');
  const [invRole,     setInvRole]     = useState('collaborator');
  const [inviting,    setInviting]    = useState(false);
  const [inviteMsg,   setInviteMsg]   = useState('');
  const [inviteErr,   setInviteErr]   = useState('');
  const [inviteLink,  setInviteLink]  = useState('');
  const [linkCopied,  setLinkCopied]  = useState(false);

  // Create form
  const [crtName,     setCrtName]     = useState('');
  const [crtEmail,    setCrtEmail]    = useState('');
  const [crtPassword, setCrtPassword] = useState('');
  const [crtRole,     setCrtRole]     = useState('collaborator');
  const [creating,    setCreating]    = useState(false);
  const [createMsg,   setCreateMsg]   = useState('');
  const [createErr,   setCreateErr]   = useState('');

  function load() {
    setLoading(true);
    Promise.all([api.getOrganization(orgId), api.getInvitations()])
      .then(([org, inv]) => { setMembers(org.members || []); setInvitations(inv || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [orgId]);

  // ── Invite ────────────────────────────────────────────────────────────────

  async function invite(e) {
    e.preventDefault();
    setInviting(true); setInviteMsg(''); setInviteErr(''); setInviteLink(''); setLinkCopied(false);
    try {
      const inv = await api.createInvitation({ name: invName, email: invEmail, role: invRole });
      setInviteMsg(t('invite_sent_to', { email: invEmail }));
      if (inv?.token) {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        setInviteLink(window.location.origin + base + '/invite/' + inv.token);
      }
      setInvName(''); setInvEmail('');
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
    try { await api.deleteInvitation(id); load(); } catch {}
  }

  // ── Create directly ───────────────────────────────────────────────────────

  async function createMember(e) {
    e.preventDefault();
    setCreating(true); setCreateMsg(''); setCreateErr('');
    try {
      await api.createOrgMember(orgId, { name: crtName, email: crtEmail, password: crtPassword, role: crtRole });
      setCreateMsg(t('team_member_created', { email: crtEmail }));
      setCrtName(''); setCrtEmail(''); setCrtPassword('');
      load();
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Edit member ───────────────────────────────────────────────────────────

  function startEdit(m) {
    setEditing(m);
    setEditForm({ name: m.name || '', bio: m.bio || '', isPhotographer: !!m.is_photographer, role: m.role });
    setEditMsg(''); setEditErr('');
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditSaving(true); setEditMsg(''); setEditErr('');
    try {
      // Update profile fields
      await api.updateOrgMember(orgId, editing.id, {
        name: editForm.name,
        bio:  editForm.bio || null,
        isPhotographer: editForm.isPhotographer,
      });
      // Update role if changed
      if (editForm.role !== editing.role) {
        await api.upsertOrgMember(orgId, editing.id, editForm.role);
      }
      setEditMsg(t('changes_saved'));
      load();
      // Update editing reference after reload (use timeout to wait for load)
      setTimeout(() => setEditing(null), 800);
    } catch (err) {
      setEditErr(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function togglePhotographer(m) {
    try {
      await api.toggleOrgPhotographer(orgId, m.id);
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

            {/* Members table */}
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
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.id} className={editing?.id === m.id ? 'table-active' : ''}>
                          <td>{m.name || '—'}</td>
                          <td className="text-muted" style={{ fontSize: '0.85rem' }}>{m.email}</td>
                          <td>
                            <AdminBadge color={ROLE_BADGE[m.role] || 'secondary'}>{m.role}</AdminBadge>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`btn btn-sm ${m.is_photographer ? 'btn-primary' : 'btn-outline-secondary'}`}
                              onClick={() => togglePhotographer(m)}
                              title={m.is_photographer ? t('team_remove_photographer') : t('team_make_photographer')}
                            >
                              <i className="fas fa-camera" />
                            </button>
                          </td>
                          <td>
                            <AdminButton
                              variant="outline-secondary"
                              size="sm"
                              icon="fas fa-pencil-alt"
                              onClick={() => editing?.id === m.id ? cancelEdit() : startEdit(m)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminCard>

            {/* Edit panel */}
            {editing && (
              <AdminCard title={`${t('team_edit_member')} — ${editing.name || editing.email}`}>
                <form onSubmit={saveEdit}>
                  <div className="row">
                    <div className="col-sm-6 mb-3">
                      <AdminInput
                        label={t('profile_name')}
                        value={editForm.name}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={t('profile_name_placeholder')}
                        className="mb-0"
                      />
                    </div>
                    <div className="col-sm-3 mb-3">
                      <label className="form-label">{t('team_th_role')}</label>
                      <select
                        className="form-select"
                        value={editForm.role}
                        onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-3 mb-3 d-flex align-items-end">
                      <div className="form-check mb-2">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="editIsPhotographer"
                          checked={editForm.isPhotographer}
                          onChange={e => setEditForm(f => ({ ...f, isPhotographer: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="editIsPhotographer">
                          <i className="fas fa-camera me-1 text-primary" />
                          {t('team_th_photographer')}
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">{t('team_bio_label')}</label>
                    <SimpleMDE
                      value={editForm.bio}
                      onChange={v => setEditForm(f => ({ ...f, bio: v }))}
                      options={mdeOptions}
                    />
                    <div className="form-text">{t('team_bio_hint')}</div>
                  </div>
                  <AdminAlert variant="success" message={editMsg} />
                  <AdminAlert message={editErr} />
                  <div className="d-flex gap-2">
                    <AdminButton type="submit" loading={editSaving} loadingLabel={t('saving')}>
                      {t('save')}
                    </AdminButton>
                    <AdminButton type="button" variant="outline-secondary" onClick={cancelEdit}>
                      {t('cancel')}
                    </AdminButton>
                  </div>
                </form>
              </AdminCard>
            )}

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
                          <td>
                            <AdminButton variant="outline-danger" size="sm" onClick={() => revokeInvite(inv.id)} aria-label={`Revoke invitation for ${inv.email}`}>
                              <i className="fas fa-times" aria-hidden="true" />
                            </AdminButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </AdminCard>
            )}

            {/* Add member — admin/owner only */}
            {canManage && (
              <AdminCard title={t('org_team_add_section')}>
                {/* Mode toggle */}
                <div className="d-flex gap-2 mb-4">
                  <button
                    type="button"
                    className={`btn btn-sm ${addMode === 'invite' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setAddMode('invite')}
                  >
                    <i className="fas fa-envelope me-1" />
                    {t('team_add_mode_invite')}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${addMode === 'create' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setAddMode('create')}
                  >
                    <i className="fas fa-user-plus me-1" />
                    {t('team_add_mode_create')}
                  </button>
                </div>

                {/* Invite by email */}
                {addMode === 'invite' && (
                  <form onSubmit={invite}>
                    <div className="row align-items-end">
                      <div className="col-sm-4 mb-3">
                        <AdminInput
                          label={t('profile_name')}
                          value={invName}
                          onChange={e => setInvName(e.target.value)}
                          placeholder={t('profile_name_placeholder')}
                          className="mb-0"
                        />
                      </div>
                      <div className="col-sm-4 mb-3">
                        <AdminInput
                          label={t('login_email')}
                          type="email"
                          value={invEmail}
                          onChange={e => setInvEmail(e.target.value)}
                          required
                          placeholder={t('org_team_invite_email_placeholder')}
                          className="mb-0"
                        />
                      </div>
                      <div className="col-sm-2 mb-3">
                        <label className="form-label">{t('team_th_role')}</label>
                        <select className="form-select" value={invRole} onChange={e => setInvRole(e.target.value)}>
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
                          <button type="button" className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={copyLink}>
                            <i className={`fas ${linkCopied ? 'fa-check text-success' : 'fa-copy'} me-1`} />
                            {linkCopied ? t('team_invite_link_copied') : t('team_invite_link_copy')}
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                )}

                {/* Create directly */}
                {addMode === 'create' && (
                  <form onSubmit={createMember}>
                    <div className="row align-items-end">
                      <div className="col-sm-3 mb-3">
                        <AdminInput
                          label={t('profile_name')}
                          value={crtName}
                          onChange={e => setCrtName(e.target.value)}
                          placeholder={t('profile_name_placeholder')}
                          className="mb-0"
                        />
                      </div>
                      <div className="col-sm-3 mb-3">
                        <AdminInput
                          label={t('login_email')}
                          type="email"
                          value={crtEmail}
                          onChange={e => setCrtEmail(e.target.value)}
                          required
                          placeholder={t('org_team_invite_email_placeholder')}
                          className="mb-0"
                        />
                      </div>
                      <div className="col-sm-2 mb-3">
                        <AdminInput
                          label={t('login_password')}
                          type="password"
                          value={crtPassword}
                          onChange={e => setCrtPassword(e.target.value)}
                          required
                          placeholder="••••••••"
                          className="mb-0"
                        />
                      </div>
                      <div className="col-sm-2 mb-3">
                        <label className="form-label">{t('team_th_role')}</label>
                        <select className="form-select" value={crtRole} onChange={e => setCrtRole(e.target.value)}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="col-sm-2 mb-3">
                        <AdminButton type="submit" loading={creating} loadingLabel={t('saving')} className="w-100">
                          {t('team_create_btn')}
                        </AdminButton>
                      </div>
                    </div>
                    <AdminAlert variant="success" message={createMsg} />
                    <AdminAlert message={createErr} />
                  </form>
                )}
              </AdminCard>
            )}

          </div>
        </div>
      )}
    </AdminPage>
  );
}
