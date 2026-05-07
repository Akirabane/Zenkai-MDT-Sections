/**
 * Schéma SQLite de la section.
 * Préfixe toutes tes tables avec le nom de la section pour éviter les conflits.
 * Exemple : medical_dossiers, medical_prescriptions, etc.
 *
 * Ce fichier doit exporter une fonction `createTables(db)` qui sera appelée
 * au bootstrap si tu branches ce schéma dans src/core/db/bootstrap.js.
 */

function createTables(db) {
  // Exemple :
  // db.exec(`
  //   CREATE TABLE IF NOT EXISTS template_records (
  //     id        INTEGER PRIMARY KEY AUTOINCREMENT,
  //     label     TEXT NOT NULL,
  //     data      TEXT,
  //     created_at TEXT NOT NULL
  //   );
  //   CREATE INDEX IF NOT EXISTS idx_template_records_label ON template_records (label);
  // `);
}

module.exports = { createTables };
