const express = require('express');

const env = require('../config/env');
const { authRequired } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const logger = require('../utils/logger');
const reportsRepo = require('../repositories/arrests');
const complaintsRepo = require('../repositories/complaints');
const historyRepo = require('../repositories/history');
const stateRepo = require('../repositories/state');
const membersRepo = require('../repositories/membres');
const usersRepo = require('../repositories/users');
const statsHistoryRepo = require('../repositories/statsHistory');
const { buildArrestId } = require('../services/auth');
const { publishCasierToDiscord, resolveAgentIdentity } = require('../services/casier');
const { buildDashboardStats } = require('../services/dashboard-stats');
const { ensureDashboardReset } = require('../services/reset');
const { buildPenaltyDetails, finalizePenaltyTotals, getLexique, getLexiqueRules } = require('../services/lexique');
const {
  canCreateReports,
  canDeleteDossiers,
  canManageCasierRecords,
  canViewCasierRecords,
  canViewCasierStats,
  canViewPatrolReports
} = require('../services/permissions');
const { reportSchema } = require('../validation/schemas');

const router = express.Router();

function parseFrenchDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const fr = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) {
    const date = new Date(`${fr[3]}-${fr[2]}-${fr[1]}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function recordDateValue(record) {
  const factual = parseFrenchDate(record.date);
  if (factual) return factual.getTime();
  const created = new Date(record.timestamp);
  return Number.isNaN(created.getTime()) ? 0 : created.getTime();
}

function normalizeReportType(value) {
  return String(value || '').trim().toLowerCase() === 'patrol' ? 'patrol' : 'incident';
}

function buildReportTargetLabel(record) {
  if (normalizeReportType(record.reportType) === 'patrol') {
    const agent = [record.agentPrenom, record.agentNom].filter(Boolean).join(' ').trim() || record.author || 'Agent inconnu';
    return `Patrouille - ${agent}`;
  }
  return [record.suspectPrenom, record.suspectNom].filter(Boolean).join(' ').trim() || record.id;
}

function buildReportMetadata(record) {
  return {
    reportType: normalizeReportType(record.reportType),
    suspectNom: record.suspectNom || '',
    suspectPrenom: record.suspectPrenom || '',
    suspectGrade: record.suspectGrade || '',
    suspectPhotoProvided: !!(record.suspectPhoto || '').trim(),
    agentNom: record.agentNom || '',
    agentPrenom: record.agentPrenom || '',
    agentGrade: record.agentGrade || '',
    date: record.date || '',
    rapport: record.rapport || '',
    delits: Array.isArray(record.delits) ? record.delits.slice() : [],
    peine: record.peine || '',
    peineDetails: record.peineDetails || {},
    graveEvent: !!record.graveEvent,
    graveEventDetails: record.graveEventDetails || '',
    author: record.author || ''
  };
}

function getDivisionForAuthor(authorPseudo) {
  const user = usersRepo.findByPseudo(authorPseudo);
  const pseudoHRP = user && user.linkedMembre ? user.linkedMembre : authorPseudo;
  const membre = pseudoHRP ? membersRepo.findByPseudoHRP(pseudoHRP) : null;
  return (membre && membre.division ? membre.division : 'Non assignee').trim() || 'Non assignee';
}

function sanitizeSuspectPhoto(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildIncidentPayload(req, agentIdentity, codePenal) {
  const canOverrideAgentIdentity = req.user.permission === 'ADMIN';
  return {
    reportType: 'incident',
    id: buildArrestId(),
    timestamp: new Date().toISOString(),
    author: req.user.pseudo,
    suspectNom: req.body.suspectNom,
    suspectPrenom: req.body.suspectPrenom,
    suspectGrade: req.body.suspectGrade,
    suspectPhoto: sanitizeSuspectPhoto(req.body.suspectPhoto),
    agentNom: canOverrideAgentIdentity ? (req.body.agentNom || agentIdentity.agentNom) : agentIdentity.agentNom,
    agentPrenom: canOverrideAgentIdentity ? (req.body.agentPrenom || agentIdentity.agentPrenom) : agentIdentity.agentPrenom,
    agentGrade: req.body.agentGrade || agentIdentity.agentGrade,
    date: req.body.date,
    rapport: req.body.rapport,
    delits: req.body.delits,
    peine: req.body.peine,
    peineDetails: buildPenaltyDetails(req.body.delits, req.body.peine, codePenal),
    graveEvent: false,
    graveEventDetails: ''
  };
}

function buildPatrolPayload(req, agentIdentity) {
  const canOverrideAgentIdentity = req.user.permission === 'ADMIN';
  return {
    reportType: 'patrol',
    id: buildArrestId(),
    timestamp: new Date().toISOString(),
    author: req.user.pseudo,
    suspectNom: '',
    suspectPrenom: '',
    suspectGrade: '',
    suspectPhoto: '',
    agentNom: canOverrideAgentIdentity ? (req.body.agentNom || agentIdentity.agentNom) : agentIdentity.agentNom,
    agentPrenom: canOverrideAgentIdentity ? (req.body.agentPrenom || agentIdentity.agentPrenom) : agentIdentity.agentPrenom,
    agentGrade: req.body.agentGrade || agentIdentity.agentGrade,
    date: req.body.date,
    rapport: req.body.rapport,
    delits: [],
    peine: '',
    peineDetails: {},
    graveEvent: req.body.graveEvent === true,
    graveEventDetails: req.body.graveEvent === true ? (req.body.graveEventDetails || '') : ''
  };
}

function updatePayloadForExisting(req, existing, codePenal) {
  const canOverrideAgentIdentity = req.user.permission === 'ADMIN';
  const reportType = normalizeReportType(existing.reportType);

  if (reportType === 'patrol') {
    return {
      reportType,
      suspectNom: '',
      suspectPrenom: '',
      suspectGrade: '',
      suspectPhoto: '',
      agentNom: canOverrideAgentIdentity ? (req.body.agentNom || existing.agentNom) : existing.agentNom,
      agentPrenom: canOverrideAgentIdentity ? (req.body.agentPrenom || existing.agentPrenom) : existing.agentPrenom,
      agentGrade: req.body.agentGrade,
      date: req.body.date,
      rapport: req.body.rapport,
      delits: [],
      peine: '',
      peineDetails: {},
      graveEvent: req.body.graveEvent === true,
      graveEventDetails: req.body.graveEvent === true ? (req.body.graveEventDetails || '') : ''
    };
  }

  return {
    reportType,
    suspectNom: req.body.suspectNom,
    suspectPrenom: req.body.suspectPrenom,
    suspectGrade: req.body.suspectGrade,
    suspectPhoto: Object.prototype.hasOwnProperty.call(req.body, 'suspectPhoto')
      ? sanitizeSuspectPhoto(req.body.suspectPhoto)
      : existing.suspectPhoto,
    agentNom: canOverrideAgentIdentity ? (req.body.agentNom || existing.agentNom) : existing.agentNom,
    agentPrenom: canOverrideAgentIdentity ? (req.body.agentPrenom || existing.agentPrenom) : existing.agentPrenom,
    agentGrade: req.body.agentGrade,
    date: req.body.date,
    rapport: req.body.rapport,
    delits: req.body.delits,
    peine: req.body.peine,
    peineDetails: buildPenaltyDetails(req.body.delits, req.body.peine, codePenal),
    graveEvent: false,
    graveEventDetails: ''
  };
}

function buildRecordFilters(query) {
  const dateFrom = parseFrenchDate(query.dateFrom);
  const dateTo = parseFrenchDate(query.dateTo);
  const inclusiveDateTo = dateTo ? new Date(dateTo) : null;
  if (inclusiveDateTo) {
    inclusiveDateTo.setHours(23, 59, 59, 999);
  }

  return {
    q: (query.q || '').trim().toLowerCase(),
    author: (query.author || '').trim().toLowerCase(),
    suspect: (query.suspect || '').trim().toLowerCase(),
    grade: (query.grade || '').trim().toLowerCase(),
    delit: (query.delit || '').trim().toLowerCase(),
    type: normalizeReportType(query.type || ''),
    hasTypeFilter: !!(query.type || '').trim(),
    reportType: (query.type || '').trim() ? normalizeReportType(query.type) : '',
    dateFrom: dateFrom ? dateFrom.toISOString() : '',
    dateTo: inclusiveDateTo ? inclusiveDateTo.toISOString() : '',
    sort: (query.sort || 'newest').trim().toLowerCase()
  };
}

function cloneTotals(totals) {
  return {
    avertissements: Number(totals && totals.avertissements || 0),
    signalements: Number(totals && totals.signalements || 0),
    tig: Number(totals && totals.tig || 0),
    detention: Number(totals && totals.detention || 0),
    jugement: Number(totals && totals.jugement || 0),
    confiscations: Number(totals && totals.confiscations || 0),
    celluleMinutes: Number(totals && totals.celluleMinutes || 0),
    amendeRyo: Number(totals && totals.amendeRyo || 0),
    avertEquivalent: Number(totals && totals.avertEquivalent || 0)
  };
}

function buildSanctionSummary(totals, lexique) {
  const labels = {
    avertissement: ((lexique && lexique.avertissement && lexique.avertissement.label) || 'Avertissement').trim(),
    signalement: ((lexique && lexique.signalement && lexique.signalement.label) || 'Signalement').trim(),
    jugement: ((lexique && lexique.jugement && lexique.jugement.label) || 'Jugement').trim()
  };
  const parts = [];
  if (totals.avertissements > 0) parts.push(`${totals.avertissements} ${labels.avertissement.toLowerCase()}(s)`);
  if (totals.signalements > 0) parts.push(`${totals.signalements} ${labels.signalement.toLowerCase()}(s)`);
  if (totals.celluleMinutes > 0) parts.push(`${totals.celluleMinutes} min cellule`);
  if (totals.tig > 0) parts.push(`${totals.tig} TIG`);
  if (totals.amendeRyo > 0) parts.push(`${totals.amendeRyo} ryo`);
  if (totals.detention > 0) parts.push(`${totals.detention} detention`);
  if (totals.jugement > 0) parts.push(`${totals.jugement} ${labels.jugement.toLowerCase()}(s)`);
  return parts.length ? parts.join(' | ') : 'Aucune sanction cumulee';
}

function formatSuspectFullName(record) {
  return [record.suspectPrenom, record.suspectNom].filter(Boolean).join(' ').trim() || 'Suspect inconnu';
}

function buildPublishSanctionAlert(record, codePenal) {
  if (normalizeReportType(record.reportType) !== 'incident') return null;

  const lexique = getLexique(codePenal);
  const totals = finalizePenaltyTotals(
    reportsRepo.getIncidentTotalsForSuspect(record.suspectNom, record.suspectPrenom),
    lexique
  );
  const rules = getLexiqueRules(lexique);
  const suspect = formatSuspectFullName(record);
  const avertLabel = ((lexique.avertissement || {}).label || 'Avertissement').trim();
  const signalementLabel = ((lexique.signalement || {}).label || 'Signalement').trim();
  const jugementLabel = ((lexique.jugement || {}).label || 'Jugement').trim();
  const messageBase = `${suspect} cumule ${totals.avertissements} ${avertLabel.toLowerCase()}(s)`;

  if (totals.jugement > 0) {
    return {
      message: `${messageBase}, ${totals.signalements} ${signalementLabel.toLowerCase()}(s) et atteint ${totals.jugement} ${jugementLabel.toLowerCase()}(s).`,
      summary: buildSanctionSummary(totals, lexique),
      alert: `Alerte disciplinaire: ${suspect} cumule ${totals.avertissements} ${avertLabel.toLowerCase()}(s), ${totals.signalements} ${signalementLabel.toLowerCase()}(s) et ${totals.jugement} ${jugementLabel.toLowerCase()}(s).`,
      totals,
      thresholds: rules
    };
  }

  if (totals.signalements > 0) {
    return {
      message: `${messageBase} et atteint ${totals.signalements} ${signalementLabel.toLowerCase()}(s).`,
      summary: buildSanctionSummary(totals, lexique),
      alert: `Alerte disciplinaire: ${suspect} est a ${totals.avertissements} ${avertLabel.toLowerCase()}(s) cumules, soit ${totals.signalements} ${signalementLabel.toLowerCase()}(s).`,
      totals,
      thresholds: rules
    };
  }

  if (totals.avertissements > 0) {
    const suffix = rules.propagateEscalationToDossiers
      ? ` Seuil actuel: ${rules.thresholdForSignalement} pour 1 ${signalementLabel.toLowerCase()}.`
      : '';
    return {
      message: `${messageBase}.${suffix}`,
      summary: buildSanctionSummary(totals, lexique),
      alert: `Alerte disciplinaire: ${suspect} est a ${totals.avertissements}${rules.propagateEscalationToDossiers ? '/' + rules.thresholdForSignalement : ''} ${avertLabel.toLowerCase()}(s)${rules.propagateEscalationToDossiers ? ' avant ' + signalementLabel.toLowerCase() : ''}.`,
      totals,
      thresholds: rules
    };
  }

  return null;
}

async function notifySanctionThreshold(record, beforeTotals, afterTotals, codePenal, actorPseudo) {
  if (!env.discordSanctionsWebhookUrl || normalizeReportType(record.reportType) !== 'incident') return;

  const lexique = getLexique(codePenal);
  const beforeSignalements = Number(beforeTotals.signalements || 0);
  const afterSignalements = Number(afterTotals.signalements || 0);
  const beforeJugements = Number(beforeTotals.jugement || 0);
  const afterJugements = Number(afterTotals.jugement || 0);
  const rules = getLexiqueRules(lexique);
  const avertLabel = ((lexique.avertissement || {}).label || 'Avertissement').trim();
  const signalementLabel = ((lexique.signalement || {}).label || 'Signalement').trim();
  const jugementLabel = ((lexique.jugement || {}).label || 'Jugement').trim();

  if (afterSignalements <= beforeSignalements && afterJugements <= beforeJugements) return;

  const suspect = formatSuspectFullName(record);
  const content = [
    '> **==============================**',
    '> **ALERTE SANCTION DISCIPLINAIRE**',
    '> **==============================**',
    `> **Suspect :** ${suspect}`,
    record.suspectGrade ? `> **Grade :** ${record.suspectGrade}` : '> **Grade :** Non renseigne',
    afterJugements > beforeJugements
      ? `> **Nouveau seuil :** ${afterJugements} ${jugementLabel}(s)`
      : `> **Nouveau seuil :** ${afterSignalements} ${signalementLabel}(s)`,
    rules.propagateEscalationToDossiers
      ? `> **Regles :** ${rules.thresholdForSignalement} ${avertLabel.toLowerCase()}(s) = 1 ${signalementLabel.toLowerCase()} | ${rules.thresholdForJugement} ${signalementLabel.toLowerCase()}(s) = 1 ${jugementLabel.toLowerCase()}`
      : '> **Regles :** Propagation automatique des seuils desactivee',
    `> **Resume sanctions :** ${buildSanctionSummary(afterTotals, lexique)}`,
    `> **Dernier rapport :** ${record.id} par ${actorPseudo || record.author || 'inconnu'}`,
    '> **==============================**'
  ].join('\n');

  const response = await fetch(env.discordSanctionsWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Surveillance Sanctions Konoha',
      allowed_mentions: { parse: [] },
      content
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord sanctions webhook HTTP ${response.status}: ${body}`);
  }

  historyRepo.logEvent({
    actorPseudo: actorPseudo || record.author || 'system',
    actorPermission: '',
    action: 'sanction_threshold',
    entityType: 'report',
    entityId: record.id,
    targetLabel: suspect,
    metadata: {
      beforeTotals,
      afterTotals,
      signalements: afterSignalements,
      jugements: afterJugements
    }
  });
}

