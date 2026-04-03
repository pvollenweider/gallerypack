// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/I18nContext.jsx';
import ScopeSidebar from './ScopeSidebar.jsx';
import Topbar from './Topbar.jsx';

/**
 * Shell for all /admin/platform/* routes.
 * Superadmin-only: redirects to /manage if user is not a superadmin.
 */
export default function PlatformLayout({ children }) {
  const { user, loading } = useAuth();
  const t = useT();
  const { pathname } = useLocation();
  const [collapsed,   setCollapsed]   = useState(false);
  const [drawerOpen,  setDrawerOpen]  = useState(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.classList.add('sidebar-mini', 'layout-fixed');
    return () => {
      document.body.classList.remove('sidebar-mini', 'layout-fixed', 'sidebar-collapse', 'sidebar-open');
    };
  }, []);

  useEffect(() => {
    if (collapsed) {
      document.body.classList.add('sidebar-collapse');
      document.body.classList.remove('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-collapse');
    }
  }, [collapsed]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
      {t('loading')}
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (user.platformRole !== 'superadmin') return <Navigate to="/admin" replace />;

  return (
    <div className="app-wrapper">
      <Topbar
        onToggleSidebar={() => setCollapsed(c => !c)}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <ScopeSidebar scope="platform" />

      {/* Mobile drawer — overlay + slide-in panel */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1050, background: 'rgba(0,0,0,0.55)' }}
          aria-hidden="true"
        />
      )}
      <div
        aria-label="Mobile navigation drawer"
        aria-hidden={!drawerOpen}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 1051,
          width: 280,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          overflowY: 'auto',
        }}
      >
        <ScopeSidebar
          scope="platform"
          isMobileDrawer
          onClose={() => setDrawerOpen(false)}
        />
      </div>

      <main className="app-main">
        <div className="app-content">
          {children}
        </div>
      </main>

      <footer className="app-footer">
        <strong>{t('manage_title')}</strong> &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
