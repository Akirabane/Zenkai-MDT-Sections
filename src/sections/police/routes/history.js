const express = require('express');

const { authRequired } = require('../../../core/middleware/auth');
const historyRepo = require('../../../core/repositories/history');
const { canViewHistory } = require('../services/permissions');

const router = express.Router();

router.get('/api/v1/history', authRequired, (req, res) => {
  if (!canViewHistory(req.user)) {
    return res.status(403).json({ error: 'Acces reserve au commandement, a la justice et aux administrateurs' });
  }

  const items = historyRepo.listHistory({
    action: (req.query.action || '').trim() || undefined,
    entityType: (req.query.entityType || '').trim() || undefined,
    actorPseudo: (req.query.actor || '').trim() || undefined,
    entityId: (req.query.entityId || '').trim() || undefined,
    search: (req.query.q || '').trim() || undefined,
    dateFrom: (req.query.dateFrom || '').trim() || undefined,
    dateTo: (req.query.dateTo || '').trim() || undefined,
    limit: req.query.limit
  });

  return res.json({ items });
});

router.delete('/api/v1/history', authRequired, (req, res) => {
  if (req.user.permission !== 'ADMIN') {
    return res.status(403).json({ error: 'Seul un administrateur peut effacer l historique' });
  }

  historyRepo.clearHistory();
  return res.json({ success: true });
});

module.exports = router;
