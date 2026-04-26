const fs = require('fs');
const path = require('path');

const db = require('../db');
const env = require('../config/env');
const membersRepo = require('./membres');
const usersRepo = require('./users');
const { normalizeText } = require('../utils/normalize');

const DRI_CATEGORY_OPTIONS = [
  'Membre de clan',
  'Sans clan',
  'Deserteur (nukenin)'
];

const DRI_CLAN_OPTIONS = [
  'Aucun',
  'Uchiha',
  'Senju',
  'Hyugan',
  'Akimichi',
  'Nara',
  'Hakumei',
  'Hoki',
  'Shirogane',
  'Roran',
  'Sabaku'
];

const DRI_RANK_OPTIONS = ['D', 'C', 'B', 'A', 'S', 'X'];
const DRI_SECTION_OPTIONS = ['Aucune', 'Militaire', 'Diplomatie', 'Police', 'Medical', 'Strategie', 'Forces Speciales'];
const DRI_NATURE_OPTIONS = ['Aucune', 'Doton', 'Katon', 'Suiton', 'Futon', 'Raiton'];
const DRI_KEKKAI_GENKAI_OPTIONS = ['Aucun', 'Deiton', 'Teiton', 'Yoton', 'Kiminari', 'Mokuton'];
const DRI_ARTEFACT_OPTIONS = [
  'Aucun',
  'Kubikiribocho',
  'Samehada',
  'Hiramekarei',
  'Kiba',
  'Nuibari',
  'Kabutowari',
  'Shibuki'
];

const DRI_ARTEFACT_STATUS_OPTIONS = [
  'Localise',
  'Sous surveillance',
  'Perdu',
  'Confisque',
  'Detenu',
  'Inconnu'
];

const DRI_INTERNAL_STATUS_OPTIONS = [
  'En cours',
  'En attente de preuves',
  'Sous couverture',
  'En surveillance',
  'Archivee',
  'Cloturee'
];

const DRI_EXTERNAL_STATUS_OPTIONS = [
  'En cours',
  'En attente de preuves',
  'Sous couverture',
  'En surveillance',
  'En territoire etranger',
  'Archivee',
  'Cloturee'
];

const DRI_UPDATE_KIND_OPTIONS = [
  'Suivi',
  'Temoignage',
  'Note interne'
];

const DRI_LINK_TYPE_LABELS = {
  dossier: 'Dossier / casier',
  complaint: 'Plainte',
  patrol_report: 'Rapport de patrouille'
};

function buildId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function ensureAttachmentBaseDir(scope) {
  const target = path.join(env.uploadsDir, 'dri', scope);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function resolveAttachmentPath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized) return '';
  if (path.isAbsolute(normalized)) return normalized;

  const modernCandidate = path.join(env.uploadsDir, normalized);
  if (fs.existsSync(modernCandidate)) {
    return modernCandidate;
  }

  const strippedLegacyPrefix = normalized.replace(/^uploads\//i, '');
  const uploadsCandidate = path.join(env.uploadsDir, strippedLegacyPrefix);
  if (fs.existsSync(uploadsCandidate)) {
    return uploadsCandidate;
  }

  return path.join(env.rootDir, normalized);
}

function normalizeAssignedAgents(values) {
  const seen = new Set();
  const source = Array.isArray(values) ? values : [values];
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

function normalizeIdList(values) {
  const seen = new Set();
  const source = Array.isArray(values) ? values : [values];
  return source.reduce((items, value) => {
    const trimmed = String(value || '').trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      return items;
    }
    seen.add(key);
    items.push(trimmed);
    return items;
  }, []);
}

