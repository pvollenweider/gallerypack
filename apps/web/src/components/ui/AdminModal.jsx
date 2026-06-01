// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useRef } from 'react';

/**
 * AdminModal — Bootstrap 5 modal (React-controlled).
 *
 * Opens/closes via the `open` prop without imperative BS.Modal calls.
 *
 * @param {boolean}   open
 * @param {function}  onClose      - Called when backdrop / × is clicked
 * @param {string}    title
 * @param {ReactNode} [footer]     - Footer content (buttons). Defaults to a single Close button.
 * @param {'sm'|'md'|'lg'|'xl'} [size='md']
 * @param {number}    [zIndex]     - Override z-index (backdrop gets zIndex-5, dialog gets zIndex)
 * @param {ReactNode} children
 */
export default function AdminModal({ open, onClose, title, footer, size = 'md', zIndex, children }) {
  const dialogRef = useRef(null);

  // Keep Bootstrap modal visibility in sync with `open` prop
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.classList.add('show');
      el.style.display = 'block';
      document.body.classList.add('modal-open');
    } else {
      el.classList.remove('show');
      el.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  }, [open]);

  if (!open) return null;

  const sizeClass = size === 'sm' ? ' modal-sm' : size === 'lg' ? ' modal-lg' : size === 'xl' ? ' modal-xl' : '';

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop fade show" onClick={onClose} style={zIndex != null ? { zIndex: zIndex - 5 } : undefined} />
      {/* Dialog */}
      <div ref={dialogRef} className="modal fade show" style={{ display: 'block', ...(zIndex != null ? { zIndex } : {}) }} tabIndex={-1} role="dialog">
        <div className={`modal-dialog${sizeClass}`} role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">
              {children}
            </div>
            {footer !== false && (
              <div className="modal-footer">
                {footer ?? (
                  <button type="button" className="btn btn-secondary" onClick={onClose}>
                    Close
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
