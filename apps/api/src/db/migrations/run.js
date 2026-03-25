// apps/api/src/db/migrations/run.js — MariaDB migration runner
import { getPool, closePool } from '../database.js';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __DIR       = path.dirname(fileURLToPath(import.meta.url));
// MariaDB migrations live in the mariadb/ subdirectory.
// The root migrations/ directory contains legacy SQLite .sql files.
const MARIADB_DIR = path.join(__DIR, 'mariadb');

export async function runMigrations() {
  const pool = getPool();

  // Track applied migrations in a meta table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         VARCHAR(128) PRIMARY KEY,
      applied_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [rows] = await pool.query('SELECT id FROM _migrations');
  const applied = new Set(rows.map(r => r.id));

  // Collect .sql files from mariadb/ subdirectory, sorted by name (001_, 002_, …)
  const files = fs.readdirSync(MARIADB_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MARIADB_DIR, file), 'utf8');

    // Split on statement boundaries so we can execute each statement separately.
    // mysql2 does not support multi-statement strings in pool.query() by default.
    // Strip full-line comments first so section headers don't get bundled with the
    // next CREATE statement and cause the whole block to be filtered out.
    const stripped = sql
      .split('\n')
      .filter(line => !line.trimStart().startsWith('--'))
      .join('\n');
    const statements = stripped
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await pool.query(stmt);
    }

    await pool.query(
      'INSERT INTO _migrations (id, applied_at) VALUES (?, ?)',
      [file, Date.now()]
    );
    console.log(`  ✓  migration applied: ${file}`);
  }
}

// Allow direct execution: node apps/api/src/db/migrations/run.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete.');
      return closePool();
    })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
