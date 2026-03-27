// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
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
  const [collapsed, setCollapsed] = useState(false);

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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
      {t('loading')}
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (user.platformRole !== 'superadmin') return <Navigate to="/admin" replace />;

  return (
    <div className="app-wrapper">
      <Topbar onToggleSidebar={() => setCollapsed(c => !c)} />

      <ScopeSidebar scope="platform" />

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
