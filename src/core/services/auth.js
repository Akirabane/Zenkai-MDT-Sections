const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../../config/env');
const usersRepo = require('../repositories/users');

function signToken(user) {
  const payload = {
    sub: String(user.id),
    pseudo: user.pseudo,
    permission: user.permission,
    policeRole: user.policeRole,
    driRole: user.driRole,
    tokenVersion: user.tokenVersion
  };

  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function issueAuthPayload(user) {
  return {
    token: signToken(user),
    pseudo: user.pseudo,
    permission: user.permission,
    policeRole: user.policeRole,
    driRole: user.driRole,
    linkedMembre: user.linkedMembre
  };
}

function buildArrestId() {
  return crypto.randomBytes(8).toString('hex');
}

function revokeUserTokens(userId) {
  return usersRepo.bumpTokenVersion(userId);
}

module.exports = {
  buildArrestId,
  issueAuthPayload,
  revokeUserTokens,
  verifyToken
};
