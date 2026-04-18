const db = require('../db');

function buildId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function parseMetadata(row) {
  try {
    const parsed = JSON.parse(row.metadata_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userPseudo: row.user_pseudo,
    kind: row.kind,
    title: row.title,
    body: row.body || '',
    entityType: row.entity_type || '',
    entityId: row.entity_id || '',
    metadata: parseMetadata(row),
    createdAt: row.created_at,
    readAt: row.read_at || null,
    unread: !row.read_at
  };
}

function createNotification(input) {
  const id = buildId('notif');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_notifications (
      id, user_pseudo, kind, title, body, entity_type, entity_id, metadata_json, created_at, read_at
    ) VALUES (
      @id, @user_pseudo, @kind, @title, @body, @entity_type, @entity_id, @metadata_json, @created_at, NULL
    )
  `).run({
    id,
    user_pseudo: input.userPseudo,
    kind: input.kind,
    title: input.title,
    body: input.body || '',
    entity_type: input.entityType || '',
    entity_id: input.entityId || '',
    metadata_json: JSON.stringify(input.metadata || {}),
    created_at: now
  });
  return getNotificationById(id);
}

function createNotificationsForUsers(userPseudos, input) {
  const seen = new Set();
  return (userPseudos || []).reduce((items, pseudo) => {
    const trimmed = String(pseudo || '').trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      return items;
    }
    seen.add(key);
    items.push(createNotification({
      ...input,
      userPseudo: trimmed
    }));
    return items;
  }, []);
}

function getNotificationById(id) {
  return mapNotification(db.prepare('SELECT * FROM user_notifications WHERE id = ?').get(id));
}

function getNotificationByUserAndId(userPseudo, notificationId) {
  return mapNotification(db.prepare(`
    SELECT *
    FROM user_notifications
    WHERE id = ?
      AND user_pseudo = ? COLLATE NOCASE
  `).get(notificationId, userPseudo));
}

function countUnreadNotifications(userPseudo) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM user_notifications
    WHERE user_pseudo = ? COLLATE NOCASE
      AND read_at IS NULL
  `).get(userPseudo);
  return Number(row && row.total) || 0;
}

function listNotifications(userPseudo, limit = 25) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Number(limit))) : 25;
  return db.prepare(`
    SELECT *
    FROM user_notifications
    WHERE user_pseudo = ? COLLATE NOCASE
    ORDER BY (read_at IS NULL) DESC, created_at DESC, id DESC
    LIMIT ${safeLimit}
  `).all(userPseudo).map(mapNotification);
}

function markNotificationRead(userPseudo, notificationId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE user_notifications
    SET read_at = COALESCE(read_at, @read_at)
    WHERE id = @id
      AND user_pseudo = @user_pseudo COLLATE NOCASE
  `).run({
    id: notificationId,
    user_pseudo: userPseudo,
    read_at: now
  });
  return getNotificationByUserAndId(userPseudo, notificationId);
}

function markAllNotificationsRead(userPseudo) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE user_notifications
    SET read_at = @read_at
    WHERE user_pseudo = @user_pseudo COLLATE NOCASE
      AND read_at IS NULL
  `).run({
    user_pseudo: userPseudo,
    read_at: now
  });
  return Number(result.changes) || 0;
}

function deleteAllNotifications(userPseudo) {
  const result = db.prepare(`
    DELETE FROM user_notifications
    WHERE user_pseudo = ? COLLATE NOCASE
  `).run(userPseudo);
  return Number(result.changes) || 0;
}

module.exports = {
  countUnreadNotifications,
  createNotification,
  createNotificationsForUsers,
  deleteAllNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
};
