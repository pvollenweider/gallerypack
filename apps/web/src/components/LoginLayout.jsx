// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useT } from '../lib/I18nContext.jsx';

// Centered login card layout — Bootstrap 5 (no AdminLTE login-page/login-box in v4)
export default function LoginLayout({ title, subtitle, children, maxWidth = 380 }) {
  const t = useT();
  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100"
      style={{ background: '#f4f6f9' }}>
      <div style={{ width: '100%', maxWidth, padding: '0 1rem' }}>
        <div className="text-center mb-4">
          <h1 className="fw-bold fs-4">{t('app_brand')}</h1>
          {title && <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>{title}</p>}
          {subtitle && <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>{subtitle}</p>}
        </div>
        <div className="card shadow-sm">
          <div className="card-body p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
