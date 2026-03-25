import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

const STUDIO_ROLES = ['photographer', 'collaborator', 'admin', 'owner'];
const ROLE_COLORS  = { owner: '#7c3aed', admin: '#2563eb', collaborator: '#0891b2', photographer: '#059669' };
const GALLERY_ROLE_COLORS = { viewer: '#888', contributor: '#059669', editor: '#0891b2' };

export default function Team() {
  const t = useT();
  const [members,     setMembers]     = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState('');

  const [invEmail,   setInvEmail]   = useState('');
  const [invRole,    setInvRole]    = useState('collaborator');
  const [inviting,   setInviting]   = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([api.listStudioMembers(), api.getInvitations()]);
      setMembers(m);
      setInvitations(i);
    } catch (e) { setToast(e.message); }
    finally { setLoading(false); }
  }

  const ownerCount = members.filter(m => m.role === 'owner').length;

  async function handleRoleChange(userId, role) {
    const member = members.find(m => m.user.id === userId);
    if (member?.role === 'owner' && role !== 'owner' && ownerCount <= 1) {
      setToast(t('team_error_last_owner_demote'));
      return;
    }
    try {
      await api.updateStudioMember(userId, role);
      setMembers(ms => ms.map(m => m.user.id === userId ? { ...m, role } : m));
      setToast(t('team_toast_role_updated'));
    } catch (e) { setToast(e.message); }
  }

  async function handleRemoveMember(userId) {
    const member = members.find(m => m.user.id === userId);
    if (member?.role === 'owner' && ownerCount <= 1) {
      setToast(t('team_error_last_owner_remove'));
      return;
    }
    if (!confirm(t('team_confirm_remove'))) return;
    try {
      await api.removeStudioMember(userId);
      setToast(t('team_toast_member_removed'));
      await load();
    } catch (e) { setToast(e.message); }
  }

  async function handleResetLink(userId) {
    try {
      const { resetUrl } = await api.adminResetLink(userId);
      await navigator.clipboard.writeText(resetUrl);
      setToast(t('team_toast_reset_link'));
    } catch (e) { setToast(e.message); }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setInviteLink('');
    try {
      const inv = await api.createInvitation({ email: invEmail, role: invRole });
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      setInviteLink(`${window.location.origin}${base}/invite/${inv.token}`);
      setInvEmail('');
      await load();
    } catch (e) { setToast(e.message); }
    finally { setInviting(false); }
  }

  async function handleRevokeInvitation(id) {
    try {
      await api.deleteInvitation(id);
      setInvitations(is => is.filter(i => i.id !== id));
      setToast(t('team_toast_invite_revoked'));
    } catch (e) { setToast(e.message); }
  }

  function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const STUDIO_ROLE_LABELS = {
    photographer: t('role_photographer'),
    collaborator: t('role_collaborator'),
    admin:        t('role_admin'),
    owner:        t('role_owner'),
  };
  const STUDIO_ROLE_DESC = {
    photographer: t('role_photographer_desc'),
    collaborator: t('role_collaborator_desc'),
    admin:        t('role_admin_desc'),
    owner:        t('role_owner_desc'),
  };
  const GALLERY_ROLE_LABELS = {
    viewer:      t('gallery_role_viewer'),
    contributor: t('gallery_role_contributor'),
    editor:      t('gallery_role_editor'),
  };

  const pending = invitations.filter(i => !i.accepted_at);

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>{t('back_to_galleries')}</Link>
        <span style={s.title}>{t('team_title')}</span>
      </header>

      <main style={s.main}>

        {/* ── Membres du studio ── */}
        <Section label={t('team_section_members')}>
          {loading ? (
            <p style={s.empty}>{t('loading')}</p>
          ) : members.length === 0 ? (
            <p style={s.empty}>{t('team_no_members')}</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{t('team_th_member')}</th>
                  <th style={s.th}>{t('team_th_role')}</th>
                  <th style={s.th}>{t('team_th_since')}</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.user.id} style={s.tr}>
                    <td style={s.td}>
                      <Link to={`/team/${m.user.id}`} style={{ fontWeight: 500, color: '#111', textDecoration: 'none' }}>{m.user.name || m.user.email}</Link>
                      {m.user.name && <div style={{ fontSize: '0.78rem', color: '#aaa' }}>{m.user.email}</div>}
                    </td>
                    <td style={s.td}>
                      <select
                        style={{ ...s.roleSelect, borderColor: ROLE_COLORS[m.role] || '#ddd', color: ROLE_COLORS[m.role] || '#555' }}
                        value={m.role}
                        onChange={e => handleRoleChange(m.user.id, e.target.value)}
                      >
                        {STUDIO_ROLES.map(r => (
                          <option key={r} value={r} title={STUDIO_ROLE_DESC[r]}>
                            {STUDIO_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <div style={s.roleDesc}>{STUDIO_ROLE_DESC[m.role]}</div>
                      {m.galleries && m.galleries.length > 0 && (
                        <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {m.galleries.map(g => (
                            <span key={g.galleryId} style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: (GALLERY_ROLE_COLORS[g.role] || '#888') + '18', color: GALLERY_ROLE_COLORS[g.role] || '#888', whiteSpace: 'nowrap' }}
                              title={`${GALLERY_ROLE_LABELS[g.role] || g.role} — "${g.galleryTitle}"`}>
                              {g.galleryTitle} — {GALLERY_ROLE_LABELS[g.role] || g.role}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ ...s.td, color: '#999', fontSize: '0.8rem' }}>{formatDate(m.user.createdAt)}</td>
                    <td style={s.td}>
                      <div style={{ display:'flex', gap:'0.4rem' }}>
                        <button style={s.removeBtn} onClick={() => handleResetLink(m.user.id)} title={t('team_reset_link_title')}>🔑</button>
                        <button
                          style={{ ...s.removeBtn, opacity: m.role === 'owner' && ownerCount <= 1 ? 0.35 : 1 }}
                          disabled={m.role === 'owner' && ownerCount <= 1}
                          onClick={() => handleRemoveMember(m.user.id)}
                        >{t('team_remove')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── Invitations en attente ── */}
        <Section label={t('team_section_invitations')}>
          {pending.length === 0 ? (
            <p style={s.empty}>{t('team_no_invitations')}</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{t('login_email')}</th>
                  <th style={s.th}>{t('team_th_role')}</th>
                  <th style={s.th}>{t('team_th_expires')}</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {pending.map(inv => (
                  <tr key={inv.id} style={s.tr}>
                    <td style={s.td}>{inv.email}</td>
                    <td style={s.td}>
                      <span style={{ ...s.roleBadge, background: (ROLE_COLORS[inv.role] || '#888') + '18', color: ROLE_COLORS[inv.role] || '#888' }}>
                        {STUDIO_ROLE_LABELS[inv.role] || inv.role}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: '#999', fontSize: '0.8rem' }}>{formatDate(inv.expires_at)}</td>
                    <td style={s.td}>
                      <button style={s.removeBtn} onClick={() => handleRevokeInvitation(inv.id)}>{t('team_revoke')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── Inviter ── */}
        <Section label={t('team_section_invite')}>
          <form onSubmit={handleInvite} style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
            <div style={{ display:'flex', gap:'0.6rem', alignItems:'flex-start', flexWrap:'wrap' }}>
              <input
                style={{ ...s.input, flex:'1 1 200px' }}
                type="email"
                placeholder={t('team_invite_email_placeholder')}
                value={invEmail}
                onChange={e => setInvEmail(e.target.value)}
                required
              />
              <div style={{ flex:'none' }}>
                <select style={{ ...s.input, width: 155 }} value={invRole} onChange={e => setInvRole(e.target.value)}>
                  {['collaborator', 'admin', 'owner'].map(r => (
                    <option key={r} value={r}>{STUDIO_ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <div style={s.roleDesc}>{STUDIO_ROLE_DESC[invRole]}</div>
              </div>
              <button style={{ ...s.btn, flex:'none', whiteSpace:'nowrap' }} type="submit" disabled={inviting}>
                {inviting ? t('sending') : t('team_invite_btn')}
              </button>
            </div>
          </form>

          {inviteLink && (
            <div style={s.inviteLinkBox}>
              <span style={s.inviteLinkLabel}>{t('team_invite_link_label')}</span>
              <div style={s.inviteLinkRow}>
                <code style={s.inviteLinkCode}>{inviteLink}</code>
                <button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(inviteLink); setToast(t('access_copied')); }}>
                  {t('team_invite_link_copy')}
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
  page:           { minHeight: '100vh', background: '#f8f8f8' },
  header:         { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', gap: '1rem' },
  back:           { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  title:          { fontWeight: 600, fontSize: '0.95rem' },
  main:           { maxWidth: 760, margin: '0 auto', padding: '1.5rem' },
  section:        { marginBottom: '2rem' },
  sectionLabel:   { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #eee' },
  empty:          { color: '#bbb', fontSize: '0.875rem', margin: '0.5rem 0' },
  table:          { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th:             { textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: '#999', fontWeight: 500, borderBottom: '1px solid #eee' },
  tr:             { borderBottom: '1px solid #f3f3f3' },
  td:             { padding: '0.55rem 0.75rem', verticalAlign: 'middle' },
  roleSelect:     { padding: '0.25rem 0.4rem', border: '1px solid', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600, background: '#fff', cursor: 'pointer' },
  roleDesc:       { fontSize: '0.72rem', color: '#aaa', marginTop: '0.2rem' },
  roleBadge:      { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600 },
  removeBtn:      { background: 'none', border: '1px solid #ddd', color: '#999', borderRadius: 4, padding: '0.2rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer' },
  input:          { flex: 1, minWidth: 200, padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none' },
  btn:            { padding: '0.45rem 1.25rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  inviteLinkBox:  { marginTop: '1rem', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, padding: '0.75rem 1rem' },
  inviteLinkLabel:{ fontSize: '0.78rem', color: '#999', display: 'block', marginBottom: '0.4rem' },
  inviteLinkRow:  { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  inviteLinkCode: { flex: 1, fontSize: '0.78rem', color: '#555', wordBreak: 'break-all', background: '#f5f5f5', padding: '0.3rem 0.5rem', borderRadius: 4 },
  copyBtn:        { padding: '0.3rem 0.75rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' },
};
