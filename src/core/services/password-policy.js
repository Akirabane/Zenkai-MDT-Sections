const MIN_PASSWORD_LENGTH = 10;

function getPasswordPolicyError(password) {
  const value = String(password || '');

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caracteres`;
  }

  if (!/[a-z]/.test(value)) {
    return 'Le mot de passe doit contenir au moins une lettre minuscule';
  }

  if (!/[A-Z]/.test(value)) {
    return 'Le mot de passe doit contenir au moins une lettre majuscule';
  }

  if (!/[0-9]/.test(value)) {
    return 'Le mot de passe doit contenir au moins un chiffre';
  }

  if (!/[^a-zA-Z0-9]/.test(value)) {
    return 'Le mot de passe doit contenir au moins un caractere special';
  }

  return null;
}

function isStrongPassword(password) {
  return getPasswordPolicyError(password) === null;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  getPasswordPolicyError,
  isStrongPassword
};
