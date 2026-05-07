const reportsRepo = require('../repositories/arrests');
const complaintsRepo = require('../repositories/complaints');
const investigationsRepo = require('../repositories/investigations');
const historyRepo = require('../../../core/repositories/history');
const membersRepo = require('../repositories/membres');
const usersRepo = require('../../../core/repositories/users');
const serviceSessionsRepo = require('../../../core/repositories/serviceSessions');
const stateRepo = require('../repositories/state');
const visitMetricsRepo = require('../../../core/repositories/visitMetrics');
const { formatPeriodLabel } = require('./dashboard-periods');

function normalizeReportType(value) {
  return String(value || '').trim().toLowerCase() === 'patrol' ? 'patrol' : 'incident';
}

function normalizeDelitLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const duplicatedCodeMatch = raw.match(/^([A-Z]\d+(?:\.\d+)?)\s*-\s*\1\s*-\s*(.+)$/i);
  if (duplicatedCodeMatch) {
    return `${duplicatedCodeMatch[1]} - ${duplicatedCodeMatch[2].trim()}`;
  }

  return raw;
}

function buildReportTargetLabel(record) {
  if (normalizeReportType(record.reportType) === 'patrol') {
    const agent = [record.agentPrenom, record.agentNom].filter(Boolean).join(' ').trim() || record.author || 'Agent inconnu';
    return `Patrouille - ${agent}`;
  }
  return [record.suspectPrenom, record.suspectNom].filter(Boolean).join(' ').trim() || record.id;
}

function getDivisionForAuthor(authorPseudo) {
  const user = usersRepo.findByPseudo(authorPseudo);
  const pseudoHRP = user && user.linkedMembre ? user.linkedMembre : authorPseudo;
  const membre = pseudoHRP ? membersRepo.findByPseudoHRP(pseudoHRP) : null;
  return (membre && membre.division ? membre.division : 'Non assignee').trim() || 'Non assignee';
}

function filterReportsByPeriod(reports, startDate, endDate) {
  const startTs = new Date(startDate).getTime();
  const endTs = new Date(endDate).getTime();
  return reports.filter((report) => {
    const timestamp = new Date(report.timestamp).getTime();
    return !Number.isNaN(timestamp) && timestamp >= startTs && timestamp < endTs;
  });
}

