const express = require('express');

const { buildOverviewPayload, getHeartbeatPayload } = require('../services/status-monitor-report');

const router = express.Router();

router.get('/api/status-monitor/heartbeat', (req, res) => {
  return res.json(getHeartbeatPayload());
});

router.get('/api/status-monitor/overview', async (req, res, next) => {
  try {
    return res.json(await buildOverviewPayload());
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
