/**
 * ZENKAI MDT — Template de section
 *
 * Copie ce dossier pour créer une nouvelle section (médical, scientifique, etc.)
 * Renomme _template par le nom de ta section, puis :
 *   1. Remplis les métadonnées ci-dessous
 *   2. Crée tes routes dans ./routes/
 *   3. Crée tes services dans ./services/
 *   4. Crée tes repositories dans ./repositories/
 *   5. Déclare tes tables SQLite dans ./db/schema.js
 *   6. Ajoute require('./sections/ta-section') dans src/app.js
 */

// const exampleRoute = require('./routes/example');

module.exports = {
  name: 'template',        // Identifiant unique de la section (snake_case)
  displayName: 'Template', // Nom affiché dans les logs
  routes: [
    // exampleRoute,
  ]
};
