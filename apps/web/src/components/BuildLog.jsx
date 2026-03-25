// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useRef, useState } from 'react';

// Phase thresholds: log line patterns → minimum progress %
const PHASES = [
  [/starting build/i,               5],
  [/download(ing)? vendor/i,       10],
  [/download(ing)? font/i,         15],
  [/reading photos/i,              20],
  [/processing|resiz|optimiz/i,    30],
  [/generat|render|templat/i,      70],
  [/manifest|photos\.json/i,       85],
  [/writing|copy|dist/i,           88],
];

// Connects to GET /api/jobs/:jobId/stream (SSE) and renders the live log.
export function BuildLog({ jobId, onDone }) {
  const [lines,    setLines]    = useState([]);
  const [status,   setStatus]   = useState('running');
  const [progress, setProgress] = useState(0);
  const bottomRef  = useRef();
  const progressRef = useRef(0);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/stream`, { withCredentials: true });

    // Elastic timer: slowly approaches 90% while running
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        const next = prev + (90 - prev) * 0.04;
        progressRef.current = next;
        return next;
      });
    }, 300);

    const advance = (text) => {
      for (const [pattern, target] of PHASES) {
        if (pattern.test(text) && progressRef.current < target) {
          progressRef.current = target;
          setProgress(target);
          break;
        }
      }
    };

    es.addEventListener('log', e => {
      const { data } = JSON.parse(e.data);
      setLines(prev => [...prev, { type: 'log', text: data }]);
      advance(data);
    });
    es.addEventListener('done', e => {
      const payload = JSON.parse(e.data);
      setLines(prev => [...prev, { type: 'done', text: `✓ Build complete — ${payload.data}` }]);
      clearInterval(timer);
      progressRef.current = 100;
      setProgress(100);
    });
    es.addEventListener('error', e => {
      const { data } = JSON.parse(e.data);
      setLines(prev => [...prev, { type: 'error', text: `✗ ${data}` }]);
      clearInterval(timer);
    });
    es.addEventListener('close', e => {
      const { status: finalStatus } = JSON.parse(e.data);
      setStatus(finalStatus);
      clearInterval(timer);
      if (finalStatus === 'done') { progressRef.current = 100; setProgress(100); }
      es.close();
      if (onDone) onDone(finalStatus);
    });
    es.onerror = () => { setStatus('error'); clearInterval(timer); es.close(); };

    return () => { es.close(); clearInterval(timer); };
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
      <div style={s.progressTrack}>
        <div style={{
          ...s.progressBar,
          width: `${progress}%`,
          background: status === 'error' ? '#dc2626' : status === 'done' ? '#16a34a' : '#ca8a04',
        }} />
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
  log:           { background:'#0d0d0d', padding:'0.75rem', fontFamily:'monospace', fontSize:'0.78rem', lineHeight:1.55, minHeight:160, maxHeight:420, overflowY:'auto' },
  line:          { whiteSpace:'pre-wrap', wordBreak:'break-all' },
  progressTrack: { background:'#1a1a1a', height:3 },
  progressBar:   { height:'100%', transition:'width 0.3s ease, background 0.4s ease' },
};
