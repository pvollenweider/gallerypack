// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect } from 'react';

/**
 * AdminToast — ephemeral top-right notification.
 * Auto-dismisses after `duration` ms.
 *
 * @param {boolean}  show
 * @param {function} onClose
 * @param {string|ReactNode} message
 * @param {'success'|'danger'|'warning'|'info'|'secondary'} [variant='success']
 * @param {number}   [duration=3000]   - Auto-close delay in ms. 0 = no auto-close.
 */
export default function AdminToast({ show, onClose, message, variant = 'success', duration = 3000 }) {
  useEffect(() => {
    if (!show || duration === 0) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [show, duration, onClose]);

  if (!show) return null;

  const iconMap = { success: 'fas fa-check-circle', danger: 'fas fa-exclamation-circle', warning: 'fas fa-exclamation-triangle', info: 'fas fa-info-circle', secondary: 'fas fa-bell' };
  const icon = iconMap[variant] || iconMap.secondary;

  return (
    <div
      style={{
        position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
        minWidth: 260, maxWidth: 360,
      }}
    >
      <div className={`alert alert-${variant} alert-dismissible d-flex align-items-center gap-2 shadow mb-0`} role="alert">
        <i className={icon} />
        <span style={{ fontSize: '0.875rem' }}>{message}</span>
        <button type="button" className="btn-close ms-auto" onClick={onClose} aria-label="Close" />
      </div>
    </div>
  );
}
