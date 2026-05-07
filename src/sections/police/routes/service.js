const express = require('express');

const { authRequired } = require('../../../core/middleware/auth');
const historyRepo = require('../../../core/repositories/history');
const serviceSessionsRepo = require('../../../core/repositories/serviceSessions');
const { getUserCapabilities } = require('../services/permissions');

const router = express.Router();

function ensurePoliceAccess(req, res) {
  if (!req.user || !getUserCapabilities(req.user).canUsePoliceService) {
    res.status(403).json({ error: 'Acces reserve aux policiers autorises a la prise de service' });
    return false;
  }
  return true;
}

router.get('/api/v1/service/me', authRequired, (req, res) => {
  if (!ensurePoliceAccess(req, res)) return;

  return res.json({
    activeSession: serviceSessionsRepo.getActiveSession(req.user.pseudo),
    history: serviceSessionsRepo.listSessionsByPseudo(req.user.pseudo, 20)
  });
});

router.post('/api/v1/service/toggle', authRequired, (req, res) => {
  if (!ensurePoliceAccess(req, res)) return;

  const result = serviceSessionsRepo.toggleSession(req.user.pseudo);
  const session = result.session;

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: result.status === 'started' ? 'service_start' : 'service_stop',
    entityType: 'service_session',
    entityId: session ? String(session.id) : null,
    targetLabel: req.user.pseudo,
    metadata: {
      status: result.status,
      session
    }
  });

  return res.json({
    success: true,
    status: result.status,
    session,
    activeSession: serviceSessionsRepo.getActiveSession(req.user.pseudo),
    history: serviceSessionsRepo.listSessionsByPseudo(req.user.pseudo, 20)
  });
});

module.exports = router;
