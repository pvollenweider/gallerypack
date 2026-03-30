// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    // Upload source maps to Sentry at build time only if auth token is provided
    ...(process.env.SENTRY_AUTH_TOKEN ? [sentryVitePlugin({
      org:     process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT || 'gallerypack-web',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    })] : []),
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward all /api requests to the API server during development
      '/api':    { target: 'http://localhost:4000', changeOrigin: true },
      '/upload': { target: 'http://localhost:4000', changeOrigin: true },
      // tus resumable upload endpoint
      '/api/tus': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Assets are served under /admin/ in production (Dockerfile serves from /admin)
    // VITE_BASE env var allows overriding for local dev (leave empty = /)
  },
  base: process.env.VITE_BASE ?? '/admin/',
});
