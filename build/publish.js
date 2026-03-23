#!/usr/bin/env node
/**
 * SSGG — Gallery publisher
 *
 * Uploads a built gallery (or all galleries) to a remote server via rsync,
 * then shows the live URL and updates DELIVERY.md with it.
 *
 * Configuration: publish.config.json at project root.
 *
 * Usage:
 *   npm run publish <gallery-name>
 *   npm run publish -- --all
 *
 * publish.config.json:
 * {
 *   "remote":     "user@server.com",
 *   "remotePath": "/var/www/html/galleries",
 *   "baseUrl":    "https://galleries.example.com",
 *   "rsyncFlags": "-az --delete"   // optional, default: "-az --delete --progress"
 * }
 */

import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __DIR  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__DIR, '..');
const DIST   = path.join(ROOT, 'dist');
const PUB_CFG_PATH = path.join(ROOT, 'publish.config.json');

const BUILD_ALL  = process.argv.includes('--all');
const GALLERY_ARG = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

const ok   = m => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const fail = m => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);
const info = m => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const log  = m => process.stdout.write(m + '\n');

// ── Load publish config ────────────────────────────────────────────────────────
if (!fs.existsSync(PUB_CFG_PATH)) {
  fail('publish.config.json not found.');
  log('');
  log('  Create publish.config.json at the project root:');
  log('');
  log('  {');
  log('    "remote":     "user@yourserver.com",');
  log('    "remotePath": "/var/www/html/galleries",');
  log('    "baseUrl":    "https://yourdomain.com/galleries"');
  log('  }');
  log('');
  process.exit(1);
}

const pub = JSON.parse(fs.readFileSync(PUB_CFG_PATH, 'utf8'));

if (!pub.remote || !pub.remotePath || !pub.baseUrl) {
  fail('publish.config.json must have: remote, remotePath, baseUrl');
  process.exit(1);
}

const rsyncFlags = pub.rsyncFlags || '-az --delete --progress';

// ── Determine which galleries to publish ──────────────────────────────────────
let targets;

if (BUILD_ALL) {
  targets = fs.readdirSync(DIST)
    .filter(n => fs.statSync(path.join(DIST, n)).isDirectory()
              && n !== 'vendor' && n !== 'fonts' && n !== 'covers');
} else if (GALLERY_ARG) {
  // Accept either srcName or distName
  const distEntries = fs.readdirSync(DIST)
    .filter(n => fs.statSync(path.join(DIST, n)).isDirectory());

  // Try direct match first, then try matching via build-summary.json
  if (distEntries.includes(GALLERY_ARG)) {
    targets = [GALLERY_ARG];
  } else {
    const match = distEntries.find(d => {
      const summaryPath = path.join(DIST, d, 'build-summary.json');
      if (!fs.existsSync(summaryPath)) return false;
      const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      return s.srcName === GALLERY_ARG;
    });
    if (match) targets = [match];
    else {
      fail(`Gallery "${GALLERY_ARG}" not found in dist/.`);
      log(`  Available: ${distEntries.join(', ')}`);
      process.exit(1);
    }
  }
} else {
  // Auto: single gallery or prompt
  const distEntries = fs.readdirSync(DIST)
    .filter(n => fs.statSync(path.join(DIST, n)).isDirectory()
              && n !== 'vendor' && n !== 'fonts' && n !== 'covers');
  if (distEntries.length === 1) {
    targets = distEntries;
  } else {
    fail('Multiple galleries found. Specify one or use --all.');
    log(`  Available: ${distEntries.join(', ')}`);
    process.exit(1);
  }
}

// ── Upload shared assets (fonts/, vendor/, covers/) ──────────────────────────
const SHARED_DIRS = ['fonts', 'vendor', 'covers'];

log('');
log('\x1b[1m🚀  Publishing\x1b[0m');
log(`   Remote : ${pub.remote}:${pub.remotePath}`);
log(`   Base   : ${pub.baseUrl}`);
log('');

