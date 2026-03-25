import { useState, useEffect } from 'react';
import { useNavigate, Link }    from 'react-router-dom';
import { api }                  from '../lib/api.js';
import { useAuth }              from '../lib/auth.jsx';
import { useT }                 from '../lib/I18nContext.jsx';
import { slugify }              from '../lib/i18n.js';
import { GalleryCard }          from '../components/GalleryCard.jsx';

async function exitStudioSwitch(setUser) {
  await api.exitStudioSwitch();
  const me = await api.me();
  setUser(me);
}

export default function Dashboard() {
  const { user, logout, setUser } = useAuth();
  const t                      = useT();
  const navigate               = useNavigate();
  const [galleries,  setGalleries]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [creating,   setCreating]   = useState(false);
  const [newTitle,   setNewTitle]   = useState('');
  const [siteTitle,  setSiteTitle]  = useState('GalleryPack');
  const [filter,     setFilter]     = useState('all');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [g, s] = await Promise.all([api.listGalleries(), api.getSettings().catch(() => ({}))]);
      setGalleries(g);
      if (s.siteTitle) setSiteTitle(s.siteTitle);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const slug = slugify(title);
    try {
      const g = await api.createGallery({ slug, title });
      setCreating(false);
      setNewTitle('');
      navigate(`/galleries/${g.id}`);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleBuild(id) {
    try {
      const job = await api.triggerBuild(id);
      navigate(`/jobs/${job.id}`);
    } catch (e) { alert(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await api.deleteGallery(id);
      setGalleries(g => g.filter(x => x.id !== id));
    } catch (e) { alert(e.message); }
  }

  const previewSlug = newTitle.trim() ? slugify(newTitle.trim()) : '';
  const CAN_CREATE_ROLES = ['collaborator', 'admin', 'owner'];
  const canCreate = CAN_CREATE_ROLES.includes(user?.studioRole);

  const FILTER_ICONS = {
    all:      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="5.5" height="5.5" rx="1"/><rect x="9.5" y="1" width="5.5" height="5.5" rx="1"/><rect x="1" y="9.5" width="5.5" height="5.5" rx="1"/><rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1"/></svg>,
    private:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>,
    password: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="8" r="3.5"/><path d="M9 8h5.5M12.5 8v2M11 8v1.5"/></svg>,
    rebuild:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8A6 6 0 102 8M2 4v4h4"/></svg>,
  };
  const FILTERS = ['all','private','password','rebuild'];
  const filteredGalleries = galleries.filter(g => {
    if (filter === 'private')  return g.access !== 'public';
    if (filter === 'password') return g.access === 'password';
    if (filter === 'rebuild')  return g.needsRebuild || g.buildStatus === 'pending';
    return true;
  });

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <span style={s.logo}>{siteTitle}</span>
          {user?.studioName && <span style={s.studioName}>{user.studioName}</span>}
        </div>
        <div style={s.headerRight}>
          <span style={s.userLabel}>{user?.email}</span>
          <a href="/" target="_blank" rel="noreferrer" style={s.outlineBtn}>{t('public_site')}</a>
          {['admin','owner'].includes(user?.studioRole) && <Link to="/projects" style={s.outlineBtn}>{t('nav_projects')}</Link>}
          {['admin','owner'].includes(user?.studioRole) && <Link to="/team" style={s.outlineBtn}>{t('nav_team')}</Link>}
          {user?.platformRole === 'superadmin' && <Link to="/platform" style={{ ...s.outlineBtn, borderColor: '#7c3aed', color: '#7c3aed' }}>{t('nav_platform')}</Link>}
          {user?.platformRole === 'superadmin' && user?.studioName && (
            <button style={{ ...s.outlineBtn, borderColor: '#f59e0b', color: '#b45309' }} onClick={() => exitStudioSwitch(setUser)}>
              {t('platform_exit_switch')}
            </button>
          )}
          <Link to="/settings" style={s.outlineBtn}>{t('settings')}</Link>
          <button style={s.outlineBtn} onClick={logout}>{t('sign_out')}</button>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.toolbar}>
          <h2 style={s.heading}>{t('galleries')}</h2>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            <div style={s.filterBar}>
              {FILTERS.map(f => (
                <button key={f} style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }}
                  onClick={() => setFilter(f)}
                  title={t(`filter_${f}`)}>
                  {FILTER_ICONS[f]}
                </button>
              ))}
            </div>
            {canCreate && <button style={s.primaryBtn} onClick={() => setCreating(v => !v)}>{t('new_gallery')}</button>}
          </div>
        </div>

        {creating && (
          <form style={s.newForm} onSubmit={handleCreate}>
            <div style={s.newInputWrap}>
              <input
                style={s.input}
                placeholder={t('gallery_title_placeholder')}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                autoFocus
              />
              {previewSlug && (
                <span style={s.slugPreview}>/{previewSlug}/</span>
              )}
            </div>
            <button style={s.primaryBtn} type="submit">{t('create')}</button>
            <button style={s.outlineBtn} type="button" onClick={() => { setCreating(false); setNewTitle(''); }}>{t('cancel')}</button>
          </form>
        )}

        {loading && <p style={s.dim}>{t('loading')}</p>}
        {error   && <p style={s.err}>{error}</p>}

        {!loading && galleries.length === 0 && (
          <div style={s.empty}>
            <p>{t('no_galleries')}</p>
            {canCreate && <button style={s.primaryBtn} onClick={() => setCreating(true)}>{t('create_first_gallery')}</button>}
          </div>
        )}

        <div style={s.grid}>
          {filteredGalleries.map(g => (
            <GalleryCard key={g.id} gallery={g} onBuild={handleBuild} onDelete={handleDelete} canBuild={canCreate} />
          ))}
        </div>
      </main>
    </div>
  );
}

const s = {
  page:         { background: '#f8f8f8' },
  header:       { background: '#fff', borderBottom: '1px solid #eee', padding: '0 1.5rem', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo:         { fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
  studioName:   { fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, letterSpacing: '0.02em' },
  headerRight:  { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  userLabel:    { fontSize: '0.85rem', color: '#888' },
  main:         { maxWidth: 1100, margin: '0 auto', padding: '1.5rem' },
  toolbar:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' },
  heading:      { margin: 0, fontSize: '1.2rem', fontWeight: 700 },
  newForm:      { display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' },
  newInputWrap: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  input:        { padding: '0.5rem 0.75rem', border: '1px solid #ddd', borderRadius: 6, fontSize: '0.9rem', outline: 'none', minWidth: 260 },
  slugPreview:  { fontSize: '0.75rem', color: '#aaa', paddingLeft: '0.25rem' },
  grid:         { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' },
  empty:        { textAlign: 'center', padding: '3rem', color: '#888' },
  dim:          { color: '#888', fontSize: '0.9rem' },
  err:          { color: '#c00', fontSize: '0.9rem' },
  primaryBtn:   { padding: '0.5rem 1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' },
  outlineBtn:   { padding: '0.5rem 1rem', background: 'none', color: '#111', border: '1px solid #ddd', borderRadius: 6, fontWeight: 500, cursor: 'pointer', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  filterBar:    { display: 'flex', gap: '0.25rem', background: '#f0f0f0', borderRadius: 6, padding: '2px' },
  filterBtn:    { padding: '0.3rem', width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#888' },
  filterBtnActive: { background: '#fff', color: '#111', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
};
