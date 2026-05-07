/**
 * Exemple de repository — accès base de données de la section.
 * Toujours utiliser des paramètres liés (jamais de concaténation dans les requêtes SQL).
 */
const db = require('../../../core/db');

function findAll() {
  return db.prepare('SELECT * FROM template_records ORDER BY created_at DESC').all();
}

function create(input) {
  const result = db.prepare(
    'INSERT INTO template_records (label, data, created_at) VALUES (@label, @data, @created_at)'
  ).run({
    label: input.label,
    data: input.data || null,
    created_at: new Date().toISOString()
  });
  return result.lastInsertRowid;
}

module.exports = { findAll, create };
