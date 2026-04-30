const stateRepo = require('../repositories/state');
const statsHistoryRepo = require('../repositories/statsHistory');
const historyRepo = require('../repositories/history');
const serviceSessionsRepo = require('../repositories/serviceSessions');
const logger = require('../utils/logger');
const { buildDashboardStats } = require('./dashboard-stats');
const {
  TIMEZONE,
  getCurrentServiceAutoCloseBoundary,
  formatPeriodLabel,
  getCurrentWeeklyResetBoundary,
  getNextWeeklyResetBoundary
} = require('./dashboard-periods');

function archiveDashboardPeriod(periodStart, periodEnd) {
  const stats = buildDashboardStats(periodStart, periodEnd, { nextResetAt: periodEnd });
  const snapshotPayload = {
    meta: {
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      label: formatPeriodLabel(periodStart, periodEnd),
      snapshotCreatedAt: new Date().toISOString()
    },
    summary: stats.summary,
    stats
  };

  const saved = statsHistoryRepo.saveSnapshot(snapshotPayload);
  historyRepo.logEvent({
    actorPseudo: 'system',
    actorPermission: 'SYSTEM',
    action: 'dashboard_archive',
    entityType: 'dashboard_stats',
    entityId: saved.id,
    targetLabel: snapshotPayload.meta.label,
    metadata: snapshotPayload.meta
  });
  logger.info('Archive hebdomadaire dashboard creee', {
    snapshot: saved.id,
    period: snapshotPayload.meta.label
  });
}

function ensureDashboardReset(now = new Date()) {
  const config = stateRepo.getResetConfig();
  const currentBoundary = getCurrentWeeklyResetBoundary(now);
  let lastWeeklyReset = config.lastWeeklyReset ? new Date(config.lastWeeklyReset) : null;

  if (!lastWeeklyReset || Number.isNaN(lastWeeklyReset.getTime())) {
    config.lastWeeklyReset = currentBoundary.toISOString();
    config.lastDailyReset = currentBoundary.toISOString();
    stateRepo.saveResetConfig(config);
    return {
      periodStart: currentBoundary.toISOString(),
      nextResetAt: getNextWeeklyResetBoundary(currentBoundary).toISOString(),
      archived: []
    };
  }

  const sameBoundaryDay = lastWeeklyReset.toLocaleDateString('fr-FR', { timeZone: TIMEZONE }) ===
    currentBoundary.toLocaleDateString('fr-FR', { timeZone: TIMEZONE });

  if (lastWeeklyReset > currentBoundary || (sameBoundaryDay && currentBoundary.getTime() - lastWeeklyReset.getTime() <= 12 * 60 * 60 * 1000)) {
    config.lastWeeklyReset = currentBoundary.toISOString();
    config.lastDailyReset = currentBoundary.toISOString();
    stateRepo.saveResetConfig(config);
    return {
      periodStart: currentBoundary.toISOString(),
      nextResetAt: getNextWeeklyResetBoundary(currentBoundary).toISOString(),
      archived: []
    };
  }

  const archived = [];
  while (lastWeeklyReset < currentBoundary) {
    const nextBoundary = getNextWeeklyResetBoundary(lastWeeklyReset);
    archiveDashboardPeriod(lastWeeklyReset, nextBoundary);
    archived.push({
      start: lastWeeklyReset.toISOString(),
      end: nextBoundary.toISOString()
    });
    lastWeeklyReset = nextBoundary;
  }

  if (archived.length) {
    config.lastWeeklyReset = lastWeeklyReset.toISOString();
    config.lastDailyReset = lastWeeklyReset.toISOString();
    stateRepo.saveResetConfig(config);
  }

  return {
    periodStart: lastWeeklyReset.toISOString(),
    nextResetAt: getNextWeeklyResetBoundary(lastWeeklyReset).toISOString(),
    archived
  };
}

function ensureServiceAutoClose(now = new Date()) {
  const cutoff = getCurrentServiceAutoCloseBoundary(now, TIMEZONE);
  const closedSessions = serviceSessionsRepo.autoCloseActiveSessionsAt(cutoff);

  closedSessions.forEach((session) => {
    historyRepo.logEvent({
      actorPseudo: 'system',
      actorPermission: 'SYSTEM',
      action: 'service_auto_stop',
      entityType: 'service_session',
      entityId: String(session.id),
      targetLabel: session.pseudo,
      metadata: {
        cutoffAt: cutoff.toISOString(),
        session
      }
    });
  });

  if (closedSessions.length) {
    logger.info('Prises de service cloturees automatiquement', {
      count: closedSessions.length,
      cutoffAt: cutoff.toISOString()
    });
  }

  return {
    cutoffAt: cutoff.toISOString(),
    closedCount: closedSessions.length
  };
}

function runResetCheck() {
  try {
    ensureServiceAutoClose(new Date());
    ensureDashboardReset(new Date());
  } catch (error) {
    logger.error('Reset hebdomadaire dashboard echoue', {
      message: error.message
    });
  }
}

function startResetScheduler() {
  runResetCheck();
  return setInterval(runResetCheck, 60000);
}

module.exports = {
  ensureDashboardReset,
  ensureServiceAutoClose,
  runResetCheck,
  startResetScheduler
};
