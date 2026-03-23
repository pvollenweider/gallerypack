#!/usr/bin/env node
/**
 * SSGG — Gallery scaffold generator
 *
 * Creates the directory structure and a pre-filled gallery.config.json for a
 * new gallery under src/.
 *
 * Two modes:
 *   Quick   — pass the gallery slug as an argument; a minimal config is written.
 *   Wizard  — interactive prompts for every config field (--wizard flag).
 *
 * Usage:
 *   npm run new-gallery my-project
 *   npm run new-gallery:wizard
 *   npm run new-gallery my-project --wizard
 *
 * @author  Philippe Vollenweider
 * @license MIT
 */

import fs       from 'fs';
import path     from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __DIR  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__DIR, '..');
const SRC    = path.join(ROOT, 'src');

const WIZARD = process.argv.includes('--wizard');
// First positional argument that is not a flag.
const NAME_ARG = process.argv.slice(2).find(a => !a.startsWith('--')) || null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Slugify a string: lowercase, ASCII, hyphens. */
function slugify(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Return today's date as YYYY-MM-DD. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Print a styled log line. */
const ok   = msg => console.log(`  \x1b[32m✓\x1b[0m  ${msg}`);
const info = msg => console.log(`  \x1b[36m→\x1b[0m  ${msg}`);
const hint = msg => console.log(`     \x1b[2m${msg}\x1b[0m`);

// ── Readline prompt helpers ───────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

/** Ask a question; return the trimmed answer (or defaultValue if empty). */
function ask(rl, question, defaultValue = '') {
  const label = defaultValue ? `${question} \x1b[2m[${defaultValue}]\x1b[0m: ` : `${question}: `;
  return new Promise(resolve => {
    rl.question(label, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

/** Ask a yes/no question; returns a boolean. */
async function askBool(rl, question, defaultValue = false) {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  const raw = await ask(rl, `${question} (${hint})`, defaultValue ? 'y' : 'n');
  return raw.toLowerCase().startsWith('y');
}

// ── Config builder ────────────────────────────────────────────────────────────

/**
 * Build a gallery.config.json object from the provided values.
 * Optional fields are included only when non-empty so the file stays clean.
 */
function buildConfig(fields) {
  const project = {};
  // Required
  if (fields.name)   project.name   = fields.name;
  project.title  = fields.title  || 'My Gallery';
  project.author = fields.author || 'Unknown';
  // Optional — only written when provided
  if (fields.subtitle)    project.subtitle    = fields.subtitle;
  if (fields.authorEmail) project.authorEmail = fields.authorEmail;
  if (fields.date)        project.date        = fields.date;
  if (fields.location)    project.location    = fields.location;
  if (fields.description) project.description = fields.description;
  if (fields.locale && fields.locale !== 'en') project.locale = fields.locale;
  // Booleans — only written when non-default
  if (fields.private)    project.private    = true;
  if (fields.standalone) project.standalone = true;
  if (fields.access && fields.access !== 'public') project.access = fields.access;
  if (fields.password) project.password = fields.password;
  // Download permissions — only written when explicitly disabled (default is true)
  if (fields.allowDownloadImage   === false) project.allowDownloadImage   = false;
  if (fields.allowDownloadGallery === false) project.allowDownloadGallery = false;
  // Autoplay group — always written with default interval so the file is self-documenting.
  project.autoplay = { slideshowInterval: fields.slideshowInterval || 3 };

  return { project };
}

// ── Scaffold writer ───────────────────────────────────────────────────────────

/**
 * Create src/<slug>/photos/ and write gallery.config.json.
 * Aborts if the folder already exists.
 */
function scaffold(slug, config) {
  const galDir    = path.join(SRC, slug);
  const photosDir = path.join(galDir, 'photos');
  const cfgPath   = path.join(galDir, 'gallery.config.json');

  if (fs.existsSync(galDir)) {
    console.error(`\n  \x1b[31m✗\x1b[0m  src/${slug}/ already exists. Aborting.\n`);
    process.exit(1);
  }

  fs.mkdirSync(photosDir, { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  console.log('');
  ok(`src/${slug}/photos/         (empty — drop your photos here)`);
  ok(`src/${slug}/gallery.config.json`);
  console.log('');
  info('Next steps:');
  hint(`1. Edit  src/${slug}/gallery.config.json  with your project details`);
  hint(`2. Drop your photos into  src/${slug}/photos/`);
  hint(`3. Run   npm run build ${slug}`);
  hint(`4. Preview with   npm run serve`);
  console.log('');
}

// ── Wizard mode ───────────────────────────────────────────────────────────────

async function runWizard(presetSlug) {
  const rl = createRl();
  console.log('\n\x1b[1m  GalleryPack — New gallery wizard\x1b[0m');
  console.log('  Press Enter to accept the default shown in brackets.\n');

  const title  = await ask(rl, '  Gallery title', 'My Gallery');
  const author = await ask(rl, '  Photographer name', '');
  const email  = await ask(rl, '  Contact email (optional)', '');
  const date   = await ask(rl, '  Shoot date (YYYY-MM-DD)', today());
  const loc    = await ask(rl, '  Location (optional)', '');
  const desc   = await ask(rl, '  Description (optional)', '');

  // Derive default slug from title
  const defaultSlug = presetSlug || (slugify(title) || 'my-gallery');
  const rawSlug     = await ask(rl, '  Folder name (URL slug)', defaultSlug);
  const slug        = slugify(rawSlug) || defaultSlug;

  console.log('');
  const localeChoices = 'en / fr / de / it / es / pt';
  const locale = await ask(rl, `  UI language (${localeChoices})`, 'en');

  const isPrivate            = await askBool(rl, '  Private gallery (hashed URL, hidden from index)?', false);
  const isStandalone         = await askBool(rl, '  Standalone mode (self-contained folder)?', false);
  const allowDownloadImage   = await askBool(rl, '  Allow individual photo download?', true);
  const allowDownloadGallery = await askBool(rl, '  Allow full gallery ZIP download?', true);

  const accessMode = await ask(rl, '  Access mode (public / password)', 'public');
  let accessPassword = '';
  if (accessMode === 'password') {
    accessPassword = await ask(rl, '  Password (leave empty to auto-generate)', '');
  }

  rl.close();

  const config = buildConfig({
    name: slug, title, author, authorEmail: email,
    date, location: loc, description: desc,
    locale, private: isPrivate, standalone: isStandalone,
    allowDownloadImage, allowDownloadGallery,
    access: accessMode !== 'public' ? accessMode : undefined,
    password: accessPassword || undefined,
  });

  scaffold(slug, config);
}

// ── Quick mode ────────────────────────────────────────────────────────────────

function runQuick(slug) {
  if (!slug) {
    console.error('\n  \x1b[31m✗\x1b[0m  Usage: npm run new-gallery <gallery-slug>');
    console.error('         npm run new-gallery:wizard\n');
    process.exit(1);
  }

  const clean = slugify(slug);
  if (!clean) {
    console.error(`\n  \x1b[31m✗\x1b[0m  "${slug}" is not a valid slug (use letters, numbers, hyphens).\n`);
    process.exit(1);
  }

  const config = buildConfig({
    name:  clean,
    title: 'My Gallery',
    author: 'Photographer Name',
    date:  today(),
  });

  console.log(`\n\x1b[1m  GalleryPack — Creating gallery: ${clean}\x1b[0m`);
  scaffold(clean, config);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (WIZARD) {
  await runWizard(NAME_ARG ? slugify(NAME_ARG) : null);
} else {
  runQuick(NAME_ARG);
}
