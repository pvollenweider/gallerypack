import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Login        from './pages/Login.jsx';
import Dashboard    from './pages/Dashboard.jsx';
import GalleryDetail from './pages/GalleryDetail.jsx';
import BuildStatus  from './pages/BuildStatus.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.center}>Loading…</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <RequireAuth><Dashboard /></RequireAuth>
      } />
      <Route path="/galleries/:id" element={
        <RequireAuth><GalleryDetail /></RequireAuth>
      } />
      <Route path="/jobs/:jobId" element={
        <RequireAuth><BuildStatus /></RequireAuth>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const styles = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' },
};
