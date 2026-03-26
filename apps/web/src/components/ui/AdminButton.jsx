// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

/**
 * AdminButton — Bootstrap button with built-in loading state.
 *
 * @param {'primary'|'secondary'|'danger'|'success'|'warning'|'outline-primary'|'outline-secondary'|'outline-danger'} [variant='primary']
 * @param {'sm'|'md'|'lg'} [size='md']
 * @param {boolean}  [loading]       - Shows spinner and disables the button
 * @param {string}   [loadingLabel]  - Label shown while loading (defaults to children)
 * @param {boolean}  [disabled]
 * @param {string}   [icon]          - FA icon class (e.g. 'fas fa-save') shown before label
 * @param {string}   [className]
 * @param {function} [onClick]
 * @param {'button'|'submit'|'reset'} [type='button']
 * @param {ReactNode} children
 */
export default function AdminButton({
  variant = 'primary',
  size,
  loading = false,
  loadingLabel,
  disabled = false,
  icon,
  className = '',
  onClick,
  type = 'button',
  children,
  ...rest
}) {
  const sizeClass = size === 'sm' ? ' btn-sm' : size === 'lg' ? ' btn-lg' : '';
  return (
    <button
      type={type}
      className={`btn btn-${variant}${sizeClass} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading ? (
        <>
          <i className="fas fa-spinner fa-spin me-1" />
          {loadingLabel ?? children}
        </>
      ) : (
        <>
          {icon && <i className={`${icon} me-1`} />}
          {children}
        </>
      )}
    </button>
  );
}
