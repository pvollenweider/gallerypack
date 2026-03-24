import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Toast } from '../components/Toast.jsx';

const STUDIO_ROLES = ['photographer', 'editor', 'admin', 'owner'];
const ROLE_COLORS  = { owner: '#7c3aed', admin: '#2563eb', editor: '#0891b2', photographer: '#059669' };

export default function Team() {
  const [members,     setMembers]     = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState('');

  // Invite form
  const [invEmail,    setInvEmail]    = useState('');
  const [invRole,     setInvRole]     = useState('editor');
  const [inviting,    setInviting]    = useState(false);
  const [inviteLink,  setInviteLink]  = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        api.listStudioMembers(),
        api.getInvitations(),
      ]);
      setMembers(m);
      setInvitations(i);
    } catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  async function handleRoleChange(userId, role) {
    try {
      await api.updateStudioMember(userId, role);
      setMembers(ms => ms.map(m => m.user_id === userId ? { ...m, role } : m));
      setToast('Role updated');
    } catch (e) { setToast(e.message); }
  }

  async function handleRemoveMember(userId) {
    if (!confirm('Remove this member from the studio?')) return;
    try {
      await api.removeStudioMember(userId);
      setMembers(ms => ms.filter(m => m.user_id !== userId));
      setToast('Member removed');
    } catch (e) { setToast(e.message); }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setInviteLink('');
    try {
      const inv = await api.createInvitation({ email: invEmail, role: invRole });
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const link = `${window.location.origin}${base}/invite/${inv.token}`;
      setInviteLink(link);
      setInvEmail('');
      await load(); // refresh invitation list
    } catch (e) { setToast(e.message); }
    finally { setInviting(false); }
  }

  async function handleRevokeInvitation(id) {
    try {
      await api.deleteInvitation(id);
      setInvitations(is => is.filter(i => i.id !== id));
      setToast('Invitation revoked');
    } catch (e) { setToast(e.message); }
  }

  function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>← Galleries</Link>
        <span style={s.title}>Team</span>
      </header>

      <main style={s.main}>

        {/* ── Studio members ─────────────────────────────────────────────── */}
        <Section label="Studio members">
          {loading ? (
            <p style={s.empty}>Loading…</p>
          ) : members.length === 0 ? (
            <p style={s.empty}>No members yet.</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Since</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.user.id} style={s.tr}>
                    <td style={s.td}>{m.user.email || m.user.name || m.user.id}</td>
                    <td style={s.td}>
                      <select
                        style={{ ...s.roleSelect, borderColor: ROLE_COLORS[m.role] || '#ddd', color: ROLE_COLORS[m.role] || '#555' }}
                        value={m.role}
                        onChange={e => handleRoleChange(m.user.id, e.target.value)}
                      >
                        {STUDIO_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ ...s.td, color: '#999', fontSize: '0.8rem' }}>{formatDate(m.user.createdAt)}</td>
                    <td style={s.td}>
                      <button style={s.removeBtn} onClick={() => handleRemoveMember(m.user.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── Pending invitations ────────────────────────────────────────── */}
        <Section label="Pending invitations">
          {invitations.filter(i => !i.accepted_at).length === 0 ? (
            <p style={s.empty}>No pending invitations.</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Expires</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {invitations.filter(i => !i.accepted_at).map(inv => (
                  <tr key={inv.id} style={s.tr}>
                    <td style={s.td}>{inv.email}</td>
                    <td style={s.td}>
                      <span style={{ ...s.roleBadge, background: (ROLE_COLORS[inv.role] || '#888') + '18', color: ROLE_COLORS[inv.role] || '#888' }}>
                        {inv.role}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: '#999', fontSize: '0.8rem' }}>{formatDate(inv.expires_at)}</td>
                    <td style={s.td}>
                      <button style={s.removeBtn} onClick={() => handleRevokeInvitation(inv.id)}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── Invite new member ──────────────────────────────────────────── */}
        <Section label="Invite a new member">
          <form onSubmit={handleInvite} style={s.inviteForm}>
            <input
              style={s.input}
              type="email"
              placeholder="email@example.com"
              value={invEmail}
              onChange={e => setInvEmail(e.target.value)}
              required
            />
            <select style={{ ...s.input, maxWidth: 140 }} value={invRole} onChange={e => setInvRole(e.target.value)}>
              {STUDIO_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button style={s.btn} type="submit" disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invitation'}
            </button>
          </form>

          {inviteLink && (
            <div style={s.inviteLinkBox}>
              <span style={s.inviteLinkLabel}>Invitation link (send manually):</span>
              <div style={s.inviteLinkRow}>
                <code style={s.inviteLinkCode}>{inviteLink}</code>
                <button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(inviteLink); setToast('Copied!'); }}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </Section>

      </main>

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={s.section}>
      <h3 style={s.sectionLabel}>{label}</h3>
      {children}
    </div>
  );
}

const s = {
  page:          { minHeight: '100vh', background: '#f8f8f8' },
  header:        { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' },
  back:          { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  title:         { fontWeight: 600, fontSize: '0.95rem' },
  main:          { maxWidth: 760, margin: '0 auto', padding: '1.5rem' },
  section:       { marginBottom: '2rem' },
  sectionLabel:  { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #eee' },
  empty:         { color: '#bbb', fontSize: '0.875rem', margin: '0.5rem 0' },
  table:         { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th:            { textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: '#999', fontWeight: 500, borderBottom: '1px solid #eee' },
  tr:            { borderBottom: '1px solid #f3f3f3' },
  td:            { padding: '0.55rem 0.75rem', verticalAlign: 'middle' },
  roleSelect:    { padding: '0.25rem 0.4rem', border: '1px solid', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600, background: '#fff', cursor: 'pointer' },
  roleBadge:     { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600 },
  removeBtn:     { background: 'none', border: '1px solid #ddd', color: '#999', borderRadius: 4, padding: '0.2rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer' },
  inviteForm:    { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  input:         { flex: 1, minWidth: 200, padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none' },
  btn:           { padding: '0.45rem 1.25rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  inviteLinkBox: { marginTop: '1rem', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '0.75rem 1rem' },
  inviteLinkLabel: { fontSize: '0.78rem', color: '#999', display: 'block', marginBottom: '0.4rem' },
  inviteLinkRow: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  inviteLinkCode: { flex: 1, fontSize: '0.78rem', color: '#555', wordBreak: 'break-all', background: '#f5f5f5', padding: '0.3rem 0.5rem', borderRadius: 4 },
  copyBtn:       { padding: '0.3rem 0.75rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' },
};
