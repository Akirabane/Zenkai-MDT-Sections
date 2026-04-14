const attempts = new Map();

// Lazy DB reference — resolves to null in test contexts where the DB isn't bootstrapped
let _db = null;
function getDb() {
  if (_db) return _db;
  try {
    _db = require('../db');
  } catch (_) {}
  return _db;
}

function nowMs() {
  return Date.now();
}

function normalizeKeyPart(value) {
  return String(value || '').trim().toLowerCase() || 'unknown';
}

function buildLoginRateLimitKey(ipAddress, pseudo) {
  return `${normalizeKeyPart(ipAddress)}::${normalizeKeyPart(pseudo)}`;
}

function loadFromDb(key) {
  const db = getDb();
  if (!db) return null;
  try {
    return db.prepare('SELECT * FROM login_rate_limits WHERE key = ?').get(key) || null;
  } catch (_) {
    return null;
  }
}

function persistToDb(key, entry) {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO login_rate_limits (key, attempts, first_attempt_at, last_attempt_at, locked_until)
      VALUES (@key, @attempts, @first_attempt_at, @last_attempt_at, @locked_until)
      ON CONFLICT(key) DO UPDATE SET
        attempts = excluded.attempts,
        first_attempt_at = excluded.first_attempt_at,
        last_attempt_at = excluded.last_attempt_at,
        locked_until = excluded.locked_until
    `).run({
      key,
      attempts: entry.attempts,
      first_attempt_at: entry.firstAttemptAt,
      last_attempt_at: entry.lastAttemptAt,
      locked_until: entry.lockedUntil || 0
    });
  } catch (_) {}
}

function deleteFromDb(key) {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare('DELETE FROM login_rate_limits WHERE key = ?').run(key);
  } catch (_) {}
}

function cleanupExpiredAttempts(config, currentTime = nowMs()) {
  const windowMs = Math.max(1, Number(config.windowMs) || 0);
  const lockMs = Math.max(1, Number(config.lockMs) || 0);
  const retentionMs = Math.max(windowMs, lockMs) * 2;

  for (const [key, entry] of attempts.entries()) {
    if (!entry) {
      attempts.delete(key);
      continue;
    }

    const lastSeenAt = Math.max(entry.lastAttemptAt || 0, entry.lockedUntil || 0);
    if (currentTime - lastSeenAt > retentionMs) {
      attempts.delete(key);
    }
  }

  const db = getDb();
  if (db) {
    try {
      db.prepare('DELETE FROM login_rate_limits WHERE MAX(last_attempt_at, locked_until) < ?').run(currentTime - retentionMs);
    } catch (_) {}
  }
}

function getEntryForKey(key, config, currentTime) {
  let entry = attempts.get(key);
  if (!entry) {
    const row = loadFromDb(key);
    if (row) {
      entry = {
        attempts: row.attempts,
        firstAttemptAt: row.first_attempt_at,
        lastAttemptAt: row.last_attempt_at,
        lockedUntil: row.locked_until
      };
      attempts.set(key, entry);
    }
  }
  return entry || null;
}

function buildStateFromEntry(key, entry, config, currentTime) {
  if (entry.lockedUntil && entry.lockedUntil > currentTime) {
    return {
      key,
      attempts: entry.attempts,
      remainingAttempts: 0,
      isLocked: true,
      retryAfterMs: entry.lockedUntil - currentTime
    };
  }

  if (currentTime - entry.firstAttemptAt >= config.windowMs) {
    attempts.delete(key);
    deleteFromDb(key);
    return {
      key,
      attempts: 0,
      remainingAttempts: Math.max(0, Number(config.maxAttempts) || 0),
      isLocked: false,
      retryAfterMs: 0
    };
  }

  return {
    key,
    attempts: entry.attempts,
    remainingAttempts: Math.max(0, config.maxAttempts - entry.attempts),
    isLocked: false,
    retryAfterMs: 0
  };
}

function getState(key, config, currentTime = nowMs()) {
  cleanupExpiredAttempts(config, currentTime);

  const entry = getEntryForKey(key, config, currentTime);
  if (!entry) {
    return {
      key,
      attempts: 0,
      remainingAttempts: Math.max(0, Number(config.maxAttempts) || 0),
      isLocked: false,
      retryAfterMs: 0
    };
  }

  return buildStateFromEntry(key, entry, config, currentTime);
}

function registerFailure(key, config, currentTime = nowMs()) {
  cleanupExpiredAttempts(config, currentTime);

  const windowMs = Math.max(1, Number(config.windowMs) || 0);
  const lockMs = Math.max(1, Number(config.lockMs) || 0);
  const maxAttempts = Math.max(1, Number(config.maxAttempts) || 1);

  const existing = getEntryForKey(key, config, currentTime);
  let entry = existing;
  if (!entry || currentTime - entry.firstAttemptAt >= windowMs) {
    entry = {
      attempts: 0,
      firstAttemptAt: currentTime,
      lastAttemptAt: currentTime,
      lockedUntil: 0
    };
  }

  entry.attempts += 1;
  entry.lastAttemptAt = currentTime;

  if (entry.attempts >= maxAttempts) {
    entry.lockedUntil = currentTime + lockMs;
  }

  attempts.set(key, entry);
  persistToDb(key, entry);

  return {
    key,
    attempts: entry.attempts,
    remainingAttempts: Math.max(0, maxAttempts - entry.attempts),
    isLocked: entry.lockedUntil > currentTime,
    retryAfterMs: entry.lockedUntil > currentTime ? entry.lockedUntil - currentTime : 0
  };
}

function resetAttempts(key) {
  attempts.delete(key);
  deleteFromDb(key);
}

function escapeLikeWildcards(value) {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function resetAttemptsForPseudo(pseudo) {
  const suffix = '::' + normalizeKeyPart(pseudo);
  for (const key of attempts.keys()) {
    if (key.endsWith(suffix)) attempts.delete(key);
  }
  const db = getDb();
  if (db) {
    try {
      db.prepare("DELETE FROM login_rate_limits WHERE key LIKE '%' || ? ESCAPE '\\'").run(escapeLikeWildcards(suffix));
    } catch (_) {}
  }
}

function resetAllAttempts() {
  attempts.clear();
  const db = getDb();
  if (db) {
    try {
      db.prepare('DELETE FROM login_rate_limits').run();
    } catch (_) {}
  }
}

module.exports = {
  buildLoginRateLimitKey,
  cleanupExpiredAttempts,
  getState,
  registerFailure,
  resetAttempts,
  resetAttemptsForPseudo,
  resetAllAttempts
};
