const fs = require('fs');
const path = require('path');

const db = require('../db');
const env = require('../config/env');
const arrestsRepo = require('./arrests');
const complaintsRepo = require('./complaints');
const membersRepo = require('./membres');
const usersRepo = require('./users');
const { normalizeText } = require('../utils/normalize');

const STATUS_OPTIONS = [
  'En cours',
  'En attente de preuves',
  'En surveillance',
  'Transmise a la Justice',
  'Bouclee',
  'Suspendue'
];

const UPDATE_KIND_OPTIONS = [
  'Suivi',
  'Temoignage',
  'Note interne'
];

const LINK_TYPE_LABELS = {
  dossier: 'Dossier / casier',
  complaint: 'Plainte',
  patrol_report: 'Rapport de patrouille'
};

function buildId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function ensureUploadsDir() {
  const target = path.join(env.uploadsDir, 'investigations');
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function resolveAttachmentPath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized) return '';

  // Strip legacy "uploads/" prefix used by old storage
  const strippedLegacyPrefix = normalized.replace(/^uploads\//i, '');
  const uploadsRoot = path.resolve(env.uploadsDir);
  const candidate = path.resolve(env.uploadsDir, strippedLegacyPrefix);

  // Reject paths that escape uploadsDir (path traversal guard)
  if (!candidate.startsWith(uploadsRoot + path.sep) && candidate !== uploadsRoot) {
    return '';
  }

  return candidate;
}

function normalizeAssignedAgents(values) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();

  return source.reduce((items, value) => {
    const trimmed = String(value || '').trim();
    const key = normalizeText(trimmed);
    if (!trimmed || !key || seen.has(key)) {
      return items;
    }
    seen.add(key);
    items.push(trimmed);
    return items;
  }, []);
}

function parseAssignedAgents(row) {
  try {
    const parsed = JSON.parse(row.assigned_agents_json || '[]');
    const values = normalizeAssignedAgents(Array.isArray(parsed) ? parsed : []);
    if (values.length) {
      return values;
    }
  } catch (error) {}

  return normalizeAssignedAgents(row.assigned_agent || '');
}

function stringifyAssignedAgents(values) {
  return JSON.stringify(normalizeAssignedAgents(values));
}

function mapInvestigationRow(row) {
  const assignedAgents = parseAssignedAgents(row);
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assignedAgent: assignedAgents[0] || row.assigned_agent || '',
    assignedAgents,
    author: row.author,
    summary: row.summary || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null
  };
}

