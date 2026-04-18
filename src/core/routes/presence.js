const express = require('express');

const { authRequired } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { guestPingSchema, presencePingSchema } = require('../../validation/schemas');
const presenceService = require('../services/presence');
const visitMetricsRepo = require('../repositories/visitMetrics');

const router = express.Router();

router.post('/presence/ping', authRequired, validate(presencePingSchema), (req, res) => {
  visitMetricsRepo.recordPoliceVisit(req.user);
  return res.json(presenceService.pingUser(req.user, req.body.status, req.body.clientId));
});

router.post('/presence/guest-ping', validate(guestPingSchema), (req, res) => {
  visitMetricsRepo.recordGuestVisit(req.body.guestId);
  return res.json(presenceService.pingGuest(req.body.guestId));
});

router.get('/presence/list', authRequired, (req, res) => {
  return res.json(presenceService.getFullPresence());
});

module.exports = router;
