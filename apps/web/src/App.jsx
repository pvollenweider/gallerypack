// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { I18nProvider } from './lib/I18nContext.jsx';
import BuildStatus     from './pages/BuildStatus.jsx';
import MemberProfile   from './pages/MemberProfile.jsx';
import AcceptInvite    from './pages/AcceptInvite.jsx';
import ForgotPassword  from './pages/ForgotPassword.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';
import MagicLogin      from './pages/MagicLogin.jsx';
import UploadPage      from './pages/UploadPage.jsx';

// Management
import ManageLayout    from './management/layout/ManageLayout.jsx';
import PlatformLayout  from './management/layout/PlatformLayout.jsx';
import ManageHub       from './management/pages/manage/ManageHub.jsx';
import TokensPage      from './management/pages/manage/TokensPage.jsx';
import ProfilePage     from './management/pages/profile/ProfilePage.jsx';
import { PlatformOverviewPage, SmtpPage, LicensePage, BrandingPage } from './management/pages/platform/index.jsx';
import { OrganizationsListPage, OrganizationOverviewPage, OrganizationGeneralPage, OrganizationDefaultsPage, OrganizationAccessPage, OrganizationTeamPage, OrganizationProjectsPage } from './management/pages/organizations/index.jsx';
import { ProjectsListPage, ProjectOverviewPage, ProjectGeneralPage, ProjectGalleriesPage, ProjectAccessPage, ProjectDeliveryPage } from './management/pages/projects/index.jsx';
import { GalleriesListPage, GalleryOverviewPage, GalleryGeneralPage, GalleryAccessPage, GalleryDownloadsPage, GalleryUploadPage, GalleryPublishPage, GalleryInsightsPage, GalleryPhotosPage, GalleryJobsPage, GalleryInboxPage } from './management/pages/galleries/index.jsx';

// Inspector
import InspectorLayout     from './inspector/InspectorLayout.jsx';
import InspectorGallery    from './inspector/InspectorGallery.jsx';
import InspectorPhoto      from './inspector/InspectorPhoto.jsx';
import { InspectorStudioList, InspectorStudioDetail } from './inspector/InspectorStudio.jsx';
import { InspectorProjectList, InspectorProjectDetail } from './inspector/InspectorProject.jsx';
import { InspectorUserList, InspectorUserDetail } from './inspector/InspectorUser.jsx';
import InspectorDashboard  from './inspector/InspectorDashboard.jsx';
import InspectorAnomalies  from './inspector/InspectorAnomalies.jsx';

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

/** Redirect /projects/:id → /admin/projects/:id/galleries */
function ProjectRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/projects/${id}/galleries`} replace />;
}

/** Redirect /galleries/:id → /admin/galleries/:id/photos */
function GalleryRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/galleries/${id}/photos`} replace />;
}

/** Redirect /jobs/:jobId → /admin/jobs/:jobId */
function JobRedirect() {
  const { jobId } = useParams();
  return <Navigate to={`/admin/jobs/${jobId}`} replace />;
}

/** Redirect /manage/* → /admin/* (backward compat) */
function ManageRedirect() {
  const { pathname } = useLocation();
  const rest = pathname.replace(/^\/manage/, '');
  return <Navigate to={`/admin${rest}`} replace />;
}

