const express = require('express');

const usersRepo = require('../../../core/repositories/users');
const membersRepo = require('../repositories/membres');
const stateRepo = require('../repositories/state');
const { adminRequired, authRequired } = require('../../../core/middleware/auth');
const { validate } = require('../../../core/middleware/validate');
const { canEditCP, getUserCapabilities } = require('../services/permissions');
const presenceService = require('../../../core/services/presence');
const { applyColumnSoftDelete, buildCodePenalSchemaSummary, buildPreviewImpact, promoteColumnToGlobal } = require('../services/column-impact');
const { codePenalPreviewSchema, codePenalPromoteColumnSchema, codePenalSchema, driRoleSchema, linkUserSchema, permissionSchema, policeRoleSchema } = require('../../../validation/schemas');
const { getLoadedSections } = require('../../../core/loader');

const router = express.Router();

function ensureCodePenalEditAccess(req, res) {
  if (!canEditCP(req.user)) {
    res.status(403).json({ error: 'Acces reserve a la Justice, au commandement de la Police ou aux administrateurs.' });
    return false;
  }
  return true;
}

router.get('/admin/users', adminRequired, (req, res) => {
  return res.json(
    usersRepo.listUsers().map((user) => ({
      pseudo: user.pseudo,
      permission: user.permission,
      policeRole: user.policeRole,
      driRole: user.driRole,
      linkedMembre: user.linkedMembre,
      createdAt: user.createdAt,
      capabilities: getUserCapabilities(user)
    }))
  );
});

router.post('/admin/users/:pseudo/link', adminRequired, validate(linkUserSchema), (req, res) => {
  const user = usersRepo.findByPseudo(req.params.pseudo);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  if (req.body.pseudoHRP) {
    const membre = membersRepo.findByPseudoHRP(req.body.pseudoHRP);
    if (!membre) {
      return res.status(404).json({ error: 'Personnage introuvable dans le registre' });
    }

    const duplicateOwner = usersRepo.listUsers().find((entry) => (
      entry.pseudo.toLowerCase() !== user.pseudo.toLowerCase() &&
      String(entry.linkedMembre || '').toLowerCase() === String(req.body.pseudoHRP || '').toLowerCase()
    ));

    if (duplicateOwner) {
      return res.status(409).json({
        error: `Ce personnage est deja lie au compte ${duplicateOwner.pseudo}`
      });
    }
  }

  usersRepo.updateLinkedMembre(user.pseudo, req.body.pseudoHRP);
  return res.json({ success: true });
});

router.post('/admin/users/:pseudo/permission', adminRequired, validate(permissionSchema), (req, res) => {
  const user = usersRepo.findByPseudo(req.params.pseudo);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  if (user.permission === 'ADMIN' && req.body.permission !== 'ADMIN' && usersRepo.countAdmins() <= 1) {
    return res.status(403).json({ error: 'Impossible de retirer le dernier administrateur' });
  }

  usersRepo.updatePermission(user.pseudo, req.body.permission);
  return res.json({ success: true, pseudo: user.pseudo, permission: req.body.permission });
});

router.post('/admin/users/:pseudo/police', adminRequired, validate(policeRoleSchema), (req, res) => {
  const user = usersRepo.findByPseudo(req.params.pseudo);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  usersRepo.updatePoliceRole(user.pseudo, req.body.policeRole);
  presenceService.updateUserRole(user.pseudo, req.body.policeRole);

  return res.json({ success: true, pseudo: user.pseudo, policeRole: req.body.policeRole });
});

router.post('/admin/users/:pseudo/dri', adminRequired, validate(driRoleSchema), (req, res) => {
  const user = usersRepo.findByPseudo(req.params.pseudo);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  usersRepo.updateDriRole(user.pseudo, req.body.driRole);

  return res.json({ success: true, pseudo: user.pseudo, driRole: req.body.driRole });
});

router.delete('/admin/users/:pseudo', adminRequired, (req, res) => {
  const user = usersRepo.findByPseudo(req.params.pseudo);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  if (user.permission === 'ADMIN' && usersRepo.countAdmins() <= 1) {
    return res.status(403).json({ error: 'Impossible de supprimer le dernier administrateur' });
  }

  usersRepo.deleteUser(user.pseudo);
  presenceService.removeUser(user.pseudo);
  return res.json({ success: true });
});

router.get('/admin/codepenal', authRequired, (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  return res.json(stateRepo.getCodePenal());
});

router.get('/api/v1/codepenal', authRequired, (req, res) => {
  return res.json(stateRepo.getCodePenal());
});

// ── Schema (colonnes effectives par section) ───────────────────────────────────
// Retourne les colonnes globales + les colonnes effectives fusionnées par section.
// Utilisé par le Studio CP et le formulaire Casier pour connaître les colonnes actives.
router.get('/api/v1/codepenal/schema', authRequired, (req, res) => {
  return res.json(buildCodePenalSchemaSummary(stateRepo.getCodePenal()));
});

