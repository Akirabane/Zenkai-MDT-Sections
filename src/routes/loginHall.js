const express = require('express');

const {
  getSnapshot,
  subscribe,
  upsertPresence,
  removePresence
} = require('../services/login-hall-presence');

const router = express.Router();

router.get('/api/login-hall/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const unsubscribe = subscribe(res);

  req.on('close', () => {
    unsubscribe();
  });
});

router.get('/api/login-hall/snapshot', (req, res) => {
  return res.json({
    peers: getSnapshot()
  });
});

router.post('/api/login-hall/presence', (req, res) => {
  if (!upsertPresence(req.body || {})) {
    return res.status(400).json({ error: 'Presence invalide' });
  }

  return res.json({ ok: true });
});

router.delete('/api/login-hall/presence/:id', (req, res) => {
  removePresence(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
