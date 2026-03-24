// apps/api/src/db/database.js — SQLite connection singleton
import Database from 'better-sqlite3';
import path     from 'path';
import fs       from 'fs';
import { fileURLToPath } from 'url';

const __DIR = path.dirname(fileURLToPath(import.meta.url));

// DB file location: DATA_DIR env var (for Docker volumes) or apps/api/data/ locally
const DATA_DIR = process.env.DATA_DIR || path.join(__DIR, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'gallerypack.db');

let _db = null;

export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}
