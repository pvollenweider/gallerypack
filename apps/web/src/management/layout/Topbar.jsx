// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { buildBreadcrumb } from '../navigation/nav.helpers.js';

/**
 * Top navigation bar shared by ManageLayout and PlatformLayout.
 *
 * @param {{ onToggleSidebar: () => void, entityNames?: Record<string,string> }} props
 *   entityNames — map of entity IDs to human-readable names for the breadcrumb,
 *   e.g. { abc123: 'Acme Corp', def456: 'Paris 2024' }. Populated by scope pages in Sprint 3+.
 */
export default function Topbar({ onToggleSidebar, entityNames = {} }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const crumbs = buildBreadcrumb(pathname, entityNames);

  return (
    <nav className="app-header navbar navbar-expand">
      <div className="container-fluid">
        {/* Sidebar toggle */}
        <ul className="navbar-nav">
          <li className="nav-item">
            <a className="nav-link" role="button" style={{ cursor: 'pointer' }} onClick={onToggleSidebar}>
              <i className="fas fa-bars" />
            </a>
          </li>
        </ul>

        {/* Breadcrumb */}
        {crumbs.length > 0 && (
          <ul className="navbar-nav d-none d-sm-flex ms-2">
            <li className="nav-item">
              <nav aria-label="breadcrumb">
                <ol className="breadcrumb mb-0" style={{ fontSize: '0.85rem' }}>
                  {crumbs.map((crumb, i) => (
                    <li
                      key={crumb.href}
                      className={`breadcrumb-item${i === crumbs.length - 1 ? ' active' : ''}`}
                    >
                      {i < crumbs.length - 1
                        ? <Link to={crumb.href} className="text-muted">{crumb.label}</Link>
                        : crumb.label
                      }
                    </li>
                  ))}
                </ol>
              </nav>
            </li>
          </ul>
        )}

        {/* Right side: user + logout */}
        <ul className="navbar-nav ms-auto">
          <li className="nav-item d-none d-sm-flex align-items-center">
            <span className="nav-link text-muted" style={{ fontSize: '0.85rem' }}>
              {user?.email}
            </span>
          </li>
          <li className="nav-item">
            <a className="nav-link" role="button" style={{ cursor: 'pointer' }} onClick={logout}>
              <i className="fas fa-sign-out-alt" />
              <span className="d-none d-md-inline ms-1">Sign out</span>
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
}
