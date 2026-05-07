const express = require('express');

const logger = require('../../../core/utils/logger');
const { authRequired } = require('../../../core/middleware/auth');
const { validate } = require('../../../core/middleware/validate');
const reportsRepo = require('../repositories/arrests');
const complaintsRepo = require('../repositories/complaints');
const historyRepo = require('../../../core/repositories/history');
const membersRepo = require('../repositories/membres');
const {
  canCreateComplaints,
  canDeleteComplaints,
  canManageComplaints,
  canViewComplaints
} = require('../services/permissions');
const { complaintSchema, complaintUpdateSchema } = require('../../../validation/schemas');
const { publishComplaintToDiscord } = require('../services/casier');
const env = require('../../../config/env');
const { findComplaintDiscordThread, saveComplaintDiscordThread } = require('../repositories/complaints');

const router = express.Router();

function buildComplaintDossiers() {
  return reportsRepo.buildIncidentDossiers(
    reportsRepo.listArrestsWithDelits({ reportType: 'incident' })
  );
}

function buildComplaintTargetLabel(record) {
  return [record.accusedPrenom, record.accusedNom].filter(Boolean).join(' ').trim()
    || [record.plaintiffPrenom, record.plaintiffNom].filter(Boolean).join(' ').trim()
    || record.id;
}

function buildComplaintMetadata(record) {
  return {
    officerNom: record.officerNom || '',
    officerPrenom: record.officerPrenom || '',
    officerGradeSection: record.officerGradeSection || '',
    plaintiffNom: record.plaintiffNom || '',
    plaintiffPrenom: record.plaintiffPrenom || '',
    plaintiffGrade: record.plaintiffGrade || '',
    accusedNom: record.accusedNom || '',
    accusedPrenom: record.accusedPrenom || '',
    date: record.date || '',
    objet: record.objet || '',
    body: record.body || '',
    updatedAt: record.updatedAt || null
  };
}

router.get('/api/v1/complaints/meta', authRequired, (req, res) => {
  if (!canCreateComplaints(req.user) && !canViewComplaints(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux policiers, a la Justice et aux administrateurs' });
  }

  return res.json({
    gradeOptions: membersRepo.GRADE_OPTIONS,
    objectOptions: complaintsRepo.listComplaintObjects(),
    officerProfile: complaintsRepo.getOfficerProfileForUser(req.user)
  });
});

router.get('/api/v1/complaints', authRequired, (req, res) => {
  if (!canViewComplaints(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux policiers, a la Justice et aux administrateurs' });
  }

  const items = complaintsRepo.listComplaints({
    q: (req.query.q || '').trim() || undefined,
    objet: (req.query.objet || '').trim() || undefined,
    author: (req.query.author || '').trim() || undefined,
    plaintiff: (req.query.plaintiff || '').trim() || undefined,
    dateFrom: (req.query.dateFrom || '').trim() || undefined,
    dateTo: (req.query.dateTo || '').trim() || undefined,
    sort: (req.query.sort || 'newest').trim() || 'newest',
    limit: req.query.limit
  });
  const dossiers = buildComplaintDossiers();

  return res.json({ items: complaintsRepo.attachComplaintLinks(items, dossiers) });
});

router.post('/api/v1/complaints', authRequired, validate(complaintSchema), (req, res) => {
  if (!canCreateComplaints(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux policiers et administrateurs' });
  }

  const complaint = complaintsRepo.createComplaint({
    author: req.user.pseudo,
    officerNom: req.body.officerNom,
    officerPrenom: req.body.officerPrenom,
    officerGradeSection: req.body.officerGradeSection,
    plaintiffNom: req.body.plaintiffNom,
    plaintiffPrenom: req.body.plaintiffPrenom,
    plaintiffGrade: req.body.plaintiffGrade,
    accusedNom: req.body.accusedNom,
    accusedPrenom: req.body.accusedPrenom,
    date: req.body.date,
    objet: req.body.objet,
    body: req.body.body
  });
  const complaintWithLink = complaintsRepo.attachComplaintLinks([complaint], buildComplaintDossiers())[0] || complaint;

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'complaint_create',
    entityType: 'complaint',
    entityId: complaint.id,
    targetLabel: buildComplaintTargetLabel(complaintWithLink),
    metadata: {
      after: buildComplaintMetadata(complaintWithLink)
    }
  });

  return res.json({ success: true, complaint: complaintWithLink });
});

router.put('/api/v1/complaints/:id', authRequired, validate(complaintUpdateSchema), (req, res) => {
  if (!canManageComplaints(req.user)) {
    return res.status(403).json({ error: 'Modification reservee aux inspecteurs+ police et aux administrateurs' });
  }

  const existing = complaintsRepo.findComplaintById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Plainte introuvable' });
  }

  const updated = complaintsRepo.updateComplaintBody(req.params.id, req.body.body);
  const updatedWithLink = complaintsRepo.attachComplaintLinks([updated || existing], buildComplaintDossiers())[0] || updated || existing;

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'complaint_update',
    entityType: 'complaint',
    entityId: existing.id,
    targetLabel: buildComplaintTargetLabel(updatedWithLink),
    metadata: {
      before: buildComplaintMetadata(existing),
      after: buildComplaintMetadata(updatedWithLink)
    }
  });

  return res.json({ success: true, complaint: updatedWithLink });
});

router.post('/api/v1/complaints/publish/:id', authRequired, async (req, res) => {
  if (!canCreateComplaints(req.user) && !canManageComplaints(req.user)) {
    return res.status(403).json({ error: 'Acces reserve aux policiers et administrateurs' });
  }

  if (!env.discordPlaintesWebhookUrl) {
    return res.status(503).json({ error: 'Webhook Discord plaintes non configure' });
  }

  const existing = complaintsRepo.findComplaintById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Plainte introuvable' });
  }

  const isUpdate = req.body && req.body.isUpdate === true;

  const existingThreadId = findComplaintDiscordThread(existing.accusedNom, existing.accusedPrenom);

  let result;
  try {
    result = await publishComplaintToDiscord(env.discordPlaintesWebhookUrl, existing, {
      updateNotice: isUpdate,
      existingThreadId
    });
  } catch (err) {
    return res.status(502).json({ error: 'Echec de la publication Discord : ' + (err.message || 'erreur inconnue') });
  }

  logger.info('[complaints/publish] publication Discord', {
    complaintId: existing.id,
    existingThreadId,
    returnedThreadId: result.threadId
  });

  if (result.threadId) {
    saveComplaintDiscordThread(existing.accusedNom, existing.accusedPrenom, result.threadId);
  } else {
    logger.warn('[complaints/publish] threadId absent de la reponse Discord — impossible de persister le thread', { complaintId: existing.id });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: isUpdate ? 'complaint_republish' : 'complaint_publish',
    entityType: 'complaint',
    entityId: existing.id,
    targetLabel: buildComplaintTargetLabel(existing),
    metadata: {}
  });

  return res.json({ success: true });
});

router.delete('/api/v1/complaints/:id', authRequired, (req, res) => {
  if (!canDeleteComplaints(req.user)) {
    return res.status(403).json({ error: 'Suppression reservee aux Lieutenants, Commandants et administrateurs' });
  }

  const existing = complaintsRepo.findComplaintById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Plainte introuvable' });
  }

  complaintsRepo.deleteComplaint(req.params.id);

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'complaint_delete',
    entityType: 'complaint',
    entityId: existing.id,
    targetLabel: buildComplaintTargetLabel(existing),
    metadata: {
      before: buildComplaintMetadata(existing)
    }
  });

  return res.json({ success: true });
});

module.exports = router;