export default function App() {
  return (
    <I18nProvider>
    <Routes>
      <Route path="/login"                       element={<Login />} />

      {/* ── Backward-compat: /manage/* → /admin/* ── */}
      <Route path="/manage/*"                    element={<ManageRedirect />} />

      {/* ── Backward-compat redirects for old AdminLayout routes ── */}
      <Route path="/"                            element={<Navigate to="/admin" replace />} />
      <Route path="/studio"                      element={<Navigate to="/admin" replace />} />
      <Route path="/dashboard"                   element={<Navigate to="/admin" replace />} />
      <Route path="/settings"                    element={<Navigate to="/admin/profile" replace />} />
      <Route path="/team"                        element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/projects/:id"                element={<ProjectRedirect />} />
      <Route path="/galleries/:id"               element={<GalleryRedirect />} />
      <Route path="/jobs/:jobId"                 element={<JobRedirect />} />

      {/* Public / unauthenticated */}
      <Route path="/invite/:token"               element={<AcceptInvite />} />
      <Route path="/forgot-password"             element={<ForgotPassword />} />
      <Route path="/reset-password/:token"       element={<ResetPassword />} />
      <Route path="/magic-login/:token"          element={<MagicLogin />} />
      <Route path="/upload/:token"               element={<UploadPage />} />

      {/* ── Management — /admin/* ── */}
      <Route path="/admin"                       element={<ManageLayout><ManageHub /></ManageLayout>} />
      <Route path="/admin/profile"               element={<ManageLayout><ProfilePage /></ManageLayout>} />
      <Route path="/admin/tokens"                element={<ManageLayout><TokensPage /></ManageLayout>} />
      <Route path="/admin/members/:userId"       element={<ManageLayout><MemberProfile /></ManageLayout>} />
      <Route path="/admin/jobs/:jobId"           element={<ManageLayout><BuildStatus /></ManageLayout>} />

      <Route path="/admin/organizations"                             element={<ManageLayout><OrganizationsListPage /></ManageLayout>} />
      <Route path="/admin/organizations/:orgId"                      element={<ManageLayout><OrganizationOverviewPage /></ManageLayout>} />
      <Route path="/admin/organizations/:orgId/general"              element={<ManageLayout><OrganizationGeneralPage /></ManageLayout>} />
      <Route path="/admin/organizations/:orgId/defaults"             element={<ManageLayout><OrganizationDefaultsPage /></ManageLayout>} />
      <Route path="/admin/organizations/:orgId/access"               element={<ManageLayout><OrganizationAccessPage /></ManageLayout>} />
      <Route path="/admin/organizations/:orgId/team"                 element={<ManageLayout><OrganizationTeamPage /></ManageLayout>} />
      <Route path="/admin/organizations/:orgId/projects"             element={<ManageLayout><OrganizationProjectsPage /></ManageLayout>} />

      <Route path="/admin/projects"                                  element={<ManageLayout><ProjectsListPage /></ManageLayout>} />
      <Route path="/admin/projects/:projectId"                       element={<ManageLayout><ProjectOverviewPage /></ManageLayout>} />
      <Route path="/admin/projects/:projectId/general"               element={<ManageLayout><ProjectGeneralPage /></ManageLayout>} />
      <Route path="/admin/projects/:projectId/galleries"             element={<ManageLayout><ProjectGalleriesPage /></ManageLayout>} />
      <Route path="/admin/projects/:projectId/access"                element={<ManageLayout><ProjectAccessPage /></ManageLayout>} />
      <Route path="/admin/projects/:projectId/delivery"              element={<ManageLayout><ProjectDeliveryPage /></ManageLayout>} />

      <Route path="/admin/galleries"                                 element={<ManageLayout><GalleriesListPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId"                      element={<ManageLayout><GalleryOverviewPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/photos"               element={<ManageLayout><GalleryPhotosPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/inbox"                element={<ManageLayout><GalleryInboxPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/jobs"                 element={<ManageLayout><GalleryJobsPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/general"              element={<ManageLayout><GalleryGeneralPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/access"               element={<ManageLayout><GalleryAccessPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/downloads"            element={<ManageLayout><GalleryDownloadsPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/upload"               element={<ManageLayout><GalleryUploadPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/publish"              element={<ManageLayout><GalleryPublishPage /></ManageLayout>} />
      <Route path="/admin/galleries/:galleryId/insights"             element={<ManageLayout><GalleryInsightsPage /></ManageLayout>} />

      {/* ── Platform admin — /admin/platform/* (superadmin only) ── */}
      <Route path="/admin/platform"              element={<PlatformLayout><PlatformOverviewPage /></PlatformLayout>} />
      <Route path="/admin/platform/smtp"         element={<PlatformLayout><SmtpPage /></PlatformLayout>} />
      <Route path="/admin/platform/license"      element={<PlatformLayout><LicensePage /></PlatformLayout>} />
      <Route path="/admin/platform/branding"     element={<PlatformLayout><BrandingPage /></PlatformLayout>} />

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

      <Route path="*"                            element={<Navigate to="/admin" replace />} />
    </Routes>
    </I18nProvider>
  );
}
