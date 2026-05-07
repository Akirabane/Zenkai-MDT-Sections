const db = require('../../../core/db');
const stateRepo = require('./state');
const { resolveDelitLabel } = require('../services/code-penal');
const { finalizePenaltyTotals, getLexique } = require('../services/lexique');

const EFFECTIVE_DATE_SQL = `
  CASE
    WHEN a.date_faits GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]'
      THEN substr(a.date_faits, 7, 4) || '-' || substr(a.date_faits, 4, 2) || '-' || substr(a.date_faits, 1, 2) || 'T00:00:00.000Z'
    WHEN trim(COALESCE(a.date_faits, '')) <> ''
      THEN a.date_faits
    ELSE a.timestamp
  END
`;

function parsePenaltyDetails(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function createEmptyTotals() {
  return {
    avertissements: 0,
    signalements: 0,
    tig: 0,
    detention: 0,
    jugement: 0,
    confiscations: 0,
    celluleMinutes: 0,
    amendeRyo: 0,
    avertEquivalent: 0
  };
}

function mergePenaltyTotals(target, penaltyDetails) {
  const source = penaltyDetails && penaltyDetails.totals ? penaltyDetails.totals : {};
  Object.keys(target).forEach((key) => {
    const value = Number(source[key] || 0);
    if (Number.isFinite(value)) {
      target[key] += value;
    }
  });
  return target;
}

function buildSuspectKey(record) {
  return [
    normalizeText(record.suspectPrenom),
    normalizeText(record.suspectNom)
  ].filter(Boolean).join('|');
}

function formatDossierReference(number) {
  return 'CAS-' + String(number).padStart(4, '0');
}

function formatPatrolReference(number) {
  return 'PAT-' + String(number).padStart(4, '0');
}

function attachDossierReferences(dossiers) {
  const registry = stateRepo.getDossierReferenceRegistry();
  let nextNumber = registry.nextNumber;
  let changed = false;

  dossiers.forEach((dossier) => {
    const key = String(dossier.dossierId || '').trim();
    if (!key) return;
    if (!registry.items[key]) {
      registry.items[key] = formatDossierReference(nextNumber);
      nextNumber += 1;
      changed = true;
    }
    dossier.reference = registry.items[key];
  });

  if (changed) {
    registry.nextNumber = nextNumber;
    stateRepo.saveDossierReferenceRegistry(registry);
  }

  return dossiers;
}

function attachPatrolReferences(records) {
  const registry = stateRepo.getPatrolReferenceRegistry();
  let nextNumber = registry.nextNumber;
  let changed = false;

  records.forEach((record) => {
    if (String(record.reportType || '').toLowerCase() !== 'patrol') return;
    const key = String(record.id || '').trim();
    if (!key) return;
    if (!registry.items[key]) {
      registry.items[key] = formatPatrolReference(nextNumber);
      nextNumber += 1;
      changed = true;
    }
    record.reference = registry.items[key];
  });

  if (changed) {
    registry.nextNumber = nextNumber;
    stateRepo.savePatrolReferenceRegistry(registry);
  }

  return records;
}

function attachDossierInvestigationLinks(dossiers) {
  if (!Array.isArray(dossiers) || dossiers.length === 0) {
    return dossiers;
  }

  const dossierIds = dossiers
    .map((dossier) => String(dossier.dossierId || '').trim())
    .filter(Boolean);

  if (!dossierIds.length) {
    return dossiers;
  }

  const placeholders = dossierIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT
      il.linked_id AS dossier_id,
      i.id AS investigation_id,
      i.title AS investigation_title,
      i.status AS investigation_status,
      i.updated_at AS investigation_updated_at,
      i.created_at AS investigation_created_at
    FROM investigation_links il
    INNER JOIN investigations i ON i.id = il.investigation_id
    WHERE il.link_type = 'dossier'
      AND il.linked_id IN (${placeholders})
    ORDER BY i.updated_at DESC, i.created_at DESC, i.id DESC
  `).all(...dossierIds);

  const grouped = new Map();
  rows.forEach((row) => {
    const key = String(row.dossier_id || '').trim();
    const investigationId = String(row.investigation_id || '').trim();
    if (!key || !investigationId) return;
    if (!grouped.has(key)) {
      grouped.set(key, new Map());
    }
    const byInvestigation = grouped.get(key);
    if (!byInvestigation.has(investigationId)) {
      byInvestigation.set(investigationId, {
        id: investigationId,
        title: row.investigation_title || '',
        status: row.investigation_status || '',
        updatedAt: row.investigation_updated_at || row.investigation_created_at || ''
      });
    }
  });

  dossiers.forEach((dossier) => {
    const byInvestigation = grouped.get(String(dossier.dossierId || '').trim());
    const investigationLinks = byInvestigation ? Array.from(byInvestigation.values()) : [];
    dossier.investigationLinks = investigationLinks;
    dossier.investigationCount = investigationLinks.length;
  });

  return dossiers;
}

function mapRow(row) {
  return {
    id: row.id,
    reference: '',
    timestamp: row.timestamp,
    author: row.author,
    reportType: row.report_type || 'incident',
    suspectNom: row.suspect_nom || '',
    suspectPrenom: row.suspect_prenom || '',
    suspectGrade: row.suspect_grade || '',
    suspectPhoto: row.suspect_photo || '',
    agentNom: row.agent_nom || '',
    agentPrenom: row.agent_prenom || '',
    agentGrade: row.agent_grade || '',
    date: row.date_faits || '',
    rapport: row.rapport || '',
    graveEvent: !!row.grave_event,
    graveEventDetails: row.grave_event_details || '',
    peine: row.peine || '',
    peineDetails: parsePenaltyDetails(row.peine_details_json),
    delits: []
  };
}

function createArrest(arrest) {
  const insertArrest = db.prepare(`
    INSERT INTO arrests (
      id, timestamp, author, report_type, suspect_nom, suspect_prenom, suspect_grade,
      suspect_photo, agent_nom, agent_prenom, agent_grade, date_faits, rapport, grave_event, grave_event_details, peine, peine_details_json
    ) VALUES (
      @id, @timestamp, @author, @report_type, @suspect_nom, @suspect_prenom, @suspect_grade,
      @suspect_photo, @agent_nom, @agent_prenom, @agent_grade, @date_faits, @rapport, @grave_event, @grave_event_details, @peine, @peine_details_json
    )
  `);

  const insertDelit = db.prepare(`
    INSERT INTO arrest_delits (arrest_id, position, delit)
    VALUES (@arrest_id, @position, @delit)
  `);

  const transaction = db.transaction((payload) => {
    insertArrest.run({
      id: payload.id,
      timestamp: payload.timestamp,
      author: payload.author,
      report_type: payload.reportType || 'incident',
      suspect_nom: payload.suspectNom,
      suspect_prenom: payload.suspectPrenom,
      suspect_grade: payload.suspectGrade,
      suspect_photo: payload.suspectPhoto || '',
      agent_nom: payload.agentNom,
      agent_prenom: payload.agentPrenom,
      agent_grade: payload.agentGrade,
      date_faits: payload.date,
      rapport: payload.rapport,
      grave_event: payload.graveEvent ? 1 : 0,
      grave_event_details: payload.graveEventDetails || '',
      peine: payload.peine,
      peine_details_json: JSON.stringify(payload.peineDetails || {})
    });

    payload.delits.forEach((delit, index) => {
      insertDelit.run({
        arrest_id: payload.id,
        position: index,
        delit
      });
    });
  });

  transaction(arrest);
}

function findArrestById(arrestId) {
  const codePenal = stateRepo.getCodePenal();
  const rows = db.prepare(`
    SELECT
      a.*,
      d.delit AS delit,
      d.position AS delit_position
    FROM arrests a
    LEFT JOIN arrest_delits d ON d.arrest_id = a.id
    WHERE a.id = ?
    ORDER BY d.position ASC
  `).all(arrestId);

  if (!rows.length) return null;

  const arrest = mapRow(rows[0]);
  for (const row of rows) {
    if (row.delit) {
      arrest.delits.push(resolveDelitLabel(codePenal, row.delit));
    }
  }

  return arrest;
}

function updateArrest(arrestId, arrest) {
  const updateArrestStatement = db.prepare(`
    UPDATE arrests
    SET
      report_type = @report_type,
      suspect_nom = @suspect_nom,
      suspect_prenom = @suspect_prenom,
      suspect_grade = @suspect_grade,
      suspect_photo = @suspect_photo,
      agent_nom = @agent_nom,
      agent_prenom = @agent_prenom,
      agent_grade = @agent_grade,
      date_faits = @date_faits,
      rapport = @rapport,
      grave_event = @grave_event,
      grave_event_details = @grave_event_details,
      peine = @peine,
      peine_details_json = @peine_details_json
    WHERE id = @id
  `);

  const deleteDelits = db.prepare('DELETE FROM arrest_delits WHERE arrest_id = ?');
  const insertDelit = db.prepare(`
    INSERT INTO arrest_delits (arrest_id, position, delit)
    VALUES (@arrest_id, @position, @delit)
  `);

  const transaction = db.transaction((payload) => {
    updateArrestStatement.run({
      id: arrestId,
      report_type: payload.reportType || 'incident',
      suspect_nom: payload.suspectNom,
      suspect_prenom: payload.suspectPrenom,
      suspect_grade: payload.suspectGrade,
      suspect_photo: payload.suspectPhoto || '',
      agent_nom: payload.agentNom,
      agent_prenom: payload.agentPrenom,
      agent_grade: payload.agentGrade,
      date_faits: payload.date,
      rapport: payload.rapport,
      grave_event: payload.graveEvent ? 1 : 0,
      grave_event_details: payload.graveEventDetails || '',
      peine: payload.peine,
      peine_details_json: JSON.stringify(payload.peineDetails || {})
    });

    deleteDelits.run(arrestId);
    payload.delits.forEach((delit, index) => {
      insertDelit.run({
        arrest_id: arrestId,
        position: index,
        delit
      });
    });
  });

  transaction(arrest);
  return findArrestById(arrestId);
}

function deleteArrest(arrestId) {
  return db.prepare('DELETE FROM arrests WHERE id = ?').run(arrestId);
}

function listArrestIds(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.reportType) {
    clauses.push('a.report_type = @reportType');
    params.reportType = filters.reportType;
  }

  if (filters.q) {
    clauses.push(`
      (
        LOWER(
          COALESCE(a.id, '') || ' ' ||
          COALESCE(a.report_type, '') || ' ' ||
          COALESCE(a.author, '') || ' ' ||
          COALESCE(a.suspect_nom, '') || ' ' ||
          COALESCE(a.suspect_prenom, '') || ' ' ||
          COALESCE(a.suspect_grade, '') || ' ' ||
          COALESCE(a.agent_nom, '') || ' ' ||
          COALESCE(a.agent_prenom, '') || ' ' ||
          COALESCE(a.agent_grade, '') || ' ' ||
          COALESCE(a.date_faits, '') || ' ' ||
          COALESCE(a.rapport, '') || ' ' ||
          COALESCE(a.peine, '') || ' ' ||
          COALESCE(a.grave_event_details, '')
        ) LIKE @q
        OR LOWER(COALESCE(d.delit, '')) LIKE @q
      )
    `);
    params.q = `%${String(filters.q).trim().toLowerCase()}%`;
  }

  if (filters.author) {
    clauses.push('LOWER(COALESCE(a.author, \'\')) LIKE @author');
    params.author = `%${String(filters.author).trim().toLowerCase()}%`;
  }

  if (filters.suspect) {
    clauses.push('LOWER(COALESCE(a.suspect_prenom, \'\') || \' \' || COALESCE(a.suspect_nom, \'\')) LIKE @suspect');
    params.suspect = `%${String(filters.suspect).trim().toLowerCase()}%`;
  }

  if (filters.grade) {
    clauses.push('LOWER(COALESCE(a.suspect_grade, \'\')) LIKE @grade');
    params.grade = `%${String(filters.grade).trim().toLowerCase()}%`;
  }

  if (filters.delit) {
    clauses.push('LOWER(COALESCE(d.delit, \'\')) LIKE @delit');
    params.delit = `%${String(filters.delit).trim().toLowerCase()}%`;
  }

  if (filters.dateFrom) {
    clauses.push(`${EFFECTIVE_DATE_SQL} >= @dateFrom`);
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    clauses.push(`${EFFECTIVE_DATE_SQL} <= @dateTo`);
    params.dateTo = filters.dateTo;
  }

  if (filters.timestampFrom) {
    clauses.push('a.timestamp >= @timestampFrom');
    params.timestampFrom = filters.timestampFrom;
  }

  if (filters.timestampTo) {
    clauses.push('a.timestamp < @timestampTo');
    params.timestampTo = filters.timestampTo;
  }

  const sort = String(filters.sort || 'newest').trim().toLowerCase();
  let orderBy = `${EFFECTIVE_DATE_SQL} DESC, a.timestamp DESC, a.id DESC`;

  if (sort === 'oldest') {
    orderBy = `${EFFECTIVE_DATE_SQL} ASC, a.timestamp ASC, a.id ASC`;
  } else if (sort === 'suspect') {
    orderBy = `LOWER(COALESCE(a.suspect_prenom, '') || ' ' || COALESCE(a.suspect_nom, '')) ASC, a.timestamp DESC, a.id DESC`;
  } else if (sort === 'author') {
    orderBy = `LOWER(COALESCE(a.author, '')) ASC, a.timestamp DESC, a.id DESC`;
  } else if (sort === 'type') {
    orderBy = `LOWER(COALESCE(a.report_type, 'incident')) ASC, a.timestamp DESC, a.id DESC`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return db.prepare(`
    SELECT DISTINCT a.id
    FROM arrests a
    LEFT JOIN arrest_delits d ON d.arrest_id = a.id
    ${where}
    ORDER BY ${orderBy}
  `).all(params).map((row) => row.id);
}

function fetchArrestsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  const codePenal = stateRepo.getCodePenal();

  const placeholders = ids.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT
      a.*,
      d.delit AS delit,
      d.position AS delit_position
    FROM arrests a
    LEFT JOIN arrest_delits d ON d.arrest_id = a.id
    WHERE a.id IN (${placeholders})
    ORDER BY a.timestamp ASC, d.position ASC
  `).all(...ids);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, mapRow(row));
    }

    if (row.delit) {
      map.get(row.id).delits.push(resolveDelitLabel(codePenal, row.delit));
    }
  }

  return attachPatrolReferences(ids.map((id) => map.get(id)).filter(Boolean));
}

