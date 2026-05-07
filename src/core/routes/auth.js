const express = require('express');
const fs = require('fs');
const path = require('path');

const env = require('../../config/env');
const historyRepo = require('../repositories/history');
const usersRepo = require('../repositories/users');
const { authRequired } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { issueAuthPayload, revokeUserTokens } = require('../services/auth');
const { buildLoginRateLimitKey, getState: getLoginRateLimitState, registerFailure, resetAttempts } = require('../services/login-rate-limit');
const { makePassword, verifyPassword } = require('../services/passwords');
const { avatarSchema, loginSchema, registerSchema } = require('../../validation/schemas');
const { canAddRegisterMembers, canCreateComplaints, canCreateInvestigations, canCreateReports, canDeleteComplaints, canDeleteDossiers, canDeleteInvestigations, canDeleteRegisterMembers, canEditCP, canManageCasierRecords, canManageComplaints, canManageInvestigations, canManagePoliceRanks, canViewCasierRecords, canViewComplaints, canViewHistory, canViewInvestigations, canViewPatrolReports, getUserCapabilities } = require('../../sections/police/services/permissions');
const presenceService = require('../services/presence');
const { getClientIp } = require('../utils/network');

const router = express.Router();
const loginRateLimitConfig = {
  maxAttempts: env.loginRateLimitMaxAttempts,
  windowMs: env.loginRateLimitWindowMinutes * 60 * 1000,
  lockMs: env.loginRateLimitLockMinutes * 60 * 1000
};

function buildJusticeAccount() {
  return {
    pseudo: env.justiceAccountPseudo,
    password: env.justiceAccountPassword,
    permission: 'JUSTICE'
  };
}

function isJusticePseudo(pseudo) {
  return (pseudo || '').trim().toLowerCase() === env.justiceAccountPseudo.toLowerCase();
}

function getLoginRateLimitResponse(state) {
  const retryAfterSeconds = Math.max(1, Math.ceil((state.retryAfterMs || 0) / 1000));
  return {
    status: 429,
    body: {
      error: `Trop de tentatives de connexion. Reessaie dans ${retryAfterSeconds} seconde(s).`
    },
    retryAfterSeconds
  };
}

// Cached per process: env vars don't change without a restart.
// We verify the existing DB hash first — only rehash if the env password changed.
let cachedJusticeUser = undefined;

function ensureJusticeAccount() {
  if (cachedJusticeUser !== undefined) return cachedJusticeUser;

  const justiceAccount = buildJusticeAccount();
  if (!justiceAccount.password) {
    cachedJusticeUser = null;
    return null;
  }

  const existing = usersRepo.findByPseudo(justiceAccount.pseudo);
  if (existing) {
    const check = verifyPassword(justiceAccount.password, existing);
    if (check.ok) {
      cachedJusticeUser = existing;
      return existing;
    }
  }

  // Env password changed or account doesn't exist — (re)create hash
  const passwordData = makePassword(justiceAccount.password);
  const user = usersRepo.upsertSharedUser({
    pseudo: justiceAccount.pseudo,
    passwordHash: passwordData.passwordHash,
    salt: passwordData.salt,
    permission: justiceAccount.permission,
    policeRole: false,
    linkedMembre: null,
    avatar: null,
    createdAt: new Date().toISOString()
  });

  if (user) cachedJusticeUser = user;
  return user;
}

router.post('/auth/register', validate(registerSchema), (req, res) => {
  const { pseudo, password, secret } = req.body;

  if (secret !== env.policeSecret) {
    return res.status(403).json({ error: 'Code secret invalide. Seuls les agents accredites peuvent s enroler.' });
  }

  if (usersRepo.findByPseudo(pseudo)) {
    return res.status(409).json({ error: 'Ce pseudo est deja utilise' });
  }

  const passwordData = makePassword(password);
  const user = usersRepo.createUser({
    pseudo,
    passwordHash: passwordData.passwordHash,
    salt: passwordData.salt,
    permission: 'READ',
    policeRole: false,
    linkedMembre: null,
    avatar: null,
    createdAt: new Date().toISOString()
  });

  return res.json(issueAuthPayload(user));
});

