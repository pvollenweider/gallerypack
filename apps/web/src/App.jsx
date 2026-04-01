// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { I18nProvider, useT } from './lib/I18nContext.jsx';
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
import ProfilePage     from './management/pages/profile/ProfilePage.jsx';
import { PlatformOverviewPage, SmtpPage, LicensePage, BrandingPage, PlatformTeamPage } from './management/pages/platform/index.jsx';
import { OrganizationsListPage, OrganizationProjectsPage } from './management/pages/organizations/index.jsx';
import { ProjectGalleriesPage } from './management/pages/projects/index.jsx';
import { GalleryJobsPage, GalleryPhotosPage } from './management/pages/galleries/index.jsx';

// Lazy-loaded heavy pages (chart.js ~200KB, @uiw/react-md-editor ~150KB)
const GalleryInsightsPage   = lazy(() => import('./management/pages/galleries/GalleryInsightsPage.jsx'));
const GalleryGeneralPage    = lazy(() => import('./management/pages/galleries/GalleryGeneralPage.jsx'));
const OrganizationGeneralPage = lazy(() => import('./management/pages/organizations/OrganizationGeneralPage.jsx'));
const OrganizationTeamPage  = lazy(() => import('./management/pages/organizations/OrganizationTeamPage.jsx'));
const ProjectGeneralPage    = lazy(() => import('./management/pages/projects/ProjectGeneralPage.jsx'));

// Inspector
import InspectorLayout     from './inspector/InspectorLayout.jsx';
import InspectorGallery    from './inspector/InspectorGallery.jsx';
import InspectorPhoto      from './inspector/InspectorPhoto.jsx';
import { InspectorOrganizationList, InspectorOrganizationDetail } from './inspector/InspectorOrganization.jsx';
import { InspectorProjectList, InspectorProjectDetail } from './inspector/InspectorProject.jsx';
import { InspectorUserList, InspectorUserDetail } from './inspector/InspectorUser.jsx';
import InspectorDashboard  from './inspector/InspectorDashboard.jsx';
import InspectorAnomalies  from './inspector/InspectorAnomalies.jsx';

import Login from './pages/Login.jsx';

function LazyFallback() {
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'40vh',color:'#888' }}>
      <i className="fas fa-spinner fa-spin me-2" />Loading...
    </div>
  );
}

