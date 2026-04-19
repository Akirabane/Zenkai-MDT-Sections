const db = require('../db');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    pseudo: row.pseudo,
    startedAt: row.started_at,
    endedAt: row.ended_at || null,
    status: row.status,
    durationSeconds: row.duration_seconds || 0,
    note: row.note || ''
  };
}

function getActiveSession(pseudo) {
  const row = db.prepare(`
    SELECT *
    FROM service_sessions
    WHERE pseudo = ? AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
  `).get(pseudo);
  return mapRow(row);
}

function startSession(pseudo, note = '') {
  const active = getActiveSession(pseudo);
  if (active) return active;

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO service_sessions (pseudo, started_at, status, note)
    VALUES (?, ?, 'active', ?)
  `).run(pseudo, now, note);

  return mapRow(db.prepare('SELECT * FROM service_sessions WHERE id = ?').get(result.lastInsertRowid));
}

function stopSession(pseudo) {
  const active = getActiveSession(pseudo);
  if (!active) return null;

  const endedAt = new Date().toISOString();
  const durationSeconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(active.startedAt).getTime()) / 1000));

  db.prepare(`
    UPDATE service_sessions
    SET ended_at = ?, status = 'closed', duration_seconds = ?
    WHERE id = ?
  `).run(endedAt, durationSeconds, active.id);

  return mapRow(db.prepare('SELECT * FROM service_sessions WHERE id = ?').get(active.id));
}

function stopSessionByIdAt(id, endedAt, note = '') {
  const row = db.prepare('SELECT * FROM service_sessions WHERE id = ?').get(id);
  if (!row || row.status !== 'active') return null;

  const safeEndedAt = new Date(endedAt).toISOString();
  const durationSeconds = Math.max(0, Math.round((new Date(safeEndedAt).getTime() - new Date(row.started_at).getTime()) / 1000));
  const mergedNote = [row.note || '', note].filter(Boolean).join(' | ').slice(0, 500);

  db.prepare(`
    UPDATE service_sessions
    SET ended_at = ?, status = 'closed', duration_seconds = ?, note = ?
    WHERE id = ?
  `).run(safeEndedAt, durationSeconds, mergedNote, id);

  return mapRow(db.prepare('SELECT * FROM service_sessions WHERE id = ?').get(id));
}

function toggleSession(pseudo) {
  const active = getActiveSession(pseudo);
  if (active) {
    return { status: 'stopped', session: stopSession(pseudo) };
  }
  return { status: 'started', session: startSession(pseudo) };
}

function autoCloseActiveSessionsAt(cutoffDate) {
  const cutoffIso = new Date(cutoffDate).toISOString();
  const rows = db.prepare(`
    SELECT *
    FROM service_sessions
    WHERE status = 'active'
      AND started_at < ?
    ORDER BY started_at ASC, id ASC
  `).all(cutoffIso);

  return rows
    .map((row) => stopSessionByIdAt(row.id, cutoffIso, 'Cloture automatique a 03:00'))
    .filter(Boolean);
}

function listSessionsByPseudo(pseudo, limit = 30) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 30;
  return db.prepare(`
    SELECT *
    FROM service_sessions
    WHERE pseudo = ?
    ORDER BY started_at DESC, id DESC
    LIMIT ${safeLimit}
  `).all(pseudo).map(mapRow);
}

function listRecentSessions(limit = 100) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 100;
  return db.prepare(`
    SELECT *
    FROM service_sessions
    ORDER BY started_at DESC, id DESC
    LIMIT ${safeLimit}
  `).all().map(mapRow);
}

function countActiveSessions() {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM service_sessions
    WHERE status = 'active'
  `).get();

  return Number(row && row.total) || 0;
}

function listSessionsBetween(startAt, endAt, limit = 500) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(2000, Number(limit))) : 500;
  const clauses = [];
  const params = {};

  if (startAt) {
    clauses.push('started_at >= @startAt');
    params.startAt = startAt;
  }

  if (endAt) {
    clauses.push('started_at < @endAt');
    params.endAt = endAt;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`
    SELECT *
    FROM service_sessions
    ${where}
    ORDER BY started_at DESC, id DESC
    LIMIT ${safeLimit}
  `).all(params).map(mapRow);
}