// ── Preview impact (avant sauvegarde) ─────────────────────────────────────────
// Reçoit le Code Pénal proposé et retourne : colonnes ajoutées/supprimées/renommées,
// détection intelligente de rôle, avertissements, erreurs bloquantes.
// Ne modifie rien.
router.post('/api/v1/codepenal/preview-impact', authRequired, validate(codePenalPreviewSchema), (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  const current = stateRepo.getCodePenal();
  return res.json(buildPreviewImpact(current, req.body));
});

router.post('/admin/codepenal', authRequired, validate(codePenalSchema), (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  stateRepo.saveCodePenal(req.body, req.user && req.user.pseudo);
  return res.json({ ok: true });
});

router.put('/api/v1/codepenal', authRequired, validate(codePenalSchema), (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  stateRepo.saveCodePenal(req.body, req.user && req.user.pseudo);
  return res.json({ ok: true });
});

// ── Column management ─────────────────────────────────────────────────────────
// Returns global columns. Pass ?showDeleted=1 to include soft-deleted ones.
router.get('/api/v1/codepenal/columns', authRequired, (req, res) => {
  const codePenal = stateRepo.getCodePenal();
  let columns = Array.isArray(codePenal.columns) ? codePenal.columns : [];
  if (!req.query.showDeleted) {
    columns = columns.filter((c) => !c.deletedAt);
  }
  return res.json(columns);
});

// Soft-deletes a global or section column by key. System columns are protected.
router.delete('/api/v1/codepenal/columns/:key', authRequired, (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  const codePenal = stateRepo.getCodePenal();
  const { codePenal: updated, changed, error } = applyColumnSoftDelete(codePenal, req.params.key);
  if (error) return res.status(400).json({ error });
  if (changed) stateRepo.saveCodePenal(updated, req.user && req.user.pseudo);
  return res.json({ ok: true, changed });
});

// Returns effective columns for a specific section (global + section-level merged).
// Pass ?showDeleted=1 to include soft-deleted columns.
router.get('/api/v1/codepenal/sections/:sectionId/columns', authRequired, (req, res) => {
  const codePenal = stateRepo.getCodePenal();
  const section = codePenal.sections.find((s) => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section introuvable' });
  const { buildEffectiveColumns } = require('../services/column-impact');
  let effective = buildEffectiveColumns(codePenal, req.params.sectionId);
  if (!req.query.showDeleted) {
    effective = effective.filter((c) => !c.deletedAt);
  }
  return res.json({
    sectionId: section.id,
    sectionTitle: section.title,
    globalColumns: (req.query.showDeleted
      ? codePenal.columns
      : codePenal.columns.filter((c) => !c.deletedAt)),
    sectionColumns: section.columns || [],
    effectiveColumns: effective
  });
});

// Promotes a section-specific column to global scope.
// Body: { sectionId: string, columnKey: string }
router.post('/api/v1/codepenal/columns/promote', authRequired, validate(codePenalPromoteColumnSchema), (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  const { sectionId, columnKey } = req.body;
  const codePenal = stateRepo.getCodePenal();
  const { codePenal: updated, changed, error } = promoteColumnToGlobal(codePenal, sectionId, columnKey);
  if (error) return res.status(400).json({ error });
  if (changed) stateRepo.saveCodePenal(updated, req.user && req.user.pseudo);
  return res.json({ ok: true, changed });
});

// ── Historique ─────────────────────────────────────────────────────────────────
router.get('/api/v1/codepenal/history', authRequired, (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  return res.json(stateRepo.getCodePenalHistory());
});

// Retourne le snapshot complet d'une version précédente (0-based index).
router.get('/api/v1/codepenal/history/:index/snapshot', authRequired, (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  const snapshot = stateRepo.getCodePenalHistorySnapshot(Number(req.params.index));
  if (!snapshot) {
    return res.status(404).json({ error: 'Snapshot introuvable pour cet index' });
  }
  return res.json(snapshot);
});

// Restaure une version précédente. Sauvegarde l'état actuel dans l'historique
// AVANT de restaurer, afin de pouvoir annuler la restauration.
router.post('/api/v1/codepenal/restore/:index', authRequired, (req, res) => {
  if (!ensureCodePenalEditAccess(req, res)) return;
  const snapshot = stateRepo.getCodePenalHistorySnapshot(Number(req.params.index));
  if (!snapshot) {
    return res.status(404).json({ error: 'Version introuvable ou snapshot absent pour cet index' });
  }
  stateRepo.saveCodePenal(snapshot, `restore_by_${req.user.pseudo}`);
  return res.json({ ok: true, restoredAt: new Date().toISOString() });
});

router.get('/admin/sections', adminRequired, (req, res) => {
  return res.json(getLoadedSections());
});

module.exports = router;
