// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminSection — titled block inside a page (no card border).
 *
 * @param {string}    title
 * @param {string}    [hint]   - Small muted hint below the title
 * @param {ReactNode} children
 */
export default function AdminSection({ title, hint, children }) {
  return (
    <div className="mb-4">
      <h5 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: hint ? '0.2rem' : '0.75rem' }}>
        {title}
      </h5>
      {hint && <p className="text-muted small mb-3">{hint}</p>}
      {children}
    </div>
  );
}