function buildDailyServiceSeries(days = 14) {
  const totalDays = Math.max(1, Math.min(90, Number(days) || 14));
  const sessions = listRecentSessions(500);
  const items = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = totalDays - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const label = day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const startTs = day.getTime();
    const endTs = nextDay.getTime();

    let sessionsCount = 0;
    let durationSeconds = 0;

    sessions.forEach((session) => {
      const sessionStart = new Date(session.startedAt).getTime();
      if (Number.isNaN(sessionStart) || sessionStart < startTs || sessionStart >= endTs) return;
      sessionsCount += 1;
      durationSeconds += session.durationSeconds || 0;
    });

    items.push({
      label,
      sessions: sessionsCount,
      hours: Number((durationSeconds / 3600).toFixed(2))
    });
  }

  return items;
}

function buildDailyServiceSeriesForRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }

  const sessions = listSessionsBetween(start.toISOString(), end.toISOString(), 2000);
  const items = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    const nextDay = new Date(cursor);
    nextDay.setDate(cursor.getDate() + 1);

    const dayStart = cursor.getTime();
    const dayEnd = nextDay.getTime();
    let sessionsCount = 0;
    let durationSeconds = 0;

    sessions.forEach((session) => {
      const sessionStart = new Date(session.startedAt).getTime();
      if (Number.isNaN(sessionStart) || sessionStart < dayStart || sessionStart >= dayEnd) return;
      sessionsCount += 1;
      durationSeconds += session.durationSeconds || 0;
    });

    items.push({
      label: cursor.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      sessions: sessionsCount,
      hours: Number((durationSeconds / 3600).toFixed(2))
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return items;
}

function buildServiceLeaderboard(limit = 5) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 5;
  const rows = db.prepare(`
    SELECT pseudo, SUM(duration_seconds) AS total_seconds, COUNT(*) AS sessions
    FROM service_sessions
    WHERE status = 'closed'
    GROUP BY pseudo
    ORDER BY total_seconds DESC, sessions DESC, pseudo ASC
    LIMIT ${safeLimit}
  `).all();

  return rows.map((row) => ({
    pseudo: row.pseudo,
    sessions: row.sessions || 0,
    totalSeconds: row.total_seconds || 0,
    hours: Number(((row.total_seconds || 0) / 3600).toFixed(2))
  }));
}

function buildServiceLeaderboardForRange(limit = 5, startAt, endAt) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 5;
  const clauses = [`status = 'closed'`];
  const params = {};

  if (startAt) {
    clauses.push('started_at >= @startAt');
    params.startAt = startAt;
  }

  if (endAt) {
    clauses.push('started_at < @endAt');
    params.endAt = endAt;
  }

  const rows = db.prepare(`
    SELECT pseudo, SUM(duration_seconds) AS total_seconds, COUNT(*) AS sessions
    FROM service_sessions
    WHERE ${clauses.join(' AND ')}
    GROUP BY pseudo
    ORDER BY total_seconds DESC, sessions DESC, pseudo ASC
    LIMIT ${safeLimit}
  `).all(params);

  return rows.map((row) => ({
    pseudo: row.pseudo,
    sessions: row.sessions || 0,
    totalSeconds: row.total_seconds || 0,
    hours: Number(((row.total_seconds || 0) / 3600).toFixed(2))
  }));
}

module.exports = {
  buildDailyServiceSeries,
  buildDailyServiceSeriesForRange,
  buildServiceLeaderboard,
  buildServiceLeaderboardForRange,
  autoCloseActiveSessionsAt,
  countActiveSessions,
  getActiveSession,
  listRecentSessions,
  listSessionsBetween,
  listSessionsByPseudo,
  startSession,
  stopSession,
  toggleSession
};
