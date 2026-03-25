// apps/api/src/db/database.js — MySQL/MariaDB connection pool (mysql2/promise)
import mysql from 'mysql2/promise';

// Pool is lazily created on first call to getPool().
let _pool = null;

/**
 * Return the shared connection pool.
 * All DB helper functions use this — never create pools outside this module.
 */
export function getPool() {
  if (!_pool) {
    _pool = mysql.createPool({
      host:               process.env.DB_HOST     || '127.0.0.1',
      port:     Number(   process.env.DB_PORT)    || 3306,
      database:           process.env.DB_NAME     || 'gallerypack',
      user:               process.env.DB_USER     || 'gallerypack',
      password:           process.env.DB_PASS     || '',
      // Keep enough connections for the API + worker sharing the same DB
      connectionLimit:    Number(process.env.DB_POOL_SIZE) || 10,
      // Return JS Date objects as-is; we store timestamps as BIGINT (Unix ms)
      // so we decode manually — no date parsing needed.
      dateStrings:        false,
      // Automatically re-establish dropped connections
      enableKeepAlive:    true,
      keepAliveInitialDelay: 10000,
      // Reject unauthorized SSL connections in production
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  }
  return _pool;
}

/**
 * Convenience wrapper — run a single parameterised query and return the
 * raw mysql2 result tuple [rows, fields].
 *
 * @param {string}   sql
 * @param {any[]}   [params=[]]
 * @returns {Promise<[any[], import('mysql2').FieldPacket[]]>}
 */
export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

/**
 * Execute `fn(connection)` inside an explicit transaction.
 * Rolls back automatically on any exception and re-throws.
 *
 * @template T
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Drain and destroy the pool — useful for graceful shutdown and tests.
 */
export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