function listArrestsWithDelits(filters = {}) {
  return fetchArrestsByIds(listArrestIds(filters));
}

function buildIncidentDossiers(sourceRecords) {
  const records = Array.isArray(sourceRecords) ? sourceRecords : listArrestsWithDelits();
  const dossiers = new Map();
  const lexique = getLexique(stateRepo.getCodePenal());

  records
    .filter((record) => String(record.reportType || '').toLowerCase() === 'incident')
    .forEach((record) => {
      const key = buildSuspectKey(record) || `incident:${record.id}`;
      if (!dossiers.has(key)) {
        dossiers.set(key, {
          dossierId: key,
          suspectNom: record.suspectNom || '',
          suspectPrenom: record.suspectPrenom || '',
          suspectGrade: record.suspectGrade || '',
          suspectPhoto: record.suspectPhoto || '',
          latestTimestamp: record.timestamp,
          reportCount: 0,
          totals: createEmptyTotals(),
          reports: []
        });
      }

      const dossier = dossiers.get(key);
      dossier.reportCount += 1;
      dossier.reports.push(record);
      mergePenaltyTotals(dossier.totals, record.peineDetails);

      if (!dossier.suspectPhoto && record.suspectPhoto) {
        dossier.suspectPhoto = record.suspectPhoto;
      }
      if (record.suspectGrade) {
        dossier.suspectGrade = record.suspectGrade;
      }
      if (new Date(record.timestamp).getTime() > new Date(dossier.latestTimestamp).getTime()) {
        dossier.latestTimestamp = record.timestamp;
      }
    });

  return attachDossierInvestigationLinks(
    attachDossierReferences(Array.from(dossiers.values())
      .map((dossier) => ({
        ...dossier,
        totals: finalizePenaltyTotals(dossier.totals, lexique),
        reports: dossier.reports
          .slice()
          .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      }))
      .sort((left, right) => new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime()))
  );
}

