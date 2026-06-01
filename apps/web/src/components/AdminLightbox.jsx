// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useCallback } from 'react';

export function AdminLightbox({
  photos,
  initialIndex,
  selected,
  onToggleSelect,
  onClose,
  photographers,
  galleryId,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0);

  const photo = photos[currentIndex];

  const goNext = useCallback(() => {
    setCurrentIndex(i => (i + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => (i - 1 + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        onToggleSelect(photos[currentIndex].id);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goNext, goPrev, onClose, onToggleSelect, photos]);

  if (!photo) return null;

  const isSelected = selected.has(photo.id);
  const imgSrc = galleryId && photo.file
  ? `/api/galleries/${galleryId}/photos/${encodeURIComponent(photo.file)}/preview`
  : (photo.thumbnail?.md ?? photo.thumbnail?.sm);
  const photographerName = photo.photographer_id
    ? (photographers.find(pg => pg.id === photo.photographer_id)?.name ?? null)
    : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1060,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Selection badge — top-left */}
      <button
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          background: isSelected ? '#3b82f6' : 'rgba(0,0,0,0.55)',
          border: `2px solid ${isSelected ? '#93c5fd' : 'rgba(255,255,255,0.4)'}`,
          color: '#fff',
          borderRadius: 20,
          padding: '5px 14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.82rem',
          fontWeight: 500,
          lineHeight: 1,
        }}
        onClick={e => { e.stopPropagation(); onToggleSelect(photo.id); }}
      >
        <i className={`fas fa-${isSelected ? 'check-circle' : 'circle'}`} style={{ fontSize: '0.8rem' }} />
        {isSelected ? 'Sélectionnée' : 'Sélectionner'}
      </button>

      {/* Close button — top-right */}
      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          background: 'rgba(0,0,0,0.55)',
          border: 'none',
          color: '#fff',
          borderRadius: 6,
          width: 32,
          height: 32,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
        }}
      >
        <i className="fas fa-times" />
      </button>

      {/* Left arrow */}
      {photos.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); goPrev(); }}
          style={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            background: 'rgba(0,0,0,0.55)',
            border: 'none',
            color: '#fff',
            borderRadius: 6,
            width: 40,
            height: 40,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
          }}
        >
          <i className="fas fa-chevron-left" />
        </button>
      )}

      {/* Right arrow */}
      {photos.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); goNext(); }}
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            background: 'rgba(0,0,0,0.55)',
            border: 'none',
            color: '#fff',
            borderRadius: 6,
            width: 40,
            height: 40,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
          }}
        >
          <i className="fas fa-chevron-right" />
        </button>
      )}

      {/* Image container — click doesn't bubble to backdrop */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '90vw',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={photo.original_name || photo.file}
            style={{
              maxHeight: '90vh',
              maxWidth: '90vw',
              objectFit: 'contain',
              display: 'block',
              borderRadius: 4,
            }}
          />
        ) : (
          <div style={{
            width: 320,
            height: 240,
            background: 'linear-gradient(135deg,#374151,#1f2937)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <i className="fas fa-image" style={{ fontSize: '3rem', color: '#9ca3af' }} />
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: '0.6rem',
          textAlign: 'center',
          color: '#e5e7eb',
          fontSize: '0.85rem',
          lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 500 }}>{photo.original_name || photo.file}</div>
          {photographerName && (
            <div style={{ color: '#93c5fd', fontSize: '0.78rem' }}>
              <i className="fas fa-camera me-1" style={{ fontSize: '0.7rem' }} />
              {photographerName}
            </div>
          )}
          {photo.exif?.width && photo.exif?.height && (
            <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
              {photo.exif.width} × {photo.exif.height}
            </div>
          )}
          <div style={{ color: '#4b5563', fontSize: '0.7rem', marginTop: '0.5rem' }}>
            <kbd style={{ background: '#1f2937', color: '#9ca3af', padding: '1px 5px', borderRadius: 3, fontSize: '0.68rem' }}>Space</kbd>
            {' '}sélectionner{'  ·  '}
            <kbd style={{ background: '#1f2937', color: '#9ca3af', padding: '1px 5px', borderRadius: 3, fontSize: '0.68rem' }}>←→</kbd>
            {' '}naviguer{'  ·  '}
            <kbd style={{ background: '#1f2937', color: '#9ca3af', padding: '1px 5px', borderRadius: 3, fontSize: '0.68rem' }}>Esc</kbd>
            {' '}fermer
          </div>
        </div>
      </div>
    </div>
  );
}
