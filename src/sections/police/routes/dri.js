const fs = require('fs');

const express = require('express');

const { authRequired } = require('../../../core/middleware/auth');
const { validate } = require('../../../core/middleware/validate');
const membersRepo = require('../repositories/membres');
const historyRepo = require('../../../core/repositories/history');
const driRepo = require('../repositories/dri');
const investigationsRepo = require('../repositories/investigations');
const notificationsRepo = require('../../../core/repositories/notifications');
const { canAccessDRI, canManageDRI, getUserCapabilities } = require('../services/permissions');
const {
  mapDriStatusToClassic
} = require('../services/investigation-transfer');
const {
  driArtifactSchema,
  investigationAttachmentSchema,
  investigationEntrySchema,
  investigationLinkSchema,
  driExternalInvestigationSchema,
  driInternalInvestigationSchema,
  driNinjaSchema
} = require('../../../validation/schemas');

const router = express.Router();

function deny(res) {
  return res.status(403).json({ error: 'Acces reserve a la DRI et aux administrateurs' });
}

function buildLabel(item) {
  return item.fullName || item.name || item.title || item.id;
}

function extractAssignedAgents(payload) {
  return Array.isArray(payload.assignedAgents) ? payload.assignedAgents : [];
}

function extractLinkedNinjaIds(payload) {
  return Array.isArray(payload.linkedNinjaIds) ? payload.linkedNinjaIds : [];
}

function notifyInternalInvestigationTargets({ investigation, actorPseudo, previousAssignedAgents, previousLinkedNinjaIds }) {
  const previousAgents = new Set((previousAssignedAgents || []).map((value) => String(value || '').trim().toLowerCase()));
  const previousNinjas = new Set((previousLinkedNinjaIds || []).map((value) => String(value || '').trim().toLowerCase()));

  const addedAgents = (investigation.assignedAgents || []).filter((agent) => !previousAgents.has(String(agent || '').trim().toLowerCase()));
  const addedNinjaIds = (investigation.linkedNinjaIds || []).filter((id) => !previousNinjas.has(String(id || '').trim().toLowerCase()));

  if (!addedAgents.length && !addedNinjaIds.length) {
    return [];
  }

  const recipients = [
    ...driRepo.resolveAssignableAgentUserPseudos(addedAgents),
    ...driRepo.resolveDriNinjaUserPseudos(addedNinjaIds)
  ];
  if (!recipients.length) {
    return [];
  }

  return notificationsRepo.createNotificationsForUsers(recipients, {
    kind: 'dri_investigation_assignment',
    title: 'Affectation DRI',
    body: `Tu as ete ajoute a l enquete DRI "${investigation.title}" par ${actorPseudo}.`,
    entityType: 'dri_internal_investigation',
    entityId: investigation.id,
    metadata: {
      investigationTitle: investigation.title,
      assignedAgents: investigation.assignedAgents || [],
      linkedNinjaIds: investigation.linkedNinjaIds || [],
      actorPseudo
    }
  });
}

function notifyClassicAssignedAgents({ investigation, actorPseudo, previousAssignedAgents }) {
  const previous = new Set((previousAssignedAgents || []).map((value) => String(value || '').trim().toLowerCase()));
  const addedAgents = (investigation.assignedAgents || []).filter((agent) => !previous.has(String(agent || '').trim().toLowerCase()));
  if (!addedAgents.length) {
    return [];
  }

  const recipients = investigationsRepo.resolveAssignableAgentUserPseudos(addedAgents);
  if (!recipients.length) {
    return [];
  }

  return notificationsRepo.createNotificationsForUsers(recipients, {
    kind: 'investigation_assignment',
    title: 'Nouvelle affectation d enquete',
    body: `Tu as ete ajoute a l enquete "${investigation.title}" par ${actorPseudo}.`,
    entityType: 'investigation',
    entityId: investigation.id,
    metadata: {
      investigationTitle: investigation.title,
      assignedAgents: investigation.assignedAgents || [],
      actorPseudo
    }
  });
}

function canTransferAcrossDivisions(user) {
  return !!(getUserCapabilities(user) || {}).canAccessDRI;
}

