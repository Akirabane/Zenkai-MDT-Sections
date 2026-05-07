const { getLexique } = require('../services/lexique');
const { DEFAULT_GLOBAL_COLUMNS, generateRowUid } = require('../services/code-penal');

function getState(db, key) {
  const row = db.prepare('SELECT json_value FROM app_state WHERE state_key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.json_value); } catch (_) { return null; }
}

function setState(db, key, value) {
  db.prepare(`
    INSERT INTO app_state (state_key, json_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET
      json_value = excluded.json_value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

function ensureCodePenalV2Migration(db) {
  const stored = getState(db, 'codepenal');
  if (!stored) return;

  const currentVersion = Number(stored.schemaVersion) || 1;
  if (currentVersion >= 2) return;

  const historyBefore = getState(db, 'codepenal_history') || [];
  const totalRowsBefore = (stored.sections || []).reduce((sum, s) => sum + (s.rows || []).length, 0);
  historyBefore.unshift({
    savedAt: new Date().toISOString(),
    savedBy: 'migration_v1_to_v2',
    schemaVersion: 1,
    totalRows: totalRowsBefore,
    sections: (stored.sections || []).map((s) => ({
      id: s.id,
      title: s.title,
      rowCount: (s.rows || []).length
    })),
    _migrationBackup: true,
    snapshot: JSON.parse(JSON.stringify(stored))
  });
  setState(db, 'codepenal_history', historyBefore.slice(0, 25));

  const migratedSections = (stored.sections || []).map((section) => {
    const rows = (section.rows || []).map((row) => {
      if (row.uid && String(row.uid).trim()) return row;
      return Object.assign({}, row, { uid: generateRowUid() });
    });
    return Object.assign({}, section, { rows });
  });

  const existingColumns = Array.isArray(stored.columns) && stored.columns.length
    ? stored.columns
    : DEFAULT_GLOBAL_COLUMNS;

  setState(db, 'codepenal', Object.assign({}, stored, {
    schemaVersion: 2,
    columns: existingColumns,
    sections: migratedSections
  }));
}

function bootstrapPoliceSection(db, env) {
  if (!getState(db, 'codepenal')) {
    const fs = require('fs');
    let legacyCodePenal = { sections: [] };
    try {
      legacyCodePenal = JSON.parse(fs.readFileSync(env.legacyCodePenalPath, 'utf8'));
    } catch (_) {}

    setState(db, 'codepenal', {
      sections: Array.isArray(legacyCodePenal.sections) ? legacyCodePenal.sections : [],
      lexique: getLexique(legacyCodePenal || {})
    });
  }

  ensureCodePenalV2Migration(db);
}

module.exports = { bootstrapPoliceSection };
