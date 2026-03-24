import { useNavigate } from 'react-router-dom';

const STATUS_COLOR = {
  done:     '#16a34a',
  building: '#ca8a04',
  error:    '#dc2626',
  pending:  '#6b7280',
  queued:   '#2563eb',
};

export function GalleryCard({ gallery, onBuild, onDelete }) {
  const navigate = useNavigate();
  const color    = STATUS_COLOR[gallery.buildStatus] || '#6b7280';

  return (
    <div style={s.card} onClick={() => navigate(`/galleries/${gallery.id}`)}>
      <div style={s.cover}>
        {gallery.firstPhoto
          ? <img src={`/api/galleries/${gallery.id}/photos/${encodeURIComponent(gallery.firstPhoto)}/preview`} style={s.img} alt="" />
          : <div style={s.placeholder}>📷</div>}
      </div>
      <div style={s.body}>
        <h3 style={s.title}>{gallery.title || gallery.slug}</h3>
        {gallery.date && <p style={s.meta}>{gallery.date}</p>}
        <div style={s.footer}>
          <span style={{ ...s.badge, background: color }}>{gallery.buildStatus}</span>
          <div style={s.actions} onClick={e => e.stopPropagation()}>
            {gallery.buildStatus === 'done' && (
              <a href={`/${gallery.slug}/`} target="_blank" rel="noreferrer" style={s.viewBtn} title="View gallery">↗</a>
            )}
            <button style={s.btn} onClick={() => onBuild(gallery.id)} title="Build">▶</button>
            <button style={{ ...s.btn, color: '#dc2626' }} onClick={() => onDelete(gallery.id)} title="Delete">✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  card:        { background:'#fff', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 6px #0001', cursor:'pointer', transition:'box-shadow 0.15s' },
  cover:       { height:160, background:'#f4f4f4', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' },
  img:         { width:'100%', height:'100%', objectFit:'cover' },
  placeholder: { fontSize:'2.5rem', color:'#ccc' },
  body:        { padding:'0.75rem 1rem 0.85rem' },
  title:       { margin:'0 0 0.15rem', fontSize:'0.95rem', fontWeight:600 },
  meta:        { margin:'0 0 0.5rem', fontSize:'0.8rem', color:'#888' },
  footer:      { display:'flex', alignItems:'center', justifyContent:'space-between' },
  badge:       { fontSize:'0.72rem', fontWeight:600, color:'#fff', padding:'2px 8px', borderRadius:99 },
  actions:     { display:'flex', gap:'0.35rem' },
  btn:         { background:'none', border:'1px solid #ddd', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontSize:'0.8rem' },
  viewBtn:     { background:'#16a34a', color:'#fff', border:'none', borderRadius:5, padding:'2px 8px', fontSize:'0.8rem', textDecoration:'none', fontWeight:600 },
};
