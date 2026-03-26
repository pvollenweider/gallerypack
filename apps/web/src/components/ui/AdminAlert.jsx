// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminAlert — Bootstrap inline alert.
 * Returns null when `message` is falsy (safe to render unconditionally).
 *
 * @param {'success'|'danger'|'warning'|'info'|'secondary'} [variant='danger']
 * @param {string|ReactNode} message
 * @param {function} [onClose]  - If provided, renders a dismiss × button
 * @param {string}   [className]
 */
export default function AdminAlert({ variant = 'danger', message, onClose, className = '' }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${variant}${onClose ? ' alert-dismissible' : ''} ${className}`} role="alert">
      {message}
      {onClose && (
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
      )}
    </div>
  );
}
