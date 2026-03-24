import { useState, useRef } from 'react';
import { api } from '../lib/api.js';

const IMG_EXTS = new Set(['jpg','jpeg','png','tiff','tif','heic','heif','avif','webp']);

function isImage(filename) {
  return IMG_EXTS.has(filename.split('.').pop().toLowerCase());
}

/** Recursively collect all image File objects from a DataTransferItem (may be a directory). */
function collectEntry(entry) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => resolve(isImage(f.name) ? [f] : []), () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const read = () => {
        reader.readEntries(async entries => {
          if (!entries.length) { resolve(all); return; }
          for (const e of entries) {
            const files = await collectEntry(e);
            all.push(...files);
          }
          read();
        }, () => resolve(all));
      };
      read();
    } else {
      resolve([]);
    }
  });
}

export function UploadZone({ galleryId, onDone }) {
  const [dragging,  setDragging]  = useState(false);
  const [files,     setFiles]     = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef   = useRef();
  const folderRef = useRef();

  function addFiles(newFiles) {
    const images = Array.from(newFiles).filter(f => isImage(f.name));
    const items  = images.map(f => ({ file: f, progress: 0, status: 'pending' }));
    setFiles(prev => {
      const existing = new Set(prev.map(x => x.file.name));
      return [...prev, ...items.filter(x => !existing.has(x.file.name))];
    });
  }

  async function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    // Support folders via DataTransferItem API
    const items = Array.from(e.dataTransfer.items || []);
    if (items.length && items[0].webkitGetAsEntry) {
      const all = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) all.push(...(await collectEntry(entry)));
      }
      addFiles(all);
    } else {
      addFiles(e.dataTransfer.files);
    }
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
      >
        <input ref={fileRef} type="file" multiple accept="image/*" style={s.hidden}
          onChange={e => addFiles(e.target.files)} />
        <input ref={folderRef} type="file" multiple style={s.hidden}
          webkitdirectory="true" mozdirectory="true"
          onChange={e => addFiles(e.target.files)} />
        {dragging ? (
          <span style={s.zoneText}>Drop here</span>
        ) : (
          <div style={s.zoneActions}>
            <span style={s.zoneText}>Drag photos or folders here</span>
            <div style={s.zoneBtns}>
              <button type="button" style={s.zoneBtn} onClick={() => fileRef.current?.click()}>
                + Photos
              </button>
              <button type="button" style={s.zoneBtn} onClick={() => folderRef.current?.click()}>
                + Folder
              </button>
            </div>
          </div>
        )}
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
  zone:       { border:'2px dashed #ccc', borderRadius:8, padding:'1.5rem', textAlign:'center', background:'#fafafa', transition:'border-color 0.15s, background 0.15s' },
  zoneActive: { borderColor:'#2563eb', background:'#eff6ff' },
  zoneActions:{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem' },
  zoneText:   { color:'#888', fontSize:'0.875rem', userSelect:'none' },
  zoneBtns:   { display:'flex', gap:'0.5rem' },
  zoneBtn:    { padding:'0.35rem 0.85rem', background:'none', border:'1px solid #ddd', borderRadius:5, cursor:'pointer', fontSize:'0.82rem', color:'#555', fontWeight:500 },
  hidden:     { display:'none' },
  list:       { display:'flex', flexDirection:'column', gap:'0.3rem', maxHeight:200, overflowY:'auto' },
  row:        { display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'0.2rem 0', borderBottom:'1px solid #f0f0f0' },
  fname:      { overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' },
  status:     { fontWeight:500, fontSize:'0.78rem' },
  actions:    { display:'flex', alignItems:'center', gap:'1rem' },
  btn:        { padding:'0.5rem 1.25rem', background:'#111', color:'#fff', border:'none', borderRadius:6, fontWeight:600, cursor:'pointer', fontSize:'0.875rem' },
  dim:        { color:'#888', fontSize:'0.82rem' },
};