function parseMeta(row) {
  try {
    const parsed = JSON.parse(row.linked_meta_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function mapUpdateRow(row) {
  return {
    id: row.id,
    investigationId: row.investigation_id,
    kind: row.kind,
    content: row.content,
    author: row.author,
    createdAt: row.created_at
  };
}

function mapLinkRow(row) {
  return {
    id: row.id,
    investigationId: row.investigation_id,
    linkType: row.link_type,
    linkLabel: LINK_TYPE_LABELS[row.link_type] || row.link_type,
    linkedId: row.linked_id,
    linkedLabel: row.linked_label,
    linkedMeta: parseMeta(row),
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function mapAttachmentRow(row) {
  return {
    id: row.id,
    investigationId: row.investigation_id,
    filename: row.filename,
    mimeType: row.mime_type,
    relativePath: row.relative_path,
    url: `/api/v1/investigations/${encodeURIComponent(row.investigation_id)}/attachments/${encodeURIComponent(row.id)}/file`,
    caption: row.caption || '',
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at
  };
}

function listUpdates(investigationId) {
  return db.prepare(`
    SELECT *
    FROM investigation_updates
    WHERE investigation_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(investigationId).map(mapUpdateRow);
}

function listLinks(investigationId) {
  return db.prepare(`
    SELECT *
    FROM investigation_links
    WHERE investigation_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(investigationId).map(mapLinkRow);
}

function listAttachments(investigationId) {
  return db.prepare(`
    SELECT *
    FROM investigation_attachments
    WHERE investigation_id = ?
    ORDER BY uploaded_at DESC, id DESC
  `).all(investigationId).map(mapAttachmentRow);
}

function findAttachmentById(investigationId, attachmentId) {
  const row = db.prepare(`
    SELECT *
    FROM investigation_attachments
    WHERE investigation_id = ? AND id = ?
    LIMIT 1
  `).get(investigationId, attachmentId);
  return row ? mapAttachmentRow(row) : null;
}

function buildInvestigationPayload(base) {
  if (!base) return null;
  const updates = listUpdates(base.id);
  const links = listLinks(base.id);
  const attachments = listAttachments(base.id);
  return {
    ...base,
    updates,
    links,
    attachments,
    updateCount: updates.length,
    linkCount: links.length,
    attachmentCount: attachments.length
  };
}

function findInvestigationById(id) {
  const row = db.prepare('SELECT * FROM investigations WHERE id = ?').get(id);
  return buildInvestigationPayload(row ? mapInvestigationRow(row) : null);
}

function createInvestigation(input) {
  const id = buildId('enq');
  const now = new Date().toISOString();
  const assignedAgents = normalizeAssignedAgents(input.assignedAgents && input.assignedAgents.length
    ? input.assignedAgents
    : input.assignedAgent || '');
  db.prepare(`
    INSERT INTO investigations (
      id, title, status, assigned_agent, assigned_agents_json, author, summary, created_at, updated_at, closed_at
    ) VALUES (
      @id, @title, @status, @assigned_agent, @assigned_agents_json, @author, @summary, @created_at, @updated_at, @closed_at
    )
  `).run({
    id,
    title: input.title,
    status: input.status || 'En cours',
    assigned_agent: assignedAgents[0] || '',
    assigned_agents_json: stringifyAssignedAgents(assignedAgents),
    author: input.author,
    summary: input.summary || '',
    created_at: now,
    updated_at: now,
    closed_at: input.status === 'Bouclee' ? now : null
  });

  return findInvestigationById(id);
}

function updateInvestigation(id, payload) {
  const existing = db.prepare('SELECT * FROM investigations WHERE id = ?').get(id);
  if (!existing) return null;

  const sets = [];
  const params = { id, updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    sets.push('title = @title');
    params.title = payload.title;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    sets.push('status = @status');
    params.status = payload.status;
    sets.push('closed_at = @closed_at');
    params.closed_at = payload.status === 'Bouclee'
      ? (existing.closed_at || params.updated_at)
      : null;
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, 'assignedAgent') ||
    Object.prototype.hasOwnProperty.call(payload, 'assignedAgents')
  ) {
    const assignedAgents = normalizeAssignedAgents(
      Object.prototype.hasOwnProperty.call(payload, 'assignedAgents')
        ? payload.assignedAgents
        : payload.assignedAgent
    );
    sets.push('assigned_agent = @assigned_agent');
    sets.push('assigned_agents_json = @assigned_agents_json');
    params.assigned_agent = assignedAgents[0] || '';
    params.assigned_agents_json = stringifyAssignedAgents(assignedAgents);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'summary')) {
    sets.push('summary = @summary');
    params.summary = payload.summary || '';
  }

  if (!sets.length) {
    return findInvestigationById(id);
  }

  sets.push('updated_at = @updated_at');
  db.prepare(`UPDATE investigations SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return findInvestigationById(id);
}

function deleteAttachmentFile(relativePath) {
  if (!relativePath) return;
  const absolutePath = resolveAttachmentPath(relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function deleteInvestigation(id) {
  const existing = findInvestigationById(id);
  if (!existing) return null;

  (existing.attachments || []).forEach((attachment) => {
    try {
      deleteAttachmentFile(attachment.relativePath);
    } catch (error) {}
  });

  db.prepare('DELETE FROM investigations WHERE id = ?').run(id);
  return existing;
}

function addUpdate(investigationId, payload) {
  const id = buildId('enq-note');
  const now = payload.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO investigation_updates (
      id, investigation_id, kind, content, author, created_at
    ) VALUES (
      @id, @investigation_id, @kind, @content, @author, @created_at
    )
  `).run({
    id,
    investigation_id: investigationId,
    kind: payload.kind,
    content: payload.content,
    author: payload.author,
    created_at: now
  });
  db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').run(now, investigationId);
  return listUpdates(investigationId)[0] || null;
}

function addLink(investigationId, payload) {
  const id = buildId('enq-link');
  const now = payload.createdAt || new Date().toISOString();
  const metaJson = JSON.stringify(payload.linkedMeta || {});

  const existing = db.prepare(`
    SELECT id
    FROM investigation_links
    WHERE investigation_id = ? AND link_type = ? AND linked_id = ?
    LIMIT 1
  `).get(investigationId, payload.linkType, payload.linkedId);
  if (existing) {
    return listLinks(investigationId).find((item) => item.id === existing.id) || null;
  }

  db.prepare(`
    INSERT INTO investigation_links (
      id, investigation_id, link_type, linked_id, linked_label, linked_meta_json, created_by, created_at
    ) VALUES (
      @id, @investigation_id, @link_type, @linked_id, @linked_label, @linked_meta_json, @created_by, @created_at
    )
  `).run({
    id,
    investigation_id: investigationId,
    link_type: payload.linkType,
    linked_id: payload.linkedId,
    linked_label: payload.linkedLabel,
    linked_meta_json: metaJson,
    created_by: payload.createdBy,
    created_at: now
  });
  db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').run(now, investigationId);
  return listLinks(investigationId).find((item) => item.id === id) || null;
}

function removeLink(investigationId, linkId) {
  const existing = db.prepare('SELECT * FROM investigation_links WHERE id = ? AND investigation_id = ?').get(linkId, investigationId);
  if (!existing) return null;
  db.prepare('DELETE FROM investigation_links WHERE id = ? AND investigation_id = ?').run(linkId, investigationId);
  db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), investigationId);
  return mapLinkRow(existing);
}

function extFromMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function saveAttachment(investigationId, payload) {
  ensureUploadsDir();
  const id = buildId('enq-file');
  const uploadedAt = payload.uploadedAt || new Date().toISOString();
  const extension = extFromMime(payload.mimeType);
  const investigationDir = path.join(env.uploadsDir, 'investigations', investigationId);
  fs.mkdirSync(investigationDir, { recursive: true });

  let buffer = null;
  if (Buffer.isBuffer(payload.buffer)) {
    buffer = payload.buffer;
  } else {
    const raw = String(payload.dataUrl || '').split(',')[1] || '';
    buffer = Buffer.from(raw, 'base64');
  }
  const safeBase = String(payload.filename || 'piece-jointe')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'piece-jointe';
  const fileName = `${safeBase}.${extension}`.replace(/\.(png|jpg|webp)\.(png|jpg|webp)$/i, '.$1');
  const absolutePath = path.join(investigationDir, `${id}-${fileName}`);
  fs.writeFileSync(absolutePath, buffer);

  const relativePath = path.relative(env.uploadsDir, absolutePath).replace(/\\/g, '/');
  db.prepare(`
    INSERT INTO investigation_attachments (
      id, investigation_id, filename, mime_type, relative_path, caption, uploaded_by, uploaded_at
    ) VALUES (
      @id, @investigation_id, @filename, @mime_type, @relative_path, @caption, @uploaded_by, @uploaded_at
    )
  `).run({
    id,
    investigation_id: investigationId,
    filename: fileName,
    mime_type: payload.mimeType,
    relative_path: relativePath,
    caption: payload.caption || '',
    uploaded_by: payload.uploadedBy,
    uploaded_at: uploadedAt
  });
  db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').run(uploadedAt, investigationId);
  return listAttachments(investigationId).find((item) => item.id === id) || null;
}

function removeAttachment(investigationId, attachmentId) {
  const existing = db.prepare('SELECT * FROM investigation_attachments WHERE id = ? AND investigation_id = ?').get(attachmentId, investigationId);
  if (!existing) return null;
  try {
    deleteAttachmentFile(existing.relative_path);
  } catch (error) {}
  db.prepare('DELETE FROM investigation_attachments WHERE id = ? AND investigation_id = ?').run(attachmentId, investigationId);
  db.prepare('UPDATE investigations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), investigationId);
  return mapAttachmentRow(existing);
}

function listInvestigations(filters = {}) {
  const clauses = [];
  const params = {};

  if (filters.q) {
    clauses.push(`
      LOWER(
        COALESCE(title, '') || ' ' ||
        COALESCE(status, '') || ' ' ||
        COALESCE(assigned_agent, '') || ' ' ||
        COALESCE(assigned_agents_json, '') || ' ' ||
        COALESCE(summary, '') || ' ' ||
        COALESCE(author, '')
      ) LIKE @q
    `);
    params.q = `%${String(filters.q).trim().toLowerCase()}%`;
  }
  if (filters.status) {
    clauses.push('LOWER(status) = @status');
    params.status = String(filters.status).trim().toLowerCase();
  }
  if (filters.assignedAgent) {
    clauses.push(`LOWER(COALESCE(assigned_agent, '') || ' ' || COALESCE(assigned_agents_json, '')) LIKE @assignedAgent`);
    params.assignedAgent = `%${String(filters.assignedAgent).trim().toLowerCase()}%`;
  }
  if (filters.author) {
    clauses.push('LOWER(author) LIKE @author');
    params.author = `%${String(filters.author).trim().toLowerCase()}%`;
  }
  if (filters.dateFrom) {
    clauses.push('created_at >= @dateFrom');
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    clauses.push('created_at <= @dateTo');
    params.dateTo = filters.dateTo;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Number.isFinite(Number(filters.limit)) ? Math.max(1, Math.min(500, Number(filters.limit))) : 200;
  const sort = String(filters.sort || 'updated').trim().toLowerCase();
  const orderBy = sort === 'oldest'
    ? 'ORDER BY created_at ASC, id ASC'
    : sort === 'created'
      ? 'ORDER BY created_at DESC, id DESC'
      : 'ORDER BY updated_at DESC, id DESC';

  const rows = db.prepare(`
    SELECT *
    FROM investigations
    ${where}
    ${orderBy}
    LIMIT ${limit}
  `).all(params);

  return rows.map((row) => buildInvestigationPayload(mapInvestigationRow(row)));
}

function countInvestigations(options = {}) {
  const clauses = [];
  const params = {};
  if (options.startAt) {
    clauses.push('created_at >= @startAt');
    params.startAt = options.startAt;
  }
  if (options.endAt) {
    clauses.push('created_at < @endAt');
    params.endAt = options.endAt;
  }
  if (options.status) {
    clauses.push('status = @status');
    params.status = options.status;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = db.prepare(`SELECT COUNT(*) AS total FROM investigations ${where}`).get(params);
  return Number(row && row.total) || 0;
}

function listRecentInvestigations(limit = 8) {
  return listInvestigations({ limit, sort: 'updated' }).map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    assignedAgent: item.assignedAgent,
    assignedAgents: item.assignedAgents || [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    summary: item.summary,
    updateCount: item.updateCount,
    attachmentCount: item.attachmentCount,
    linkCount: item.linkCount
  }));
}

function buildDailyInvestigationSeries(periodStart, periodEnd) {
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
      investigations: 0
    };
    items.push(bucket);
    bucketMap.set(key, bucket);
    cursor.setDate(cursor.getDate() + 1);
  }

  const rows = db.prepare(`
    SELECT created_at
    FROM investigations
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at ASC
  `).all(new Date(periodStart).toISOString(), new Date(periodEnd).toISOString());

  rows.forEach((row) => {
    const key = String(row.created_at || '').slice(0, 10);
    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.investigations += 1;
    }
  });
  return items;
}

