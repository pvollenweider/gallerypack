// Page d'accueil d'un studio : projets + équipe
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

function slugify(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const ROLE_COLORS = { owner: '#7c3aed', admin: '#2563eb', collaborator: '#0891b2', photographer: '#059669' };
const CAN_ADMIN   = ['admin', 'owner'];

export default function StudioHome() {
  const t                     = useT();
  const navigate              = useNavigate();
  const { user, setUser, logout } = useAuth();
  const isSuperadmin          = user?.platformRole === 'superadmin';
  const canAdmin              = CAN_ADMIN.includes(user?.studioRole) || isSuperadmin;

  // Projects
  const [projects,      setProjects]      = useState([]);
  const [projectsLoad,  setProjectsLoad]  = useState(true);
  const [creatingProj,  setCreatingProj]  = useState(false);
  const [projName,      setProjName]      = useState('');
  const [projSlug,      setProjSlug]      = useState('');
  const [projSlugTouched, setProjSlugTouched] = useState(false);

  // Team
  const [members,       setMembers]       = useState([]);
  const [membersLoad,   setMembersLoad]   = useState(true);
  const [invEmail,      setInvEmail]      = useState('');
  const [invRole,       setInvRole]       = useState('collaborator');
  const [inviting,      setInviting]      = useState(false);
  const [inviteLink,    setInviteLink]    = useState('');

  const [toast,         setToast]         = useState('');

  const ROLE_LABELS = {
    photographer: t('role_photographer'),
    collaborator: t('role_collaborator'),
    admin:        t('role_admin'),
    owner:        t('role_owner'),
  };

  const loadProjects = useCallback(async () => {
    setProjectsLoad(true);
    try { setProjects(await api.listProjects()); }
    catch (e) { setToast(e.message); }
    finally { setProjectsLoad(false); }
  }, []);

  const loadMembers = useCallback(async () => {
    if (!canAdmin) { setMembersLoad(false); return; }
    setMembersLoad(true);
    try { setMembers(await api.listStudioMembers()); }
    catch (e) { setToast(e.message); }
    finally { setMembersLoad(false); }
  }, [canAdmin]);

  useEffect(() => { loadProjects(); loadMembers(); }, [loadProjects, loadMembers]);

  function handleProjNameChange(v) {
    setProjName(v);
    if (!projSlugTouched) setProjSlug(slugify(v));
  }

  async function handleCreateProject(e) {
    e.preventDefault();
    try {
      const p = await api.createProject({ name: projName.trim(), slug: projSlug || slugify(projName) });
      setProjects(ps => [...ps, p]);
      setCreatingProj(false); setProjName(''); setProjSlug(''); setProjSlugTouched(false);
      navigate(`/projects/${p.id}`);
    } catch (err) { setToast(err.message); }
  }

  async function handleDeleteProject(id) {
    if (!confirm(t('projects_confirm_delete'))) return;
    try {
      await api.deleteProject(id);
      setProjects(ps => ps.filter(p => p.id !== id));
      setToast(t('projects_toast_deleted'));
    } catch (e) { setToast(e.message); }
  }

  async function handleRoleChange(userId, role) {
    try {
      await api.updateStudioMember(userId, role);
      setMembers(ms => ms.map(m => m.user.id === userId ? { ...m, role } : m));
    } catch (e) { setToast(e.message); }
  }

  async function handleRemoveMember(userId) {
    if (!confirm(t('team_confirm_remove'))) return;
    try {
      await api.removeStudioMember(userId);
      setMembers(ms => ms.filter(m => m.user.id !== userId));
      setToast(t('team_toast_member_removed'));
    } catch (e) { setToast(e.message); }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true); setInviteLink('');
    try {
      const inv = await api.createInvitation({ email: invEmail, role: invRole });
      setInviteLink(`${window.location.origin}/admin/invite/${inv.token}`);
      setInvEmail('');
      await loadMembers();
      setToast(t('team_toast_role_updated'));
    } catch (e) { setToast(e.message); }
    finally { setInviting(false); }
  }

  async function handleExitSwitch() {
    await api.exitStudioSwitch();
    const me = await api.me();
    setUser(me);
    navigate('/');
  }

  const ownerCount = members.filter(m => m.role === 'owner').length;

  return (
    <div style={s.page}>
      <header style={s.header}>
        {isSuperadmin
          ? <button style={s.back} onClick={handleExitSwitch}>{t('studios_back')}</button>
          : <span style={s.backPlaceholder} />
        }
        <div style={s.headerCenter}>
          <span style={s.studioName}>{user?.studioName || t('studio_untitled')}</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.userLabel}>{user?.email}</span>
          <Link to="/settings" style={s.outlineBtn}>{t('settings')}</Link>
          <button style={s.outlineBtn} onClick={logout}>{t('sign_out')}</button>
        </div>
      </header>

      <main style={s.main}>

        {/* ── Projets ── */}
        <section style={s.section}>
          <div style={s.sectionHeader}>
            <h3 style={s.sectionTitle}>{t('studio_projects_title')}</h3>
            {canAdmin && (
              <button style={s.primaryBtn} onClick={() => setCreatingProj(v => !v)}>
                {t('projects_new')}
              </button>
            )}
          </div>

          {creatingProj && (
            <form style={s.inlineForm} onSubmit={handleCreateProject}>
              <input
                style={s.input}
                placeholder={t('projects_name_placeholder')}
                value={projName}
                onChange={e => handleProjNameChange(e.target.value)}
                autoFocus required
              />
              <input
                style={{ ...s.input, maxWidth: 180, fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder="slug"
                value={projSlug}
                onChange={e => { setProjSlug(e.target.value); setProjSlugTouched(true); }}
              />
              <button style={s.primaryBtn} type="submit">{t('create')}</button>
              <button style={s.outlineBtn} type="button" onClick={() => setCreatingProj(false)}>{t('cancel')}</button>
            </form>
          )}

          {projectsLoad ? (
            <p style={s.dim}>{t('loading')}</p>
          ) : projects.length === 0 ? (
            <div style={s.emptyBox}>
              <p style={{ margin: 0 }}>{t('studio_no_projects')}</p>
              {canAdmin && (
                <button style={s.primaryBtn} onClick={() => setCreatingProj(true)}>
                  {t('studio_create_first_project')}
                </button>
              )}
            </div>
          ) : (
            <div style={s.projectGrid}>
              {projects.map(p => (
                <div key={p.id} style={s.projectCard} onClick={() => navigate(`/projects/${p.id}`)}>
                  <div style={s.projectName}>{p.name}</div>
                  <div style={s.projectSlug}>{p.slug}</div>
                  {canAdmin && (
                    <button
                      style={s.projectDelete}
                      onClick={e => { e.stopPropagation(); handleDeleteProject(p.id); }}
                      title={t('delete')}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Équipe ── */}
        {canAdmin && (
          <section style={s.section}>
            <div style={s.sectionHeader}>
              <h3 style={s.sectionTitle}>{t('studio_team_title')}</h3>
            </div>

            {membersLoad ? (
              <p style={s.dim}>{t('loading')}</p>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>{t('team_th_member')}</th>
                    <th style={s.th}>{t('team_th_role')}</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.user.id} style={s.tr}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 500 }}>{m.user.name || m.user.email}</div>
                        {m.user.name && <div style={{ fontSize: '0.75rem', color: '#aaa' }}>{m.user.email}</div>}
                      </td>
                      <td style={s.td}>
                        <select
                          style={{ ...s.roleSelect, borderColor: ROLE_COLORS[m.role] || '#ddd', color: ROLE_COLORS[m.role] || '#555' }}
                          value={m.role}
                          onChange={e => handleRoleChange(m.user.id, e.target.value)}
                        >
                          {['photographer','collaborator','admin','owner'].map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                      <td style={s.td}>
                        <button
                          style={{ ...s.smallBtn, opacity: m.role === 'owner' && ownerCount <= 1 ? 0.3 : 1 }}
                          disabled={m.role === 'owner' && ownerCount <= 1}
                          onClick={() => handleRemoveMember(m.user.id)}
                        >{t('team_remove')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Invite form */}
            <div style={s.inviteBox}>
              <p style={s.inviteTitle}>{t('studio_invite_title')}</p>
              <form style={s.inviteForm} onSubmit={handleInvite}>
                <input
                  style={s.input}
                  type="email"
                  placeholder={t('team_invite_email_placeholder')}
                  value={invEmail}
                  onChange={e => setInvEmail(e.target.value)}
                  required
                />
                <select style={{ ...s.input, maxWidth: 160 }} value={invRole} onChange={e => setInvRole(e.target.value)}>
                  {['photographer','collaborator','admin','owner'].map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button style={s.primaryBtn} type="submit" disabled={inviting}>
                  {inviting ? t('sending') : t('team_invite_btn')}
                </button>
              </form>
              {inviteLink && (
                <div style={s.inviteLinkRow}>
                  <code style={s.inviteLinkCode}>{inviteLink}</code>
                  <button style={s.outlineBtn} onClick={() => { navigator.clipboard.writeText(inviteLink); setToast(t('access_copied')); }}>
                    {t('team_invite_link_copy')}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

      </main>
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

const s = {
  page:          { minHeight: '100vh', background: '#f8f8f8' },
  header:        { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  back:          { background: 'none', border: 'none', color: '#7c3aed', fontSize: '0.875rem', cursor: 'pointer', padding: 0, fontWeight: 500 },
  backPlaceholder:{ flex: '0 0 80px' },
  headerCenter:  { flex: 1, textAlign: 'center' },
  studioName:    { fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' },
  headerRight:   { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  userLabel:     { fontSize: '0.85rem', color: '#888' },
  outlineBtn:    { padding: '0.4rem 0.85rem', background: 'none', color: '#111', border: '1px solid #ddd', borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  main:          { maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' },
  section:       { background: '#fff', borderRadius: 12, border: '1px solid #eee', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' },
  sectionTitle:  { margin: 0, fontSize: '1rem', fontWeight: 700 },
  primaryBtn:    { padding: '0.45rem 1.1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' },
  inlineForm:    { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', padding: '0.75rem', background: '#f9f9f9', borderRadius: 8, border: '1px solid #eee' },
  input:         { padding: '0.4rem 0.65rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.875rem', outline: 'none', flex: '1 1 160px' },
  emptyBox:      { padding: '2.5rem', textAlign: 'center', color: '#888', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', background: '#fafafa', borderRadius: 8, border: '1px dashed #e0e0e0' },
  projectGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' },
  projectCard:   { position: 'relative', background: '#f8f8f8', border: '1px solid #eee', borderRadius: 8, padding: '1rem 1.1rem', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s', hover: { borderColor: '#111' } },
  projectName:   { fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' },
  projectSlug:   { fontSize: '0.75rem', color: '#aaa', fontFamily: 'monospace' },
  projectDelete: { position: 'absolute', top: '0.5rem', right: '0.6rem', background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '0.9rem', padding: '0.2rem 0.3rem', lineHeight: 1 },
  table:         { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: '1.5rem' },
  th:            { textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.72rem', color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #eee' },
  tr:            { borderBottom: '1px solid #f5f5f5' },
  td:            { padding: '0.55rem 0.75rem', verticalAlign: 'middle' },
  roleSelect:    { padding: '0.2rem 0.4rem', border: '1px solid', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600, background: '#fff', cursor: 'pointer' },
  smallBtn:      { background: 'none', border: '1px solid #ddd', color: '#999', borderRadius: 4, padding: '0.2rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer' },
  inviteBox:     { background: '#f9f9f9', borderRadius: 8, padding: '1rem', border: '1px solid #eee' },
  inviteTitle:   { margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#555' },
  inviteForm:    { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  inviteLinkRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' },
  inviteLinkCode:{ flex: 1, fontSize: '0.75rem', color: '#555', wordBreak: 'break-all', background: '#f0f0f0', padding: '0.3rem 0.5rem', borderRadius: 4 },
  dim:           { color: '#888', fontSize: '0.875rem' },
};