function findIncidentDossierById(dossierId) {
  return buildIncidentDossiers().find((dossier) => dossier.dossierId === dossierId) || null;
}

function deleteIncidentDossier(dossierId) {
  const dossier = findIncidentDossierById(dossierId);
  if (!dossier) return { deletedReports: 0, dossier: null };

  const deleteStatement = db.prepare('DELETE FROM arrests WHERE id = ?');
  const transaction = db.transaction((reports) => {
    reports.forEach((report) => deleteStatement.run(report.id));
  });

  transaction(dossier.reports || []);
  return {
    deletedReports: (dossier.reports || []).length,
    dossier
  };
}

function getIncidentTotalsForSuspect(suspectNom, suspectPrenom, options = {}) {
  const totals = createEmptyTotals();
  const lexique = getLexique(stateRepo.getCodePenal());
  const clauses = [
    `a.report_type = 'incident'`,
    'normalize_lookup(a.suspect_nom) = normalize_lookup(@suspectNom)',
    'normalize_lookup(a.suspect_prenom) = normalize_lookup(@suspectPrenom)'
  ];
  const params = {
    suspectNom,
    suspectPrenom
  };

  if (options.excludeReportId) {
    clauses.push('a.id <> @excludedId');
    params.excludedId = options.excludeReportId;
  }

  const rows = db.prepare(`
    SELECT a.peine_details_json
    FROM arrests a
    WHERE ${clauses.join(' AND ')}
  `).all(params);

  rows
    .map((row) => parsePenaltyDetails(row.peine_details_json))
    .forEach((details) => mergePenaltyTotals(totals, details));

  return finalizePenaltyTotals(totals, lexique);
}

function countArrests() {
  return db.prepare('SELECT COUNT(*) AS total FROM arrests').get().total;
}

module.exports = {
  buildIncidentDossiers,
  countArrests,
  createArrest,
  deleteArrest,
  deleteIncidentDossier,
  findArrestById,
  findIncidentDossierById,
  getIncidentTotalsForSuspect,
  listArrestsWithDelits,
  mergePenaltyTotals,
  updateArrest
};