function mapNinja(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    category: row.category,
    clan: row.clan,
    rank: row.rank,
    section: row.section,
    nature: row.nature,
    kekkaiGenkai: row.kekkai_genkai,
    artefact: row.artefact,
    photoDataUrl: row.photo_data_url || '',
    notes: row.notes || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapArtifact(row) {
  return {
    id: row.id,
    name: row.name,
    holderName: row.holder_name || '',
    status: row.status,
    classification: row.classification || '',
    notes: row.notes || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInternalInvestigation(row) {
  let assignedAgents = [];
  let linkedNinjaIds = [];
  try {
    assignedAgents = normalizeAssignedAgents(JSON.parse(row.assigned_agents_json || '[]'));
  } catch (error) {}
  try {
    linkedNinjaIds = normalizeIdList(JSON.parse(row.linked_ninja_ids_json || '[]'));
  } catch (error) {}

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assignedAgents,
    linkedNinjaIds,
    summary: row.summary || '',
    notes: row.notes || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExternalInvestigation(row) {
  let assignedAgents = [];
  try {
    assignedAgents = normalizeAssignedAgents(JSON.parse(row.assigned_agents_json || '[]'));
  } catch (error) {}

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assignedAgents,
    targetZone: row.target_zone || '',
    summary: row.summary || '',
    notes: row.notes || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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

function parseMeta(row) {
  try {
    const parsed = JSON.parse(row.linked_meta_json || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function mapLinkRow(row) {
  return {
    id: row.id,
    investigationId: row.investigation_id,
    linkType: row.link_type,
    linkLabel: DRI_LINK_TYPE_LABELS[row.link_type] || row.link_type,
    linkedId: row.linked_id,
    linkedLabel: row.linked_label,
    linkedMeta: parseMeta(row),
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function mapAttachmentRow(row, scope) {
  return {
    id: row.id,
    investigationId: row.investigation_id,
    filename: row.filename,
    mimeType: row.mime_type,
    relativePath: row.relative_path,
    url: `/api/v1/dri/${scope}/${encodeURIComponent(row.investigation_id)}/attachments/${encodeURIComponent(row.id)}/file`,
    caption: row.caption || '',
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at
  };
}

function getInvestigationConfig(type) {
  if (type === 'external') {
    return {
      scope: 'external-investigations',
      mainTable: 'dri_external_investigations',
      updatesTable: 'dri_external_investigation_updates',
      linksTable: 'dri_external_investigation_links',
      attachmentsTable: 'dri_external_investigation_attachments',
      prefix: 'dri-ext'
    };
  }

  return {
    scope: 'internal-investigations',
    mainTable: 'dri_internal_investigations',
    updatesTable: 'dri_internal_investigation_updates',
    linksTable: 'dri_internal_investigation_links',
    attachmentsTable: 'dri_internal_investigation_attachments',
    prefix: 'dri-enq'
  };
}

function listUpdates(type, investigationId) {
  const config = getInvestigationConfig(type);
  return db.prepare(`
    SELECT *
    FROM ${config.updatesTable}
    WHERE investigation_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(investigationId).map(mapUpdateRow);
}

function listLinks(type, investigationId) {
  const config = getInvestigationConfig(type);
  return db.prepare(`
    SELECT *
    FROM ${config.linksTable}
    WHERE investigation_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(investigationId).map(mapLinkRow);
}

function listAttachments(type, investigationId) {
  const config = getInvestigationConfig(type);
  return db.prepare(`
    SELECT *
    FROM ${config.attachmentsTable}
    WHERE investigation_id = ?
    ORDER BY uploaded_at DESC, id DESC
  `).all(investigationId).map((row) => mapAttachmentRow(row, config.scope));
}

function findAttachmentById(type, investigationId, attachmentId) {
  const config = getInvestigationConfig(type);
  const row = db.prepare(`
    SELECT *
    FROM ${config.attachmentsTable}
    WHERE investigation_id = ? AND id = ?
    LIMIT 1
  `).get(investigationId, attachmentId);
  return row ? mapAttachmentRow(row, config.scope) : null;
}

function buildInvestigationPayload(type, base) {
  if (!base) return null;
  const updates = listUpdates(type, base.id);
  const links = listLinks(type, base.id);
  const attachments = listAttachments(type, base.id);
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

function listMeta() {
  return {
    categoryOptions: DRI_CATEGORY_OPTIONS.slice(),
    clanOptions: DRI_CLAN_OPTIONS.slice(),
    rankOptions: DRI_RANK_OPTIONS.slice(),
    sectionOptions: DRI_SECTION_OPTIONS.slice(),
    natureOptions: DRI_NATURE_OPTIONS.slice(),
    kekkaiGenkaiOptions: DRI_KEKKAI_GENKAI_OPTIONS.slice(),
    artefactOptions: DRI_ARTEFACT_OPTIONS.slice(),
    artefactStatusOptions: DRI_ARTEFACT_STATUS_OPTIONS.slice(),
    internalStatusOptions: DRI_INTERNAL_STATUS_OPTIONS.slice(),
    externalStatusOptions: DRI_EXTERNAL_STATUS_OPTIONS.slice(),
    updateKinds: DRI_UPDATE_KIND_OPTIONS.slice(),
    linkTypeLabels: { ...DRI_LINK_TYPE_LABELS }
  };
}

function listNinjaFiles() {
  return db.prepare(`
    SELECT *
    FROM dri_ninja_files
    ORDER BY updated_at DESC, full_name COLLATE NOCASE ASC
  `).all().map(mapNinja);
}

function createNinjaFile(input) {
  const id = buildId('dri-ninja');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO dri_ninja_files (
      id, full_name, category, clan, rank, section, nature, kekkai_genkai, artefact, photo_data_url, notes, created_by, created_at, updated_at
    ) VALUES (
      @id, @full_name, @category, @clan, @rank, @section, @nature, @kekkai_genkai, @artefact, @photo_data_url, @notes, @created_by, @created_at, @updated_at
    )
  `).run({
    id,
    full_name: input.fullName,
    category: input.category,
    clan: input.clan || 'Aucun',
    rank: input.rank,
    section: input.section || 'Aucune',
    nature: input.nature || 'Aucune',
    kekkai_genkai: input.kekkaiGenkai || 'Aucun',
    artefact: input.artefact || 'Aucun',
    photo_data_url: input.photoDataUrl || '',
    notes: input.notes || '',
    created_by: input.createdBy,
    created_at: now,
    updated_at: now
  });

  return findNinjaFileById(id);
}

function findNinjaFileById(id) {
  const row = db.prepare('SELECT * FROM dri_ninja_files WHERE id = ?').get(id);
  return row ? mapNinja(row) : null;
}

function updateNinjaFile(id, input) {
  const existing = findNinjaFileById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE dri_ninja_files
    SET full_name = @full_name,
        category = @category,
        clan = @clan,
        rank = @rank,
        section = @section,
        nature = @nature,
        kekkai_genkai = @kekkai_genkai,
        artefact = @artefact,
        photo_data_url = @photo_data_url,
        notes = @notes,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    full_name: input.fullName,
    category: input.category,
    clan: input.clan || 'Aucun',
    rank: input.rank,
    section: input.section || 'Aucune',
    nature: input.nature || 'Aucune',
    kekkai_genkai: input.kekkaiGenkai || 'Aucun',
    artefact: input.artefact || 'Aucun',
    photo_data_url: input.photoDataUrl || '',
    notes: input.notes || '',
    updated_at: now
  });
  return findNinjaFileById(id);
}

function deleteNinjaFile(id) {
  const existing = findNinjaFileById(id);
  if (!existing) return null;
  db.prepare('DELETE FROM dri_ninja_files WHERE id = ?').run(id);
  return existing;
}

function listArtifacts() {
  return db.prepare(`
    SELECT *
    FROM dri_artifacts
    ORDER BY updated_at DESC, name COLLATE NOCASE ASC
  `).all().map(mapArtifact);
}

function findArtifactById(id) {
  const row = db.prepare('SELECT * FROM dri_artifacts WHERE id = ?').get(id);
  return row ? mapArtifact(row) : null;
}

function createArtifact(input) {
  const id = buildId('dri-art');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO dri_artifacts (
      id, name, holder_name, status, classification, notes, created_by, created_at, updated_at
    ) VALUES (
      @id, @name, @holder_name, @status, @classification, @notes, @created_by, @created_at, @updated_at
    )
  `).run({
    id,
    name: input.name,
    holder_name: input.holderName || '',
    status: input.status,
    classification: input.classification || '',
    notes: input.notes || '',
    created_by: input.createdBy,
    created_at: now,
    updated_at: now
  });
  return findArtifactById(id);
}

function updateArtifact(id, input) {
  const existing = findArtifactById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE dri_artifacts
    SET name = @name,
        holder_name = @holder_name,
        status = @status,
        classification = @classification,
        notes = @notes,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    name: input.name,
    holder_name: input.holderName || '',
    status: input.status,
    classification: input.classification || '',
    notes: input.notes || '',
    updated_at: now
  });
  return findArtifactById(id);
}

function deleteArtifact(id) {
  const existing = findArtifactById(id);
  if (!existing) return null;
  db.prepare('DELETE FROM dri_artifacts WHERE id = ?').run(id);
  return existing;
}

function deleteAttachmentFile(relativePath) {
  if (!relativePath) return;
  const absolutePath = resolveAttachmentPath(relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function addInvestigationUpdate(type, investigationId, payload) {
  const config = getInvestigationConfig(type);
  const id = buildId(type === 'external' ? 'dri-ext-note' : 'dri-int-note');
  const createdAt = payload.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO ${config.updatesTable} (
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
    created_at: createdAt
  });
  db.prepare(`UPDATE ${config.mainTable} SET updated_at = ? WHERE id = ?`).run(createdAt, investigationId);
  return listUpdates(type, investigationId)[0] || null;
}

function addInvestigationLink(type, investigationId, payload) {
  const config = getInvestigationConfig(type);
  const id = buildId(type === 'external' ? 'dri-ext-link' : 'dri-int-link');
  const createdAt = payload.createdAt || new Date().toISOString();
  const metaJson = JSON.stringify(payload.linkedMeta || {});

  const existing = db.prepare(`
    SELECT id
    FROM ${config.linksTable}
    WHERE investigation_id = ? AND link_type = ? AND linked_id = ?
    LIMIT 1
  `).get(investigationId, payload.linkType, payload.linkedId);
  if (existing) {
    return listLinks(type, investigationId).find((item) => item.id === existing.id) || null;
  }

  db.prepare(`
    INSERT INTO ${config.linksTable} (
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
    created_at: createdAt
  });
  db.prepare(`UPDATE ${config.mainTable} SET updated_at = ? WHERE id = ?`).run(createdAt, investigationId);
  return listLinks(type, investigationId).find((item) => item.id === id) || null;
}

function removeInvestigationLink(type, investigationId, linkId) {
  const config = getInvestigationConfig(type);
  const existing = db.prepare(`
    SELECT *
    FROM ${config.linksTable}
    WHERE id = ? AND investigation_id = ?
  `).get(linkId, investigationId);
  if (!existing) return null;
  db.prepare(`DELETE FROM ${config.linksTable} WHERE id = ? AND investigation_id = ?`).run(linkId, investigationId);
  db.prepare(`UPDATE ${config.mainTable} SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), investigationId);
  return mapLinkRow(existing);
}

function extFromMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function saveInvestigationAttachment(type, investigationId, payload) {
  const config = getInvestigationConfig(type);
  ensureAttachmentBaseDir(config.scope);
  const id = buildId(type === 'external' ? 'dri-ext-file' : 'dri-int-file');
  const uploadedAt = payload.uploadedAt || new Date().toISOString();
  const extension = extFromMime(payload.mimeType);
  const investigationDir = path.join(env.uploadsDir, 'dri', config.scope, investigationId);
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
    INSERT INTO ${config.attachmentsTable} (
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
  db.prepare(`UPDATE ${config.mainTable} SET updated_at = ? WHERE id = ?`).run(uploadedAt, investigationId);
  return listAttachments(type, investigationId).find((item) => item.id === id) || null;
}

function removeInvestigationAttachment(type, investigationId, attachmentId) {
  const config = getInvestigationConfig(type);
  const existing = db.prepare(`
    SELECT *
    FROM ${config.attachmentsTable}
    WHERE id = ? AND investigation_id = ?
  `).get(attachmentId, investigationId);
  if (!existing) return null;
  try {
    deleteAttachmentFile(existing.relative_path);
  } catch (error) {}
  db.prepare(`DELETE FROM ${config.attachmentsTable} WHERE id = ? AND investigation_id = ?`).run(attachmentId, investigationId);
  db.prepare(`UPDATE ${config.mainTable} SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), investigationId);
  return mapAttachmentRow(existing, config.scope);
}

function getAttachmentAbsolutePath(type, investigationId, attachmentId) {
  const config = getInvestigationConfig(type);
  const attachment = db.prepare(`
    SELECT *
    FROM ${config.attachmentsTable}
    WHERE investigation_id = ? AND id = ?
    LIMIT 1
  `).get(investigationId, attachmentId);
  if (!attachment) return null;

  const absolutePath = resolveAttachmentPath(attachment.relative_path);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return null;
  }

  return {
    attachment: mapAttachmentRow(attachment, config.scope),
    absolutePath
  };
}

function listInternalInvestigations() {
  return db.prepare(`
    SELECT *
    FROM dri_internal_investigations
    ORDER BY updated_at DESC, title COLLATE NOCASE ASC
  `).all().map((row) => buildInvestigationPayload('internal', mapInternalInvestigation(row)));
}

function findInternalInvestigationById(id) {
  const row = db.prepare('SELECT * FROM dri_internal_investigations WHERE id = ?').get(id);
  return row ? buildInvestigationPayload('internal', mapInternalInvestigation(row)) : null;
}

function createInternalInvestigation(input) {
  const id = buildId('dri-enq');
  const now = input.createdAt || new Date().toISOString();
  const updatedAt = input.updatedAt || now;
  db.prepare(`
    INSERT INTO dri_internal_investigations (
      id, title, status, assigned_agents_json, linked_ninja_ids_json, summary, notes, created_by, created_at, updated_at
    ) VALUES (
      @id, @title, @status, @assigned_agents_json, @linked_ninja_ids_json, @summary, @notes, @created_by, @created_at, @updated_at
    )
  `).run({
    id,
    title: input.title,
    status: input.status,
    assigned_agents_json: JSON.stringify(normalizeAssignedAgents(input.assignedAgents)),
    linked_ninja_ids_json: JSON.stringify(normalizeIdList(input.linkedNinjaIds)),
    summary: input.summary || '',
    notes: input.notes || '',
    created_by: input.createdBy,
    created_at: now,
    updated_at: updatedAt
  });
  return findInternalInvestigationById(id);
}

function updateInternalInvestigation(id, input) {
  const existing = findInternalInvestigationById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE dri_internal_investigations
    SET title = @title,
        status = @status,
        assigned_agents_json = @assigned_agents_json,
        linked_ninja_ids_json = @linked_ninja_ids_json,
        summary = @summary,
        notes = @notes,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: input.title,
    status: input.status,
    assigned_agents_json: JSON.stringify(normalizeAssignedAgents(input.assignedAgents)),
    linked_ninja_ids_json: JSON.stringify(normalizeIdList(input.linkedNinjaIds)),
    summary: input.summary || '',
    notes: input.notes || '',
    updated_at: now
  });
  return findInternalInvestigationById(id);
}

function deleteInternalInvestigation(id) {
  const existing = findInternalInvestigationById(id);
  if (!existing) return null;
  (existing.attachments || []).forEach((attachment) => {
    try {
      deleteAttachmentFile(attachment.relativePath);
    } catch (error) {}
  });
  db.prepare('DELETE FROM dri_internal_investigations WHERE id = ?').run(id);
  return existing;
}

function listExternalInvestigations() {
  return db.prepare(`
    SELECT *
    FROM dri_external_investigations
    ORDER BY updated_at DESC, title COLLATE NOCASE ASC
  `).all().map((row) => buildInvestigationPayload('external', mapExternalInvestigation(row)));
}

function findExternalInvestigationById(id) {
  const row = db.prepare('SELECT * FROM dri_external_investigations WHERE id = ?').get(id);
  return row ? buildInvestigationPayload('external', mapExternalInvestigation(row)) : null;
}

function createExternalInvestigation(input) {
  const id = buildId('dri-ext');
  const now = input.createdAt || new Date().toISOString();
  const updatedAt = input.updatedAt || now;
  db.prepare(`
    INSERT INTO dri_external_investigations (
      id, title, status, assigned_agents_json, target_zone, summary, notes, created_by, created_at, updated_at
    ) VALUES (
      @id, @title, @status, @assigned_agents_json, @target_zone, @summary, @notes, @created_by, @created_at, @updated_at
    )
  `).run({
    id,
    title: input.title,
    status: input.status,
    assigned_agents_json: JSON.stringify(normalizeAssignedAgents(input.assignedAgents)),
    target_zone: input.targetZone || '',
    summary: input.summary || '',
    notes: input.notes || '',
    created_by: input.createdBy,
    created_at: now,
    updated_at: updatedAt
  });
  return findExternalInvestigationById(id);
}

function updateExternalInvestigation(id, input) {
  const existing = findExternalInvestigationById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE dri_external_investigations
    SET title = @title,
        status = @status,
        assigned_agents_json = @assigned_agents_json,
        target_zone = @target_zone,
        summary = @summary,
        notes = @notes,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: input.title,
    status: input.status,
    assigned_agents_json: JSON.stringify(normalizeAssignedAgents(input.assignedAgents)),
    target_zone: input.targetZone || '',
    summary: input.summary || '',
    notes: input.notes || '',
    updated_at: now
  });
  return findExternalInvestigationById(id);
}

function deleteExternalInvestigation(id) {
  const existing = findExternalInvestigationById(id);
  if (!existing) return null;
  (existing.attachments || []).forEach((attachment) => {
    try {
      deleteAttachmentFile(attachment.relativePath);
    } catch (error) {}
  });
  db.prepare('DELETE FROM dri_external_investigations WHERE id = ?').run(id);
  return existing;
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

function resolveDriNinjaUserPseudos(ninjaIds) {
  const targetIds = normalizeIdList(ninjaIds);
  if (!targetIds.length) return [];

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

  targetIds.forEach((ninjaId) => {
    const ninja = findNinjaFileById(ninjaId);
    if (!ninja) return;
    const hrps = hrpByName.get(normalizeText(ninja.fullName)) || [];
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

module.exports = {
  addInvestigationLink,
  addInvestigationUpdate,
  createArtifact,
  createExternalInvestigation,
  createInternalInvestigation,
  createNinjaFile,
  deleteArtifact,
  deleteExternalInvestigation,
  deleteInternalInvestigation,
  deleteNinjaFile,
  findArtifactById,
  findAttachmentById,
  findExternalInvestigationById,
  findInternalInvestigationById,
  findNinjaFileById,
  getAttachmentAbsolutePath,
  listArtifacts,
  listExternalInvestigations,
  listInternalInvestigations,
  listMeta,
  listNinjaFiles,
  removeInvestigationAttachment,
  removeInvestigationLink,
  resolveAssignableAgentUserPseudos,
  resolveDriNinjaUserPseudos,
  saveInvestigationAttachment,
  updateArtifact,
  updateExternalInvestigation,
  updateInternalInvestigation,
  updateNinjaFile
};
