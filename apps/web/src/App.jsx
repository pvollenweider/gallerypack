// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { I18nProvider } from './lib/I18nContext.jsx';
import AdminLayout     from './components/AdminLayout.jsx';
import StudiosPage     from './pages/StudiosPage.jsx';
import StudioHome      from './pages/StudioHome.jsx';
import ProjectDetail   from './pages/ProjectDetail.jsx';
import GalleryDetail   from './pages/GalleryDetail.jsx';
import BuildStatus     from './pages/BuildStatus.jsx';
import Settings        from './pages/Settings.jsx';
import Team            from './pages/Team.jsx';
import MemberProfile   from './pages/MemberProfile.jsx';
import AcceptInvite    from './pages/AcceptInvite.jsx';
import ForgotPassword  from './pages/ForgotPassword.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';
import MagicLogin      from './pages/MagicLogin.jsx';
import UploadPage      from './pages/UploadPage.jsx';
import Dashboard       from './pages/Dashboard.jsx';

// Management
import ManageLayout    from './management/layout/ManageLayout.jsx';
import PlatformLayout  from './management/layout/PlatformLayout.jsx';
import ManageHub       from './management/pages/manage/ManageHub.jsx';
import { PlatformOverviewPage, SmtpPage, LicensePage, BrandingPage } from './management/pages/platform/index.jsx';
import { OrganizationsListPage, OrganizationOverviewPage, OrganizationGeneralPage, OrganizationDefaultsPage, OrganizationAccessPage, OrganizationTeamPage, OrganizationProjectsPage } from './management/pages/organizations/index.jsx';
import { ProjectsListPage, ProjectOverviewPage, ProjectGeneralPage, ProjectGalleriesPage, ProjectAccessPage, ProjectDeliveryPage } from './management/pages/projects/index.jsx';
import { GalleriesListPage, GalleryOverviewPage, GalleryGeneralPage, GalleryAccessPage, GalleryDownloadsPage, GalleryUploadPage, GalleryPublishPage, GalleryInsightsPage } from './management/pages/galleries/index.jsx';

// Inspector
import InspectorLayout     from './inspector/InspectorLayout.jsx';
import InspectorGallery    from './inspector/InspectorGallery.jsx';
import InspectorPhoto      from './inspector/InspectorPhoto.jsx';
import { InspectorStudioList, InspectorStudioDetail } from './inspector/InspectorStudio.jsx';
import { InspectorProjectList, InspectorProjectDetail } from './inspector/InspectorProject.jsx';
import { InspectorUserList, InspectorUserDetail } from './inspector/InspectorUser.jsx';
import InspectorDashboard  from './inspector/InspectorDashboard.jsx';
import InspectorAnomalies  from './inspector/InspectorAnomalies.jsx';

// Lazy import of Login to avoid circular deps with auth context
import Login from './pages/Login.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888' }}>
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AuthLayout({ children }) {
  return (
    <RequireAuth>
      <AdminLayout>
        {children}
      </AdminLayout>
    </RequireAuth>
  );
}

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
      <Route path="/team"                        element={<AuthLayout><Team /></AuthLayout>} />
      <Route path="/team/:userId"                element={<AuthLayout><MemberProfile /></AuthLayout>} />
      {/* Public / unauthenticated */}
      <Route path="/invite/:token"               element={<AcceptInvite />} />
      <Route path="/forgot-password"             element={<ForgotPassword />} />
      <Route path="/reset-password/:token"       element={<ResetPassword />} />
      <Route path="/magic-login/:token"          element={<MagicLogin />} />
      <Route path="/upload/:token"               element={<UploadPage />} />

      {/* ── Management — /manage/* ── */}
      <Route path="/manage" element={<ManageLayout><ManageHub /></ManageLayout>} />
      <Route path="/manage/organizations" element={<ManageLayout><OrganizationsListPage /></ManageLayout>} />
      <Route path="/manage/organizations/:orgId" element={<ManageLayout><OrganizationOverviewPage /></ManageLayout>} />
      <Route path="/manage/organizations/:orgId/general" element={<ManageLayout><OrganizationGeneralPage /></ManageLayout>} />
      <Route path="/manage/organizations/:orgId/defaults" element={<ManageLayout><OrganizationDefaultsPage /></ManageLayout>} />
      <Route path="/manage/organizations/:orgId/access" element={<ManageLayout><OrganizationAccessPage /></ManageLayout>} />
      <Route path="/manage/organizations/:orgId/team" element={<ManageLayout><OrganizationTeamPage /></ManageLayout>} />
      <Route path="/manage/organizations/:orgId/projects" element={<ManageLayout><OrganizationProjectsPage /></ManageLayout>} />

      <Route path="/manage/projects" element={<ManageLayout><ProjectsListPage /></ManageLayout>} />
      <Route path="/manage/projects/:projectId" element={<ManageLayout><ProjectOverviewPage /></ManageLayout>} />
      <Route path="/manage/projects/:projectId/general" element={<ManageLayout><ProjectGeneralPage /></ManageLayout>} />
      <Route path="/manage/projects/:projectId/galleries" element={<ManageLayout><ProjectGalleriesPage /></ManageLayout>} />
      <Route path="/manage/projects/:projectId/access" element={<ManageLayout><ProjectAccessPage /></ManageLayout>} />
      <Route path="/manage/projects/:projectId/delivery" element={<ManageLayout><ProjectDeliveryPage /></ManageLayout>} />

      <Route path="/manage/galleries" element={<ManageLayout><GalleriesListPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId" element={<ManageLayout><GalleryOverviewPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId/general" element={<ManageLayout><GalleryGeneralPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId/access" element={<ManageLayout><GalleryAccessPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId/downloads" element={<ManageLayout><GalleryDownloadsPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId/upload" element={<ManageLayout><GalleryUploadPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId/publish" element={<ManageLayout><GalleryPublishPage /></ManageLayout>} />
      <Route path="/manage/galleries/:galleryId/insights" element={<ManageLayout><GalleryInsightsPage /></ManageLayout>} />

      {/* ── Platform admin — /admin/platform/* (superadmin only) ── */}
      <Route path="/admin/platform" element={<PlatformLayout><PlatformOverviewPage /></PlatformLayout>} />
      <Route path="/admin/platform/smtp" element={<PlatformLayout><SmtpPage /></PlatformLayout>} />
      <Route path="/admin/platform/license" element={<PlatformLayout><LicensePage /></PlatformLayout>} />
      <Route path="/admin/platform/branding" element={<PlatformLayout><BrandingPage /></PlatformLayout>} />

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
