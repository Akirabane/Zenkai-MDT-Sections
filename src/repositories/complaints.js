const db = require('../db');
const stateRepo = require('./state');
const membersRepo = require('./membres');
const { normalizeText } = require('../utils/normalize');

function mapRow(row) {
  return {
    id: row.id,
    timestamp: row.timestamp,
    author: row.author,
    officerNom: row.officer_nom,
    officerPrenom: row.officer_prenom,
    officerGradeSection: row.officer_grade_section,
    plaintiffNom: row.plaintiff_nom,
    plaintiffPrenom: row.plaintiff_prenom,
    plaintiffGrade: row.plaintiff_grade,
    accusedNom: row.accused_nom || '',
    accusedPrenom: row.accused_prenom || '',
    date: row.date_faits,
    objet: row.objet,
    body: row.body,
    updatedAt: row.updated_at || null
  };
}

function buildComplaintFullName(record) {
  return [record && record.accusedPrenom, record && record.accusedNom].filter(Boolean).join(' ').trim();
}

function buildDossierFullName(dossier) {
  return [dossier && dossier.suspectPrenom, dossier && dossier.suspectNom].filter(Boolean).join(' ').trim();
}

function levenshteinDistance(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const length = Math.max(a.length, b.length);
  if (!length) return 1;
  return Math.max(0, 1 - (levenshteinDistance(a, b) / length));
}

function computeComplaintDossierScore(complaint, dossier) {
  const accusedNom = normalizeText(complaint && complaint.accusedNom);
  const accusedPrenom = normalizeText(complaint && complaint.accusedPrenom);
  const suspectNom = normalizeText(dossier && dossier.suspectNom);
  const suspectPrenom = normalizeText(dossier && dossier.suspectPrenom);

  const directNom = similarityScore(accusedNom, suspectNom);
  const directPrenom = similarityScore(accusedPrenom, suspectPrenom);
  const swappedNom = similarityScore(accusedNom, suspectPrenom);
  const swappedPrenom = similarityScore(accusedPrenom, suspectNom);
  const fullDirect = similarityScore(buildComplaintFullName(complaint), buildDossierFullName(dossier));
  const fullSwapped = similarityScore(
    buildComplaintFullName(complaint),
    [dossier && dossier.suspectNom, dossier && dossier.suspectPrenom].filter(Boolean).join(' ').trim()
  );

  const directPair = (directNom * 0.58) + (directPrenom * 0.42);
  const swappedPair = (swappedNom * 0.58) + (swappedPrenom * 0.42);
  return Math.max(directPair, fullDirect, fullSwapped * 0.97, swappedPair * 0.94);
}

function matchComplaintToDossier(complaint, dossiers, options = {}) {
  const threshold = Number.isFinite(Number(options.threshold)) ? Number(options.threshold) : 0.82;
  const ambiguityGap = Number.isFinite(Number(options.ambiguityGap)) ? Number(options.ambiguityGap) : 0.04;
  const availableDossiers = Array.isArray(dossiers) ? dossiers : [];
  if (!availableDossiers.length) return null;

  const ranked = availableDossiers.map((dossier) => ({
    dossier,
    score: computeComplaintDossierScore(complaint, dossier)
  })).sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score < threshold) return null;

  const second = ranked[1];
  if (second && (best.score - second.score) < ambiguityGap && best.score < 0.98) {
    return null;
  }

  return {
    dossierId: best.dossier.dossierId,
    dossierName: buildDossierFullName(best.dossier) || best.dossier.dossierId,
    matchScore: Number(best.score.toFixed(3))
  };
}

function attachComplaintLinks(items, dossiers, options = {}) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const linked = matchComplaintToDossier(item, dossiers, options);
    return {
      ...item,
      linkedDossierId: linked ? linked.dossierId : null,
      linkedDossierName: linked ? linked.dossierName : null,
      linkedDossierMatchScore: linked ? linked.matchScore : null
    };
  });
}

function buildComplaintHistoryEntry(item) {
  return {
    type: 'complaint',
    id: item.id,
    timestamp: item.timestamp,
    body: item.body,
    objet: item.objet,
    date: item.date,
    plaintiffNom: item.plaintiffNom,
    plaintiffPrenom: item.plaintiffPrenom,
    plaintiffGrade: item.plaintiffGrade,
    accusedNom: item.accusedNom,
    accusedPrenom: item.accusedPrenom,
    officerNom: item.officerNom,
    officerPrenom: item.officerPrenom,
    officerGradeSection: item.officerGradeSection,
    linkedDossierId: item.linkedDossierId,
    linkedDossierName: item.linkedDossierName,
    linkedDossierMatchScore: item.linkedDossierMatchScore
  };
}