function buildPerDaySeries(reports, periodStart, periodEnd) {
  const items = [];
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    const nextDay = new Date(cursor);
    nextDay.setDate(cursor.getDate() + 1);

    const startTs = cursor.getTime();
    const endTs = nextDay.getTime();
    let dayReports = 0;
    let dayIncidents = 0;
    let dayPatrols = 0;
    let dayDelits = 0;

    reports.forEach((report) => {
      const timestamp = new Date(report.timestamp).getTime();
      if (Number.isNaN(timestamp) || timestamp < startTs || timestamp >= endTs) return;
      dayReports += 1;
      if (normalizeReportType(report.reportType) === 'patrol') {
        dayPatrols += 1;
      } else {
        dayIncidents += 1;
        dayDelits += (report.delits || []).length;
      }
    });

    items.push({
      label: cursor.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      reports: dayReports,
      incidents: dayIncidents,
      patrols: dayPatrols,
      delits: dayDelits
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return items;
}

function buildLeaderboard(map, keyName) {
  return Object.keys(map)
    .sort((a, b) => map[b] - map[a])
    .slice(0, 8)
    .map((key) => ({ [keyName]: key, count: map[key] }));
}

function summarize(stats) {
  return {
    totalReports: stats.totalReports,
    totalIncidents: stats.totalIncidents,
    totalPatrols: stats.totalPatrols,
    totalComplaints: stats.totalComplaints,
    totalInvestigations: stats.totalInvestigations,
    totalPoliceAcademies: stats.totalPoliceAcademies,
    dossiersCount: stats.dossiersCount,
    totalPublications: stats.recentPublications.length,
    totalServiceSessions: stats.recentServiceHistory.length
  };
}

function buildDashboardStats(periodStart, periodEnd, options = {}) {
  const reports = reportsRepo.listArrestsWithDelits({
    timestampFrom: new Date(periodStart).toISOString(),
    timestampTo: new Date(periodEnd).toISOString(),
    sort: 'newest'
  });
  const periodReports = filterReportsByPeriod(reports, periodStart, periodEnd);
  const incidents = periodReports.filter((report) => normalizeReportType(report.reportType) === 'incident');
  const patrols = periodReports.filter((report) => normalizeReportType(report.reportType) === 'patrol');
  const incidentDossiers = reportsRepo.buildIncidentDossiers(incidents);

  const byAgent = {};
  const byDelit = {};
  const byDivision = {};

  periodReports.forEach((report) => {
    const agentKey = `${report.agentPrenom} ${report.agentNom}`.trim() || report.author || 'Agent inconnu';
    byAgent[agentKey] = (byAgent[agentKey] || 0) + 1;
    byDivision[getDivisionForAuthor(report.author)] = (byDivision[getDivisionForAuthor(report.author)] || 0) + 1;

    if (normalizeReportType(report.reportType) === 'incident') {
      (report.delits || []).forEach((delit) => {
        const normalizedDelit = normalizeDelitLabel(delit);
        if (!normalizedDelit) return;
        byDelit[normalizedDelit] = (byDelit[normalizedDelit] || 0) + 1;
      });
    }
  });

  const endInclusive = new Date(new Date(periodEnd).getTime() - 1).toISOString();
  const periodComplaintStart = new Date(periodStart).toISOString();
  const periodComplaintEnd = new Date(periodEnd).toISOString();
  const recentComplaints = complaintsRepo.listComplaints({
    dateFrom: periodComplaintStart,
    dateTo: endInclusive,
    sort: 'newest',
    limit: 12
  }).map((complaint) => ({
    id: complaint.id,
    timestamp: complaint.timestamp,
    title: [complaint.accusedPrenom, complaint.accusedNom].filter(Boolean).join(' ').trim() || complaint.id,
    plaintiff: [complaint.plaintiffPrenom, complaint.plaintiffNom].filter(Boolean).join(' ').trim(),
    objet: complaint.objet,
    author: complaint.author
  }));

  const recentPublications = historyRepo.listHistory({
    entityType: 'report',
    dateFrom: new Date(periodStart).toISOString(),
    dateTo: endInclusive,
    limit: 200
  })
    .filter((item) => item.action === 'report_publish' || item.action === 'casier_publish')
    .slice(0, 12)
    .map((item) => ({
      id: item.entityId,
      timestamp: item.timestamp,
      actorPseudo: item.actorPseudo,
      targetLabel: item.targetLabel,
      updateNotice: item.metadata.updateNotice === true,
      reportType: normalizeReportType((item.metadata.record && item.metadata.record.reportType) || 'incident'),
      suspect: item.targetLabel,
      agent: [item.metadata.record && item.metadata.record.agentPrenom, item.metadata.record && item.metadata.record.agentNom]
        .filter(Boolean)
        .join(' ')
        .trim()
    }));

  const latestReports = periodReports
    .slice()
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 12)
    .map((report) => ({
      id: report.id,
      timestamp: report.timestamp,
      reportType: normalizeReportType(report.reportType),
      title: buildReportTargetLabel(report),
      author: report.author,
      agent: [report.agentPrenom, report.agentNom].filter(Boolean).join(' ').trim(),
      graveEvent: !!report.graveEvent
    }));

  const startIso = new Date(periodStart).toISOString();
  const endIso = new Date(periodEnd).toISOString();
  const recentServiceHistory = serviceSessionsRepo.listSessionsBetween(startIso, endIso, 100)
    .slice(0, 12)
    .map((session) => ({
      pseudo: session.pseudo,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      status: session.status,
      durationSeconds: session.durationSeconds
    }));

  const recentInvestigations = investigationsRepo.listInvestigations({
    dateFrom: periodComplaintStart,
    dateTo: endInclusive,
    sort: 'updated',
    limit: 12
  }).map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    assignedAgent: item.assignedAgent,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    updateCount: item.updateCount,
    attachmentCount: item.attachmentCount,
    linkCount: item.linkCount
  }));

  const payload = {
    period: {
      start: new Date(periodStart).toISOString(),
      end: new Date(periodEnd).toISOString(),
      label: formatPeriodLabel(periodStart, periodEnd),
      nextResetAt: options.nextResetAt ? new Date(options.nextResetAt).toISOString() : null,
      generatedAt: new Date().toISOString()
    },
    totalReports: periodReports.length,
    totalIncidents: incidents.length,
    totalPatrols: patrols.length,
    totalComplaints: complaintsRepo.countComplaints({
      startAt: periodComplaintStart,
      endAt: periodComplaintEnd
    }),
    totalInvestigations: investigationsRepo.countInvestigations({
      startAt: periodComplaintStart,
      endAt: periodComplaintEnd
    }),
    dossiersCount: incidentDossiers.length,
    topAgents: buildLeaderboard(byAgent, 'name').slice(0, 5),
    topDelits: buildLeaderboard(byDelit, 'delit').slice(0, 8),
    topComplaintObjects: complaintsRepo.buildTopComplaintObjects(6, {
      startAt: periodComplaintStart,
      endAt: periodComplaintEnd
    }),
    topInvestigationStatuses: investigationsRepo.buildTopStatuses(6, {
      startAt: periodComplaintStart,
      endAt: periodComplaintEnd
    }),
    activityByDivision: buildLeaderboard(byDivision, 'name'),
    recentComplaints,
    recentInvestigations,
    recentPublications,
    latestReports,
    perDay: buildPerDaySeries(periodReports, periodStart, periodEnd),
    complaintSeries: complaintsRepo.buildDailyComplaintSeries(periodStart, periodEnd),
    investigationSeries: investigationsRepo.buildDailyInvestigationSeries(periodStart, periodEnd),
    visitSeries30d: visitMetricsRepo.buildVisitSeries(30, periodEnd ? new Date(periodEnd) : new Date()),
    serviceSeries: serviceSessionsRepo.buildDailyServiceSeriesForRange(periodStart, periodEnd),
    serviceLeaderboard: serviceSessionsRepo.buildServiceLeaderboardForRange(8, startIso, endIso),
    recentServiceHistory,
    resetConfig: stateRepo.getResetConfig()
  };

  payload.summary = summarize(payload);
  return payload;
}

module.exports = {
  buildDashboardStats
};