function copyDriInvestigationDataToClassic(type, source, targetId) {
  (source.updates || []).slice().reverse().forEach((entry) => {
    investigationsRepo.addUpdate(targetId, {
      kind: entry.kind,
      content: entry.content,
      author: entry.author,
      createdAt: entry.createdAt
    });
  });

  (source.links || []).forEach((link) => {
    investigationsRepo.addLink(targetId, {
      linkType: link.linkType,
      linkedId: link.linkedId,
      linkedLabel: link.linkedLabel,
      linkedMeta: link.linkedMeta || {},
      createdBy: link.createdBy || source.createdBy || 'system',
      createdAt: link.createdAt
    });
  });

  (source.attachments || []).slice().reverse().forEach((attachment) => {
    const result = attachment && attachment.id
      ? driRepo.getAttachmentAbsolutePath(type, source.id, attachment.id)
      : null;
    if (!result) return;

    investigationsRepo.saveAttachment(targetId, {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      buffer: fs.readFileSync(result.absolutePath),
      caption: attachment.caption || '',
      uploadedBy: attachment.uploadedBy || source.createdBy || 'system',
      uploadedAt: attachment.uploadedAt
    });
  });
}

router.get('/api/v1/dri/meta', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  const assignableAgents = membersRepo.listMembres()
    .filter((membre) => String(membre.division || '').trim().toUpperCase() === 'DRI')
    .map((membre) => String(membre.nomRP || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }));

  const ninjaFiles = driRepo.listNinjaFiles()
    .map((item) => ({
      id: item.id,
      label: item.fullName,
      category: item.category,
      rank: item.rank
    }));

  const investigationMeta = investigationsRepo.listMeta();

  return res.json({
    ...driRepo.listMeta(),
    updateKinds: investigationMeta.updateKinds || [],
    linkTypeLabels: investigationMeta.linkTypeLabels || {},
    dossierOptions: investigationMeta.dossierOptions || [],
    complaintOptions: investigationMeta.complaintOptions || [],
    patrolReportOptions: investigationMeta.patrolReportOptions || [],
    assignableAgents,
    ninjaFiles
  });
});

router.get('/api/v1/dri/ninjas', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  return res.json({ items: driRepo.listNinjaFiles() });
});

router.post('/api/v1/dri/ninjas', authRequired, validate(driNinjaSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.createNinjaFile({
    ...req.body,
    createdBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_ninja_create',
    entityType: 'dri_ninja',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { after: item }
  });

  return res.json({ success: true, item });
});

router.put('/api/v1/dri/ninjas/:id', authRequired, validate(driNinjaSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const before = driRepo.findNinjaFileById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Fiche ninja introuvable' });
  }

  const item = driRepo.updateNinjaFile(req.params.id, req.body);
  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_ninja_update',
    entityType: 'dri_ninja',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { before, after: item }
  });

  return res.json({ success: true, item });
});

router.delete('/api/v1/dri/ninjas/:id', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const removed = driRepo.deleteNinjaFile(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Fiche ninja introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_ninja_delete',
    entityType: 'dri_ninja',
    entityId: removed.id,
    targetLabel: buildLabel(removed),
    metadata: { before: removed }
  });

  return res.json({ success: true });
});

router.get('/api/v1/dri/artifacts', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  return res.json({ items: driRepo.listArtifacts() });
});

router.post('/api/v1/dri/artifacts', authRequired, validate(driArtifactSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.createArtifact({
    ...req.body,
    createdBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_artifact_create',
    entityType: 'dri_artifact',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { after: item }
  });

  return res.json({ success: true, item });
});

router.put('/api/v1/dri/artifacts/:id', authRequired, validate(driArtifactSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const before = driRepo.findArtifactById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Artefact introuvable' });
  }

  const item = driRepo.updateArtifact(req.params.id, req.body);
  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_artifact_update',
    entityType: 'dri_artifact',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { before, after: item }
  });

  return res.json({ success: true, item });
});

router.delete('/api/v1/dri/artifacts/:id', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const removed = driRepo.deleteArtifact(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Artefact introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_artifact_delete',
    entityType: 'dri_artifact',
    entityId: removed.id,
    targetLabel: buildLabel(removed),
    metadata: { before: removed }
  });

  return res.json({ success: true });
});

