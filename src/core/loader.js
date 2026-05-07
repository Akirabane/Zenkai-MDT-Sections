const logger = require('./utils/logger');

function loadSections(app, sections) {
  for (const section of sections) {
    for (const router of section.routes) {
      app.use(router);
    }
    logger.info(`Section chargée : ${section.name}`);
  }
}

module.exports = { loadSections };
