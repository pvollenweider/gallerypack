#!/usr/bin/env node
// scripts/check-headers.js — verify all source files have a license header
// Used in CI. Exits with code 1 if any file is missing a copyright notice.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

function walk(dir, exts, ignore = []) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (ignore.some(i => full.includes(i))) continue;
    if (entry.isDirectory()) results.push(...walk(full, exts, ignore));
    else if (exts.includes(extname(entry.name))) results.push(full);
  }
  return results;
}

function globSync(pattern, { cwd, ignore = [] }) {
  const base = pattern.split('/**')[0];
  const braceMatch = pattern.match(/\{([^}]+)\}/);
  const exts = braceMatch
    ? braceMatch[1].split(',').map(e => '.' + e.trim())
    : [pattern.slice(pattern.lastIndexOf('.'))];
  const absBase = join(cwd, base);
  try { statSync(absBase); } catch { return []; }
  return walk(absBase, exts, ignore).map(f => relative(cwd, f));
}

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const patterns = [
  'packages/**/*.{js,jsx}',
  'apps/**/*.{js,jsx}',
  'workers/**/*.{js,jsx}',
  'apps/api/src/db/migrations/**/*.sql',
];

const missing = [];

for (const pattern of patterns) {
  const files = globSync(pattern, { cwd: ROOT, ignore: ['**/node_modules/**', '**/*.test.*', '**/*.min.*'] });
  for (const relPath of files) {
    const content = readFileSync(join(ROOT, relPath), 'utf8');
    if (!content.slice(0, 300).includes('Copyright')) {
      missing.push(relPath);
    }
  }
}

if (missing.length > 0) {
  console.error(`\n✗ ${missing.length} file(s) missing a license header:\n`);
  for (const f of missing) console.error(`  ${f}`);
  console.error('\nRun: node scripts/add-headers.js\n');
  process.exit(1);
} else {
  console.log(`✓ All source files have a license header.`);
}
