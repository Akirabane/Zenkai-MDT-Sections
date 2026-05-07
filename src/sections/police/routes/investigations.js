const fs = require('fs');

const express = require('express');

const { authRequired } = require('../../../core/middleware/auth');
const { validate } = require('../../../core/middleware/validate');
const historyRepo = require('../../../core/repositories/history');
const driRepo = require('../repositories/dri');
const investigationsRepo = require('../repositories/investigations');
const notificationsRepo = require('../../../core/repositories/notifications');
const {
  canCreateInvestigations,
  canDeleteInvestigations,
  canManageInvestigations,
  canViewInvestigations,
  getUserCapabilities
} = require('../services/permissions');
const {
  mapClassicStatusToDri
} = require('../services/investigation-transfer');
const {
  investigationAttachmentSchema,
  investigationEntrySchema,
  investigationLinkSchema,
  investigationSchema,
  investigationTransferToDriSchema,
  investigationUpdateSchema
} = require('../../../validation/schemas');

const router = express.Router();

function buildTargetLabel(investigation) {
  return (investigation && investigation.title) || (investigation && investigation.id) || 'Enquete';
}

function buildInvestigationMetadata(investigation) {
  return {
    title: investigation.title || '',
    status: investigation.status || '',
    assignedAgent: investigation.assignedAgent || '',
    assignedAgents: investigation.assignedAgents || [],
    summary: investigation.summary || '',
    updateCount: Number(investigation.updateCount || 0),
    attachmentCount: Number(investigation.attachmentCount || 0),
    linkCount: Number(investigation.linkCount || 0)
  };
}

function extractAssignedAgents(payload) {
  if (Array.isArray(payload.assignedAgents) && payload.assignedAgents.length) {
    return payload.assignedAgents;
  }
  if (payload.assignedAgent) {
    return [payload.assignedAgent];
  }
  return [];
}

