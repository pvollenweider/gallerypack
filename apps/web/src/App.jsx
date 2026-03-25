// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { I18nProvider } from './lib/I18nContext.jsx';
import StudiosPage    from './pages/StudiosPage.jsx';
import StudioHome     from './pages/StudioHome.jsx';
import ProjectDetail  from './pages/ProjectDetail.jsx';
import GalleryDetail  from './pages/GalleryDetail.jsx';
import BuildStatus    from './pages/BuildStatus.jsx';
import Settings       from './pages/Settings.jsx';
import MemberProfile  from './pages/MemberProfile.jsx';
import AcceptInvite   from './pages/AcceptInvite.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword  from './pages/ResetPassword.jsx';
import MagicLogin     from './pages/MagicLogin.jsx';
import { Footer }     from './components/Footer.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.center}>Loading…</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function AuthLayout({ children }) {
  return (
    <RequireAuth>
      <div style={styles.layout}>
        <div style={styles.content}>{children}</div>
        <Footer />
      </div>
    </RequireAuth>
  );
}

// Lazy import of Login to avoid circular deps with auth context
import Login from './pages/Login.jsx';

export default function App() {
  return (
    <I18nProvider>
    <Routes>
      <Route path="/login"                       element={<Login />} />
      {/* Studios list — main entry point */}
      <Route path="/"                            element={<AuthLayout><StudiosPage /></AuthLayout>} />
      {/* Studio home — projects + team */}
      <Route path="/studio"                      element={<AuthLayout><StudioHome /></AuthLayout>} />
      {/* Project detail — galleries */}
      <Route path="/projects/:id"                element={<AuthLayout><ProjectDetail /></AuthLayout>} />
      {/* Gallery detail */}
      <Route path="/galleries/:id"               element={<AuthLayout><GalleryDetail /></AuthLayout>} />
      <Route path="/jobs/:jobId"                 element={<AuthLayout><BuildStatus /></AuthLayout>} />
      <Route path="/settings"                    element={<AuthLayout><Settings /></AuthLayout>} />
      <Route path="/team/:userId"                element={<AuthLayout><MemberProfile /></AuthLayout>} />
      {/* Public / unauthenticated */}
      <Route path="/invite/:token"               element={<AcceptInvite />} />
      <Route path="/forgot-password"             element={<ForgotPassword />} />
      <Route path="/reset-password/:token"       element={<ResetPassword />} />
      <Route path="/magic-login/:token"          element={<MagicLogin />} />
      <Route path="*"                            element={<Navigate to="/" replace />} />
    </Routes>
    </I18nProvider>
  );
}

const styles = {
  center:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' },
  layout:  { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  content: { flex: 1 },
};
