const env = require('../../config/env');
const usersRepo = require('../repositories/users');
const { verifyToken } = require('../services/auth');

function getTokenFromReq(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function authRequired(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: 'Non authentifie' });
  }

  try {
    const payload = verifyToken(token);
    const user = usersRepo.findById(Number(payload.sub));

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: 'Session expiree' });
    }

    req.token = token;
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

function adminRequired(req, res, next) {
  return authRequired(req, res, function handleAuth() {
    if (req.user.permission !== 'ADMIN') {
      return res.status(403).json({ error: 'Reserve aux administrateurs' });
    }
    return next();
  });
}

function gradeBotOrAuthRequired(req, res, next) {
  const token = getTokenFromReq(req);

  if (env.gradeBotToken && env.gradeBotToken.length >= 32 && token && token === env.gradeBotToken) {
    req.token = token;
    req.user = {
      id: 0,
      pseudo: 'grade-bot',
      permission: 'ADMIN',
      policeRole: true,
      linkedMembre: null,
      isServiceToken: true
    };
    return next();
  }

  return authRequired(req, res, next);
}

module.exports = {
  adminRequired,
  authRequired,
  getTokenFromReq,
  gradeBotOrAuthRequired
};
