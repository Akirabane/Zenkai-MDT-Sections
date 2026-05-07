const express = require('express');
const { authRequired } = require('../../../core/middleware/auth');
const {
  canAddRegisterMembers,
  canCreateComplaints,
  canCreateInvestigations,
  canCreateReports,
  canDeleteComplaints,
  canDeleteDossiers,
  canDeleteInvestigations,
  canDeleteRegisterMembers,
  canEditCP,
  canManageCasierRecords,
  canManageComplaints,
  canManageInvestigations,
  canManagePoliceRanks,
  canViewCasierRecords,
  canViewComplaints,
  canViewHistory,
  canViewInvestigations,
  canViewPatrolReports,
  getUserCapabilities
} = require('../services/permissions');

const router = express.Router();

router.get('/auth/me', authRequired, (req, res) => {
  return res.json({
    pseudo: req.user.pseudo,
    permission: req.user.permission,
    policeRole: req.user.policeRole,
    linkedMembre: req.user.linkedMembre,
    capabilities: getUserCapabilities(req.user)
  });
});

router.get('/auth/can-edit-cp', authRequired, (req, res) => {
  return res.json({ canEdit: canEditCP(req.user) });
});

router.get('/auth/can-manage-ranks', authRequired, (req, res) => {
  return res.json({
    canManage: canManagePoliceRanks(req.user),
    canDelete: canDeleteRegisterMembers(req.user)
  });
});

router.get('/auth/can-add-registry-members', authRequired, (req, res) => {
  return res.json({ canAdd: canAddRegisterMembers(req.user) });
});

router.get('/auth/can-manage-casiers', authRequired, (req, res) => {
  return res.json({
    canView: canViewCasierRecords(req.user),
    canManage: canManageCasierRecords(req.user),
    canDeleteDossiers: canDeleteDossiers(req.user),
    canViewPatrolReports: canViewPatrolReports(req.user)
  });
});

router.get('/auth/can-view-history', authRequired, (req, res) => {
  return res.json({ canView: canViewHistory(req.user) });
});

router.get('/auth/can-manage-complaints', authRequired, (req, res) => {
  return res.json({
    canCreate: canCreateComplaints(req.user),
    canView: canViewComplaints(req.user),
    canManage: canManageComplaints(req.user),
    canDelete: canDeleteComplaints(req.user)
  });
});

router.get('/auth/can-manage-investigations', authRequired, (req, res) => {
  return res.json({
    canCreate: canCreateInvestigations(req.user),
    canView: canViewInvestigations(req.user),
    canManage: canManageInvestigations(req.user),
    canDelete: canDeleteInvestigations(req.user)
  });
});

router.get('/auth/capabilities', authRequired, (req, res) => {
  return res.json(getUserCapabilities(req.user));
});

module.exports = router;