router.post('/auth/login', validate(loginSchema), (req, res) => {
  const { pseudo, password } = req.body;
  const rateLimitKey = buildLoginRateLimitKey(getClientIp(req), pseudo);
  const rateLimitState = getLoginRateLimitState(rateLimitKey, loginRateLimitConfig);
  if (rateLimitState.isLocked) {
    const response = getLoginRateLimitResponse(rateLimitState);
    res.setHeader('Retry-After', String(response.retryAfterSeconds));
    return res.status(response.status).json(response.body);
  }

  if (isJusticePseudo(pseudo)) {
    const justiceAccount = ensureJusticeAccount();
    if (!justiceAccount) {
      return res.status(503).json({ error: 'Compte Justice non configure sur le serveur.' });
    }
  }
  let user = usersRepo.findByPseudo(pseudo);
  const passwordCheck = verifyPassword(password, user);

  if (!user || !passwordCheck.ok) {
    const failureState = registerFailure(rateLimitKey, loginRateLimitConfig);
    if (failureState.isLocked) {
      const response = getLoginRateLimitResponse(failureState);
      res.setHeader('Retry-After', String(response.retryAfterSeconds));
      return res.status(response.status).json(response.body);
    }

    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  if (passwordCheck.needsRehash) {
    user = usersRepo.updatePassword(user.id, makePassword(password)) || user;
  }

  resetAttempts(rateLimitKey);
  historyRepo.logEvent({
    actorPseudo: user.pseudo,
    actorPermission: user.permission,
    action: 'auth_login',
    entityType: 'user_session',
    entityId: String(user.id),
    targetLabel: user.pseudo,
    metadata: {
      ip: getClientIp(req),
      policeRole: !!user.policeRole,
      linkedMembre: user.linkedMembre || null
    }
  });
  return res.json(issueAuthPayload(user));
});

router.post('/auth/logout', authRequired, (req, res) => {
  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'auth_logout',
    entityType: 'user_session',
    entityId: String(req.user.id || req.user.pseudo),
    targetLabel: req.user.pseudo,
    metadata: {
      ip: getClientIp(req),
      policeRole: !!req.user.policeRole
    }
  });

  revokeUserTokens(req.user.id);
  presenceService.removeUser(req.user.pseudo);
  return res.json({ success: true });
});

router.get('/auth/me', authRequired, (req, res) => {
  return res.json({
    pseudo: req.user.pseudo,
    permission: req.user.permission,
    policeRole: req.user.policeRole,
    linkedMembre: req.user.linkedMembre,
    capabilities: getUserCapabilities(req.user)
  });
});

const AVATAR_MIME_TO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const AVATAR_EXT_TO_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

function saveAvatarToFile(userId, dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const [, mimeType, base64Data] = match;
  const ext = AVATAR_MIME_TO_EXT[mimeType.toLowerCase()] || 'png';
  const avatarDir = path.join(env.uploadsDir, 'avatars');
  fs.mkdirSync(avatarDir, { recursive: true });
  const filename = `${userId}.${ext}`;
  // Remove any old avatar with a different extension before writing
  for (const oldExt of Object.values(AVATAR_MIME_TO_EXT)) {
    if (oldExt !== ext) {
      try { fs.unlinkSync(path.join(avatarDir, `${userId}.${oldExt}`)); } catch (_) {}
    }
  }
  fs.writeFileSync(path.join(avatarDir, filename), Buffer.from(base64Data, 'base64'));
  return `avatars/${filename}`;
}

