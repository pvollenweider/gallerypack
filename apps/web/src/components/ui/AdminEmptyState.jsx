// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminEmptyState — centered placeholder for empty lists / sections.
 *
 * @param {string}    [icon='fas fa-inbox'] - FA icon class
 * @param {string}    message               - Primary message
 * @param {ReactNode} [action]              - Optional action button
 * @param {string}    [className]
 */
export default function AdminEmptyState({ icon = 'fas fa-inbox', message, action, className = '' }) {
  return (
    <div className={`text-center text-muted py-5 ${className}`}>
      <i className={`${icon} mb-3`} style={{ fontSize: '2rem', opacity: 0.35, display: 'block' }} />
      <p className="mb-0" style={{ fontSize: '0.9rem' }}>{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
