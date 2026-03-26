// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../lib/api.js';

const ROLES = ['owner', 'admin', 'collaborator', 'photographer'];
const ROLE_BADGE = { owner: 'danger', admin: 'primary', collaborator: 'info', photographer: 'secondary' };

export default function OrganizationTeamPage() {
  const { orgId } = useParams();
  const [members,     setMembers]     = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Invite form
  const [email,      setEmail]      = useState('');
  const [role,       setRole]       = useState('collaborator');
  const [inviting,   setInviting]   = useState(false);
  const [inviteMsg,  setInviteMsg]  = useState('');
  const [inviteErr,  setInviteErr]  = useState('');

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
    setInviting(true); setInviteMsg(''); setInviteErr('');
    try {
      await api.createInvitation({ email, role });
      setInviteMsg(`Invitation sent to ${email}.`);
      setEmail('');
      load();
    } catch (err) {
      setInviteErr(err.message);
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvite(id) {
    try {
      await api.deleteInvitation(id);
      load();
    } catch {}
  }

  return (
    <>
      <div className="app-content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6"><h1 className="m-0">Team</h1></div>
          </div>
        </div>
      </div>

      <div className="app-content-body">
        <div className="container-fluid">
          {loading ? (
            <div className="text-center py-5 text-muted"><i className="fas fa-spinner fa-spin fa-2x" /></div>
          ) : (
            <div className="row">
              <div className="col-lg-8">

                {/* Members */}
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Members</h3></div>
                  <div className="card-body p-0">
                    {members.length === 0 ? (
                      <div className="text-center text-muted py-4">No members yet.</div>
                    ) : (
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map(m => (
                            <tr key={m.user_id}>
                              <td>{m.name || '—'}</td>
                              <td className="text-muted" style={{ fontSize: '0.85rem' }}>{m.email}</td>
                              <td>
                                <span className={`badge bg-${ROLE_BADGE[m.role] || 'secondary'}`}>{m.role}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Pending invitations */}
                {invitations.length > 0 && (
                  <div className="card">
                    <div className="card-header"><h3 className="card-title">Pending invitations</h3></div>
                    <div className="card-body p-0">
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light">
                          <tr><th>Email</th><th>Role</th><th>Sent</th><th></th></tr>
                        </thead>
                        <tbody>
                          {invitations.map(inv => (
                            <tr key={inv.id}>
                              <td>{inv.email}</td>
                              <td><span className={`badge bg-${ROLE_BADGE[inv.role] || 'secondary'}`}>{inv.role}</span></td>
                              <td className="text-muted" style={{ fontSize: '0.8rem' }}>{new Date(inv.created_at).toLocaleDateString()}</td>
                              <td>
                                <button className="btn btn-sm btn-outline-danger" onClick={() => revokeInvite(inv.id)}>
                                  <i className="fas fa-times" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Invite */}
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Invite member</h3></div>
                  <div className="card-body">
                    <form onSubmit={invite}>
                      <div className="row align-items-end">
                        <div className="col-sm-5 mb-3">
                          <label className="form-label">Email</label>
                          <input className="form-control" type="email" value={email}
                            onChange={e => setEmail(e.target.value)} required placeholder="member@example.com" />
                        </div>
                        <div className="col-sm-4 mb-3">
                          <label className="form-label">Role</label>
                          <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div className="col-sm-3 mb-3">
                          <button type="submit" className="btn btn-primary w-100" disabled={inviting}>
                            {inviting ? <i className="fas fa-spinner fa-spin" /> : 'Send invite'}
                          </button>
                        </div>
                      </div>
                      {inviteMsg && <div className="alert alert-success py-2">{inviteMsg}</div>}
                      {inviteErr && <div className="alert alert-danger py-2">{inviteErr}</div>}
                    </form>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
