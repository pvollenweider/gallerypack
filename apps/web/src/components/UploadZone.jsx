import { useState, useRef } from 'react';
import { api } from '../lib/api.js';

export function UploadZone({ galleryId, onDone }) {
  const [dragging,  setDragging]  = useState(false);
  const [files,     setFiles]     = useState([]);   // { file, progress, status }
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef();

  function addFiles(newFiles) {
    const items = Array.from(newFiles).map(f => ({ file: f, progress: 0, status: 'pending' }));
    setFiles(prev => [...prev, ...items]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function upload() {
    if (!files.length || uploading) return;
    setUploading(true);
    const toUpload = files.filter(f => f.status === 'pending');

    for (const item of toUpload) {
      setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'uploading' } : f));
      try {
        await api.uploadPhotos(galleryId, [item.file], (pct) => {
          setFiles(prev => prev.map(f => f.file === item.file ? { ...f, progress: pct } : f));
        });
        setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'done', progress: 1 } : f));
      } catch {
        setFiles(prev => prev.map(f => f.file === item.file ? { ...f, status: 'error' } : f));
      }
    }
    setUploading(false);
    if (onDone) onDone();
  }

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount    = files.filter(f => f.status === 'done').length;

  return (
    <div style={s.root}>
      <div
        style={{ ...s.zone, ...(dragging ? s.zoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept="image/*" style={s.hidden}
          onChange={e => addFiles(e.target.files)} />
        <span style={s.zoneText}>
          {dragging ? 'Drop photos here' : 'Drag & drop photos — or click to browse'}
        </span>
      </div>

      {files.length > 0 && (
        <div style={s.list}>
          {files.map((item, i) => (
            <div key={i} style={s.row}>
              <span style={s.fname}>{item.file.name}</span>
              <span style={{ ...s.status, color: STATUS_COLOR[item.status] }}>
                {item.status === 'uploading'
                  ? `${Math.round(item.progress * 100)}%`
                  : item.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {pendingCount > 0 && (
        <div style={s.actions}>
          <button style={s.btn} onClick={upload} disabled={uploading}>
            {uploading ? 'Uploading…' : `Upload ${pendingCount} photo${pendingCount > 1 ? 's' : ''}`}
          </button>
          {doneCount > 0 && <span style={s.dim}>{doneCount} uploaded</span>}
        </div>
      )}
    </div>
  );
}

const STATUS_COLOR = { pending: '#888', uploading: '#2563eb', done: '#16a34a', error: '#dc2626' };

const s = {
  root:       { display:'flex', flexDirection:'column', gap:'0.75rem' },
  zone:       { border:'2px dashed #ccc', borderRadius:8, padding:'2rem', textAlign:'center', cursor:'pointer', background:'#fafafa', transition:'border-color 0.15s, background 0.15s' },
  zoneActive: { borderColor:'#2563eb', background:'#eff6ff' },
  zoneText:   { color:'#888', fontSize:'0.9rem', userSelect:'none' },
  hidden:     { display:'none' },
  list:       { display:'flex', flexDirection:'column', gap:'0.3rem', maxHeight:200, overflowY:'auto' },
  row:        { display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.2rem 0', borderBottom:'1px solid #f0f0f0' },
  fname:      { overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' },
  status:     { fontWeight:500, fontSize:'0.78rem' },
  actions:    { display:'flex', alignItems:'center', gap:'1rem' },
  btn:        { padding:'0.5rem 1.25rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' },
  dim:        { color:'#888', fontSize:'0.82rem' },
};
