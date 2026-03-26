// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminCard — Bootstrap card with optional title and footer.
 *
 * @param {string}    [title]      - Card header title
 * @param {ReactNode} [headerRight]- Right-aligned content in the header
 * @param {ReactNode} [footer]     - Card footer content
 * @param {string}    [className]  - Extra class on the root card div
 * @param {boolean}   [noPadding]  - Skip card-body padding (for tables)
 * @param {ReactNode} children
 */
export default function AdminCard({ title, headerRight, footer, className = '', noPadding = false, children }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-header d-flex align-items-center justify-content-between">
          <h3 className="card-title mb-0">{title}</h3>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'card-body'}>
        {children}
      </div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}
