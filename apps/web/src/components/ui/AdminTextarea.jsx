// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminTextarea — form-control textarea with label and hint.
 *
 * @param {string}  label
 * @param {string}  [hint]
 * @param {string}  [error]
 * @param {string}  [className]
 * @param {number}  [rows=3]
 * All other props forwarded to <textarea>.
 */
export default function AdminTextarea({ label, hint, error, className = '', rows = 3, ...textareaProps }) {
  const id = textareaProps.id || textareaProps.name || label?.replace(/\s+/g, '_').toLowerCase();
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label className="form-label" htmlFor={id}>{label}</label>}
      <textarea
        id={id}
        rows={rows}
        className={`form-control${error ? ' is-invalid' : ''}`}
        {...textareaProps}
      />
      {error && <div className="invalid-feedback">{error}</div>}
      {hint && <div className="form-text">{hint}</div>}
    </div>
  );
}
