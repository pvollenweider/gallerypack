// apps/api/src/db/migrations/run.js — migration runner
import { getDb } from '../database.js';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __DIR = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations() {
  const db = getDb();

  // Track applied migrations in a meta table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM _migrations').all().map(r => r.id)
  );

  // Collect .sql files, sorted by name (001_, 002_, …)
  const files = fs.readdirSync(__DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(__DIR, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)').run(file, Date.now());
    console.log(`  ✓  migration applied: ${file}`);
  }
}

// Allow direct execution: node apps/api/src/db/migrations/run.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
  console.log('Migrations complete.');
  process.exit(0);
}
