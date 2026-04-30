const fs = require('fs');

const express = require('express');

const env = require('../config/env');
const arrestsRepo = require('../repositories/arrests');
const historyRepo = require('../repositories/history');
const membersRepo = require('../repositories/membres');
const serviceSessionsRepo = require('../repositories/serviceSessions');
const usersRepo = require('../repositories/users');
const visitMetricsRepo = require('../repositories/visitMetrics');
const { authRequired } = require('../middleware/auth');
const { canViewHistory } = require('../services/permissions');
const presenceService = require('../services/presence');
const { getRuntimeInfo } = require('../services/runtime-status');
const { listSnapshots } = require('../utils/backups');

const router = express.Router();

const STATUS_ACTIONS = ['auth_login', 'auth_logout', 'system_start', 'system_shutdown', 'system_error', 'system_http_error'];

function toMb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));
}

function mapSeverity(action) {
  if (action === 'system_error' || action === 'system_http_error') return 'error';
  if (action === 'system_shutdown') return 'warning';
  return 'info';
}

function mapEventLabel(event) {
  const target = event.targetLabel ? ` - ${event.targetLabel}` : '';

  switch (event.action) {
    case 'auth_login':
      return `Connexion${target}`;
    case 'auth_logout':
      return `Deconnexion${target}`;
    case 'system_start':
      return 'Demarrage application';
    case 'system_shutdown':
      return 'Arret application';
    case 'system_error':
      return `Erreur processus${target}`;
    case 'system_http_error':
      return `Erreur HTTP${target}`;
    default:
      return event.action;
  }
}

function canViewStatus(user) {
  return canViewHistory(user) || user.permission === 'ADMIN' || user.permission === 'JUSTICE';
}

function getDetailedStatusPayload() {
  const now = new Date();
  const runtime = getRuntimeInfo();
  const sqliteExists = fs.existsSync(env.dbPath);
  const sqliteSizeBytes = sqliteExists ? fs.statSync(env.dbPath).size : 0;
  const snapshots = listSnapshots();
  const latestSnapshot = snapshots[0] || null;
  const latestSnapshotAgeHours = latestSnapshot
    ? Math.max(0, (now.getTime() - new Date(latestSnapshot.updatedAt || latestSnapshot.createdAt).getTime()) / 3600000)
    : null;
  const latestBackupFresh = latestSnapshotAgeHours !== null && latestSnapshotAgeHours <= 36;

  const presence = presenceService.getFullPresence();
  const publicPresence = presenceService.getPublicPresence();
  const users = usersRepo.countUsers();
  const membres = membersRepo.countMembres();
  const reports = arrestsRepo.countArrests();
  const dossiers = arrestsRepo.buildIncidentDossiers().length;
  const activeServiceSessions = serviceSessionsRepo.countActiveSessions();

  const since7d = new Date(now);
  since7d.setDate(now.getDate() - 6);
  since7d.setHours(0, 0, 0, 0);

  const since30d = new Date(now);
  since30d.setDate(now.getDate() - 29);
  since30d.setHours(0, 0, 0, 0);

  const recentEvents = historyRepo.listEventsByActions(STATUS_ACTIONS, {
    limit: 18
  }).map((event) => ({
    timestamp: event.timestamp,
    action: event.action,
    label: mapEventLabel(event),
    severity: mapSeverity(event.action),
    actorPseudo: event.actorPseudo,
    targetLabel: event.targetLabel,
    metadata: event.metadata
  }));

  return {
    generatedAt: now.toISOString(),
    summary: {
      server: {
        status: sqliteExists ? 'ok' : 'degraded',
        label: sqliteExists ? 'Serveur applicatif operationnel' : 'SQLite indisponible'
      },
      api: {
        status: 'ok',
        label: 'API Express repond correctement'
      },
      database: {
        status: sqliteExists ? 'ok' : 'degraded',
        label: sqliteExists ? 'SQLite joignable' : 'Base SQLite introuvable'
      },
      backups: {
        status: latestBackupFresh ? 'ok' : 'warning',
        label: latestBackupFresh ? 'Sauvegardes a jour' : 'Sauvegarde a verifier'
      },
      auth: {
        status: 'ok',
        label: 'JWT et authentification actives'
      }
    },
    runtime: {
      ...runtime,
      environment: env.nodeEnv,
      sqlite: {
        exists: sqliteExists,
        sizeBytes: sqliteSizeBytes,
        sizeMb: toMb(sqliteSizeBytes)
      }
    },
    totals: {
      users,
      membres,
      reports,
      dossiers,
      activeServiceSessions,
      auditEvents: historyRepo.countEventsByActions(STATUS_ACTIONS, {
        startAt: since30d.toISOString()
      })
    },
    presence: {
      onlineUsers: publicPresence.enLigne,
      nonActiveUsers: publicPresence.absents,
      guestCount: publicPresence.visiteurs,
      policeOnline: publicPresence.shinobis.filter((item) => item.police).length,
      justiceOnline: publicPresence.shinobis.filter((item) => item.permission === 'JUSTICE').length,
      sessions: presence.users
    },
    backups: {
      count: snapshots.length,
      latest: latestSnapshot,
      latestAgeHours: latestSnapshotAgeHours === null ? null : Number(latestSnapshotAgeHours.toFixed(1))
    },
    counters: {
      logins7d: historyRepo.countEventsByActions(['auth_login'], { startAt: since7d.toISOString() }),
      logouts7d: historyRepo.countEventsByActions(['auth_logout'], { startAt: since7d.toISOString() }),
      restarts30d: historyRepo.countEventsByActions(['system_start'], { startAt: since30d.toISOString() }),
      shutdowns30d: historyRepo.countEventsByActions(['system_shutdown'], { startAt: since30d.toISOString() }),
      errors30d: historyRepo.countEventsByActions(['system_error', 'system_http_error'], { startAt: since30d.toISOString() })
    },
    series: {
      visits: visitMetricsRepo.buildVisitSeries(14, now),
      auth: historyRepo.buildDailyActionSeries(14, ['auth_login', 'auth_logout'], now),
      system: historyRepo.buildDailyActionSeries(14, ['system_start', 'system_shutdown', 'system_error', 'system_http_error'], now),
      service: serviceSessionsRepo.buildDailyServiceSeries(14)
    },
    recentEvents
  };
}

router.get('/api/v1/status/heartbeat', (req, res) => {
  return res.json({
    status: 'ok',
    service: getRuntimeInfo().service,
    version: getRuntimeInfo().version,
    time: new Date().toISOString()
  });
});

router.get('/api/v1/status/overview', authRequired, (req, res) => {
  if (!canViewStatus(req.user)) {
    return res.status(403).json({ error: 'Acces reserve au commandement, a la Justice et aux administrateurs' });
  }

  return res.json(getDetailedStatusPayload());
});

module.exports = router;
