// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminLoader — centered spinner.
 *
 * @param {string} [label='Loading…']
 * @param {'sm'|'md'} [size='md']
 * @param {string} [className]
 */
export default function AdminLoader({ label = 'Loading…', size = 'md', className = '' }) {
  const spinnerClass = size === 'sm' ? 'spinner-border spinner-border-sm' : 'spinner-border';
  return (
    <div className={`d-flex align-items-center justify-content-center gap-2 text-muted py-4 ${className}`}>
      <div className={spinnerClass} role="status" aria-hidden="true" />
      <span style={{ fontSize: '0.9rem' }}>{label}</span>
    </div>
  );
}
