// Core permissions: generic user/member resolution utilities.
// Police-specific logic (rank levels, canXxx functions) lives in
// src/sections/police/services/permissions.js
//
// NOTE: getLinkedMembreForUser depends on membres/users repos which are police-domain,
// so the full implementation lives in the police section. This module re-exports
// the generic helpers for any consumers that want them without police-specific stuff.

const { getLinkedMembreForUser } = require('../../sections/police/services/permissions');

module.exports = {
  getLinkedMembreForUser
};
