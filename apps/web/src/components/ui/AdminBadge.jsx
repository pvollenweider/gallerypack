// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminBadge — Bootstrap badge.
 *
 * @param {'primary'|'secondary'|'success'|'danger'|'warning'|'info'|'light'|'dark'} [color='secondary']
 * @param {string} [className]
 * @param {ReactNode} children
 */
export default function AdminBadge({ color = 'secondary', className = '', children }) {
  return (
    <span className={`badge bg-${color} ${className}`}>
      {children}
    </span>
  );
}
