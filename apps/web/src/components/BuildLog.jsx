import { useEffect, useRef, useState } from 'react';

// Connects to GET /api/jobs/:jobId/stream (SSE) and renders the live log.
export function BuildLog({ jobId, onDone }) {
  const [lines,  setLines]  = useState([]);
  const [status, setStatus] = useState('running');
  const bottomRef = useRef();

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/stream`, { withCredentials: true });

    es.addEventListener('log', e => {
      const { data } = JSON.parse(e.data);
      setLines(prev => [...prev, { type: 'log', text: data }]);
    });
    es.addEventListener('done', e => {
      const payload = JSON.parse(e.data);
      setLines(prev => [...prev, { type: 'done', text: `✓ Build complete — ${payload.data}` }]);
    });
    es.addEventListener('error', e => {
      const { data } = JSON.parse(e.data);
      setLines(prev => [...prev, { type: 'error', text: `✗ ${data}` }]);
    });
    es.addEventListener('close', e => {
      const { status: finalStatus } = JSON.parse(e.data);
      setStatus(finalStatus);
      es.close();
      if (onDone) onDone(finalStatus);
    });
    es.onerror = () => { setStatus('error'); es.close(); };

    return () => es.close();
  }, [jobId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const isRunning = status === 'running';

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.label}>Build log</span>
        <span style={{ ...s.dot, background: isRunning ? '#ca8a04' : status === 'done' ? '#16a34a' : '#dc2626' }} />
        <span style={s.statusText}>{status}</span>
      </div>
      <div style={s.log}>
        {lines.map((l, i) => (
          <div key={i} style={{ ...s.line, color: l.type === 'error' ? '#f87171' : l.type === 'done' ? '#86efac' : '#e5e7eb' }}>
            {l.text}
          </div>
        ))}
        {isRunning && <div style={{ ...s.line, color: '#6b7280' }}>…</div>}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const s = {
  root:       { display:'flex', flexDirection:'column', border:'1px solid #2d2d2d', borderRadius:8, overflow:'hidden' },
  header:     { background:'#1a1a1a', padding:'0.5rem 0.75rem', display:'flex', alignItems:'center', gap:'0.5rem' },
  label:      { fontSize:'0.8rem', color:'#9ca3af', fontWeight:600, marginRight:'auto' },
  dot:        { width:8, height:8, borderRadius:'50%' },
  statusText: { fontSize:'0.78rem', color:'#9ca3af' },
  log:        { background:'#0d0d0d', padding:'0.75rem', fontFamily:'monospace', fontSize:'0.78rem', lineHeight:1.55, minHeight:160, maxHeight:420, overflowY:'auto' },
  line:       { whiteSpace:'pre-wrap', wordBreak:'break-all' },
};
