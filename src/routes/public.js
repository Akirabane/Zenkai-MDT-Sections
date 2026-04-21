const fs = require('fs');
const express = require('express');

const { buildOpenApi } = require('../config/openapi');
const membersRepo = require('../repositories/membres');
const stateRepo = require('../repositories/state');
const presenceService = require('../services/presence');
const { listSnapshots } = require('../utils/backups');
const packageJson = require('../../package.json');
const env = require('../config/env');

const router = express.Router();

router.get('/health', (req, res) => {
  const sqliteExists = fs.existsSync(env.dbPath);
  return res.status(sqliteExists ? 200 : 503).json({
    status: sqliteExists ? 'ok' : 'degraded',
    time: new Date().toISOString()
  });
});

router.get('/codepenal.json', (req, res) => {
  return res.redirect(301, '/api/v1/public/codepenal');
});

router.get('/api/v1/public/codepenal', (req, res) => {
  return res.json(stateRepo.getCodePenal());
});

router.get('/api/v1/openapi.json', (req, res) => {
  return res.json(buildOpenApi());
});

router.get('/api/v1/membres', (req, res) => {
  let membres = membersRepo.listMembres().map(membersRepo.publicMembre);
  const q = (req.query.q || '').trim().toLowerCase();
  const rang = (req.query.rang || '').trim().toLowerCase();
  const grade = (req.query.grade || '').trim().toLowerCase();
  const division = (req.query.division || '').trim().toLowerCase();
  const specialisation = (req.query.specialisation || '').trim().toLowerCase();
  const chakra = (req.query.chakra || '').trim().toLowerCase();
  const sort = (req.query.sort || 'pseudo').trim().toLowerCase();

  if (q) {
    membres = membres.filter((membre) => {
      const haystack = [
        membre.pseudoHRP,
        membre.nomRP,
        membre.rang,
        membre.grade,
        membre.chakra,
        membre.specialisation,
        membre.division,
        membre.dateArrivee,
        membre.notes
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  if (rang) {
    membres = membres.filter((membre) => (membre.rang || '').toLowerCase() === rang);
  }

  if (grade) {
    membres = membres.filter((membre) => (membre.grade || '').toLowerCase() === grade);
  }

  if (division) {
    membres = membres.filter((membre) => (membre.division || '').toLowerCase() === division);
  }

  if (specialisation) {
    membres = membres.filter((membre) => (membre.specialisation || '').toLowerCase().includes(specialisation));
  }

  if (chakra) {
    membres = membres.filter((membre) => (membre.chakra || '').toLowerCase().includes(chakra));
  }

  membres.sort((left, right) => {
    if (sort === 'grade') {
      return (left.grade || '').localeCompare(right.grade || '', 'fr', { sensitivity: 'base' });
    }
    if (sort === 'rang') {
      return (left.rang || '').localeCompare(right.rang || '', 'fr', { sensitivity: 'base' });
    }
    if (sort === 'division') {
      return (left.division || '').localeCompare(right.division || '', 'fr', { sensitivity: 'base' });
    }
    if (sort === 'date') {
      return (left.dateArrivee || '').localeCompare(right.dateArrivee || '', 'fr', { sensitivity: 'base' });
    }
    return (left.pseudoHRP || '').localeCompare(right.pseudoHRP || '', 'fr', { sensitivity: 'base' });
  });

  return res.json({
    total: membres.length,
    lastUpdated: membersRepo.getMeta().lastUpdated || null,
    sourceManaged: !!env.registrySyncEnabled,
    membres
  });
});

router.get('/api/v1/membres/:pseudoHRP', (req, res) => {
  const membre = membersRepo.findByPseudoHRP(req.params.pseudoHRP);
  if (!membre) {
    return res.status(404).json({ error: 'Ninja introuvable.' });
  }

  return res.json(membersRepo.publicMembre(membre));
});

router.get('/api/v1/rangs', (req, res) => {
  const membres = membersRepo.listMembres();
  const grouped = {};

  for (const membre of membres) {
    const rang = (membre.rang || 'Inconnu').trim();
    if (!grouped[rang]) {
      grouped[rang] = [];
    }
    grouped[rang].push(membersRepo.publicMembre(membre));
  }

  return res.json({
    totalMembres: membres.length,
    lastUpdated: membersRepo.getMeta().lastUpdated || null,
    rangs: Object.keys(grouped).map((rang) => ({
      rang,
      effectif: grouped[rang].length,
      membres: grouped[rang]
    }))
  });
});

router.get('/api/v1/presence', (req, res) => {
  return res.json(presenceService.getPublicPresence());
});

router.get('/api/v1/stats', (req, res) => {
  const membres = membersRepo.listMembres();
  const presence = presenceService.getFullPresence();

  const parRang = {};
  const parDivision = {};
  const parSpecialisation = {};

  for (const membre of membres) {
    const rang = (membre.rang || 'Inconnu').trim();
    const division = (membre.division || 'Aucune').trim();
    const specialisation = (membre.specialisation || 'Aucune').trim();

    parRang[rang] = (parRang[rang] || 0) + 1;
    parDivision[division] = (parDivision[division] || 0) + 1;
    parSpecialisation[specialisation] = (parSpecialisation[specialisation] || 0) + 1;
  }

  return res.json({
    totalMembres: membres.length,
    enLigneActuel: presence.users.length,
    lastUpdated: membersRepo.getMeta().lastUpdated || null,
    parRang,
    parDivision,
    parSpecialisation
  });
});

module.exports = router;
