// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/components/UploadZone.jsx — robust upload queue with mobile support
// - Per-file state machine: queued → uploading → done / error
// - Max 3 concurrent uploads
// - Auto-retry up to 3 times with backoff (1s, 2s, 4s)
// - Offline detection: pauses queue, resumes on reconnect
// - Mobile: tap-to-select replaces drag zone; folder button hidden on iOS
// - Client-side thumbnail preview

import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../lib/api.js';

const IMG_EXTS = new Set(['jpg','jpeg','png','tiff','tif','heic','heif','avif','webp']);
const MAX_CONCURRENT  = 3;
const MAX_RETRIES     = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function isImage(name) {
  return IMG_EXTS.has(name.split('.').pop().toLowerCase());
}

// True on iOS Safari / iPadOS
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

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

const STATUS_BADGE = {
  queued:    { bg: '#f3f4f6', color: '#888',    label: 'Queued' },
  uploading: { bg: '#dbeafe', color: '#2563eb', label: 'Uploading…' },
  done:      { bg: '#dcfce7', color: '#16a34a', label: '✓ Done' },
  error:     { bg: '#fee2e2', color: '#dc2626', label: '✕ Failed' },
};

export function UploadZone({ galleryId, onDone }) {
  const [items,    setItems]    = useState([]);
  const [dragging, setDragging] = useState(false);
  const [notified, setNotified] = useState(false);
  const [offline,  setOffline]  = useState(!navigator.onLine);
  const fileRef   = useRef();
  const folderRef = useRef();
  const running   = useRef(0);
  const queueRef  = useRef([]);
  const pausedRef = useRef(false);

  useEffect(() => { queueRef.current = items; }, [items]);

  // Offline / online detection
  useEffect(() => {
    const goOffline = () => { setOffline(true);  pausedRef.current = true; };
    const goOnline  = () => { setOffline(false); pausedRef.current = false; drainQueue(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []); // eslint-disable-line

  const addFiles = useCallback(async (fileList) => {
    const images = Array.from(fileList).filter(f => isImage(f.name));
    const newItems = images.map(f => ({
      id:       Math.random().toString(36).slice(2),
      file:     f,
      status:   'queued',
      progress: 0,
      preview:  URL.createObjectURL(f),
      retries:  0,
    }));
    setItems(prev => {
      const existing = new Set(prev.map(x => x.file.name));
      return [...prev, ...newItems.filter(x => !existing.has(x.file.name))];
    });
  }, []);

  const drainQueue = useCallback(() => {
    const tick = () => {
      if (pausedRef.current) return;
      if (running.current >= MAX_CONCURRENT) return;
      const next = queueRef.current.find(x => x.status === 'queued');
      if (!next) return;
      running.current += 1;
      setItems(prev => prev.map(x => x.id === next.id ? { ...x, status: 'uploading' } : x));

      api.uploadPhotos(galleryId, [next.file], (pct) => {
        setItems(prev => prev.map(x => x.id === next.id ? { ...x, progress: pct } : x));
      }).then(() => {
        running.current -= 1;
        setItems(prev => prev.map(x => x.id === next.id ? { ...x, status: 'done', progress: 1 } : x));
        if (onDone) onDone();
        tick();
      }).catch(() => {
        running.current -= 1;
        const retries = queueRef.current.find(x => x.id === next.id)?.retries ?? 0;
        if (retries < MAX_RETRIES) {
          const delay = RETRY_DELAYS_MS[retries] ?? 4000;
          // Show retry state in badge
          setItems(prev => prev.map(x => x.id === next.id
            ? { ...x, status: 'queued', retries: retries + 1, progress: 0, retryLabel: `Retrying (${retries + 1}/${MAX_RETRIES})…` }
            : x));
          setTimeout(() => tick(), delay);
        } else {
          setItems(prev => prev.map(x => x.id === next.id
            ? { ...x, status: 'error', retryLabel: null }
            : x));
          tick();
        }
      });
      if (running.current < MAX_CONCURRENT) tick();
    };
    tick();
  }, [galleryId, onDone]);

  useEffect(() => { drainQueue(); }, [items.length, drainQueue]);

  function retryItem(id) {
    setItems(prev => prev.map(x => x.id === id ? { ...x, status: 'queued', progress: 0, retries: 0 } : x));
  }

  function retryFailed() {
    setItems(prev => prev.map(x => x.status === 'error' ? { ...x, status: 'queued', progress: 0, retries: 0 } : x));
  }

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

  async function handleDone() {
    try { await api.uploadDone(galleryId); setNotified(true); } catch {}
  }

  function clearDone() {
    setItems(prev => {
      prev.filter(x => x.status === 'done').forEach(x => URL.revokeObjectURL(x.preview));
      return prev.filter(x => x.status !== 'done');
    });
  }

  const queued    = items.filter(x => x.status === 'queued').length;
  const uploading = items.filter(x => x.status === 'uploading').length;
  const done      = items.filter(x => x.status === 'done').length;
  const errors    = items.filter(x => x.status === 'error').length;
  const hasActive = queued > 0 || uploading > 0;

  return (
    <div style={s.root}>

      {/* Offline banner */}
      {offline && (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#92400e' }}>
          Waiting for network… uploads will resume automatically when you reconnect.
        </div>
      )}

      {/* Desktop: drag-and-drop zone */}
      <div
        className="d-none d-md-block"
        style={{ ...s.zone, ...(dragging ? s.zoneActive : {}) }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {dragging ? (
          <span style={s.zoneText}>Drop here</span>
        ) : (
          <div style={s.zoneActions}>
            <span style={s.zoneText}>Drag photos or folders here</span>
            <div style={s.zoneBtns}>
              <button type="button" style={s.zoneBtn} onClick={() => fileRef.current?.click()}>+ Photos</button>
              <button type="button" style={s.zoneBtn} onClick={() => folderRef.current?.click()}>+ Folder</button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: tap-to-select button */}
      <div className="d-md-none">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', padding: '1rem', background: '#f8f9fa',
            border: '2px dashed #ccc', borderRadius: 8, fontSize: '1rem',
            fontWeight: 600, color: '#555', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}
        >
          <i className="fas fa-images" aria-hidden="true" />
          Add photos
        </button>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileRef} type="file" multiple accept="image/*" style={s.hidden}
        onChange={e => addFiles(e.target.files)} />
      {/* Folder input: hidden on iOS (webkitdirectory unsupported) */}
      {!IS_IOS && (
        <input ref={folderRef} type="file" multiple style={s.hidden}
          webkitdirectory="true" mozdirectory="true"
          onChange={e => addFiles(e.target.files)} />
      )}

      {/* Stats bar */}
      {items.length > 0 && (
        <div style={s.statsBar}>
          {uploading > 0 && <span style={{ color: '#60a5fa' }}>{uploading} uploading</span>}
          {queued    > 0 && <span style={{ color: '#888' }}>{queued} queued</span>}
          {done      > 0 && <span style={{ color: '#4ade80' }}>{done} done</span>}
          {errors    > 0 && <span style={{ color: '#f87171' }}>{errors} failed</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            {errors > 0 && (
              <button style={s.smallBtn} onClick={retryFailed} aria-label="Retry all failed uploads">
                Retry failed
              </button>
            )}
            {done > 0 && !hasActive && (
              <button style={s.smallBtn} onClick={clearDone}>Clear done</button>
            )}
          </div>
        </div>
      )}

      {/* File cards grid */}
      {items.length > 0 && (
        <div style={s.grid}>
          {items.map(item => (
            <div key={item.id} style={s.card}>
              <div style={s.thumbWrap}>
                <img src={item.preview} style={s.thumb} alt={item.file.name}
                  loading="lazy" decoding="async" />
                {item.status === 'uploading' && (
                  <div style={{ ...s.progressBar, width: `${Math.round(item.progress * 100)}%` }} />
                )}
              </div>
              <div style={s.cardMeta}>
                <span style={{ ...s.badge, background: STATUS_BADGE[item.status]?.bg, color: STATUS_BADGE[item.status]?.color }}>
                  {item.retryLabel ?? (item.status === 'uploading' ? `${Math.round(item.progress * 100)}%` : STATUS_BADGE[item.status]?.label)}
                </span>
                {item.status === 'error' && (
                  <button
                    style={{ ...s.smallBtn, marginTop: 2, minHeight: 28, width: '100%' }}
                    onClick={() => retryItem(item.id)}
                    aria-label={`Retry ${item.file.name}`}
                  >
                    Retry
                  </button>
                )}
              </div>
              <div style={s.cardName} title={item.file.name}>{item.file.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Upload done notification */}
      {done > 0 && !hasActive && !notified && (
        <div>
          <button style={s.doneBtn} onClick={handleDone}>
            ✓ J'ai terminé — notifier les éditeurs
          </button>
        </div>
      )}
      {notified && (
        <p style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 500, margin: 0 }}>
          ✓ Éditeurs notifiés
        </p>
      )}
    </div>
  );
}

const s = {
  root:        { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  zone:        { border: '2px dashed #ccc', borderRadius: 8, padding: '1.5rem', textAlign: 'center', background: '#f8f9fa', transition: 'border-color 0.15s, background 0.15s' },
  zoneActive:  { borderColor: '#16a34a', background: '#f0fdf4' },
  zoneActions: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  zoneText:    { color: '#888', fontSize: '0.875rem', userSelect: 'none' },
  zoneBtns:    { display: 'flex', gap: '0.5rem' },
  zoneBtn:     { padding: '0.35rem 0.85rem', background: '#fff', border: '1px solid #ddd', borderRadius: 5, cursor: 'pointer', fontSize: '0.82rem', color: '#555', fontWeight: 500 },
  hidden:      { display: 'none' },
  statsBar:    { display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.82rem', flexWrap: 'wrap' },
  smallBtn:    { padding: '0.25rem 0.6rem', background: 'none', border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: '0.78rem', color: '#888' },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.5rem' },
  card:        { position: 'relative', borderRadius: 6, overflow: 'hidden', background: '#fff', border: '1px solid #e5e7eb' },
  thumbWrap:   { position: 'relative', aspectRatio: '1', overflow: 'hidden' },
  thumb:       { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  progressBar: { position: 'absolute', bottom: 0, left: 0, height: 3, background: '#60a5fa', transition: 'width 0.2s' },
  cardMeta:    { padding: '0.25rem 0.35rem 0' },
  badge:       { display: 'inline-block', fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: 3 },
  cardName:    { padding: '0.15rem 0.35rem 0.35rem', fontSize: '0.65rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  doneBtn:     { padding: '0.5rem 1.25rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' },
};
