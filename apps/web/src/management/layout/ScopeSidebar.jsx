// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/I18nContext.jsx';
import { globalNav, scopeNav, scopeLabels } from '../navigation/nav.config.js';
import { interpolatePath } from '../navigation/nav.helpers.js';

/**
 * Sidebar driven entirely by nav.config.
 * Props:
 *   isMobileDrawer  — when true, renders in the mobile drawer context
 *   onClose         — called to close the mobile drawer (link clicks also close it)
 */
export default function ScopeSidebar({ scope, params = {}, onToggle, isMobileDrawer = false, onClose }) {
  const { user, logout } = useAuth();
  const t = useT();
  const isSuperadmin = user?.platformRole === 'superadmin';
  const location = useLocation();

  const navCls = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;
  const contextItems = scope ? scopeNav[scope] : null;

  // On mobile drawer, clicking a nav item should close it
  const handleNavClick = isMobileDrawer && onClose ? onClose : undefined;

  return (
    <aside className="app-sidebar bg-body" data-bs-theme="dark">
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/manage" className="brand-link" onClick={handleNavClick}>
          <span className="brand-text fw-bold" style={{ fontSize: '1rem', letterSpacing: '-0.02em' }}>
            {t('manage_title')}
          </span>
        </Link>
        {isMobileDrawer && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <i className="fas fa-times" />
          </button>
        )}
      </div>

      <div className="sidebar-wrapper">
        {/* User panel */}
        <div className="d-flex align-items-center px-3 py-3 border-bottom border-secondary">
          <span
            className="d-flex align-items-center justify-content-center fw-bold text-white me-2"
            style={{ width: 34, height: 34, background: '#6c757d', fontSize: '0.9rem', borderRadius: '50%', flexShrink: 0 }}
            aria-hidden="true"
          >
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </span>
          <span className="text-white text-truncate" style={{ fontSize: '0.85rem' }}>
            {user?.name || user?.email}
          </span>
        </div>

        {/* Global navigation */}
        <nav className="mt-2" aria-label="Main navigation">
          <ul className="nav sidebar-menu flex-column">
            {globalNav
              .filter(item => !item.superadminOnly || isSuperadmin)
              .map(item => (
                <li key={item.key} className="nav-item">
                  <NavLink to={item.href} end={item.href === '/manage'} className={navCls} onClick={handleNavClick}
                    style={{ minHeight: 44 }}>
                    <i className={`nav-icon ${item.icon}`} />
                    <p>{item.label}</p>
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>

        {/* Contextual scope navigation */}
        {contextItems && (
          <>
            <div className="px-3 py-2 border-top border-secondary mt-2">
              <span className="text-white" style={{ fontSize: '0.72rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {scopeLabels[scope]}
              </span>
            </div>
            <nav aria-label={`${scopeLabels[scope]} navigation`}>
              <ul className="nav sidebar-menu flex-column">
                {contextItems.map(item => {
                  const href = interpolatePath(item.href, params);
                  return (
                    <li key={item.key} className="nav-item">
                      <NavLink
                        to={href}
                        end={item.key === 'overview'}
                        className={navCls}
                        onClick={handleNavClick}
                        style={{ minHeight: 44 }}
                      >
                        <i className={`nav-icon ${item.icon}`} />
                        <p>{item.label}</p>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </>
        )}
      </div>
    </aside>
  );
}