router.post('/api/v1/casier/save', authRequired, validate(reportSchema), async (req, res) => {
  if (!canCreateReports(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux policiers operationnels et administrateurs' });
  }

  const codePenal = stateRepo.getCodePenal();
  const agentIdentity = resolveAgentIdentity(req.user);
  const reportType = normalizeReportType(req.body.reportType);
  const report = reportType === 'patrol'
    ? buildPatrolPayload(req, agentIdentity)
    : buildIncidentPayload(req, agentIdentity, codePenal);

  const beforeTotals = reportType === 'incident'
    ? cloneTotals(reportsRepo.getIncidentTotalsForSuspect(report.suspectNom, report.suspectPrenom))
    : null;

  reportsRepo.createArrest(report);

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'report_create',
    entityType: 'report',
    entityId: report.id,
    targetLabel: buildReportTargetLabel(report),
    metadata: {
      after: buildReportMetadata(report)
    }
  });

  if (reportType === 'incident') {
    const afterTotals = cloneTotals(reportsRepo.getIncidentTotalsForSuspect(report.suspectNom, report.suspectPrenom));
    try {
      await notifySanctionThreshold(report, beforeTotals, afterTotals, codePenal, req.user.pseudo);
    } catch (error) {
      logger.error('Failed to notify sanction threshold', {
        reportId: report.id,
        author: req.user.pseudo,
        message: error.message
      });
    }
  }

  return res.json({
    success: true,
    arrestId: report.id,
    record: reportsRepo.findArrestById(report.id)
  });
});