router.get('/api/v1/dri/internal-investigations', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  return res.json({ items: driRepo.listInternalInvestigations() });
});

router.get('/api/v1/dri/internal-investigations/:id', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findInternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  return res.json({ item });
});

router.post('/api/v1/dri/internal-investigations', authRequired, validate(driInternalInvestigationSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.createInternalInvestigation({
    ...req.body,
    assignedAgents: extractAssignedAgents(req.body),
    linkedNinjaIds: extractLinkedNinjaIds(req.body),
    createdBy: req.user.pseudo
  });

  notifyInternalInvestigationTargets({
    investigation: item,
    actorPseudo: req.user.pseudo,
    previousAssignedAgents: [],
    previousLinkedNinjaIds: []
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_create',
    entityType: 'dri_internal_investigation',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { after: item }
  });

  return res.json({ success: true, item });
});

router.put('/api/v1/dri/internal-investigations/:id', authRequired, validate(driInternalInvestigationSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const before = driRepo.findInternalInvestigationById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const item = driRepo.updateInternalInvestigation(req.params.id, {
    ...req.body,
    assignedAgents: extractAssignedAgents(req.body),
    linkedNinjaIds: extractLinkedNinjaIds(req.body)
  });

  notifyInternalInvestigationTargets({
    investigation: item,
    actorPseudo: req.user.pseudo,
    previousAssignedAgents: before.assignedAgents || [],
    previousLinkedNinjaIds: before.linkedNinjaIds || []
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_update',
    entityType: 'dri_internal_investigation',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { before, after: item }
  });

  return res.json({ success: true, item });
});

router.post('/api/v1/dri/internal-investigations/:id/updates', authRequired, validate(investigationEntrySchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findInternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const entry = driRepo.addInvestigationUpdate('internal', req.params.id, {
    kind: req.body.kind,
    content: req.body.content,
    author: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_entry_add',
    entityType: 'dri_internal_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      kind: entry.kind,
      contentPreview: String(entry.content || '').slice(0, 180)
    }
  });

  return res.json({ success: true, entry, item: driRepo.findInternalInvestigationById(req.params.id) });
});

router.post('/api/v1/dri/internal-investigations/:id/links', authRequired, validate(investigationLinkSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findInternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const link = driRepo.addInvestigationLink('internal', req.params.id, {
    linkType: req.body.linkType,
    linkedId: req.body.linkedId,
    linkedLabel: req.body.linkedLabel,
    linkedMeta: req.body.linkedMeta || {},
    createdBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_link_add',
    entityType: 'dri_internal_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      linkType: link.linkType,
      linkedId: link.linkedId,
      linkedLabel: link.linkedLabel
    }
  });

  return res.json({ success: true, link, item: driRepo.findInternalInvestigationById(req.params.id) });
});

router.delete('/api/v1/dri/internal-investigations/:id/links/:linkId', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findInternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const removed = driRepo.removeInvestigationLink('internal', req.params.id, req.params.linkId);
  if (!removed) {
    return res.status(404).json({ error: 'Lien introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_link_remove',
    entityType: 'dri_internal_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      linkType: removed.linkType,
      linkedId: removed.linkedId,
      linkedLabel: removed.linkedLabel
    }
  });

  return res.json({ success: true, removed, item: driRepo.findInternalInvestigationById(req.params.id) });
});

router.post('/api/v1/dri/internal-investigations/:id/attachments', authRequired, validate(investigationAttachmentSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findInternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const attachment = driRepo.saveInvestigationAttachment('internal', req.params.id, {
    filename: req.body.filename,
    mimeType: req.body.mimeType,
    dataUrl: req.body.dataUrl,
    caption: req.body.caption || '',
    uploadedBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_attachment_add',
    entityType: 'dri_internal_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      filename: attachment.filename,
      caption: attachment.caption || ''
    }
  });

  return res.json({ success: true, attachment, item: driRepo.findInternalInvestigationById(req.params.id) });
});

