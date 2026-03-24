import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api }          from '../lib/api.js';
import { UploadZone }   from '../components/UploadZone.jsx';
import { Toast }        from '../components/Toast.jsx';

const LOCALES  = ['fr','en','de','es','it','pt'];
const ACCESS   = ['public','private','password'];

export default function GalleryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [gallery,   setGallery]   = useState(null);
  const [photos,    setPhotos]    = useState([]);
  const [jobs,      setJobs]      = useState([]);
  const [tab,       setTab]       = useState('photos'); // photos | settings | jobs
  const [saving,    setSaving]    = useState(false);
  const [form,      setForm]      = useState({});
  const [dragIdx,      setDragIdx]      = useState(null);
  const [reordering,   setReordering]   = useState(false);
  const [sortAsc,      setSortAsc]      = useState(true);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [toast,        setToast]        = useState('');

  useEffect(() => { load(); }, [id]);

  async function load() {
    try {
      const [g, p, j] = await Promise.all([api.getGallery(id), api.listPhotos(id), api.listJobs(id)]);
      setGallery(g);
      setPhotos(p);
      setJobs(j);
      // Detect if any photo was modified after the last build
      if (g.builtAt && p.some(photo => photo.mtime > g.builtAt)) setNeedsRebuild(true);
      if (g.buildStatus !== 'done' && p.length > 0) setNeedsRebuild(true);
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
      setToast('Settings saved');
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
      setNeedsRebuild(true);
    } catch (e) { alert(e.message); }
  }

  async function sortPhotos(dir) {
    const sorted = [...photos].sort((a, b) =>
      dir === 'asc' ? a.file.localeCompare(b.file) : b.file.localeCompare(a.file));
    setPhotos(sorted);
    try { await api.reorderPhotos(id, sorted.map(p => p.file)); } catch (e) { alert(e.message); }
  }

  function onDragStart(i) { setDragIdx(i); }
  function onDragOver(e, i) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    const next = [...photos];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setPhotos(next);
    setDragIdx(i);
  }
  async function onDragEnd() {
    setDragIdx(null);
    setReordering(true);
    try { await api.reorderPhotos(id, photos.map(p => p.file)); } catch (e) { alert(e.message); }
    finally { setReordering(false); }
  }

  if (!gallery) return <div style={s.center}>Loading…</div>;

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>← Galleries</Link>
        <span style={s.title}>{gallery.title || gallery.slug}</span>
        <div style={s.headerActions}>
          {gallery.buildStatus === 'done' && (
            <a href={`/${gallery.slug}/`} target="_blank" rel="noreferrer" style={s.viewBtn}>
              View gallery ↗
            </a>
          )}
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
            <UploadZone galleryId={id} onDone={() => { api.listPhotos(id).then(setPhotos); setNeedsRebuild(true); }} />

            {needsRebuild && (
              <div style={s.rebuildBanner}>
                <span>Photos have changed since the last build —</span>
                <button style={s.rebuildBtn} onClick={() => handleBuild(false)}>Build now</button>
              </div>
            )}

            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'1.5rem', marginBottom:'0.75rem' }}>
              <h3 style={{ ...s.sectionTitle, margin:0 }}>Photos ({photos.length})</h3>
              <div style={{ marginLeft:'auto', display:'flex', gap:'0.35rem', alignItems:'center' }}>
                {reordering && <span style={{ fontSize:'0.75rem', color:'#888' }}>Saving…</span>}
                <button
                  style={s.sortBtn}
                  title={sortAsc ? 'Sorted A→Z — click to reverse' : 'Sorted Z→A — click to reverse'}
                  onClick={() => { const next = !sortAsc; setSortAsc(next); sortPhotos(next ? 'asc' : 'desc'); }}
                >
                  <SortIcon asc={sortAsc} />
                </button>
              </div>
            </div>
            {photos.length === 0 && <p style={s.dim}>No photos yet.</p>}
            <div style={s.photoGrid}>
              {photos.map((p, i) => (
                <div
                  key={p.file}
                  style={{ ...s.photoCard, opacity: dragIdx === i ? 0.5 : 1, cursor:'grab' }}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => onDragOver(e, i)}
                  onDragEnd={onDragEnd}
                >
                  <img
                    src={p.thumb
                      ? `/${gallery.slug}/img/grid/${p.thumb}.webp`
                      : `/api/galleries/${id}/photos/${encodeURIComponent(p.file)}/preview`}
                    style={s.thumb} alt={p.file} />
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
            <Row label="Date">
              <input style={s.input} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
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
            <div style={{ marginBottom:'0.6rem' }}>
              <label style={{ display:'block', fontSize:'0.85rem', color:'#555', marginBottom:'0.4rem' }}>Cover photo</label>
              {photos.length === 0
                ? <p style={s.dim}>Upload photos first.</p>
                : <div style={s.coverGrid}>
                    {photos.map(p => (
                      <div
                        key={p.file}
                        onClick={() => setForm(f => ({ ...f, coverPhoto: p.file }))}
                        style={{
                          ...s.coverThumb,
                          ...(form.coverPhoto === p.file ? s.coverThumbSelected : {}),
                        }}
                      >
                        <img
                          src={p.thumb
                            ? `/${gallery.slug}/img/grid/${p.thumb}.webp`
                            : `/api/galleries/${id}/photos/${encodeURIComponent(p.file)}/preview`}
                          style={s.coverThumbImg} alt={p.file} />
                        {form.coverPhoto === p.file && <div style={s.coverCheck}>✓</div>}
                      </div>
                    ))}
                  </div>}
            </div>
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
      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}

function SortIcon({ asc }) {
  // asc: long bars at top → short at bottom (A→Z by filename = ascending)
  // desc: short bars at top → long at bottom
  const widths = asc ? [14, 10, 6, 3] : [3, 6, 10, 14];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      {widths.map((w, i) => (
        <rect key={i} x={0} y={i * 3.5} width={w} height="2" rx="1" />
      ))}
    </svg>
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
  viewBtn:      { padding:'0.4rem 0.85rem', background:'#16a34a', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontSize:'0.8rem', textDecoration:'none', fontWeight:600 },
  coverGrid:    { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(80px,1fr))', gap:'0.5rem', maxWidth:560 },
  coverThumb:   { position:'relative', cursor:'pointer', borderRadius:5, overflow:'hidden', border:'2px solid transparent', boxSizing:'border-box' },
  coverThumbSelected: { border:'2px solid #111' },
  coverThumbImg:{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' },
  coverCheck:   { position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', color:'#fff', fontWeight:700, fontSize:'1.1rem' },
  sortBtn:      { padding:'4px 7px', background:'none', border:'1px solid #ddd', borderRadius:4, cursor:'pointer', display:'flex', alignItems:'center', color:'#555' },
  rebuildBanner:{ display:'flex', alignItems:'center', gap:'0.75rem', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:6, padding:'0.6rem 1rem', fontSize:'0.85rem', color:'#92400e', marginTop:'1rem' },
  rebuildBtn:   { padding:'0.25rem 0.75rem', background:'#f59e0b', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600, fontSize:'0.8rem', whiteSpace:'nowrap' },
  dim:          { color:'#888', fontSize:'0.875rem' },
  jobList:      { display:'flex', flexDirection:'column', gap:'0.4rem' },
  jobRow:       { display:'flex', gap:'1rem', alignItems:'center', padding:'0.6rem 0.85rem', background:'#fff', borderRadius:6, textDecoration:'none', color:'#111', fontSize:'0.875rem', boxShadow:'0 1px 3px #0001' },
  jobStatus:    { fontWeight:600, width:70 },
  jobId:        { fontFamily:'monospace', color:'#888', fontSize:'0.8rem' },
  jobDate:      { color:'#888', fontSize:'0.8rem', marginLeft:'auto' },
};
