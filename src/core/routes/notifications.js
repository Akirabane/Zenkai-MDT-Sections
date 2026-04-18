const express = require('express');

const { authRequired } = require('../middleware/auth');
const notificationsRepo = require('../repositories/notifications');

const router = express.Router();

function canUseNotifications(user) {
  return !!(user && user.permission && user.permission !== 'GUEST');
}

router.get('/api/v1/notifications', authRequired, (req, res) => {
  if (!canUseNotifications(req.user)) {
    return res.status(403).json({ error: 'Notifications indisponibles pour ce profil' });
  }

  const limit = req.query.limit;
  const items = notificationsRepo.listNotifications(req.user.pseudo, limit);
  return res.json({
    unreadCount: notificationsRepo.countUnreadNotifications(req.user.pseudo),
    items
  });
});

router.post('/api/v1/notifications/:id/read', authRequired, (req, res) => {
  if (!canUseNotifications(req.user)) {
    return res.status(403).json({ error: 'Notifications indisponibles pour ce profil' });
  }

  const item = notificationsRepo.markNotificationRead(req.user.pseudo, req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Notification introuvable' });
  }

  return res.json({
    success: true,
    item,
    unreadCount: notificationsRepo.countUnreadNotifications(req.user.pseudo)
  });
});

router.post('/api/v1/notifications/read-all', authRequired, (req, res) => {
  if (!canUseNotifications(req.user)) {
    return res.status(403).json({ error: 'Notifications indisponibles pour ce profil' });
  }

  const updated = notificationsRepo.markAllNotificationsRead(req.user.pseudo);
  return res.json({
    success: true,
    updated,
    unreadCount: notificationsRepo.countUnreadNotifications(req.user.pseudo)
  });
});

router.post('/api/v1/notifications/clear-all', authRequired, (req, res) => {
  if (!canUseNotifications(req.user)) {
    return res.status(403).json({ error: 'Notifications indisponibles pour ce profil' });
  }

  const deleted = notificationsRepo.deleteAllNotifications(req.user.pseudo);
  return res.json({
    success: true,
    deleted,
    unreadCount: notificationsRepo.countUnreadNotifications(req.user.pseudo)
  });
});

module.exports = router;
