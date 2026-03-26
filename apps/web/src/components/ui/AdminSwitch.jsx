// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminSwitch — Bootstrap form-check form-switch.
 *
 * @param {string}   label
 * @param {string}   [hint]       - Small muted text below the switch
 * @param {boolean}  checked
 * @param {function} onChange
 * @param {boolean}  [disabled]
 * @param {string}   [className]
 * @param {string}   [id]
 */
export default function AdminSwitch({ label, hint, checked, onChange, disabled = false, className = '', id, name }) {
  const switchId = id || name || label?.replace(/\s+/g, '_').toLowerCase();
  return (
    <div className={`mb-3 ${className}`}>
      <div className="form-check form-switch">
        <input
          className="form-check-input"
          type="checkbox"
          id={switchId}
          name={name}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <label className="form-check-label" htmlFor={switchId}>{label}</label>
      </div>
      {hint && <div className="form-text">{hint}</div>}
    </div>
  );
}
