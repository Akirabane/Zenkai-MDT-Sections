const logger = require('./utils/logger');

const _loadedSections = [];

function loadSections(app, sections) {
  for (const section of sections) {
    for (const router of section.routes) {
      app.use(router);
    }
    _loadedSections.push({
      name: section.name,
      displayName: section.displayName || section.name,
      routeCount: section.routes.length
    });
    logger.info(`Section chargée : ${section.displayName || section.name}`);
  }
}

function getLoadedSections() {
  return _loadedSections;
}

module.exports = { loadSections, getLoadedSections };