router.get('/api/v1/casier/records', authRequired, (req, res) => {
  if (!canViewCasierRecords(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux gradés police, administrateurs et Justice de Konoha' });
  }

  const filters = buildRecordFilters(req.query);
  const records = reportsRepo
    .listArrestsWithDelits(filters)
    .filter((record) => canViewPatrolReports(req.user) || normalizeReportType(record.reportType) !== 'patrol');
  return res.json({ records });
});

router.get('/api/v1/casier/dossiers', authRequired, (req, res) => {
  if (!canViewCasierRecords(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux gradés police, administrateurs et Justice de Konoha' });
  }

  const filters = buildRecordFilters(req.query);
  const filteredRecords = reportsRepo.listArrestsWithDelits(filters);
  const visibleRecords = filteredRecords.filter((record) => (
    canViewPatrolReports(req.user) || normalizeReportType(record.reportType) !== 'patrol'
  ));
  const dossiers = reportsRepo.buildIncidentDossiers(visibleRecords);
  const complaints = complaintsRepo.listComplaints({ limit: 500 });

  return res.json({
    dossiers: complaintsRepo.attachComplaintsToDossiers(dossiers, complaints),
    patrols: visibleRecords.filter((record) => normalizeReportType(record.reportType) === 'patrol')
  });
});

router.put('/api/v1/casier/records/:id', authRequired, validate(reportSchema), async (req, res) => {
  if (!canManageCasierRecords(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux inspecteurs+ police et administrateurs' });
  }

  const existing = reportsRepo.findArrestById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }

  const requestedType = req.body.reportType ? normalizeReportType(req.body.reportType) : normalizeReportType(existing.reportType);
  if (requestedType !== normalizeReportType(existing.reportType)) {
    return res.status(400).json({ error: 'Le type de rapport ne peut pas etre modifie' });
  }

  const codePenal = stateRepo.getCodePenal();
  const payload = updatePayloadForExisting(req, existing, codePenal);
  const beforeTotals = requestedType === 'incident'
    ? cloneTotals(reportsRepo.getIncidentTotalsForSuspect(payload.suspectNom, payload.suspectPrenom, { excludeReportId: existing.id }))
    : null;
  const updated = reportsRepo.updateArrest(req.params.id, payload);

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'report_update',
    entityType: 'report',
    entityId: existing.id,
    targetLabel: buildReportTargetLabel(updated || existing),
    metadata: {
      before: buildReportMetadata(existing),
      after: buildReportMetadata(updated || existing)
    }
  });

  if (requestedType === 'incident' && updated) {
    const afterTotals = cloneTotals(reportsRepo.getIncidentTotalsForSuspect(updated.suspectNom, updated.suspectPrenom));
    try {
      await notifySanctionThreshold(updated, beforeTotals, afterTotals, codePenal, req.user.pseudo);
    } catch (error) {
      logger.error('Failed to notify sanction threshold after report update', {
        reportId: updated.id,
        author: req.user.pseudo,
        message: error.message
      });
    }
  }

  return res.json({ success: true, record: updated });
});

