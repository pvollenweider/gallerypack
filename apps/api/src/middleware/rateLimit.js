// apps/api/src/middleware/rateLimit.js — simple in-memory sliding-window rate limiter
// Lightweight replacement for express-rate-limit (no extra dependency).

const windows = new Map(); // key → [timestamps]

/**
 * Creates a rate-limit middleware.
 * @param {{ windowMs?: number, max?: number, keyFn?: (req) => string }} options
 */
export function rateLimit({ windowMs = 60_000, max = 100, keyFn } = {}) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : (req.ip || 'unknown');
    const now = Date.now();
    const cutoff = now - windowMs;

    let hits = (windows.get(key) || []).filter(t => t > cutoff);
    hits.push(now);
    windows.set(key, hits);

    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - hits.length));

    if (hits.length > max) {
      return res.status(429).json({ error: 'Too many requests, please slow down.' });
    }
    next();
  };
}

// Periodically clean up stale entries to avoid memory leak
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, hits] of windows) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) windows.delete(key);
    else windows.set(key, fresh);
  }
}, 60_000).unref();
