const db = require('../db');

function parseMetadata(row) {
  try {
    return JSON.parse(row.metadata_json || '{}');
  } catch (error) {
    return {};
  }
}

function mapRow(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    actorPseudo: row.actor_pseudo,
    actorPermission: row.actor_permission || '',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id || null,
    targetLabel: row.target_label || '',
    metadata: parseMetadata(row)
  };
}

function logEvent(input) {
  db.prepare(`
    INSERT INTO audit_log (
      timestamp, actor_pseudo, actor_permission, action, entity_type, entity_id, target_label, metadata_json
    ) VALUES (
      @timestamp, @actor_pseudo, @actor_permission, @action, @entity_type, @entity_id, @target_label, @metadata_json
    )
  `).run({
    timestamp: input.timestamp || new Date().toISOString(),
    actor_pseudo: input.actorPseudo,
    actor_permission: input.actorPermission || '',
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    target_label: input.targetLabel || '',
    metadata_json: JSON.stringify(input.metadata || {})
  });
}

function listHistory(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.action) {
    clauses.push('action = @action');
    params.action = filters.action;
  }

  if (filters.entityType) {
    clauses.push('entity_type = @entityType');
    params.entityType = filters.entityType;
  }

  if (filters.actorPseudo) {
    clauses.push('actor_pseudo = @actorPseudo COLLATE NOCASE');
    params.actorPseudo = filters.actorPseudo;
  }

  if (filters.entityId) {
    clauses.push('entity_id = @entityId');
    params.entityId = filters.entityId;
  }

  if (filters.search) {
    clauses.push(`
      (
        LOWER(actor_pseudo) LIKE @search
        OR LOWER(COALESCE(target_label, '')) LIKE @search
        OR LOWER(COALESCE(metadata_json, '')) LIKE @search
      )
    `);
    params.search = `%${String(filters.search).trim().toLowerCase()}%`;
  }

  if (filters.dateFrom) {
    clauses.push('timestamp >= @dateFrom');
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push('timestamp <= @dateTo');
    params.dateTo = filters.dateTo;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(Number(filters.limit)) ? Math.max(1, Math.min(500, Number(filters.limit))) : 200;
  const rows = db.prepare(`
    SELECT *
    FROM audit_log
    ${where}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${limit}
  `).all(params);

  return rows.map(mapRow);
}

function listRecentPublications(limit = 5) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 5;
  const rows = db.prepare(`
    SELECT *
    FROM audit_log
    WHERE action IN ('casier_publish', 'report_publish')
    ORDER BY timestamp DESC, id DESC
    LIMIT ${safeLimit}
  `).all();

  return rows.map(mapRow);
}

function listEventsByActions(actions = [], options = {}) {
  const safeActions = Array.from(new Set((actions || []).filter(Boolean)));
  if (!safeActions.length) {
    return [];
  }

  const clauses = [`action IN (${safeActions.map(() => '?').join(', ')})`];
  const params = safeActions.slice();

  if (options.startAt) {
    clauses.push('timestamp >= ?');
    params.push(options.startAt);
  }

  if (options.endAt) {
    clauses.push('timestamp <= ?');
    params.push(options.endAt);
  }

  const safeLimit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Math.min(5000, Number(options.limit)))
    : 200;

  const rows = db.prepare(`
    SELECT *
    FROM audit_log
    WHERE ${clauses.join(' AND ')}
    ORDER BY timestamp DESC, id DESC
    LIMIT ${safeLimit}
  `).all(...params);

  return rows.map(mapRow);
}

function countEventsByActions(actions = [], options = {}) {
  const safeActions = Array.from(new Set((actions || []).filter(Boolean)));
  if (!safeActions.length) {
    return 0;
  }

  const clauses = [`action IN (${safeActions.map(() => '?').join(', ')})`];
  const params = safeActions.slice();

  if (options.startAt) {
    clauses.push('timestamp >= ?');
    params.push(options.startAt);
  }

  if (options.endAt) {
    clauses.push('timestamp <= ?');
    params.push(options.endAt);
  }

  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_log
    WHERE ${clauses.join(' AND ')}
  `).get(...params);

  return Number(row && row.total) || 0;
}

function buildDailyActionSeries(days = 14, actions = [], now = new Date()) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 14));
  const safeActions = Array.from(new Set((actions || []).filter(Boolean)));

  if (!safeActions.length) {
    return [];
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (safeDays - 1));

  const buckets = [];
  const bucketIndex = new Map();

  for (let index = 0; index < safeDays; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = day.toISOString().slice(0, 10);
    const item = {
      key,
      label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    };

    safeActions.forEach((action) => {
      item[action] = 0;
    });

    bucketIndex.set(key, item);
    buckets.push(item);
  }

  listEventsByActions(safeActions, {
    startAt: start.toISOString(),
    limit: safeDays * 500
  }).forEach((event) => {
    const key = String(event.timestamp || '').slice(0, 10);
    const bucket = bucketIndex.get(key);
    if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, event.action)) {
      return;
    }
    bucket[event.action] += 1;
  });

  return buckets;
}

function clearHistory() {
  return db.prepare('DELETE FROM audit_log').run();
}

module.exports = {
  buildDailyActionSeries,
  clearHistory,
  countEventsByActions,
  listHistory,
  listEventsByActions,
  listRecentPublications,
  logEvent
};