router.delete('/api/v1/casier/records/:id', authRequired, (req, res) => {
  if (!canManageCasierRecords(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux inspecteurs+ police et administrateurs' });
  }

  const existing = reportsRepo.findArrestById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }

  reportsRepo.deleteArrest(req.params.id);
  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'report_delete',
    entityType: 'report',
    entityId: existing.id,
    targetLabel: buildReportTargetLabel(existing),
    metadata: {
      before: buildReportMetadata(existing)
    }
  });
  return res.json({ success: true });
});

router.delete('/api/v1/casier/dossiers/:dossierId', authRequired, (req, res) => {
  if (!canDeleteDossiers(req.user)) {
    return res.status(403).json({ error: 'Suppression complete reservee aux Lieutenants-Jonins, Commandants et administrateurs' });
  }

  const result = reportsRepo.deleteIncidentDossier(req.params.dossierId);
  if (!result.dossier) {
    return res.status(404).json({ error: 'Casier introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dossier_delete',
    entityType: 'dossier',
    entityId: result.dossier.dossierId,
    targetLabel: [result.dossier.suspectPrenom, result.dossier.suspectNom].filter(Boolean).join(' ').trim() || result.dossier.dossierId,
    metadata: {
      deletedReports: result.deletedReports,
      suspectGrade: result.dossier.suspectGrade || '',
      totals: result.dossier.totals || {}
    }
  });

  return res.json({ success: true, deletedReports: result.deletedReports });
});

router.post('/api/v1/casier/publish/:id', authRequired, async (req, res) => {
  if (!canCreateReports(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux policiers operationnels et administrateurs' });
  }

  const record = reportsRepo.findArrestById(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Rapport introuvable' });
  }
  if (normalizeReportType(record.reportType) !== 'incident') {
    return res.status(400).json({ error: 'Seuls les rapports d incident peuvent etre publies sur Discord' });
  }

  const canPublish = record.author === req.user.pseudo || canManageCasierRecords(req.user);
  if (!canPublish) {
    return res.status(403).json({ error: 'Vous ne pouvez publier que vos propres rapports d incident' });
  }

  if (!env.discordCasierWebhookUrl) {
    return res.status(503).json({ error: 'Webhook Discord non configure' });
  }

  try {
    const updateNotice = req.body && req.body.updateNotice === true;
    const sanctionAlert = buildPublishSanctionAlert(record, stateRepo.getCodePenal());
    const result = await publishCasierToDiscord(env.discordCasierWebhookUrl, record, { updateNotice, sanctionAlert });
    logger.info('Incident report published to Discord', {
      reportId: record.id,
      author: req.user.pseudo,
      chunks: result.chunks,
      updateNotice
    });
    historyRepo.logEvent({
      actorPseudo: req.user.pseudo,
      actorPermission: req.user.permission,
      action: 'report_publish',
      entityType: 'report',
      entityId: record.id,
      targetLabel: buildReportTargetLabel(record),
      metadata: {
        updateNotice,
        sanctionAlert,
        chunks: result.chunks,
        usedPlaceholder: result.usedPlaceholder,
        record: buildReportMetadata(record)
      }
    });
    return res.json({ success: true, chunks: result.chunks, sanctionAlert });
  } catch (error) {
    logger.error('Failed to publish incident report to Discord', {
      reportId: record.id,
      author: req.user.pseudo,
      message: error.message
    });
    return res.status(502).json({ error: 'Publication Discord impossible' });
  }
});

router.get('/api/v1/casier/stats/history', authRequired, (req, res) => {
  if (!canViewCasierStats(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux inspecteurs+' });
  }

  return res.json({ snapshots: statsHistoryRepo.listSnapshots(52) });
});

router.get('/api/v1/casier/stats/history/:snapshotId', authRequired, (req, res) => {
  if (!canViewCasierStats(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux inspecteurs+' });
  }

  const snapshot = statsHistoryRepo.getSnapshot(req.params.snapshotId);
  if (!snapshot) {
    return res.status(404).json({ error: 'Archive introuvable' });
  }

  return res.json(snapshot);
});

router.get('/api/v1/casier/stats', authRequired, (req, res) => {
  if (!canViewCasierStats(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux inspecteurs+' });
  }

  const resetState = ensureDashboardReset(new Date());
  return res.json(buildDashboardStats(resetState.periodStart, new Date(), {
    nextResetAt: resetState.nextResetAt
  }));
});

module.exports = router;
