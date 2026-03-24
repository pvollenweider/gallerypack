#!/usr/bin/env node
/**
 * GalleryPack — build/export.js
 *
 * Builds all galleries and prepares dist/ for Apache deployment:
 *   1. Runs the full build (all galleries + site index)
 *   2. Patches every .htaccess — replaces __HTPASSWD_PATH__ with the real
 *      absolute path on the target Apache server
 *   3. Optionally creates a dist.zip for FTP / cPanel upload
 *
 * Apache path resolution order:
 *   1. --apache-path=<path>  CLI argument
 *   2. GALLERY_APACHE_PATH   env variable
 *   3. remotePath field in   publish.config.json
 *   4. Interactive prompt
 *
 * Usage:
 *   npm run export
 *   npm run export -- --apache-path=/var/www/html/galleries
 *   npm run export -- --apache-path=/var/www/html/galleries --zip
 *   npm run export -- --no-build          (skip rebuild, just patch + zip)
 */

import fs          from 'fs';
import path        from 'path';
import readline    from 'readline';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath }       from 'url';
import { createGzip }          from 'zlib';
import { pipeline }            from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__DIR, '..');
const DIST  = path.join(ROOT, 'dist');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const NO_BUILD   = args.includes('--no-build');
const MAKE_ZIP   = args.includes('--zip');
const apacheArg  = (args.find(a => a.startsWith('--apache-path=')) || '').split('=').slice(1).join('=');

// ── Helpers ───────────────────────────────────────────────────────────────────
const ok   = m => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);
const fail = m => process.stdout.write(`  \x1b[31m✗\x1b[0m  ${m}\n`);
const info = m => process.stdout.write(`  \x1b[36m→\x1b[0m  ${m}\n`);
const log  = m => process.stdout.write(m + '\n');
const hr   = () => log('  ' + '─'.repeat(56));

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

// ── Resolve Apache deployment path ────────────────────────────────────────────
async function resolveApachePath() {
  // 1. CLI arg
  if (apacheArg) return apacheArg.replace(/\/$/, '');

  // 2. Env var
  if (process.env.GALLERY_APACHE_PATH) return process.env.GALLERY_APACHE_PATH.replace(/\/$/, '');

  // 3. publish.config.json
  const pubCfgPath = path.join(ROOT, 'publish.config.json');
  if (fs.existsSync(pubCfgPath)) {
    try {
      const pub = JSON.parse(fs.readFileSync(pubCfgPath, 'utf8'));
      if (pub.remotePath) return pub.remotePath.replace(/\/$/, '');
    } catch (_) {}
  }

  // 4. Interactive
  log('');
  log('  \x1b[33m⚠\x1b[0m  No Apache document root configured.');
  log('     Password-protected galleries will have a placeholder in .htaccess.');
  log('');
  const ans = await ask('  Apache document root (leave empty to skip): ');
  return ans.replace(/\/$/, '');
}

// ── Patch .htaccess files in dist/ ───────────────────────────────────────────
function patchHtaccess(apachePath) {
  if (!fs.existsSync(DIST)) return 0;

  let patched = 0;
  const entries = fs.readdirSync(DIST).filter(e => {
    const p = path.join(DIST, e);
    return fs.statSync(p).isDirectory() && e !== 'vendor' && e !== 'fonts' && e !== 'covers';
  });

  for (const entry of entries) {
    const htPath = path.join(DIST, entry, '.htaccess');
    if (!fs.existsSync(htPath)) continue;
    const content = fs.readFileSync(htPath, 'utf8');
    if (!content.includes('__HTPASSWD_PATH__')) continue;

    if (!apachePath) {
      info(`.htaccess in ${entry}/ left with placeholder (no apache path set)`);
      continue;
    }

    const absPath = `${apachePath}/${entry}/.htpasswd`;
    fs.writeFileSync(htPath, content.replace('__HTPASSWD_PATH__', absPath), 'utf8');
    ok(`.htaccess [${entry}] → AuthUserFile ${absPath}`);
    patched++;
  }

  return patched;
}

// ── Create zip of dist/ ───────────────────────────────────────────────────────
async function createZip() {
  const zipPath = path.join(ROOT, 'dist-export.zip');
  info(`Creating ${zipPath} …`);
  try {
    // Use system zip if available (fastest), else warn
    execSync(`cd "${ROOT}" && zip -rq dist-export.zip dist/`, { stdio: 'pipe' });
    const stat = fs.statSync(zipPath);
    ok(`dist-export.zip created (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    return zipPath;
  } catch (e) {
    fail(`zip command failed: ${e.message}`);
    fail('Install zip: brew install zip  (macOS) or apt install zip  (Linux)');
    return null;
  }
}

// ── Print deployment instructions ─────────────────────────────────────────────
function printInstructions(apachePath, zipPath) {
  hr();
  log('');
  log('  \x1b[1m\x1b[32m✅  Export complete — deployment instructions\x1b[0m');
  log('');

  log('  \x1b[1m1. Copy dist/ to your Apache server\x1b[0m');
  if (zipPath) {
    log(`     FTP/cPanel: upload \x1b[36mdist-export.zip\x1b[0m and extract to the web root`);
    log(`     rsync:  rsync -az dist/ user@server:${apachePath || '/var/www/html/galleries'}/`);
  } else {
    log(`     rsync:  rsync -az dist/ user@server:${apachePath || '/var/www/html/galleries'}/`);
    log(`     FTP:    upload the contents of dist/ to your web root`);
  }

  log('');
  log('  \x1b[1m2. Apache configuration (once)\x1b[0m');
  log('     Ensure .htaccess overrides are enabled in your Apache config:');
  log('');
  log('     <Directory "/var/www/html/galleries">');
  log('       AllowOverride AuthConfig');
  log('     </Directory>');

  if (!apachePath) {
    log('');
    log('  \x1b[1m\x1b[33m3. Fix .htaccess manually\x1b[0m');
    log('     Password-protected galleries have __HTPASSWD_PATH__ in their .htaccess.');
    log('     Replace it with the absolute path on the server, e.g.:');
    log('       AuthUserFile /var/www/html/galleries/my-gallery/.htpasswd');
  }

  log('');
  hr();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('');
  log('  \x1b[1m📦  GalleryPack export\x1b[0m');
  hr();

  // 1. Build
  if (!NO_BUILD) {
    log('');
    log('  \x1b[1m🔨  Building all galleries…\x1b[0m');
    log('');
    const result = spawnSync('node', ['build/index.js', '--all'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    if (result.status !== 0) {
      fail('Build failed — aborting export.');
      process.exit(1);
    }
  } else {
    info('Skipping build (--no-build)');
  }

  // 2. Resolve apache path
  const apachePath = await resolveApachePath();

  // 3. Patch .htaccess
  log('');
  log('  \x1b[1m🔧  Patching .htaccess files…\x1b[0m');
  const n = patchHtaccess(apachePath);
  if (n === 0) info('No .htaccess files needed patching');

  // 4. Optional zip
  let zipPath = null;
  if (MAKE_ZIP) {
    log('');
    log('  \x1b[1m🗜   Creating archive…\x1b[0m');
    zipPath = await createZip();
  }

  // 5. Instructions
  printInstructions(apachePath, zipPath);
}

main().catch(e => { fail(e.message); process.exit(1); });