function attachComplaintsToDossiers(dossiers, complaints, options = {}) {
  const linkedComplaints = attachComplaintLinks(complaints, dossiers, options);
  const complaintMap = new Map();

  linkedComplaints.forEach((item) => {
    if (!item.linkedDossierId) return;
    if (!complaintMap.has(item.linkedDossierId)) {
      complaintMap.set(item.linkedDossierId, []);
    }
    complaintMap.get(item.linkedDossierId).push(item);
  });

  return (Array.isArray(dossiers) ? dossiers : []).map((dossier) => {
    const dossierComplaints = (complaintMap.get(dossier.dossierId) || [])
      .slice()
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
    const dossierHistory = []
      .concat((dossier.reports || []).map((record) => ({ ...record, type: 'report' })))
      .concat(dossierComplaints.map(buildComplaintHistoryEntry))
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

    return {
      ...dossier,
      complaintCount: dossierComplaints.length,
      complaints: dossierComplaints,
      history: dossierHistory
    };
  });
}

function buildComplaintId() {
  return 'plainte-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function createComplaint(input) {
  const id = input.id || buildComplaintId();
  const timestamp = input.timestamp || new Date().toISOString();

  db.prepare(`
    INSERT INTO complaints (
      id, timestamp, author, officer_nom, officer_prenom, officer_grade_section,
      plaintiff_nom, plaintiff_prenom, plaintiff_grade, accused_nom, accused_prenom, date_faits, objet, body, updated_at
    ) VALUES (
      @id, @timestamp, @author, @officer_nom, @officer_prenom, @officer_grade_section,
      @plaintiff_nom, @plaintiff_prenom, @plaintiff_grade, @accused_nom, @accused_prenom, @date_faits, @objet, @body, @updated_at
    )
  `).run({
    id,
    timestamp,
    author: input.author,
    officer_nom: input.officerNom,
    officer_prenom: input.officerPrenom,
    officer_grade_section: input.officerGradeSection,
    plaintiff_nom: input.plaintiffNom,
    plaintiff_prenom: input.plaintiffPrenom,
    plaintiff_grade: input.plaintiffGrade,
    accused_nom: input.accusedNom,
    accused_prenom: input.accusedPrenom,
    date_faits: input.date,
    objet: input.objet,
    body: input.body,
    updated_at: null
  });

  return findComplaintById(id);
}

function findComplaintById(id) {
  const row = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
  return row ? mapRow(row) : null;
}

function listComplaints(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.q) {
    clauses.push(`
      LOWER(
        COALESCE(plaintiff_nom, '') || ' ' ||
        COALESCE(plaintiff_prenom, '') || ' ' ||
        COALESCE(accused_nom, '') || ' ' ||
        COALESCE(accused_prenom, '') || ' ' ||
        COALESCE(officer_nom, '') || ' ' ||
        COALESCE(officer_prenom, '') || ' ' ||
        COALESCE(objet, '') || ' ' ||
        COALESCE(body, '') || ' ' ||
        COALESCE(author, '')
      ) LIKE @q
    `);
    params.q = `%${String(filters.q).trim().toLowerCase()}%`;
  }

  if (filters.objet) {
    clauses.push('LOWER(COALESCE(objet, \'\')) = @objet');
    params.objet = String(filters.objet).trim().toLowerCase();
  }

  if (filters.author) {
    clauses.push('LOWER(COALESCE(author, \'\')) LIKE @author');
    params.author = `%${String(filters.author).trim().toLowerCase()}%`;
  }

  if (filters.plaintiff) {
    clauses.push('LOWER(COALESCE(plaintiff_prenom, \'\') || \' \' || COALESCE(plaintiff_nom, \'\')) LIKE @plaintiff');
    params.plaintiff = `%${String(filters.plaintiff).trim().toLowerCase()}%`;
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
  const sort = String(filters.sort || 'newest').trim().toLowerCase();
  const orderBy = sort === 'oldest' ? 'ORDER BY timestamp ASC, id ASC' : 'ORDER BY timestamp DESC, id DESC';
  const limit = Number.isFinite(Number(filters.limit)) ? Math.max(1, Math.min(500, Number(filters.limit))) : 250;

  return db.prepare(`
    SELECT *
    FROM complaints
    ${where}
    ${orderBy}
    LIMIT ${limit}
  `).all(params).map(mapRow);
}

