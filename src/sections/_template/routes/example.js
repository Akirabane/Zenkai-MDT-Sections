const express = require('express');
const { authRequired } = require('../../../core/middleware/auth');

const router = express.Router();

/**
 * Exemple de route — à adapter ou supprimer.
 * Tous les imports core se font depuis '../../../core/...'
 * Les imports internes à la section se font depuis '../repositories/...' etc.
 */
router.get('/api/v1/template/example', authRequired, (req, res) => {
  return res.json({ section: 'template', user: req.user.pseudo });
});

module.exports = router;