function SuspenseRoute({ children }) {
  return <Suspense fallback={<LazyFallback />}>{children}</Suspense>;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const t = useT();
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#888' }}>
      {t('loading')}
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GalleryPhotosRedirect() {
  const { orgId, projectId, galleryId } = useParams();
  return <Navigate to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${galleryId}/photos`} replace />;
}

function OrgSettingsRedirect() {
  const { orgId } = useParams();
  return <Navigate to={`/admin/organizations/${orgId}/settings`} replace />;
}

function ProjectSettingsRedirect() {
  const { orgId, projectId } = useParams();
  return <Navigate to={`/admin/organizations/${orgId}/projects/${projectId}/settings`} replace />;
}

function GallerySettingsRedirect() {
  const { orgId, projectId, galleryId } = useParams();
  return <Navigate to={`/admin/organizations/${orgId}/projects/${projectId}/galleries/${galleryId}/settings`} replace />;
}

function ManageRedirect() {
  const { pathname } = useLocation();
  const rest = pathname.replace(/^\/manage/, '');
  return <Navigate to={`/admin${rest}`} replace />;
}

const W = ManageLayout;

export default function App() {
  return (
    <I18nProvider>
    <Routes>
      <Route path="/login"                       element={<Login />} />

      {/* Backward-compat */}
      <Route path="/manage/*"                    element={<ManageRedirect />} />
      <Route path="/"                            element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/studio"                      element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/dashboard"                   element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/settings"                    element={<Navigate to="/admin/profile" replace />} />
      <Route path="/team"                        element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/admin/projects"              element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/admin/tokens"                element={<Navigate to="/admin/organizations" replace />} />

      {/* Public */}
      <Route path="/invite/:token"               element={<AcceptInvite />} />
      <Route path="/forgot-password"             element={<ForgotPassword />} />
      <Route path="/reset-password/:token"       element={<ResetPassword />} />
      <Route path="/magic-login/:token"          element={<MagicLogin />} />
      <Route path="/upload/:token"               element={<UploadPage />} />

      {/* Global management */}
      <Route path="/admin"                       element={<Navigate to="/admin/organizations" replace />} />
      <Route path="/admin/profile"               element={<W><ProfilePage /></W>} />
      <Route path="/admin/members/:userId"       element={<W><MemberProfile /></W>} />
      <Route path="/admin/jobs/:jobId"           element={<W><BuildStatus /></W>} />

      {/* Organizations list */}
      <Route path="/admin/organizations"         element={<W><OrganizationsListPage /></W>} />

      {/* Org home = project list */}
      <Route path="/admin/organizations/:orgId"                element={<W><OrganizationProjectsPage /></W>} />
      <Route path="/admin/organizations/:orgId/settings"       element={<W><SuspenseRoute><OrganizationGeneralPage /></SuspenseRoute></W>} />
      <Route path="/admin/organizations/:orgId/team"           element={<W><SuspenseRoute><OrganizationTeamPage /></SuspenseRoute></W>} />
      <Route path="/admin/organizations/:orgId/general"        element={<OrgSettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/defaults"       element={<OrgSettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/access"         element={<OrgSettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/overview"       element={<OrgSettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/projects"       element={<Navigate to="/admin/organizations" replace />} />

      {/* Project home = gallery list */}
      <Route path="/admin/organizations/:orgId/projects/:projectId"                element={<W><ProjectGalleriesPage /></W>} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/settings"       element={<W><SuspenseRoute><ProjectGeneralPage /></SuspenseRoute></W>} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/general"        element={<ProjectSettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/access"         element={<ProjectSettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/delivery"       element={<ProjectSettingsRedirect />} />

      {/* Gallery sub-pages */}
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId"             element={<GalleryPhotosRedirect />} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/photos"      element={<W><GalleryPhotosPage /></W>} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/settings"    element={<W><SuspenseRoute><GalleryGeneralPage /></SuspenseRoute></W>} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/jobs"        element={<W><GalleryJobsPage /></W>} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/statistics"  element={<W><SuspenseRoute><GalleryInsightsPage /></SuspenseRoute></W>} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/publish"     element={<GalleryPhotosRedirect />} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/general"     element={<GallerySettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/access"      element={<GallerySettingsRedirect />} />
      <Route path="/admin/organizations/:orgId/projects/:projectId/galleries/:galleryId/downloads"       element={<GallerySettingsRedirect />} />

      {/* Platform (superadmin only) */}
      <Route path="/admin/platform"              element={<Navigate to="/admin/platform/branding" replace />} />
      <Route path="/admin/platform/branding"     element={<PlatformLayout><BrandingPage /></PlatformLayout>} />
      <Route path="/admin/platform/license"      element={<PlatformLayout><LicensePage /></PlatformLayout>} />
      <Route path="/admin/platform/smtp"         element={<PlatformLayout><SmtpPage /></PlatformLayout>} />
      <Route path="/admin/platform/team"         element={<PlatformLayout><PlatformTeamPage /></PlatformLayout>} />

      {/* Inspector (superadmin only) */}
      <Route path="/inspector" element={<RequireAuth><InspectorLayout /></RequireAuth>}>
        <Route index                             element={<Navigate to="/inspector/organizations" replace />} />
        <Route path="organizations"              element={<InspectorOrganizationList />} />
        <Route path="organizations/:id"          element={<InspectorOrganizationDetail />} />
        {/* Backward-compat redirects */}
        <Route path="studios"                    element={<Navigate to="/inspector/organizations" replace />} />
        <Route path="studios/:id"                element={<Navigate to="/inspector/organizations" replace />} />
        <Route path="projects"                   element={<InspectorProjectList />} />
        <Route path="projects/:id"               element={<InspectorProjectDetail />} />
        <Route path="galleries"                  element={<Navigate to="/inspector/organizations" replace />} />
        <Route path="galleries/:id"              element={<InspectorGallery />} />
        <Route path="photos/:id"                 element={<InspectorPhoto />} />
        <Route path="users"                      element={<InspectorUserList />} />
        <Route path="users/:id"                  element={<InspectorUserDetail />} />
        <Route path="anomalies"                  element={<InspectorAnomalies />} />
        <Route path="dashboard"                  element={<InspectorDashboard />} />
      </Route>

      <Route path="*"                            element={<Navigate to="/admin/organizations" replace />} />
    </Routes>
    </I18nProvider>
  );
}
