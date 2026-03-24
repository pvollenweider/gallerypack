import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useT } from '../lib/I18nContext.jsx';
import { Toast } from '../components/Toast.jsx';

const STUDIO_ROLES = ['photographer', 'editor', 'admin', 'owner'];
const ROLE_COLORS  = { owner: '#7c3aed', admin: '#2563eb', editor: '#0891b2', photographer: '#059669' };
const GALLERY_ROLE_COLORS = { viewer: '#888', contributor: '#059669', editor: '#0891b2' };

export default function MemberProfile() {
  const { userId }  = useParams();
  const navigate    = useNavigate();
  const t           = useT();
  const [member,    setMember]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState('');
  const [removing,  setRemoving]  = useState(false);

  useEffect(() => {
    api.getStudioMember(userId)
      .then(setMember)
      .catch(e => setToast(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const STUDIO_ROLE_LABELS = {
    photographer: t('role_photographer'),
    editor:       t('role_editor'),
    admin:        t('role_admin'),
    owner:        t('role_owner'),
  };
  const STUDIO_ROLE_DESC = {
    photographer: t('role_photographer_desc'),
    editor:       t('role_editor_desc'),
    admin:        t('role_admin_desc'),
    owner:        t('role_owner_desc'),
  };
  const GALLERY_ROLE_LABELS = {
    viewer:      t('gallery_role_viewer'),
    contributor: t('gallery_role_contributor'),
    editor:      t('gallery_role_editor'),
  };

  async function handleRoleChange(role) {
    try {
      await api.updateStudioMember(userId, role);
      setMember(m => ({ ...m, role }));
      setToast(t('team_toast_role_updated'));
    } catch (e) { setToast(e.message); }
  }

  async function handleResetLink() {
    try {
      const { resetUrl } = await api.adminResetLink(userId);
      await navigator.clipboard.writeText(resetUrl);
      setToast(t('team_toast_reset_link'));
    } catch (e) { setToast(e.message); }
  }

  async function handleRemoveRights() {
    const name = member.user.name || member.user.email;
    if (!confirm(t('member_remove_rights_confirm', { name }))) return;
    setRemoving(true);
    try {
      await api.removeStudioMember(userId);
      setToast(t('member_rights_removed'));
      setTimeout(() => navigate('/team'), 800);
    } catch (e) {
      setToast(e.message);
      setRemoving(false);
    }
  }

  function formatDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/team" style={s.back}>{t('member_back')}</Link>
      </header>

      <main style={s.main}>
        {loading ? (
          <p style={s.empty}>{t('loading')}</p>
        ) : !member ? null : (
          <>
            {/* ── Identity card ── */}
            <div style={s.card}>
              <div style={s.avatar}>{(member.user.name || member.user.email)[0].toUpperCase()}</div>
              <div>
                <div style={s.name}>{member.user.name || member.user.email}</div>
                {member.user.name && <div style={s.email}>{member.user.email}</div>}
                <div style={s.meta}>{t('member_joined')} {formatDate(member.user.createdAt)}</div>
              </div>
            </div>

            {/* ── Studio role ── */}
            <Section label={t('member_studio_role')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <select
                  style={{ ...s.roleSelect, borderColor: ROLE_COLORS[member.role] || '#ddd', color: ROLE_COLORS[member.role] || '#555', width: 180 }}
                  value={member.role}
                  onChange={e => handleRoleChange(e.target.value)}
                >
                  {STUDIO_ROLES.map(r => (
                    <option key={r} value={r}>{STUDIO_ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <div style={s.roleDesc}>{STUDIO_ROLE_DESC[member.role]}</div>
              </div>
            </Section>

            {/* ── Gallery accesses ── */}
            <Section label={t('member_gallery_access')}>
              {member.galleries.length === 0 ? (
                <p style={s.empty}>{t('member_no_gallery_access')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {member.galleries.map(g => (
                    <div key={g.galleryId} style={s.galleryRow}>
                      <Link to={`/galleries/${g.galleryId}`} style={s.galleryTitle}>{g.galleryTitle}</Link>
                      <span style={{ ...s.roleBadge, background: (GALLERY_ROLE_COLORS[g.role] || '#888') + '18', color: GALLERY_ROLE_COLORS[g.role] || '#888' }}>
                        {GALLERY_ROLE_LABELS[g.role] || g.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── Actions ── */}
            <Section label="">
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button style={s.secondaryBtn} onClick={handleResetLink}>
                  🔑 {t('team_reset_link_title')}
                </button>
                <button
                  style={{ ...s.dangerBtn, opacity: removing ? 0.6 : 1 }}
                  disabled={removing}
                  onClick={handleRemoveRights}
                >
                  {t('member_remove_rights')}
                </button>
              </div>
            </Section>
          </>
        )}
      </main>

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={s.section}>
      {label && <h3 style={s.sectionLabel}>{label}</h3>}
      {children}
    </div>
  );
}

const s = {
  page:        { minHeight: '100vh', background: '#f8f8f8' },
  header:      { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center' },
  back:        { color: '#111', textDecoration: 'none', fontSize: '0.875rem' },
  main:        { maxWidth: 560, margin: '0 auto', padding: '1.5rem' },
  card:        { background: '#fff', borderRadius: 10, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px #0001' },
  avatar:      { width: 48, height: 48, borderRadius: '50%', background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.3rem', color: '#555', flexShrink: 0 },
  name:        { fontWeight: 600, fontSize: '1rem' },
  email:       { fontSize: '0.825rem', color: '#888', marginTop: 2 },
  meta:        { fontSize: '0.78rem', color: '#bbb', marginTop: 4 },
  section:     { background: '#fff', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem', boxShadow: '0 1px 4px #0001' },
  sectionLabel:{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aaa', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid #f0f0f0', margin: '0 0 0.75rem' },
  empty:       { color: '#bbb', fontSize: '0.875rem', margin: 0 },
  roleSelect:  { padding: '0.3rem 0.5rem', border: '1px solid', borderRadius: 4, fontSize: '0.85rem', fontWeight: 600, background: '#fff', cursor: 'pointer' },
  roleDesc:    { fontSize: '0.75rem', color: '#aaa' },
  roleBadge:   { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600 },
  galleryRow:  { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  galleryTitle:{ fontSize: '0.875rem', color: '#333', textDecoration: 'none', flex: 1 },
  secondaryBtn:{ padding: '0.45rem 0.9rem', background: '#f5f5f5', color: '#555', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer' },
  dangerBtn:   { padding: '0.45rem 0.9rem', background: '#fff', color: '#c00', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
};
