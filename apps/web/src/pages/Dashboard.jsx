import { useState, useEffect } from 'react';
import { useNavigate, Link }    from 'react-router-dom';
import { api }                  from '../lib/api.js';
import { useAuth }              from '../lib/auth.jsx';
import { GalleryCard }          from '../components/GalleryCard.jsx';

export default function Dashboard() {
  const { user, logout }       = useAuth();
  const navigate               = useNavigate();
  const [galleries,  setGalleries]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [creating,   setCreating]   = useState(false);
  const [newSlug,    setNewSlug]    = useState('');
  const [siteTitle,  setSiteTitle]  = useState('GalleryPack');

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
    if (!newSlug.trim()) return;
    try {
      const g = await api.createGallery({ slug: newSlug.trim(), title: newSlug.trim() });
      setCreating(false);
      setNewSlug('');
      navigate(`/galleries/${g.id}`);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleBuild(id) {
    try {
      const job = await api.triggerBuild(id);
      navigate(`/jobs/${job.id}`);
    } catch (e) { alert(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this gallery?')) return;
    try {
      await api.deleteGallery(id);
      setGalleries(g => g.filter(x => x.id !== id));
    } catch (e) { alert(e.message); }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <span style={s.logo}>{siteTitle}</span>
        <div style={s.headerRight}>
          <span style={s.userLabel}>{user?.email}</span>
          <Link to="/settings" style={s.outlineBtn}>Settings</Link>
          <button style={s.outlineBtn} onClick={logout}>Sign out</button>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.toolbar}>
          <h2 style={s.heading}>Galleries</h2>
          <button style={s.primaryBtn} onClick={() => setCreating(v => !v)}>+ New gallery</button>
        </div>

        {creating && (
          <form style={s.newForm} onSubmit={handleCreate}>
            <input
              style={s.input}
              placeholder="gallery-slug"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value)}
              autoFocus
            />
            <button style={s.primaryBtn} type="submit">Create</button>
            <button style={s.outlineBtn} type="button" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        )}

        {loading && <p style={s.dim}>Loading…</p>}
        {error   && <p style={s.err}>{error}</p>}

        {!loading && galleries.length === 0 && (
          <div style={s.empty}>
            <p>No galleries yet.</p>
            <button style={s.primaryBtn} onClick={() => setCreating(true)}>Create your first gallery</button>
          </div>
        )}

        <div style={s.grid}>
          {galleries.map(g => (
            <GalleryCard key={g.id} gallery={g} onBuild={handleBuild} onDelete={handleDelete} />
          ))}
        </div>
      </main>
    </div>
  );
}

const s = {
  page:       { minHeight:'100vh', background:'#f8f8f8' },
  header:     { background:'#fff', borderBottom:'1px solid #eee', padding:'0 1.5rem', height:52, display:'flex', alignItems:'center', justifyContent:'space-between' },
  logo:       { fontWeight:700, letterSpacing:'-0.02em' },
  headerRight:{ display:'flex', alignItems:'center', gap:'0.75rem' },
  userLabel:  { fontSize:'0.85rem', color:'#888' },
  main:       { maxWidth:1100, margin:'0 auto', padding:'1.5rem 1.5rem' },
  toolbar:    { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' },
  heading:    { margin:0, fontSize:'1.2rem', fontWeight:700 },
  newForm:    { display:'flex', gap:'0.5rem', marginBottom:'1.25rem', alignItems:'center' },
  input:      { padding:'0.5rem 0.75rem', border:'1px solid #ddd', borderRadius:6, fontSize:'0.9rem', outline:'none' },
  grid:       { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'1rem' },
  empty:      { textAlign:'center', padding:'3rem', color:'#888' },
  dim:        { color:'#888', fontSize:'0.9rem' },
  err:        { color:'#c00', fontSize:'0.9rem' },
  primaryBtn: { padding:'0.5rem 1rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' },
  outlineBtn: { padding:'0.5rem 1rem', background:'none', color:'#111', border:'1px solid #ddd', borderRadius:6, fontWeight:500, cursor:'pointer', fontSize:'0.875rem', textDecoration:'none', display:'inline-flex', alignItems:'center' },
};
