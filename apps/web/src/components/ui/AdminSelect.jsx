// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminSelect — form-select with label and hint.
 *
 * @param {string} label
 * @param {string} [hint]
 * @param {string} [error]
 * @param {string} [className]
 * @param {{ value: string, label: string }[]} [options] - Convenience shorthand
 * @param {ReactNode} [children] - <option> elements (alternative to `options`)
 * All other props forwarded to <select>.
 */
export default function AdminSelect({ label, hint, error, options, className = '', children, ...selectProps }) {
  const id = selectProps.id || selectProps.name || label?.replace(/\s+/g, '_').toLowerCase();
  return (
    <div className={`mb-3 ${className}`}>
      {label && <label className="form-label" htmlFor={id}>{label}</label>}
      <select
        id={id}
        className={`form-select${error ? ' is-invalid' : ''}`}
        {...selectProps}
      >
        {options
          ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
          : children}
      </select>
      {error && <div className="invalid-feedback">{error}</div>}
      {hint && <div className="form-text">{hint}</div>}
    </div>
  );
}
