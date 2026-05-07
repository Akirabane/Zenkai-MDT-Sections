// Police state repository: police-specific app_state (Code Pénal, history).
// Generic state functions are re-exported from core.
const fs = require('fs');

const db = require('../../../core/db');
const { getState, setState } = require('../../../core/db/bootstrap');
const env = require('../../../config/env');
const { getLexique } = require('../services/lexique');
const { DEFAULT_GLOBAL_COLUMNS, normalizeCodePenal } = require('../services/code-penal');

// Re-export core state functions for full backward compatibility
const {
  getDossierReferenceRegistry,
  saveDossierReferenceRegistry,
  getPatrolReferenceRegistry,
  savePatrolReferenceRegistry,
  getRegistrySyncState,
  saveRegistrySyncState,
  getResetConfig,
  saveResetConfig
} = require('../../../core/repositories/state');

function readLegacyCodePenalSections() {
  try {
    const raw = JSON.parse(fs.readFileSync(env.legacyCodePenalPath, 'utf8'));
    return Array.isArray(raw && raw.sections) ? raw.sections : [];
  } catch (error) {
    return [];
  }
}

function getCodePenal() {
  const stored = getState(db, 'codepenal') || { sections: [] };
  const fallbackSections = readLegacyCodePenalSections();
  const mergedSource = {
    ...stored,
    sections: Array.isArray(stored.sections) && stored.sections.length
      ? stored.sections
      : fallbackSections
  };
  const raw = normalizeCodePenal(mergedSource);
  return {
    schemaVersion: raw.schemaVersion || 1,
    columns: Array.isArray(raw.columns) ? raw.columns : [],
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    lexique: getLexique(raw),
    preamble: raw.preamble || ''
  };
}

function saveCodePenal(codePenal, savedBy) {
  const normalized = normalizeCodePenal(codePenal);

  // Columns: preserve or auto-soft-delete depending on whether the caller sent
  // any column definitions at all.
  const existing = getState(db, 'codepenal');
  const existingColumns = existing && Array.isArray(existing.columns) && existing.columns.length
    ? existing.columns
    : DEFAULT_GLOBAL_COLUMNS;

  let columns = normalized.columns;
  if (!columns.length) {
    // Old Studio CP didn't send columns — keep existing ones unchanged.
    columns = existingColumns;
  } else {
    // New Studio CP sent columns. Soft-delete any non-system columns that were
    // present before but are now absent, so data is never silently lost.
    const proposedKeys = new Set(columns.map((c) => c.key));
    const now = new Date().toISOString();
    for (const existingCol of existingColumns) {
      if (!existingCol.system && !proposedKeys.has(existingCol.key) && !existingCol.deletedAt) {
        columns = [...columns, { ...existingCol, deletedAt: now }];
      }
    }
  }

  const schemaVersion = Math.max(Number(normalized.schemaVersion) || 1, 1);

  const data = {
    schemaVersion,
    columns,
    sections: Array.isArray(normalized.sections) ? normalized.sections : [],
    lexique: getLexique(normalized),
    preamble: normalized.preamble || ''
  };
  setState(db, 'codepenal', data);

  const history = getState(db, 'codepenal_history') || [];
  history.unshift({
    savedAt: new Date().toISOString(),
    savedBy: savedBy || 'inconnu',
    schemaVersion,
    totalRows: data.sections.reduce((sum, s) => sum + (s.rows || []).length, 0),
    sections: data.sections.map((s) => ({ id: s.id, title: s.title, rowCount: (s.rows || []).length })),
    // Full snapshot stored for potential restore — stripped before returning to clients.
    snapshot: JSON.parse(JSON.stringify(data))
  });
  setState(db, 'codepenal_history', history.slice(0, 25));
}

// Returns history metadata only (no full snapshots) — keeps the API response lean.
function getCodePenalHistory() {
  const entries = getState(db, 'codepenal_history') || [];
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const meta = Object.assign({}, entry);
    delete meta.snapshot;
    return meta;
  });
}

// Returns the full snapshot for a specific history entry (by 0-based index).
// Returns null if the entry doesn't exist or has no snapshot.
function getCodePenalHistorySnapshot(index) {
  const entries = getState(db, 'codepenal_history') || [];
  const entry = entries[Number(index)];
  return (entry && entry.snapshot) ? entry.snapshot : null;
}

module.exports = {
  getDossierReferenceRegistry,
  getPatrolReferenceRegistry,
  getRegistrySyncState,
  getCodePenal,
  getCodePenalHistory,
  getCodePenalHistorySnapshot,
  getResetConfig,
  saveDossierReferenceRegistry,
  savePatrolReferenceRegistry,
  saveRegistrySyncState,
  saveCodePenal,
  saveResetConfig
};