function updateComplaintBody(id, body) {
  const updatedAt = new Date().toISOString();
  const result = db.prepare(`
    UPDATE complaints
    SET body = @body, updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    body,
    updatedAt
  });

  return result.changes ? findComplaintById(id) : null;
}

function deleteComplaint(id) {
  return db.prepare('DELETE FROM complaints WHERE id = ?').run(id);
}

function countComplaints(options = {}) {
  const clauses = [];
  const params = {};

  if (options.startAt) {
    clauses.push('timestamp >= @startAt');
    params.startAt = options.startAt;
  }

  if (options.endAt) {
    clauses.push('timestamp < @endAt');
    params.endAt = options.endAt;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = db.prepare(`SELECT COUNT(*) AS total FROM complaints ${where}`).get(params);
  return Number(row && row.total) || 0;
}

function buildDailyComplaintSeries(periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const items = [];
  const bucketMap = new Map();
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = {
      key,
      label: cursor.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      complaints: 0
    };
    items.push(bucket);
    bucketMap.set(key, bucket);
    cursor.setDate(cursor.getDate() + 1);
  }

  const rows = db.prepare(`
    SELECT timestamp
    FROM complaints
    WHERE timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `).all(new Date(periodStart).toISOString(), new Date(periodEnd).toISOString());

  rows.forEach((row) => {
    const key = String(row.timestamp || '').slice(0, 10);
    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.complaints += 1;
    }
  });

  return items;
}

function listRecentComplaints(limit = 8) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 8;
  return db.prepare(`
    SELECT *
    FROM complaints
    ORDER BY timestamp DESC, id DESC
    LIMIT ${safeLimit}
  `).all().map(mapRow);
}

function buildTopComplaintObjects(limit = 6, options = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 6;
  const clauses = [];
  const params = {};

  if (options.startAt) {
    clauses.push('timestamp >= @startAt');
    params.startAt = options.startAt;
  }

  if (options.endAt) {
    clauses.push('timestamp < @endAt');
    params.endAt = options.endAt;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`
    SELECT objet AS name, COUNT(*) AS count
    FROM complaints
    ${where}
    GROUP BY objet
    ORDER BY count DESC, LOWER(objet) ASC
    LIMIT ${safeLimit}
  `).all(params).map((row) => ({
    name: row.name,
    count: Number(row.count) || 0
  }));
}

function listComplaintObjects() {
  const codePenal = stateRepo.getCodePenal() || {};
  return (Array.isArray(codePenal.sections) ? codePenal.sections : [])
    .map((section) => String(section && section.title || '').trim())
    .filter(Boolean);
}

function getOfficerProfileForUser(user) {
  const pseudoHRP = (user && user.linkedMembre) || (user && user.pseudo) || '';
  const membre = pseudoHRP ? membersRepo.findByPseudoHRP(pseudoHRP) : null;
  const nomRP = String(membre && membre.nomRP || '').trim();
  const parts = nomRP.split(/\s+/).filter(Boolean);

  return {
    officerNom: parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || user.pseudo || ''),
    officerPrenom: parts.length > 1 ? parts[0] : '',
    officerGradeSection: String(membre && membre.rang || '').trim() || String(membre && membre.grade || '').trim() || ''
  };
}

function buildAccusedKey(nom, prenom) {
  return `${String(nom || '').toLowerCase().trim()}|${String(prenom || '').toLowerCase().trim()}`;
}

function findComplaintDiscordThread(accusedNom, accusedPrenom) {
  const key = buildAccusedKey(accusedNom, accusedPrenom);
  const row = db.prepare('SELECT thread_id FROM complaint_discord_threads WHERE accused_key = ?').get(key);
  return row ? row.thread_id : null;
}

function saveComplaintDiscordThread(accusedNom, accusedPrenom, threadId) {
  const key = buildAccusedKey(accusedNom, accusedPrenom);
  db.prepare(`
    INSERT INTO complaint_discord_threads (accused_key, thread_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(accused_key) DO UPDATE SET
      thread_id = excluded.thread_id,
      updated_at = excluded.updated_at
  `).run(key, threadId, new Date().toISOString());
}

module.exports = {
  attachComplaintLinks,
  attachComplaintsToDossiers,
  buildComplaintId,
  buildComplaintFullName,
  buildDailyComplaintSeries,
  buildTopComplaintObjects,
  computeComplaintDossierScore,
  countComplaints,
  createComplaint,
  deleteComplaint,
  findComplaintById,
  findComplaintDiscordThread,
  getOfficerProfileForUser,
  listComplaintObjects,
  listComplaints,
  listRecentComplaints,
  matchComplaintToDossier,
  saveComplaintDiscordThread,
  updateComplaintBody
};
