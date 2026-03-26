// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminInput — form-control with label, hint, and error display.
 *
 * @param {string}   label
 * @param {string}   [hint]        - Small muted help text below the input
 * @param {string}   [error]       - Validation error message (turns input red)
 * @param {string}   [prefix]      - input-group-text prepended before the input
 * @param {ReactNode}[labelRight]  - Small content placed right of the label
 * @param {string}   [className]   - Extra class on the wrapper mb-3 div
 * All other props are forwarded to <input>.
 */
export default function AdminInput({ label, hint, error, prefix, labelRight, className = '', ...inputProps }) {
  const id = inputProps.id || inputProps.name || label?.replace(/\s+/g, '_').toLowerCase();
  return (
    <div className={`mb-3 ${className}`}>
      {label && (
        <div className="d-flex justify-content-between align-items-baseline mb-1">
          <label className="form-label mb-0" htmlFor={id}>{label}</label>
          {labelRight && <span className="small">{labelRight}</span>}
        </div>
      )}
      {prefix ? (
        <div className="input-group">
          <span className="input-group-text text-muted">{prefix}</span>
          <input
            id={id}
            className={`form-control${error ? ' is-invalid' : ''}`}
            {...inputProps}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </div>
      ) : (
        <>
          <input
            id={id}
            className={`form-control${error ? ' is-invalid' : ''}`}
            {...inputProps}
          />
          {error && <div className="invalid-feedback">{error}</div>}
        </>
      )}
      {hint && <div className="form-text">{hint}</div>}
    </div>
  );
}
