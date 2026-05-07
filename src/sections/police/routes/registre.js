const express = require('express');

const env = require('../../../config/env');
const { authRequired, gradeBotOrAuthRequired } = require('../../../core/middleware/auth');
const { validate } = require('../../../core/middleware/validate');
const membersRepo = require('../repositories/membres');
const historyRepo = require('../../../core/repositories/history');
const { canAddRegisterMembers, canDeleteRegisterMembers, canManagePoliceRanks } = require('../services/permissions');
const { saveRegistrySchema, updateMembreGradeSchema } = require('../../../validation/schemas');

const router = express.Router();

router.post('/save', authRequired, validate(saveRegistrySchema), (req, res) => {
  const canManage = canManagePoliceRanks(req.user);
  const canAddOnly = !canManage && canAddRegisterMembers(req.user);
  const canDelete = canDeleteRegisterMembers(req.user);
  if (!canManage && !canAddOnly) {
    return res.status(403).json({ error: 'Permission insuffisante (Inspecteur+ requis)' });
  }

  const previousByPseudo = new Map(
    membersRepo.listMembres().map((membre) => [String(membre.pseudoHRP || '').toLowerCase(), membre])
  );
  const incomingByPseudo = new Map(
    req.body.membres.map((membre) => [String(membre.pseudoHRP || '').toLowerCase(), membre])
  );

  if (env.registrySyncEnabled) {
    if (previousByPseudo.size !== incomingByPseudo.size) {
      return res.status(409).json({
        error: 'Le registre est synchronise via le serveur Zenkai. Ajout et suppression manuels des membres desactives.'
      });
    }

    for (const pseudoKey of previousByPseudo.keys()) {
      if (!incomingByPseudo.has(pseudoKey)) {
        return res.status(409).json({
          error: 'Le registre est synchronise via le serveur Zenkai. Ajout et suppression manuels des membres desactives.'
        });
      }
    }
  }

  for (const [pseudoKey, previous] of previousByPseudo.entries()) {
    const incoming = incomingByPseudo.get(pseudoKey);
    if (!incoming) {
      if (!canDelete) {
        return res.status(403).json({ error: 'Suppression du registre reservee aux Lieutenants, Commandants et administrateurs.' });
      }
      continue;
    }

    if (canAddOnly) {
      const previousSnapshot = JSON.stringify({
        pseudoHRP: String(previous.pseudoHRP || '').trim(),
        nomRP: String(previous.nomRP || '').trim(),
        grade: String(previous.grade || '').trim(),
        chakra: String(previous.chakra || '').trim(),
        specialisation: String(previous.specialisation || '').trim(),
        division: String(previous.division || '').trim(),
        rang: String(previous.rang || '').trim(),
        dateArrivee: String(previous.dateArrivee || '').trim(),
        notes: String(previous.notes || '').trim()
      });

      const incomingSnapshot = JSON.stringify({
        pseudoHRP: String(incoming.pseudoHRP || '').trim(),
        nomRP: String(incoming.nomRP || '').trim(),
        grade: String(incoming.grade || '').trim(),
        chakra: String(incoming.chakra || '').trim(),
        specialisation: String(incoming.specialisation || '').trim(),
        division: String(incoming.division || '').trim(),
        rang: String(incoming.rang || '').trim(),
        dateArrivee: String(incoming.dateArrivee || '').trim(),
        notes: String(incoming.notes || '').trim()
      });

      if (previousSnapshot !== incomingSnapshot) {
        return res.status(403).json({ error: 'Inspecteur+: ajout uniquement. Modification du registre existant non autorisee.' });
      }
    }
  }

  const payloadRows = env.registrySyncEnabled
    ? req.body.membres.map((membre) => {
        const previous = previousByPseudo.get(String(membre.pseudoHRP || '').toLowerCase());
        if (!previous) {
          return membre;
        }

        return {
          pseudoHRP: previous.pseudoHRP,
          nomRP: previous.nomRP,
          grade: previous.grade,
          chakra: previous.chakra,
          specialisation: previous.specialisation,
          division: membre.division,
          rang: previous.rang,
          dateArrivee: previous.dateArrivee,
          notes: membre.notes
        };
      })
    : req.body.membres;

  membersRepo.replaceMembres(payloadRows, new Date().toISOString());

  for (const membre of req.body.membres) {
    const pseudoKey = String(membre.pseudoHRP || '').toLowerCase();
    const previous = previousByPseudo.get(pseudoKey);
    if (!previous) continue;

    const oldGrade = String(previous.grade || '').trim();
    const newGrade = membersRepo.canonicalizeGrade(membre.grade || '');
    if (oldGrade === newGrade) continue;

    historyRepo.logEvent({
      actorPseudo: req.user.pseudo,
      actorPermission: req.user.permission,
      action: 'grade_change',
      entityType: 'membre',
      entityId: membre.pseudoHRP,
      targetLabel: membre.nomRP || membre.pseudoHRP,
      metadata: {
        source: 'registre_save',
        matchType: 'exact',
        score: 1,
        oldValue: { grade: oldGrade },
        newValue: { grade: newGrade }
      }
    });
  }

  for (const membre of req.body.membres) {
    const pseudoKey = String(membre.pseudoHRP || '').toLowerCase();
    const previous = previousByPseudo.get(pseudoKey);
    if (!previous) continue;

    const oldRang = String(previous.rang || '').trim();
    const newRang = String(membre.rang || '').trim();
    if (oldRang === newRang) continue;

    historyRepo.logEvent({
      actorPseudo: req.user.pseudo,
      actorPermission: req.user.permission,
      action: 'rang_change',
      entityType: 'membre',
      entityId: membre.pseudoHRP,
      targetLabel: membre.nomRP || membre.pseudoHRP,
      metadata: {
        source: 'registre_save',
        matchType: 'exact',
        score: 1,
        oldValue: { rang: oldRang },
        newValue: { rang: newRang }
      }
    });
  }

  return res.json({
    success: true,
    sourceManaged: !!env.registrySyncEnabled,
    message: env.registrySyncEnabled
      ? 'Division et notes sauvegardees. Les donnees police centrales restent synchronisees depuis Zenkai.'
      : ''
  });
});

router.post('/api/v1/membres/grade', gradeBotOrAuthRequired, validate(updateMembreGradeSchema), (req, res) => {
  if (!canManagePoliceRanks(req.user)) {
    return res.status(403).json({ error: 'Permission insuffisante (Inspecteur+ requis)' });
  }

  const match = membersRepo.findBestByPseudoHRP(req.body.discordPseudo);
  if (!match) {
    return res.status(404).json({ error: 'Aucun pseudo HRP proche ou exact n a ete trouve dans le registre' });
  }

  const updated = membersRepo.updateMembreGrade(match.membre.pseudoHRP, req.body.grade);
  if (!updated) {
    return res.status(404).json({ error: 'Personnage introuvable dans le registre' });
  }

  historyRepo.logEvent({
    actorPseudo: req.user.pseudo,
    actorPermission: req.user.permission,
    action: 'grade_change',
    entityType: 'membre',
    entityId: updated.pseudoHRP,
    targetLabel: updated.nomRP || updated.pseudoHRP,
    metadata: {
      query: req.body.discordPseudo,
      matchType: match.matchType,
      score: Number(match.score.toFixed(3)),
      oldValue: { grade: match.membre.grade || '' },
      newValue: { grade: updated.grade || '' }
    }
  });

  return res.json({
    success: true,
    query: req.body.discordPseudo,
    matchType: match.matchType,
    score: Number(match.score.toFixed(3)),
    membre: membersRepo.publicMembre(updated)
  });
});

module.exports = router;