function buildTopStatuses(limit = 6, options = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(20, Number(limit))) : 6;
  const clauses = [];
  const params = {};
  if (options.startAt) {
    clauses.push('created_at >= @startAt');
    params.startAt = options.startAt;
  }
  if (options.endAt) {
    clauses.push('created_at < @endAt');
    params.endAt = options.endAt;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`
    SELECT status AS name, COUNT(*) AS count
    FROM investigations
    ${where}
    GROUP BY status
    ORDER BY count DESC, LOWER(status) ASC
    LIMIT ${safeLimit}
  `).all(params).map((row) => ({
    name: row.name,
    count: Number(row.count) || 0
  }));
}

function listAssignableAgents() {
  const labels = new Map();

  membersRepo.listMembres().forEach((membre) => {
    const fullName = String(membre.nomRP || '').trim();
    if (!fullName) return;

    const normalizedRank = normalizeText(membre.rang);
    if (!normalizedRank || normalizedRank === 'visiteur') return;

    const normalizedName = normalizeText(fullName);
    if (!normalizedName) return;
    if (!labels.has(normalizedName)) {
      labels.set(normalizedName, fullName);
    }
  });

  return Array.from(labels.values()).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

function resolveAssignableAgentUserPseudos(agentNames) {
  const normalizedTargets = normalizeAssignedAgents(agentNames).map((value) => normalizeText(value));
  if (!normalizedTargets.length) return [];

  const hrpByName = new Map();
  membersRepo.listMembres().forEach((membre) => {
    const normalizedName = normalizeText(membre.nomRP);
    const pseudoHRP = String(membre.pseudoHRP || '').trim();
    if (!normalizedName || !pseudoHRP) return;
    if (!hrpByName.has(normalizedName)) {
      hrpByName.set(normalizedName, []);
    }
    hrpByName.get(normalizedName).push(pseudoHRP);
  });

  const users = usersRepo.listUsers();
  const seen = new Set();
  const recipients = [];

  normalizedTargets.forEach((target) => {
    const hrps = hrpByName.get(target) || [];
    if (!hrps.length) return;

    users.forEach((user) => {
      const linkedPseudo = normalizeText(user.linkedMembre || user.pseudo || '');
      if (!linkedPseudo) return;
      if (!hrps.some((pseudoHRP) => normalizeText(pseudoHRP) === linkedPseudo)) return;
      const key = String(user.pseudo || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      recipients.push(user.pseudo);
    });
  });

  return recipients;
}

function getAttachmentAbsolutePath(investigationId, attachmentId) {
  const attachment = db.prepare(`
    SELECT *
    FROM investigation_attachments
    WHERE investigation_id = ? AND id = ?
    LIMIT 1
  `).get(investigationId, attachmentId);
  if (!attachment) return null;

  const absolutePath = resolveAttachmentPath(attachment.relative_path);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return null;
  }

  return {
    attachment: mapAttachmentRow(attachment),
    absolutePath
  };
}

function listMeta() {
  const dossiers = arrestsRepo.buildIncidentDossiers()
    .slice(0, 80)
    .map((dossier) => ({
      id: dossier.dossierId,
      label: [dossier.reference || dossier.dossierId, [dossier.suspectPrenom, dossier.suspectNom].filter(Boolean).join(' ').trim()].filter(Boolean).join(' · '),
      meta: {
        reference: dossier.reference || '',
        reportCount: dossier.reportCount,
        suspectGrade: dossier.suspectGrade || ''
      }
    }));

  const complaints = complaintsRepo.listComplaints({ sort: 'newest', limit: 80 })
    .map((item) => ({
      id: item.id,
      label: [item.id, [item.accusedPrenom, item.accusedNom].filter(Boolean).join(' ').trim()].filter(Boolean).join(' · '),
      meta: {
        objet: item.objet || '',
        plaintiff: [item.plaintiffPrenom, item.plaintiffNom].filter(Boolean).join(' ').trim()
      }
    }));

  const reports = arrestsRepo.listArrestsWithDelits({ sort: 'newest' }).slice(0, 120);
  const patrolReports = reports
    .filter((item) => String(item.reportType || '').toLowerCase() === 'patrol')
    .map((item) => ({
      id: item.id,
      label: [item.reference || item.id, [item.agentPrenom, item.agentNom].filter(Boolean).join(' ').trim()].filter(Boolean).join(' · '),
      meta: {
        reference: item.reference || '',
        date: item.date || '',
        graveEvent: !!item.graveEvent
      }
    }));

  return {
    statuses: STATUS_OPTIONS.slice(),
    updateKinds: UPDATE_KIND_OPTIONS.slice(),
    assignableAgents: listAssignableAgents(),
    linkTypeLabels: LINK_TYPE_LABELS,
    dossierOptions: dossiers,
    complaintOptions: complaints,
    patrolReportOptions: patrolReports
  };
}

module.exports = {
  STATUS_OPTIONS,
  UPDATE_KIND_OPTIONS,
  addLink,
  addUpdate,
  buildDailyInvestigationSeries,
  buildTopStatuses,
  countInvestigations,
  createInvestigation,
  deleteInvestigation,
  findAttachmentById,
  findInvestigationById,
  getAttachmentAbsolutePath,
  listInvestigations,
  listMeta,
  listRecentInvestigations,
  removeAttachment,
  removeLink,
  resolveAssignableAgentUserPseudos,
  saveAttachment,
  updateInvestigation
};
