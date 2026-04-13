const crypto = require('crypto');

const LEGACY_ITERATIONS = 10000;
const CURRENT_ITERATIONS = 600000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const HASH_PREFIX = 'pbkdf2_sha512';

function pbkdf2Hex(password, salt, iterations) {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString('hex');
}

function hashPassword(password, salt, iterations = CURRENT_ITERATIONS) {
  return pbkdf2Hex(password, salt, iterations);
}

function encodePasswordHash(hash, iterations = CURRENT_ITERATIONS) {
  return `${HASH_PREFIX}$${iterations}$${hash}`;
}

function decodePasswordHash(passwordHash) {
  const value = String(passwordHash || '');
  if (!value.startsWith(`${HASH_PREFIX}$`)) {
    return {
      scheme: 'legacy',
      iterations: LEGACY_ITERATIONS,
      hash: value
    };
  }

  const parts = value.split('$');
  const iterations = Number.parseInt(parts[1], 10);
  return {
    scheme: HASH_PREFIX,
    iterations: Number.isFinite(iterations) ? iterations : CURRENT_ITERATIONS,
    hash: parts[2] || ''
  };
}

function timingSafeHexCompare(left, right) {
  try {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    if (a.length !== b.length || a.length === 0) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch (error) {
    return false;
  }
}

function verifyPassword(password, user) {
  if (!user || !user.salt || !user.passwordHash) {
    return { ok: false, needsRehash: false };
  }

  const decoded = decodePasswordHash(user.passwordHash);
  const computed = pbkdf2Hex(password, user.salt, decoded.iterations);
  const ok = timingSafeHexCompare(computed, decoded.hash);

  return {
    ok,
    needsRehash: ok && (decoded.scheme === 'legacy' || decoded.iterations < CURRENT_ITERATIONS)
  };
}

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt, CURRENT_ITERATIONS);
  return {
    salt,
    passwordHash: encodePasswordHash(hash, CURRENT_ITERATIONS)
  };
}

module.exports = {
  hashPassword,
  makePassword,
  verifyPassword
};
