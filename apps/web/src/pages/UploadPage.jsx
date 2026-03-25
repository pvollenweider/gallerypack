// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/pages/UploadPage.jsx — unauthenticated photographer upload via token
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function UploadPage() {
  const { token } = useParams();
  const [info,     setInfo]     = useState(null);
  const [error,    setError]    = useState('');
  const [files,    setFiles]    = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploading,setUploading]= useState(false);
  const [done,     setDone]     = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    api.getUploadInfo(token)
      .then(setInfo)
      .catch(e => setError(e.message));
  }, [token]);

  function handleFiles(newFiles) {
    const EXTS = new Set(['.jpg','.jpeg','.png','.tiff','.tif','.heic','.heif','.avif']);
    const valid = Array.from(newFiles).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return EXTS.has(ext);
    });
    setFiles(prev => [...prev, ...valid]);
  }

  function removeFile(idx) {
    setFiles(f => f.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    if (!files.length || uploading) return;
    setUploading(true);
    setProgress(0);
    try {
      await api.uploadPhotosViaToken(token, files, p => setProgress(Math.round(p * 100)));
      setDone(true);
      setFiles([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  if (error) return (
    <div style={s.center}>
      <div style={s.card}>
        <p style={s.errorText}>{error}</p>
        <p style={{ color: '#999', fontSize: '0.85rem' }}>This upload link may have expired or been revoked.</p>
      </div>
    </div>
  );

  if (!info) return <div style={s.center}><p style={{ color: '#aaa' }}>Loading…</p></div>;

  if (done) return (
    <div style={s.center}>
      <div style={s.card}>
        <div style={s.checkmark}>✓</div>
        <h2 style={s.title}>Photos uploaded</h2>
        <p style={{ color: '#aaa', marginTop: '0.5rem' }}>
          Your photos have been received and are pending review.
        </p>
        <button style={s.btn} onClick={() => setDone(false)}>Upload more</button>
      </div>
    </div>
  );

  return (
    <div style={s.center}>
      <div style={s.card}>
        <h2 style={s.title}>{info.galleryTitle}</h2>
        {info.label && <p style={s.label}>{info.label}</p>}
        {info.expiresAt && (
          <p style={s.hint}>
            Link expires {new Date(info.expiresAt).toLocaleDateString()}
          </p>
        )}

        <div
          style={{ ...s.dropZone, ...(dragOver ? s.dropZoneActive : {}) }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.tiff,.tif,.heic,.heif,.avif"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <p style={s.dropText}>
            {files.length > 0
              ? `${files.length} photo${files.length > 1 ? 's' : ''} selected`
              : 'Drop photos here or click to select'}
          </p>
          <p style={s.dropHint}>JPG, PNG, TIFF, HEIC, AVIF · max 200 MB each</p>
        </div>

        {files.length > 0 && (
          <ul style={s.fileList}>
            {files.map((f, i) => (
              <li key={i} style={s.fileItem}>
                <span style={s.fileName}>{f.name}</span>
                <span style={s.fileSize}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button style={s.removeBtn} onClick={() => removeFile(i)}>✕</button>
              </li>
            ))}
          </ul>
        )}

        {uploading && (
          <div style={s.progressWrap}>
            <div style={{ ...s.progressBar, width: `${progress}%` }} />
            <span style={s.progressLabel}>{progress}%</span>
          </div>
        )}

        <button
          style={{ ...s.btn, ...((!files.length || uploading) ? s.btnDisabled : {}) }}
          disabled={!files.length || uploading}
          onClick={handleUpload}
        >
          {uploading ? 'Uploading…' : `Upload ${files.length || ''} photo${files.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

const s = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111',
    padding: '1.5rem',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '2rem',
    width: '100%',
    maxWidth: '480px',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: '1.3rem',
    fontWeight: 600,
    color: '#eee',
  },
  label: {
    margin: '0.4rem 0 0',
    color: '#aaa',
    fontSize: '0.9rem',
  },
  hint: {
    margin: '0.25rem 0 0',
    color: '#666',
    fontSize: '0.8rem',
  },
  dropZone: {
    marginTop: '1.5rem',
    border: '2px dashed #333',
    borderRadius: '8px',
    padding: '2rem 1rem',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
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
  dropHint: {
    margin: '0.4rem 0 0',
    color: '#555',
    fontSize: '0.78rem',
  },
  fileList: {
    listStyle: 'none',
    margin: '1rem 0 0',
    padding: 0,
    maxHeight: '180px',
    overflowY: 'auto',
    textAlign: 'left',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.3rem 0',
    borderBottom: '1px solid #222',
    fontSize: '0.82rem',
    color: '#ccc',
  },
  fileName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileSize: {
    color: '#666',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    cursor: 'pointer',
    padding: '0 0.25rem',
    fontSize: '0.85rem',
  },
  progressWrap: {
    position: 'relative',
    marginTop: '1rem',
    height: '6px',
    background: '#2a2a2a',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#4ade80',
    transition: 'width 0.2s',
  },
  progressLabel: {
    position: 'absolute',
    right: 0,
    top: '8px',
    fontSize: '0.75rem',
    color: '#888',
  },
  btn: {
    marginTop: '1.25rem',
    width: '100%',
    padding: '0.75rem',
    background: '#222',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#eee',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  checkmark: {
    fontSize: '2.5rem',
    color: '#4ade80',
    marginBottom: '0.5rem',
  },
  errorText: {
    color: '#f87171',
    margin: 0,
    fontSize: '1rem',
  },
};
