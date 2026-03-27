// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/web/src/components/PhotoThumb.jsx — thumbnail with shimmer + placeholder fallback
//
// Props:
//   photo    { id, filename, thumbnail: { sm: string|null, md: string|null } }
//   size     'sm' | 'md'  (default: 'sm')
//   width    number (default: 56)
//   height   number (default: 56)
//   className  optional extra CSS class
//   alt      optional alt text (defaults to photo.filename)

import { useState } from 'react';

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
    style={{ width: 20, height: 20, color: '#9ca3af' }} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
  </svg>
);

export default function PhotoThumb({ photo, size = 'sm', width = 56, height = 56, className = '', alt }) {
  const [loaded, setLoaded]   = useState(false);
  const [broken, setBroken]   = useState(false);

  const src = photo?.thumbnail?.[size] ?? null;
  const showPlaceholder = !src || broken;

  const containerStyle = {
    width,
    height,
    borderRadius: 4,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  };

  return (
    <div className={`photo-thumb ${className}`} style={containerStyle}>
      {/* Shimmer — shown while image is loading */}
      {!loaded && !showPlaceholder && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
          backgroundSize: '200% 100%',
          animation: 'photo-thumb-shimmer 1.2s infinite linear',
        }} />
      )}

      {/* Placeholder — missing or broken thumbnail */}
      {showPlaceholder && <CameraIcon />}

      {/* Actual thumbnail */}
      {src && !broken && (
        <img
          src={src}
          alt={alt ?? photo?.filename ?? ''}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: loaded ? 'block' : 'none' }}
          onLoad={() => setLoaded(true)}
          onError={() => { setBroken(true); setLoaded(true); }}
        />
      )}

      <style>{`
        @keyframes photo-thumb-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
