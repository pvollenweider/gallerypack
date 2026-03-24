import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';

// In production the app is mounted at /admin — Vite sets import.meta.env.BASE_URL
// React Router needs the same basename so links resolve correctly.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