// Upload root index.html (galleries landing page) if present
const rootIndex = path.join(DIST, 'index.html');
if (fs.existsSync(rootIndex)) {
  info('Uploading site index (index.html)…');
  try {
    execSync(`rsync ${rsyncFlags.replace('--delete', '')} "${rootIndex}" "${pub.remote}:${pub.remotePath}/index.html"`, { stdio: 'inherit' });
    ok('index.html → uploaded');
  } catch (e) {
    fail(`rsync failed for index.html: ${e.message}`);
    process.exit(1);
  }
  log('');
}

for (const shared of SHARED_DIRS) {
  const localShared  = path.join(DIST, shared);
  const remoteShared = `${pub.remote}:${pub.remotePath}/${shared}/`;
  if (!fs.existsSync(localShared)) continue;
  info(`Syncing shared assets: ${shared}/`);
  try {
    execSync(`rsync ${rsyncFlags} "${localShared}/" "${remoteShared}"`, { stdio: 'inherit' });
    ok(`${shared}/ → uploaded`);
  } catch (e) {
    fail(`rsync failed for ${shared}/: ${e.message}`);
    process.exit(1);
  }
}
log('');

for (const distName of targets) {
  const localPath  = path.join(DIST, distName);
  const remoteDest = `${pub.remote}:${pub.remotePath}/${distName}/`;
  const liveUrl    = `${pub.baseUrl.replace(/\/$/, '')}/${distName}/`;

  log(`\x1b[1m  → ${distName}\x1b[0m`);
  info(`rsync ${localPath}/ ${remoteDest}`);

  // Patch .htaccess with the real absolute path before uploading
  const htaccessPath = path.join(localPath, '.htaccess');
  if (fs.existsSync(htaccessPath)) {
    const htContent = fs.readFileSync(htaccessPath, 'utf8');
    if (htContent.includes('__HTPASSWD_PATH__')) {
      const absHtpasswd = `${pub.remotePath}/${distName}/.htpasswd`;
      const patched = htContent.replace('__HTPASSWD_PATH__', absHtpasswd);
      fs.writeFileSync(htaccessPath, patched, 'utf8');
      ok(`.htaccess patched → AuthUserFile ${absHtpasswd}`);
    }
  }

  try {
    execSync(`rsync ${rsyncFlags} "${localPath}/" "${remoteDest}"`, { stdio: 'inherit' });
    ok(`Uploaded → ${liveUrl}`);
  } catch (e) {
    fail(`rsync failed: ${e.message}`);
    process.exit(1);
  }

  // Update DELIVERY.md with the live URL
  const deliveryPath = path.join(localPath, 'DELIVERY.md');
  if (fs.existsSync(deliveryPath)) {
    let delivery = fs.readFileSync(deliveryPath, 'utf8');
    delivery = delivery.replace(
      '(URL à renseigner — voir npm run publish)',
      liveUrl
    ).replace(
      '(URL to be set — run npm run publish)',
      liveUrl
    );
    // Replace any placeholder URL line
    delivery = delivery.replace(
      /\*\*URL[^:]*:\*\* \(.*\)/,
      `**URL :** ${liveUrl}`
    ).replace(
      /\*\*URL[^:]*:\*\* \(.*\)/,
      `**URL:** ${liveUrl}`
    );
    fs.writeFileSync(deliveryPath, delivery, 'utf8');
    ok(`DELIVERY.md → URL updated`);
  }

  // Also update build-summary.json with the URL
  const summaryPath = path.join(localPath, 'build-summary.json');
  if (fs.existsSync(summaryPath)) {
    const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    s.url = liveUrl;
    s.publishedAt = new Date().toISOString();
    fs.writeFileSync(summaryPath, JSON.stringify(s, null, 2), 'utf8');
  }

  log('');
  log(`  \x1b[32m\x1b[1m✅  Live at: ${liveUrl}\x1b[0m`);
  log('');

  // Print the DELIVERY.md content to terminal for easy copy-paste
  if (fs.existsSync(deliveryPath)) {
    log('  ─────────────────────────────────────────');
    log('  DELIVERY MESSAGE (copy-paste ready):');
    log('  ─────────────────────────────────────────');
    const lines = fs.readFileSync(deliveryPath, 'utf8').split('\n');
    lines.forEach(l => log(`  ${l}`));
    log('  ─────────────────────────────────────────');
  }
}
