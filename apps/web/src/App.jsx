import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { I18nProvider } from './lib/I18nContext.jsx';
import Login        from './pages/Login.jsx';
import Dashboard    from './pages/Dashboard.jsx';
import GalleryDetail from './pages/GalleryDetail.jsx';
import BuildStatus  from './pages/BuildStatus.jsx';
import Settings     from './pages/Settings.jsx';
import Team         from './pages/Team.jsx';
import MemberProfile from './pages/MemberProfile.jsx';
import AcceptInvite    from './pages/AcceptInvite.jsx';
import ForgotPassword  from './pages/ForgotPassword.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';
import MagicLogin      from './pages/MagicLogin.jsx';
import { Footer }   from './components/Footer.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.center}>Loading…</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

// Wrap authenticated pages in a layout that includes the sticky footer
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

export default function App() {
  return (
    <I18nProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AuthLayout><Dashboard /></AuthLayout>} />
      <Route path="/galleries/:id" element={<AuthLayout><GalleryDetail /></AuthLayout>} />
      <Route path="/jobs/:jobId"   element={<AuthLayout><BuildStatus /></AuthLayout>} />
      <Route path="/settings"      element={<AuthLayout><Settings /></AuthLayout>} />
      <Route path="/team"          element={<AuthLayout><Team /></AuthLayout>} />
      <Route path="/team/:userId"  element={<AuthLayout><MemberProfile /></AuthLayout>} />
      <Route path="/invite/:token"           element={<AcceptInvite />} />
      <Route path="/forgot-password"          element={<ForgotPassword />} />
      <Route path="/reset-password/:token"    element={<ResetPassword />} />
      <Route path="/magic-login/:token"       element={<MagicLogin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </I18nProvider>
  );
}

const styles = {
  center:  { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' },
  layout:  { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  content: { flex: 1 },
};
