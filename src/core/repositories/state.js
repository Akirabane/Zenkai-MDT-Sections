// Core state repository: generic app_state management functions.
// Police-specific state (Code Pénal, history) lives in
// src/sections/police/repositories/state.js
const db = require('../db');
const { getState, setState } = require('../db/bootstrap');

function getResetConfig() {
  return getState(db, 'resetConfig') || {
    lastDailyReset: null,
    lastWeeklyReset: null
  };
}

function saveResetConfig(config) {
  setState(db, 'resetConfig', config);
}

function getDossierReferenceRegistry() {
  const stored = getState(db, 'dossierReferenceRegistry');
  const items = stored && typeof stored.items === 'object' && stored.items ? stored.items : {};
  const nextNumber = Number(stored && stored.nextNumber);
  return {
    nextNumber: Number.isFinite(nextNumber) && nextNumber > 0 ? nextNumber : 1,
    items
  };
}

function saveDossierReferenceRegistry(registry) {
  const items = registry && typeof registry.items === 'object' && registry.items ? registry.items : {};
  const nextNumber = Number(registry && registry.nextNumber);
  setState(db, 'dossierReferenceRegistry', {
    nextNumber: Number.isFinite(nextNumber) && nextNumber > 0 ? nextNumber : 1,
    items
  });
}

function getPatrolReferenceRegistry() {
  const stored = getState(db, 'patrolReferenceRegistry');
  const items = stored && typeof stored.items === 'object' && stored.items ? stored.items : {};
  const nextNumber = Number(stored && stored.nextNumber);
  return {
    nextNumber: Number.isFinite(nextNumber) && nextNumber > 0 ? nextNumber : 1,
    items
  };
}

function savePatrolReferenceRegistry(registry) {
  const items = registry && typeof registry.items === 'object' && registry.items ? registry.items : {};
  const nextNumber = Number(registry && registry.nextNumber);
  setState(db, 'patrolReferenceRegistry', {
    nextNumber: Number.isFinite(nextNumber) && nextNumber > 0 ? nextNumber : 1,
    items
  });
}

function getRegistrySyncState() {
  return getState(db, 'registrySyncState') || {
    lastStartedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: '',
    sourceCount: 0,
    syncedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    removedCount: 0
  };
}

function saveRegistrySyncState(state) {
  setState(db, 'registrySyncState', {
    ...getRegistrySyncState(),
    ...(state || {})
  });
}

module.exports = {
  getDossierReferenceRegistry,
  getPatrolReferenceRegistry,
  getRegistrySyncState,
  getResetConfig,
  saveDossierReferenceRegistry,
  savePatrolReferenceRegistry,
  saveRegistrySyncState,
  saveResetConfig
};