router.delete('/api/v1/dri/internal-investigations/:id/attachments/:attachmentId', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findInternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const removed = driRepo.removeInvestigationAttachment('internal', req.params.id, req.params.attachmentId);
  if (!removed) {
    return res.status(404).json({ error: 'Piece jointe introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_attachment_remove',
    entityType: 'dri_internal_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      filename: removed.filename
    }
  });

  return res.json({ success: true, removed, item: driRepo.findInternalInvestigationById(req.params.id) });
});

router.get('/api/v1/dri/internal-investigations/:id/attachments/:attachmentId/file', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  const result = driRepo.getAttachmentAbsolutePath('internal', req.params.id, req.params.attachmentId);
  if (!result) {
    return res.status(404).json({ error: 'Piece jointe introuvable' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.type(result.attachment.mimeType || 'application/octet-stream');
  return res.sendFile(result.absolutePath);
});

router.post('/api/v1/dri/internal-investigations/:id/transfer-to-police', authRequired, (req, res) => {
  if (!canTransferAcrossDivisions(req.user)) {
    return res.status(403).json({ error: 'Transfert reserve aux ninjas de la division DRI' });
  }

  const before = driRepo.findInternalInvestigationById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  const investigation = investigationsRepo.createInvestigation({
    title: before.title,
    status: mapDriStatusToClassic(before.status),
    assignedAgents: before.assignedAgents || [],
    summary: before.summary || '',
    author: before.createdBy || req.user.pseudo
  });

  copyDriInvestigationDataToClassic('internal', before, investigation.id);

  notifyClassicAssignedAgents({
    investigation,
    actorPseudo: req.user.pseudo,
    previousAssignedAgents: []
  });

  driRepo.deleteInternalInvestigation(before.id);

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_transfer_to_police',
    entityType: 'dri_internal_investigation',
    entityId: before.id,
    targetLabel: buildLabel(before),
    metadata: {
      before,
      transferredId: investigation.id,
      transferredTitle: investigation.title
    }
  });

  return res.json({ success: true, investigation });
});

router.delete('/api/v1/dri/internal-investigations/:id', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const removed = driRepo.deleteInternalInvestigation(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Enquete interne introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_internal_investigation_delete',
    entityType: 'dri_internal_investigation',
    entityId: removed.id,
    targetLabel: buildLabel(removed),
    metadata: { before: removed }
  });

  return res.json({ success: true });
});

router.get('/api/v1/dri/external-investigations', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  return res.json({ items: driRepo.listExternalInvestigations() });
});

router.get('/api/v1/dri/external-investigations/:id', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findExternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  return res.json({ item });
});

router.post('/api/v1/dri/external-investigations', authRequired, validate(driExternalInvestigationSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.createExternalInvestigation({
    ...req.body,
    createdBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_create',
    entityType: 'dri_external_investigation',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { after: item }
  });

  return res.json({ success: true, item });
});

router.put('/api/v1/dri/external-investigations/:id', authRequired, validate(driExternalInvestigationSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const before = driRepo.findExternalInvestigationById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const item = driRepo.updateExternalInvestigation(req.params.id, req.body);
  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_update',
    entityType: 'dri_external_investigation',
    entityId: item.id,
    targetLabel: buildLabel(item),
    metadata: { before, after: item }
  });

  return res.json({ success: true, item });
});

router.post('/api/v1/dri/external-investigations/:id/updates', authRequired, validate(investigationEntrySchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findExternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const entry = driRepo.addInvestigationUpdate('external', req.params.id, {
    kind: req.body.kind,
    content: req.body.content,
    author: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_entry_add',
    entityType: 'dri_external_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      kind: entry.kind,
      contentPreview: String(entry.content || '').slice(0, 180)
    }
  });

  return res.json({ success: true, entry, item: driRepo.findExternalInvestigationById(req.params.id) });
});

router.post('/api/v1/dri/external-investigations/:id/links', authRequired, validate(investigationLinkSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findExternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const link = driRepo.addInvestigationLink('external', req.params.id, {
    linkType: req.body.linkType,
    linkedId: req.body.linkedId,
    linkedLabel: req.body.linkedLabel,
    linkedMeta: req.body.linkedMeta || {},
    createdBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_link_add',
    entityType: 'dri_external_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      linkType: link.linkType,
      linkedId: link.linkedId,
      linkedLabel: link.linkedLabel
    }
  });

  return res.json({ success: true, link, item: driRepo.findExternalInvestigationById(req.params.id) });
});

