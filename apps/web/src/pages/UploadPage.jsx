// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/pages/UploadPage.jsx — unauthenticated photographer upload via token
// Robust per-file queue: queued → uploading → done / error
// Max 3 concurrent uploads, auto-retry once, thumbnail preview, folder drop.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

const IMG_EXTS = new Set(['jpg','jpeg','png','tiff','tif','heic','heif','avif']);
const MAX_CONCURRENT = 3;

function isImage(name) {
  return IMG_EXTS.has(name.split('.').pop().toLowerCase());
}

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
          for (const e of entries) all.push(...await collectEntry(e));
          read();
        }, () => resolve(all));
      };
      read();
    } else {
      resolve([]);
    }
  });
}

const BADGE = {
  queued:    { bg: '#1c1c1c', color: '#888',    label: 'Queued'      },
  uploading: { bg: '#1e3a5f', color: '#60a5fa', label: 'Uploading…'  },
  done:      { bg: '#14532d', color: '#4ade80', label: '✓ Done'      },
  error:     { bg: '#450a0a', color: '#f87171', label: '✕ Failed'    },
};

export default function UploadPage() {
  const { token } = useParams();
  const [info,    setInfo]    = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [items,   setItems]   = useState([]);
  const [dragging,setDragging]= useState(false);

  const fileRef   = useRef();
  const folderRef = useRef();
  const running   = useRef(0);
  const queueRef  = useRef([]);

  useEffect(() => {
    api.getUploadInfo(token)
      .then(setInfo)
      .catch(e => setLoadErr(e.message));
  }, [token]);

  useEffect(() => { queueRef.current = items; }, [items]);

  const addFiles = useCallback((fileList) => {
    const images = Array.from(fileList).filter(f => isImage(f.name));
    setItems(prev => {
      const existing = new Set(prev.map(x => x.file.name));
      const newItems = images
        .filter(f => !existing.has(f.name))
        .map(f => ({
          id:       Math.random().toString(36).slice(2),
          file:     f,
          status:   'queued',
          progress: 0,
          preview:  URL.createObjectURL(f),
          retries:  0,
        }));
      return [...prev, ...newItems];
    });
  }, []);

  const drainQueue = useCallback(() => {
    const tick = () => {
      if (running.current >= MAX_CONCURRENT) return;
      const next = queueRef.current.find(x => x.status === 'queued');
      if (!next) return;
      running.current += 1;
      setItems(prev => prev.map(x => x.id === next.id ? { ...x, status: 'uploading' } : x));
      api.uploadOneViaToken(token, next.file, (pct) => {
        setItems(prev => prev.map(x => x.id === next.id ? { ...x, progress: pct } : x));
      }).then(() => {
        running.current -= 1;
        setItems(prev => prev.map(x => x.id === next.id ? { ...x, status: 'done', progress: 1 } : x));
        tick();
      }).catch(() => {
        running.current -= 1;
        const retries = queueRef.current.find(x => x.id === next.id)?.retries || 0;
        if (retries < 1) {
          setItems(prev => prev.map(x => x.id === next.id ? { ...x, status: 'queued', retries: retries + 1, progress: 0 } : x));
        } else {
          setItems(prev => prev.map(x => x.id === next.id ? { ...x, status: 'error' } : x));
        }
        tick();
      });
      if (running.current < MAX_CONCURRENT) tick();
    };
    tick();
  }, [token]);

  useEffect(() => { drainQueue(); }, [items.length, drainQueue]);

  async function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dataItems = Array.from(e.dataTransfer.items || []);
    if (dataItems.length && dataItems[0].webkitGetAsEntry) {
      const all = [];
      for (const item of dataItems) {
        const entry = item.webkitGetAsEntry();
        if (entry) all.push(...await collectEntry(entry));
      }
      addFiles(all);
    } else {
      addFiles(e.dataTransfer.files);
    }
  }

  function retryFailed() {
    setItems(prev => prev.map(x => x.status === 'error' ? { ...x, status: 'queued', progress: 0, retries: 0 } : x));
  }

  function clearDone() {
    setItems(prev => {
      prev.filter(x => x.status === 'done').forEach(x => URL.revokeObjectURL(x.preview));
      return prev.filter(x => x.status !== 'done');
    });
  }

  if (loadErr) return (
    <div style={s.center}>
      <div style={s.card}>
        <p style={s.errorText}>{loadErr}</p>
        <p style={{ color: '#666', fontSize: '0.82rem', marginTop: '0.5rem' }}>
          This upload link may have expired or been revoked.
        </p>
      </div>
    </div>
  );

  if (!info) return <div style={s.center}><p style={{ color: '#aaa' }}>Loading…</p></div>;

  const queued    = items.filter(x => x.status === 'queued').length;
  const uploading = items.filter(x => x.status === 'uploading').length;
  const done      = items.filter(x => x.status === 'done').length;
  const errors    = items.filter(x => x.status === 'error').length;
  const hasActive = queued > 0 || uploading > 0;

  return (
    <div style={s.center}>
      <div style={s.card}>
        <h2 style={s.title}>{info.galleryTitle}</h2>
        {info.photographerName && (
          <p style={s.photographer}>Uploading as <strong>{info.photographerName}</strong></p>
        )}
        {info.label && <p style={s.label}>{info.label}</p>}
        {info.expiresAt && (
          <p style={s.hint}>Link expires {new Date(info.expiresAt).toLocaleDateString()}</p>
        )}

        {/* Drop zone */}
        <div
          style={{ ...s.dropZone, ...(dragging ? s.dropZoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => addFiles(e.target.files)} />
          <input ref={folderRef} type="file" multiple style={{ display: 'none' }}
            webkitdirectory="true" mozdirectory="true"
            onChange={e => addFiles(e.target.files)} />
          {dragging ? (
            <span style={s.dropText}>Drop here</span>
          ) : (
            <div>
              <p style={s.dropText}>Drag photos or folders here</p>
              <div style={s.dropBtns}>
                <button type="button" style={s.dropBtn} onClick={() => fileRef.current?.click()}>+ Photos</button>
                <button type="button" style={s.dropBtn} onClick={() => folderRef.current?.click()}>+ Folder</button>
              </div>
              <p style={s.dropHint}>JPG · PNG · TIFF · HEIC · AVIF · max 200 MB</p>
            </div>
          )}
        </div>

        {/* Status summary */}
        {items.length > 0 && (
          <div style={s.summary}>
            {hasActive && <span style={s.summaryChip}>{queued + uploading} remaining</span>}
            {done  > 0  && <span style={{ ...s.summaryChip, color: '#4ade80' }}>{done} done</span>}
            {errors > 0 && (
              <>
                <span style={{ ...s.summaryChip, color: '#f87171' }}>{errors} failed</span>
                <button style={s.retryBtn} onClick={retryFailed}>Retry</button>
              </>
            )}
            {!hasActive && done > 0 && (
              <button style={s.clearBtn} onClick={clearDone}>Clear done</button>
            )}
          </div>
        )}

        {/* File grid */}
        {items.length > 0 && (
          <div style={s.grid}>
            {items.map(item => (
              <div key={item.id} style={s.cell}>
                <img src={item.preview} alt={item.file.name} style={s.thumb} />
                {item.status === 'uploading' && (
                  <div style={s.progressOverlay}>
                    <div style={{ ...s.progressBar, width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                )}
                <div style={{ ...s.badge, background: BADGE[item.status].bg, color: BADGE[item.status].color }}>
                  {item.status === 'uploading'
                    ? `${Math.round(item.progress * 100)}%`
                    : BADGE[item.status].label}
                </div>
                <div style={s.cellName}>{item.file.name}</div>
              </div>
            ))}
          </div>
        )}

        {done > 0 && !hasActive && (
          <div style={s.successBox}>
            <div style={s.checkmark}>✓</div>
            <p style={s.successText}>
              {done} photo{done > 1 ? 's' : ''} uploaded — pending review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    background: '#111',
    padding: '2rem 1rem',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '2rem',
    width: '100%',
    maxWidth: '560px',
  },
  title: {
    margin: 0,
    fontSize: '1.3rem',
    fontWeight: 600,
    color: '#eee',
    textAlign: 'center',
  },
  photographer: {
    margin: '0.4rem 0 0',
    color: '#60a5fa',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  label: {
    margin: '0.4rem 0 0',
    color: '#888',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  hint: {
    margin: '0.25rem 0 0',
    color: '#555',
    fontSize: '0.78rem',
    textAlign: 'center',
  },
  dropZone: {
    marginTop: '1.5rem',
    border: '2px dashed #333',
    borderRadius: '8px',
    padding: '2rem 1rem',
    textAlign: 'center',
    cursor: 'default',
    transition: 'border-color 0.15s, background 0.15s',
  },
  dropZoneActive: {
    borderColor: '#555',
    background: '#222',
  },
  dropText: {
    margin: 0,
    color: '#ccc',
    fontSize: '0.95rem',
  },
  dropBtns: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
    marginTop: '0.75rem',
  },
  dropBtn: {
    padding: '0.4rem 0.9rem',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 5,
    color: '#ccc',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  dropHint: {
    margin: '0.75rem 0 0',
    color: '#555',
    fontSize: '0.75rem',
  },
  summary: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: '1rem',
    fontSize: '0.82rem',
  },
  summaryChip: {
    background: '#222',
    borderRadius: 4,
    padding: '0.2rem 0.5rem',
    color: '#888',
  },
  retryBtn: {
    background: '#450a0a',
    border: '1px solid #7f1d1d',
    borderRadius: 4,
    color: '#f87171',
    padding: '0.2rem 0.6rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  clearBtn: {
    background: 'none',
    border: '1px solid #333',
    borderRadius: 4,
    color: '#555',
    padding: '0.2rem 0.6rem',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '0.5rem',
    marginTop: '1rem',
  },
  cell: {
    position: 'relative',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#111',
    aspectRatio: '1',
  },
  thumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    background: '#111',
  },
  progressBar: {
    height: '100%',
    background: '#60a5fa',
    transition: 'width 0.15s',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: '0.6rem',
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: 3,
  },
  cellName: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    fontSize: '0.6rem',
    color: '#aaa',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    background: 'rgba(0,0,0,0.6)',
    borderRadius: 2,
    padding: '1px 3px',
  },
  successBox: {
    marginTop: '1.25rem',
    textAlign: 'center',
    padding: '1rem',
    background: '#0f2a1f',
    border: '1px solid #14532d',
    borderRadius: 8,
  },
  checkmark: {
    fontSize: '2rem',
    color: '#4ade80',
  },
  successText: {
    margin: '0.4rem 0 0',
    color: '#aaa',
    fontSize: '0.9rem',
  },
  errorText: {
    color: '#f87171',
    margin: 0,
    fontSize: '1rem',
    textAlign: 'center',
  },
};
