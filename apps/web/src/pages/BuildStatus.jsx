import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api }       from '../lib/api.js';
import { BuildLog }  from '../components/BuildLog.jsx';

export default function BuildStatus() {
  const { jobId }   = useParams();
  const navigate    = useNavigate();
  const [job,     setJob]     = useState(null);
  const [gallery, setGallery] = useState(null);
  const [done,    setDone]    = useState(false);

  useEffect(() => {
    api.getJob(jobId).then(setJob).catch(() => navigate('/'));
  }, [jobId]);

  function handleDone(finalStatus) {
    setDone(true);
    api.getJob(jobId).then(j => {
      setJob(j);
      if (finalStatus === 'done') api.getGallery(j.galleryId).then(setGallery).catch(() => {});
    });
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <Link to="/" style={s.back}>← Dashboard</Link>
        <span style={s.title}>Build {jobId.slice(-8)}</span>
      </header>

      <main style={s.main}>
        {job && (
          <div style={s.meta}>
            <span>Gallery: <strong>{job.galleryId}</strong></span>
            <span>Triggered: {new Date(job.createdAt).toLocaleString()}</span>
            {job.durationMs && <span>Duration: {(job.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        )}

        <BuildLog jobId={jobId} onDone={handleDone} />

        {done && job && (
          <div style={s.actions}>
            <Link to={`/galleries/${job.galleryId}`} style={s.btn}>Back to gallery</Link>
            {gallery && (
              <a href={`/${gallery.slug}/`} target="_blank" rel="noreferrer" style={s.viewBtn}>
                View gallery ↗
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const s = {
  page:    { minHeight:'100vh', background:'#f8f8f8' },
  header:  { background:'#fff', borderBottom:'1px solid #eee', padding:'0 1.5rem', height:52, display:'flex', alignItems:'center', gap:'1rem' },
  back:    { color:'#111', textDecoration:'none', fontSize:'0.875rem' },
  title:   { fontWeight:600, fontSize:'0.95rem' },
  main:    { maxWidth:820, margin:'0 auto', padding:'1.5rem' },
  meta:    { display:'flex', gap:'1.5rem', fontSize:'0.85rem', color:'#666', marginBottom:'1rem', flexWrap:'wrap' },
  actions: { marginTop:'1rem', display:'flex', gap:'0.75rem', alignItems:'center' },
  btn:     { padding:'0.5rem 1.25rem', background:'#111', color:'#fff', borderRadius:6, textDecoration:'none', fontWeight:600, fontSize:'0.875rem' },
  viewBtn: { padding:'0.5rem 1.25rem', background:'#16a34a', color:'#fff', borderRadius:6, textDecoration:'none', fontWeight:600, fontSize:'0.875rem' },
};