router.delete('/api/v1/dri/external-investigations/:id/links/:linkId', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findExternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const removed = driRepo.removeInvestigationLink('external', req.params.id, req.params.linkId);
  if (!removed) {
    return res.status(404).json({ error: 'Lien introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_link_remove',
    entityType: 'dri_external_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      linkType: removed.linkType,
      linkedId: removed.linkedId,
      linkedLabel: removed.linkedLabel
    }
  });

  return res.json({ success: true, removed, item: driRepo.findExternalInvestigationById(req.params.id) });
});

router.post('/api/v1/dri/external-investigations/:id/attachments', authRequired, validate(investigationAttachmentSchema), (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findExternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const attachment = driRepo.saveInvestigationAttachment('external', req.params.id, {
    filename: req.body.filename,
    mimeType: req.body.mimeType,
    dataUrl: req.body.dataUrl,
    caption: req.body.caption || '',
    uploadedBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_attachment_add',
    entityType: 'dri_external_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      filename: attachment.filename,
      caption: attachment.caption || ''
    }
  });

  return res.json({ success: true, attachment, item: driRepo.findExternalInvestigationById(req.params.id) });
});

router.delete('/api/v1/dri/external-investigations/:id/attachments/:attachmentId', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const item = driRepo.findExternalInvestigationById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const removed = driRepo.removeInvestigationAttachment('external', req.params.id, req.params.attachmentId);
  if (!removed) {
    return res.status(404).json({ error: 'Piece jointe introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_attachment_remove',
    entityType: 'dri_external_investigation',
    entityId: req.params.id,
    targetLabel: buildLabel(item),
    metadata: {
      filename: removed.filename
    }
  });

  return res.json({ success: true, removed, item: driRepo.findExternalInvestigationById(req.params.id) });
});

router.get('/api/v1/dri/external-investigations/:id/attachments/:attachmentId/file', authRequired, (req, res) => {
  if (!canAccessDRI(req.user)) {
    return deny(res);
  }

  const result = driRepo.getAttachmentAbsolutePath('external', req.params.id, req.params.attachmentId);
  if (!result) {
    return res.status(404).json({ error: 'Piece jointe introuvable' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.type(result.attachment.mimeType || 'application/octet-stream');
  return res.sendFile(result.absolutePath);
});

router.post('/api/v1/dri/external-investigations/:id/transfer-to-police', authRequired, (req, res) => {
  if (!canTransferAcrossDivisions(req.user)) {
    return res.status(403).json({ error: 'Transfert reserve aux ninjas de la division DRI' });
  }

  const before = driRepo.findExternalInvestigationById(req.params.id);
  if (!before) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  const investigation = investigationsRepo.createInvestigation({
    title: before.title,
    status: mapDriStatusToClassic(before.status),
    assignedAgents: before.assignedAgents || [],
    summary: before.summary || '',
    author: before.createdBy || req.user.pseudo
  });

  copyDriInvestigationDataToClassic('external', before, investigation.id);

  notifyClassicAssignedAgents({
    investigation,
    actorPseudo: req.user.pseudo,
    previousAssignedAgents: []
  });

  driRepo.deleteExternalInvestigation(before.id);

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_transfer_to_police',
    entityType: 'dri_external_investigation',
    entityId: before.id,
    targetLabel: buildLabel(before),
    metadata: {
      before,
      transferredId: investigation.id,
      transferredTitle: investigation.title
    }
  });

  return res.json({ success: true, investigation });
});

router.delete('/api/v1/dri/external-investigations/:id', authRequired, (req, res) => {
  if (!canManageDRI(req.user)) {
    return deny(res);
  }

  const removed = driRepo.deleteExternalInvestigation(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: 'Enquete externe introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'dri_external_investigation_delete',
    entityType: 'dri_external_investigation',
    entityId: removed.id,
    targetLabel: buildLabel(removed),
    metadata: { before: removed }
  });

  return res.json({ success: true });
});

module.exports = router;
