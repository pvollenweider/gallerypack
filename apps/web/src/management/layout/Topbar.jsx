// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/I18nContext.jsx';

/**
 * Top navigation bar shared by ManageLayout and PlatformLayout.
 * Props:
 *   onToggleSidebar — desktop sidebar collapse/expand
 *   onOpenDrawer    — mobile hamburger opens the slide-in drawer
 */
export default function Topbar({ onToggleSidebar, onOpenDrawer }) {
  const { user, logout } = useAuth();
  const t = useT();

  const btnStyle = { minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <nav className="app-header navbar navbar-expand">
      <div className="container-fluid">
        <ul className="navbar-nav">
          <li className="nav-item">
            {/* Desktop: collapse sidebar */}
            <button type="button" className="nav-link d-none d-md-flex" onClick={onToggleSidebar}
              aria-label="Toggle sidebar" style={btnStyle}>
              <i className="fas fa-bars" aria-hidden="true" />
            </button>
            {/* Mobile: open slide-in drawer */}
            <button type="button" className="nav-link d-flex d-md-none" onClick={onOpenDrawer}
              aria-label="Open navigation" style={btnStyle}>
              <i className="fas fa-bars" aria-hidden="true" />
            </button>
          </li>
        </ul>

        <ul className="navbar-nav ms-auto">
          <li className="nav-item d-none d-sm-flex align-items-center">
            <span className="nav-link text-muted" style={{
              fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: 200, whiteSpace: 'nowrap',
            }}>
              {user?.email}
            </span>
          </li>
          <li className="nav-item">
            <button type="button" className="nav-link" onClick={logout}
              aria-label="Sign out" style={btnStyle}>
              <i className="fas fa-sign-out-alt" aria-hidden="true" />
              <span className="d-none d-md-inline ms-1">{t('sign_out')}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
