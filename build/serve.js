#!/usr/bin/env node
/**
 * SSGG — Development static file server
 * Serves the dist/ directory over HTTP so that fetch() and other browser APIs
 * work correctly (they are blocked when opening HTML via the file:// protocol).
 *
 * Usage:
 *   npm run serve              — serves dist/ on http://localhost:3000
 *   npm run serve -- 8080      — custom port
 *
 * @author  Philippe Vollenweider
 * @license MIT
 */

import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __DIR  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__DIR, '..');
const DIST   = path.join(ROOT, 'dist');
const PORT   = parseInt(process.argv[2] || process.env.PORT || '3000', 10);

// MIME types for common static asset extensions.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg' : 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png' : 'image/png',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.md'  : 'text/plain; charset=utf-8',
  '.txt' : 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Decode URL and strip query string.
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Redirect bare gallery folders to their index.html.
  let filePath = path.join(DIST, urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // Security: prevent directory traversal outside dist/.
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  \x1b[32m✓\x1b[0m  GalleryPack dev server running`);
  console.log(`     http://localhost:${PORT}/\n`);

  // List available galleries.
  if (fs.existsSync(DIST)) {
    const galleries = fs.readdirSync(DIST)
      .filter(n => fs.statSync(path.join(DIST, n)).isDirectory() && n !== 'vendor' && n !== 'fonts');
    if (galleries.length) {
      galleries.forEach(g => console.log(`     http://localhost:${PORT}/${g}/`));
      console.log('');
    }
  }

  console.log('  Press Ctrl+C to stop.\n');
});
