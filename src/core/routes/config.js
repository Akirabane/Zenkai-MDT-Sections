const express = require('express');
const env = require('../../config/env');
const { getSectionMeta } = require('../config/sectionMeta');

const router = express.Router();

router.get('/api/config', (req, res) => {
  const section = (env.enabledSections[0] || 'police').toLowerCase();
  const village = env.village || '';
  const meta = getSectionMeta(section);
  const instanceName = village
    ? `${meta.displayName} de ${village}`
    : meta.displayName;

  res.json({
    section,
    village,
    displayName: meta.displayName,
    instanceName,
    features: meta.features,
    labels: meta.labels,
  });
});

module.exports = router;
