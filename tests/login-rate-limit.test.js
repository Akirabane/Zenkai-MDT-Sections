const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLoginRateLimitKey,
  cleanupExpiredAttempts,
  getState,
  registerFailure,
  resetAttempts
} = require('../src/core/services/login-rate-limit');

const config = {
  maxAttempts: 3,
  windowMs: 60_000,
  lockMs: 120_000
};

test('locks a login key after too many failures and resets after cleanup', () => {
  const start = 1_000;
  const key = buildLoginRateLimitKey('127.0.0.1', 'Akirabane');

  resetAttempts(key);
  assert.equal(getState(key, config, start).isLocked, false);

  registerFailure(key, config, start);
  registerFailure(key, config, start + 1_000);
  const locked = registerFailure(key, config, start + 2_000);

  assert.equal(locked.isLocked, true);
  assert.equal(getState(key, config, start + 2_500).isLocked, true);

  cleanupExpiredAttempts(config, start + config.lockMs + config.windowMs * 2);
  assert.equal(getState(key, config, start + config.lockMs + config.windowMs * 2).attempts, 0);
});

test('resetAttempts clears the lock state after a successful login', () => {
  const key = buildLoginRateLimitKey('127.0.0.1', 'JusticeKonoha');

  registerFailure(key, config, 10_000);
  registerFailure(key, config, 11_000);
  resetAttempts(key);

  const state = getState(key, config, 12_000);
  assert.equal(state.attempts, 0);
  assert.equal(state.isLocked, false);
});
