const { getClientIp } = require('../utils/network');

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 300;

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.windowStart > WINDOW_MS * 2) buckets.delete(key);
  }
}, WINDOW_MS * 5).unref();

function globalRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();

  let entry = buckets.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { windowStart: now, count: 0 };
    buckets.set(ip, entry);
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Trop de requetes. Reessaie dans 60 secondes.' });
  }

  return next();
}

module.exports = { globalRateLimit };
