import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api }          from '../lib/api.js';
import { UploadZone }   from '../components/UploadZone.jsx';

const LOCALES  = ['fr','en','de','es','it','pt'];
const ACCESS   = ['public','private','password'];

export default function GalleryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [gallery, setGallery] = useState(null);
  const [photos,  setPhotos]  = useState([]);
  const [jobs,    setJobs]    = useState([]);
  const [tab,     setTab]     = useState('photos'); // photos | settings | jobs
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const [g, p, j] = await Promise.all([api.getGallery(id), api.listPhotos(id), api.listJobs(id)]);
      setGallery(g);
      setPhotos(p);
      setJobs(j);
      setForm({
        title: g.title || '', subtitle: g.subtitle || '',
        author: g.author || '', authorEmail: g.authorEmail || '',
        date: g.date || '', location: g.location || '',
        locale: g.locale || 'fr', access: g.access || 'public',
        password: g.password || '', coverPhoto: g.coverPhoto || '',
        allowDownloadImage: g.allowDownloadImage !== false,
        allowDownloadGallery: g.allowDownloadGallery !== false,
        private: !!g.private,
      });
    } catch (e) { navigate('/'); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateGallery(id, form);
      setGallery(updated);
      alert('Saved.');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function handleBuild(force = false) {
    try {
      const job = await api.triggerBuild(id, force);
      navigate(`/jobs/${job.id}`);
    } catch (e) { alert(e.message); }
  }

  async function handleDeletePhoto(filename) {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await api.deletePhoto(id, filename);
      setPhotos(p => p.filter(f => f.file !== filename));
    } catch (e) { alert(e.message); }
  }

  if (!gallery) return <div style={s.center}>Loading…</div>;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>← Galleries</Link>
        <span style={s.title}>{gallery.title || gallery.slug}</span>
        <div style={s.headerActions}>
          <button style={s.outlineBtn} onClick={() => handleBuild(false)}>▶ Build</button>
          <button style={s.outlineBtn} onClick={() => handleBuild(true)}>↺ Force rebuild</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={s.tabs}>
        {['photos','settings','jobs'].map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <main style={s.main}>

        {/* ── PHOTOS ── */}
        {tab === 'photos' && (
          <div>
            <h3 style={s.sectionTitle}>Upload photos</h3>
            <UploadZone galleryId={id} onDone={() => api.listPhotos(id).then(setPhotos)} />

            <h3 style={{ ...s.sectionTitle, marginTop:'1.5rem' }}>Photos ({photos.length})</h3>
            {photos.length === 0 && <p style={s.dim}>No photos yet.</p>}
            <div style={s.photoGrid}>
              {photos.map(p => (
                <div key={p.file} style={s.photoCard}>
                  {p.thumb
                    ? <img src={`/${gallery.slug}/img/grid/${p.thumb}.webp`} style={s.thumb} alt={p.file} />
                    : <div style={s.thumbPlaceholder}>📷</div>}
                  <div style={s.photoName}>{p.file}</div>
                  <button style={s.deleteBtn} onClick={() => handleDeletePhoto(p.file)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <form onSubmit={saveSettings} style={s.settingsForm}>
            <Row label="Title">
              <input style={s.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </Row>
            <Row label="Subtitle">
              <input style={s.input} value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} />
            </Row>
            <Row label="Author">
              <input style={s.input} value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} />
            </Row>
            <Row label="Author email">
              <input style={s.input} type="email" value={form.authorEmail} onChange={e => setForm(f => ({ ...f, authorEmail: e.target.value }))} />
            </Row>
            <Row label="Date (YYYY-MM-DD)">
              <input style={s.input} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Row>
            <Row label="Location">
              <input style={s.input} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </Row>
            <Row label="Locale">
              <select style={s.input} value={form.locale} onChange={e => setForm(f => ({ ...f, locale: e.target.value }))}>
                {LOCALES.map(l => <option key={l}>{l}</option>)}
              </select>
            </Row>
            <Row label="Access">
              <select style={s.input} value={form.access} onChange={e => setForm(f => ({ ...f, access: e.target.value }))}>
                {ACCESS.map(a => <option key={a}>{a}</option>)}
              </select>
            </Row>
            {form.access === 'password' && (
              <Row label="Password">
                <input style={s.input} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </Row>
            )}
            <Row label="Cover photo (filename)">
              <input style={s.input} value={form.coverPhoto} onChange={e => setForm(f => ({ ...f, coverPhoto: e.target.value }))} />
            </Row>
            <Row label="Allow image download">
              <input type="checkbox" checked={form.allowDownloadImage} onChange={e => setForm(f => ({ ...f, allowDownloadImage: e.target.checked }))} />
            </Row>
            <Row label="Allow gallery download (ZIP)">
              <input type="checkbox" checked={form.allowDownloadGallery} onChange={e => setForm(f => ({ ...f, allowDownloadGallery: e.target.checked }))} />
            </Row>
            <Row label="Private (hidden URL)">
              <input type="checkbox" checked={form.private} onChange={e => setForm(f => ({ ...f, private: e.target.checked }))} />
            </Row>
            <button style={s.primaryBtn} type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </form>
        )}

        {/* ── JOBS ── */}
        {tab === 'jobs' && (
          <div>
            <h3 style={s.sectionTitle}>Recent builds</h3>
            {jobs.length === 0 && <p style={s.dim}>No builds yet.</p>}
            <div style={s.jobList}>
              {jobs.map(j => (
                <Link key={j.id} to={`/jobs/${j.id}`} style={s.jobRow}>
                  <span style={{ ...s.jobStatus, color: STATUS_COLOR[j.status] || '#888' }}>{j.status}</span>
                  <span style={s.jobId}>{j.id.slice(-10)}</span>
                  <span style={s.jobDate}>{new Date(j.createdAt).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'0.6rem' }}>
      <label style={{ width:200, fontSize:'0.85rem', color:'#555', flexShrink:0 }}>{label}</label>
      {children}
    </div>
  );
}

const STATUS_COLOR = { done:'#16a34a', error:'#dc2626', running:'#ca8a04', queued:'#2563eb', pending:'#888' };

const s = {
  page:         { minHeight:'100vh', background:'#f8f8f8' },
  center:       { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#888' },
  header:       { background:'#fff', borderBottom:'1px solid #eee', padding:'0 1.5rem', height:52, display:'flex', alignItems:'center', gap:'1rem' },
  back:         { color:'#111', textDecoration:'none', fontSize:'0.875rem' },
  title:        { fontWeight:600, fontSize:'0.95rem', marginRight:'auto' },
  headerActions:{ display:'flex', gap:'0.5rem' },
  tabs:         { background:'#fff', borderBottom:'1px solid #eee', padding:'0 1.5rem', display:'flex', gap:'0.25rem' },
  tab:          { padding:'0.6rem 1rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.875rem', color:'#666', borderBottom:'2px solid transparent' },
  tabActive:    { color:'#111', borderBottom:'2px solid #111', fontWeight:600 },
  main:         { maxWidth:900, margin:'0 auto', padding:'1.5rem' },
  sectionTitle: { fontSize:'0.95rem', fontWeight:600, margin:'0 0 0.75rem' },
  photoGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:'0.75rem' },
  photoCard:    { position:'relative', background:'#fff', borderRadius:6, overflow:'hidden', boxShadow:'0 1px 4px #0001' },
  thumb:        { width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' },
  thumbPlaceholder:{ width:'100%', aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', color:'#ccc', background:'#f4f4f4' },
  photoName:    { fontSize:'0.72rem', padding:'0.25rem 0.4rem', color:'#666', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  deleteBtn:    { position:'absolute', top:4, right:4, background:'#000a', color:'#fff', border:'none', borderRadius:4, width:22, height:22, cursor:'pointer', fontSize:'0.75rem', display:'flex', alignItems:'center', justifyContent:'center' },
  settingsForm: { maxWidth:560 },
  input:        { flex:1, padding:'0.4rem 0.6rem', border:'1px solid #ddd', borderRadius:5, fontSize:'0.875rem', outline:'none' },
  primaryBtn:   { marginTop:'0.75rem', padding:'0.55rem 1.5rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' },
  outlineBtn:   { padding:'0.4rem 0.85rem', background:'none', border:'1px solid #ddd', borderRadius:5, cursor:'pointer', fontSize:'0.8rem' },
  dim:          { color:'#888', fontSize:'0.875rem' },
  jobList:      { display:'flex', flexDirection:'column', gap:'0.4rem' },
  jobRow:       { display:'flex', gap:'1rem', alignItems:'center', padding:'0.6rem 0.85rem', background:'#fff', borderRadius:6, textDecoration:'none', color:'#111', fontSize:'0.875rem', boxShadow:'0 1px 3px #0001' },
  jobStatus:    { fontWeight:600, width:70 },
  jobId:        { fontFamily:'monospace', color:'#888', fontSize:'0.8rem' },
  jobDate:      { color:'#888', fontSize:'0.8rem', marginLeft:'auto' },
};