function readAvatarAsDataUrl(avatarField) {
  if (!avatarField) return null;
  // Legacy: inline base64 stored directly in DB — return as-is until user updates avatar
  if (avatarField.startsWith('data:')) return avatarField;
  // New: relative path under uploadsDir — must stay within uploadsDir
  try {
    const absolutePath = path.resolve(env.uploadsDir, avatarField);
    const uploadsRoot = path.resolve(env.uploadsDir);
    if (!absolutePath.startsWith(uploadsRoot + path.sep) && absolutePath !== uploadsRoot) {
      return null;
    }
    const buffer = fs.readFileSync(absolutePath);
    const ext = path.extname(avatarField).slice(1).toLowerCase();
    const mime = AVATAR_EXT_TO_MIME[ext] || 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (_) {
    return null;
  }
}

router.post('/auth/profile/avatar', authRequired, validate(avatarSchema), (req, res) => {
  const filePath = saveAvatarToFile(req.user.id, req.body.avatar);
  usersRepo.updateAvatar(req.user.id, filePath || req.body.avatar);
  return res.json({ success: true });
});

router.get('/auth/profile/avatar/:pseudo', authRequired, (req, res) => {
  const user = usersRepo.findByPseudo(req.params.pseudo);
  if (!user || !user.avatar) {
    return res.status(404).json({ error: 'Aucun avatar.' });
  }

  const avatar = readAvatarAsDataUrl(user.avatar);
  if (!avatar) {
    return res.status(404).json({ error: 'Aucun avatar.' });
  }

  return res.json({ avatar });
});

router.get('/auth/profile/avatar-by-hrp/:pseudoHRP', authRequired, (req, res) => {
  const pseudoHRP = (req.params.pseudoHRP || '').toLowerCase();
  const user = usersRepo
    .listUsers()
    .find((item) =>
      (item.linkedMembre || '').toLowerCase() === pseudoHRP ||
      item.pseudo.toLowerCase() === pseudoHRP
    );

  if (!user || !user.avatar) {
    return res.status(404).json({ error: 'Aucun avatar.' });
  }

  const avatar = readAvatarAsDataUrl(user.avatar);
  if (!avatar) {
    return res.status(404).json({ error: 'Aucun avatar.' });
  }

  return res.json({ avatar });
});

router.get('/auth/can-edit-cp', authRequired, (req, res) => {
  return res.json({ canEdit: canEditCP(req.user) });
});

router.get('/auth/can-manage-ranks', authRequired, (req, res) => {
  return res.json({
    canManage: canManagePoliceRanks(req.user),
    canDelete: canDeleteRegisterMembers(req.user)
  });
});

router.get('/auth/can-add-registry-members', authRequired, (req, res) => {
  return res.json({ canAdd: canAddRegisterMembers(req.user) });
});

router.get('/auth/can-manage-casiers', authRequired, (req, res) => {
  return res.json({
    canView: canViewCasierRecords(req.user),
    canManage: canManageCasierRecords(req.user),
    canDeleteDossiers: canDeleteDossiers(req.user),
    canViewPatrolReports: canViewPatrolReports(req.user)
  });
});

router.get('/auth/can-view-history', authRequired, (req, res) => {
  return res.json({ canView: canViewHistory(req.user) });
});

router.get('/auth/can-manage-complaints', authRequired, (req, res) => {
  return res.json({
    canCreate: canCreateComplaints(req.user),
    canView: canViewComplaints(req.user),
    canManage: canManageComplaints(req.user),
    canDelete: canDeleteComplaints(req.user)
  });
});

router.get('/auth/can-manage-investigations', authRequired, (req, res) => {
  return res.json({
    canCreate: canCreateInvestigations(req.user),
    canView: canViewInvestigations(req.user),
    canManage: canManageInvestigations(req.user),
    canDelete: canDeleteInvestigations(req.user)
  });
});

router.get('/auth/capabilities', authRequired, (req, res) => {
  return res.json(getUserCapabilities(req.user));
});

module.exports = router;