function notifyAssignedAgents({ investigation, actorPseudo, previousAssignedAgents }) {
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

function canTransferToDri(user) {
  return !!(getUserCapabilities(user) || {}).canTransferInvestigationsAcrossDivisions;
}

router.get('/api/v1/investigations/meta', authRequired, (req, res) => {
  if (!canViewInvestigations(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux chefs d unite+, a la Justice et aux administrateurs' });
  }

  return res.json(investigationsRepo.listMeta());
});

router.get('/api/v1/investigations', authRequired, (req, res) => {
  if (!canViewInvestigations(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux chefs d unite+, a la Justice et aux administrateurs' });
  }

  const items = investigationsRepo.listInvestigations({
    q: (req.query.q || '').trim() || undefined,
    status: (req.query.status || '').trim() || undefined,
    assignedAgent: (req.query.assignedAgent || '').trim() || undefined,
    author: (req.query.author || '').trim() || undefined,
    dateFrom: (req.query.dateFrom || '').trim() || undefined,
    dateTo: (req.query.dateTo || '').trim() || undefined,
    sort: (req.query.sort || 'updated').trim() || 'updated',
    limit: req.query.limit
  });

  return res.json({ items });
});

router.post('/api/v1/investigations', authRequired, validate(investigationSchema), (req, res) => {
  if (!canCreateInvestigations(req.user)) {
    return res.status(403).json({ error: 'Creation reservee aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const investigation = investigationsRepo.createInvestigation({
    title: req.body.title,
    status: req.body.status,
    assignedAgent: req.body.assignedAgent || '',
    assignedAgents: extractAssignedAgents(req.body),
    summary: req.body.summary || '',
    author: req.user.pseudo
  });

  notifyAssignedAgents({
    investigation,
    actorPseudo: req.user.pseudo,
    previousAssignedAgents: []
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_create',
    entityType: 'investigation',
    entityId: investigation.id,
    targetLabel: buildTargetLabel(investigation),
    metadata: {
      after: buildInvestigationMetadata(investigation)
    }
  });

  return res.json({ success: true, investigation });
});

router.get('/api/v1/investigations/:id', authRequired, (req, res) => {
  if (!canViewInvestigations(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux chefs d unite+, a la Justice et aux administrateurs' });
  }

  const investigation = investigationsRepo.findInvestigationById(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  return res.json({ investigation });
});

router.put('/api/v1/investigations/:id', authRequired, validate(investigationUpdateSchema), (req, res) => {
  if (!canManageInvestigations(req.user)) {
    return res.status(403).json({ error: 'Modification reservee aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const existing = investigationsRepo.findInvestigationById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const updated = investigationsRepo.updateInvestigation(req.params.id, req.body);

  notifyAssignedAgents({
    investigation: updated,
    actorPseudo: req.user.pseudo,
    previousAssignedAgents: existing.assignedAgents || []
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_update',
    entityType: 'investigation',
    entityId: updated.id,
    targetLabel: buildTargetLabel(updated),
    metadata: {
      before: buildInvestigationMetadata(existing),
      after: buildInvestigationMetadata(updated)
    }
  });

  return res.json({ success: true, investigation: updated });
});

router.post('/api/v1/investigations/:id/transfer-to-dri', authRequired, validate(investigationTransferToDriSchema), (req, res) => {
  if (!canTransferToDri(req.user)) {
    return res.status(403).json({ error: 'Transfert reserve aux ninjas de la division DRI' });
  }

  const existing = investigationsRepo.findInvestigationById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const targetType = req.body.targetType;
  const targetPayload = {
    title: existing.title,
    status: mapClassicStatusToDri(existing.status, targetType),
    assignedAgents: existing.assignedAgents || [],
    summary: existing.summary || '',
    notes: '',
    createdBy: existing.author || req.user.pseudo
  };

  const transferred = targetType === 'external'
    ? driRepo.createExternalInvestigation({
        ...targetPayload,
        targetZone: ''
      })
    : driRepo.createInternalInvestigation({
        ...targetPayload,
        linkedNinjaIds: []
      });

  (existing.updates || []).slice().reverse().forEach((entry) => {
    driRepo.addInvestigationUpdate(targetType, transferred.id, {
      kind: entry.kind,
      content: entry.content,
      author: entry.author,
      createdAt: entry.createdAt
    });
  });

  (existing.links || []).forEach((link) => {
    driRepo.addInvestigationLink(targetType, transferred.id, {
      linkType: link.linkType,
      linkedId: link.linkedId,
      linkedLabel: link.linkedLabel,
      linkedMeta: link.linkedMeta || {},
      createdBy: link.createdBy || existing.author || 'system',
      createdAt: link.createdAt
    });
  });

  (existing.attachments || []).slice().reverse().forEach((attachment) => {
    const result = investigationsRepo.getAttachmentAbsolutePath(existing.id, attachment.id);
    if (!result) return;

    driRepo.saveInvestigationAttachment(targetType, transferred.id, {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      buffer: fs.readFileSync(result.absolutePath),
      caption: attachment.caption || '',
      uploadedBy: attachment.uploadedBy || existing.author || 'system',
      uploadedAt: attachment.uploadedAt
    });
  });

  investigationsRepo.deleteInvestigation(existing.id);

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_transfer_to_dri',
    entityType: 'investigation',
    entityId: existing.id,
    targetLabel: buildTargetLabel(existing),
    metadata: {
      targetType,
      before: buildInvestigationMetadata(existing),
      transferredId: transferred.id,
      transferredTitle: transferred.title
    }
  });

  return res.json({
    success: true,
    targetType,
    item: transferred
  });
});

router.delete('/api/v1/investigations/:id', authRequired, (req, res) => {
  if (!canDeleteInvestigations(req.user)) {
    return res.status(403).json({ error: 'Suppression reservee aux Lieutenants, Commandants et administrateurs' });
  }

  const deleted = investigationsRepo.deleteInvestigation(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_delete',
    entityType: 'investigation',
    entityId: deleted.id,
    targetLabel: buildTargetLabel(deleted),
    metadata: {
      before: buildInvestigationMetadata(deleted)
    }
  });

  return res.json({ success: true });
});

router.post('/api/v1/investigations/:id/updates', authRequired, validate(investigationEntrySchema), (req, res) => {
  if (!canManageInvestigations(req.user)) {
    return res.status(403).json({ error: 'Ajout de suivi reserve aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const investigation = investigationsRepo.findInvestigationById(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const entry = investigationsRepo.addUpdate(req.params.id, {
    kind: req.body.kind,
    content: req.body.content,
    author: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_entry_add',
    entityType: 'investigation',
    entityId: req.params.id,
    targetLabel: buildTargetLabel(investigation),
    metadata: {
      kind: entry.kind,
      contentPreview: String(entry.content || '').slice(0, 180)
    }
  });

  return res.json({ success: true, entry, investigation: investigationsRepo.findInvestigationById(req.params.id) });
});

router.post('/api/v1/investigations/:id/links', authRequired, validate(investigationLinkSchema), (req, res) => {
  if (!canManageInvestigations(req.user)) {
    return res.status(403).json({ error: 'Ajout de lien reserve aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const investigation = investigationsRepo.findInvestigationById(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const link = investigationsRepo.addLink(req.params.id, {
    linkType: req.body.linkType,
    linkedId: req.body.linkedId,
    linkedLabel: req.body.linkedLabel,
    linkedMeta: req.body.linkedMeta || {},
    createdBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_link_add',
    entityType: 'investigation',
    entityId: req.params.id,
    targetLabel: buildTargetLabel(investigation),
    metadata: {
      linkType: link.linkType,
      linkedId: link.linkedId,
      linkedLabel: link.linkedLabel
    }
  });

  return res.json({ success: true, link, investigation: investigationsRepo.findInvestigationById(req.params.id) });
});

router.delete('/api/v1/investigations/:id/links/:linkId', authRequired, (req, res) => {
  if (!canManageInvestigations(req.user)) {
    return res.status(403).json({ error: 'Suppression de lien reservee aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const investigation = investigationsRepo.findInvestigationById(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const removed = investigationsRepo.removeLink(req.params.id, req.params.linkId);
  if (!removed) {
    return res.status(404).json({ error: 'Lien introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_link_remove',
    entityType: 'investigation',
    entityId: req.params.id,
    targetLabel: buildTargetLabel(investigation),
    metadata: {
      linkType: removed.linkType,
      linkedId: removed.linkedId,
      linkedLabel: removed.linkedLabel
    }
  });

  return res.json({ success: true, removed, investigation: investigationsRepo.findInvestigationById(req.params.id) });
});

router.post('/api/v1/investigations/:id/attachments', authRequired, validate(investigationAttachmentSchema), (req, res) => {
  if (!canManageInvestigations(req.user)) {
    return res.status(403).json({ error: 'Ajout de piece jointe reserve aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const investigation = investigationsRepo.findInvestigationById(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const attachment = investigationsRepo.saveAttachment(req.params.id, {
    filename: req.body.filename,
    mimeType: req.body.mimeType,
    dataUrl: req.body.dataUrl,
    caption: req.body.caption || '',
    uploadedBy: req.user.pseudo
  });

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_attachment_add',
    entityType: 'investigation',
    entityId: req.params.id,
    targetLabel: buildTargetLabel(investigation),
    metadata: {
      filename: attachment.filename,
      caption: attachment.caption || ''
    }
  });

  return res.json({ success: true, attachment, investigation: investigationsRepo.findInvestigationById(req.params.id) });
});

router.delete('/api/v1/investigations/:id/attachments/:attachmentId', authRequired, (req, res) => {
  if (!canManageInvestigations(req.user)) {
    return res.status(403).json({ error: 'Suppression de piece jointe reservee aux chefs d unite+, aux inspecteurs+ et aux administrateurs' });
  }

  const investigation = investigationsRepo.findInvestigationById(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Enquete introuvable' });
  }

  const removed = investigationsRepo.removeAttachment(req.params.id, req.params.attachmentId);
  if (!removed) {
    return res.status(404).json({ error: 'Piece jointe introuvable' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'investigation_attachment_remove',
    entityType: 'investigation',
    entityId: req.params.id,
    targetLabel: buildTargetLabel(investigation),
    metadata: {
      filename: removed.filename
    }
  });

  return res.json({ success: true, removed, investigation: investigationsRepo.findInvestigationById(req.params.id) });
});

router.get('/api/v1/investigations/:id/attachments/:attachmentId/file', authRequired, (req, res) => {
  if (!canViewInvestigations(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux chefs d unite+, a la Justice et aux administrateurs' });
  }

  const result = investigationsRepo.getAttachmentAbsolutePath(req.params.id, req.params.attachmentId);
  if (!result) {
    return res.status(404).json({ error: 'Piece jointe introuvable' });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.type(result.attachment.mimeType || 'application/octet-stream');
  return res.sendFile(result.absolutePath);
});

module.exports = router;
