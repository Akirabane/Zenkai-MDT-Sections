const test = require('node:test');
const assert = require('node:assert/strict');

const { MIN_PASSWORD_LENGTH, getPasswordPolicyError, isStrongPassword } = require('../src/core/services/password-policy');

test('accepts a strong password', () => {
  const password = 'KonohaSecure42!';
  assert.equal(getPasswordPolicyError(password), null);
  assert.equal(isStrongPassword(password), true);
});

test('rejects passwords shorter than the minimum policy', () => {
  assert.match(getPasswordPolicyError('Abc123'), new RegExp(String(MIN_PASSWORD_LENGTH)));
  assert.equal(isStrongPassword('Abc123'), false);
});

test('rejects passwords missing a required character class', () => {
  assert.equal(getPasswordPolicyError('alllowercase42'), 'Le mot de passe doit contenir au moins une lettre majuscule');
  assert.equal(getPasswordPolicyError('ALLUPPERCASE42'), 'Le mot de passe doit contenir au moins une lettre minuscule');
  assert.equal(getPasswordPolicyError('NoDigitsHere'), 'Le mot de passe doit contenir au moins un chiffre');
});
