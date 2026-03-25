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
import UploadPage     from './pages/UploadPage.jsx';
import Dashboard      from './pages/Dashboard.jsx';
import { Footer }     from './components/Footer.jsx';

// Inspector
import InspectorLayout     from './inspector/InspectorLayout.jsx';
import InspectorGallery    from './inspector/InspectorGallery.jsx';
import InspectorPhoto      from './inspector/InspectorPhoto.jsx';
import { InspectorStudioList, InspectorStudioDetail } from './inspector/InspectorStudio.jsx';
import { InspectorProjectList, InspectorProjectDetail } from './inspector/InspectorProject.jsx';
import { InspectorUserList, InspectorUserDetail } from './inspector/InspectorUser.jsx';
import InspectorDashboard  from './inspector/InspectorDashboard.jsx';
import InspectorAnomalies  from './inspector/InspectorAnomalies.jsx';

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
      <Route path="/dashboard"                   element={<AuthLayout><Dashboard /></AuthLayout>} />
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
      <Route path="/upload/:token"               element={<UploadPage />} />

      {/* Inspector (superadmin only) */}
      <Route path="/inspector" element={<RequireAuth><InspectorLayout /></RequireAuth>}>
        <Route index                             element={<Navigate to="/inspector/studios" replace />} />
        <Route path="studios"                    element={<InspectorStudioList />} />
        <Route path="studios/:id"                element={<InspectorStudioDetail />} />
        <Route path="projects"                   element={<InspectorProjectList />} />
        <Route path="projects/:id"               element={<InspectorProjectDetail />} />
        <Route path="galleries"                  element={<Navigate to="/inspector/studios" replace />} />
        <Route path="galleries/:id"              element={<InspectorGallery />} />
        <Route path="photos/:id"                 element={<InspectorPhoto />} />
        <Route path="users"                      element={<InspectorUserList />} />
        <Route path="users/:id"                  element={<InspectorUserDetail />} />
        <Route path="anomalies"                  element={<InspectorAnomalies />} />
        <Route path="dashboard"                  element={<InspectorDashboard />} />
      </Route>

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
