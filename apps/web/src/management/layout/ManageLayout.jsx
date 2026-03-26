// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useEffect, useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import ScopeSidebar from './ScopeSidebar.jsx';
import Topbar from './Topbar.jsx';
import { detectScope, extractScopeParams } from '../navigation/nav.helpers.js';

/**
 * Main shell for all /manage/* routes.
 * Detects the active scope from the URL and passes it to ScopeSidebar.
 *
 * @param {{ children: React.ReactNode, entityNames?: Record<string,string> }} props
 */
export default function ManageLayout({ children, entityNames }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const scope = detectScope(pathname);
  const params = extractScopeParams(pathname);

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
      Loading…
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-wrapper">
      <Topbar onToggleSidebar={() => setCollapsed(c => !c)} entityNames={entityNames} />

      <ScopeSidebar scope={scope} params={params} />

      <main className="app-main">
        <div className="app-content">
          {children}
        </div>
      </main>

      <footer className="app-footer">
        <strong>GalleryPack</strong> &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
