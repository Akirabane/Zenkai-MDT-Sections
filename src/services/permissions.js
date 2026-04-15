const membersRepo = require('../repositories/membres');
const usersRepo = require('../repositories/users');
const { normalizeText } = require('../utils/normalize');

const POLICE_RANK_LEVELS = {
  auxiliaire: 1,
  chunin_patrouilleur: 2,
  chunin_eclaireur: 2,
  chef_unite: 3,
  inspecteur: 4,
  tokubetsu_inspecteur: 5,
  lieutenant: 6,
  commandant: 7
};

function normalizePoliceRank(rang) {
  const value = normalizeText(rang);

  if (!value) return '';

  if (
    value === 'cmd police' ||
    value === 'commandant' ||
    value === 'commandant jonin' ||
    value === 'commandant jonin de la police' ||
    value === 'commandant jonin police'
  ) {
    return 'commandant';
  }

  if (
    value === 'lieutenant jonin' ||
    value === 'lieutenant jonin de la police' ||
    value === 'ltj'
  ) {
    return 'lieutenant';
  }

  if (value === 'tokubetsu inspecteur' || value === 'ti') {
    return 'tokubetsu_inspecteur';
  }

  if (value === 'inspecteur') {
    return 'inspecteur';
  }

  if (
    value === 'chef d unite' ||
    value === 'chef unite' ||
    value === 'chef d unites'
  ) {
    return 'chef_unite';
  }

  if (value === 'chunin patrouilleur') {
    return 'chunin_patrouilleur';
  }

  if (value === 'chunin eclaireur') {
    return 'chunin_eclaireur';
  }

  if (value === 'auxiliaire de police') {
    return 'auxiliaire';
  }

  return value;
}

function getLinkedMembreForUser(pseudo) {
  const user = usersRepo.findByPseudo(pseudo);
  const lookupValues = [
    user && user.linkedMembre ? user.linkedMembre : '',
    pseudo
  ].filter(Boolean);

  for (const value of lookupValues) {
    const exact = membersRepo.findByPseudoHRP(value);
    if (exact) {
      return exact;
    }
  }

  const membres = membersRepo.listMembres();
  const buildAliases = (membre) => {
    const aliases = new Set();
    const pseudoAlias = normalizeText(membre.pseudoHRP || '');
    const nameAlias = normalizeText(membre.nomRP || '');

    if (pseudoAlias) {
      aliases.add(pseudoAlias);
    }

    if (nameAlias) {
      aliases.add(nameAlias);
      const parts = String(membre.nomRP || '').trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        aliases.add(normalizeText(parts.slice(1).join(' ') + ' ' + parts[0]));
      }
    }

    return aliases;
  };

  for (const rawValue of lookupValues) {
    const lookup = normalizeText(rawValue);
    if (!lookup) {
      continue;
    }

    const matched = membres.find((membre) => buildAliases(membre).has(lookup));
    if (matched) {
      return matched;
    }
  }

  return null;
}

function getPoliceRankLevel(user) {
  if (!user) return 0;
  if (user.permission === 'ADMIN') return 99;

  const membre = getLinkedMembreForUser(user.pseudo);
  if (!membre) return 0;

  const normalized = normalizePoliceRank(membre.rang);
  return POLICE_RANK_LEVELS[normalized] || 0;
}

function getUserCapabilities(user) {
  const isGuest = !!user && user.permission === 'GUEST';
  const isAdmin = !!user && user.permission === 'ADMIN';
  const isJustice = !!user && user.permission === 'JUSTICE';
  const linkedMembre = user && user.pseudo ? getLinkedMembreForUser(user.pseudo) : null;
  const isPolice = !!user && !!(user.policeRole || linkedMembre);
  const isDRI = !!(user && user.driRole) || (!!linkedMembre && String(linkedMembre.division || '').trim().toUpperCase() === 'DRI');
  const rankLevel = getPoliceRankLevel(user);
  const normalizedRank = isAdmin ? 'admin' : normalizePoliceRank(linkedMembre && linkedMembre.rang);
  const hasOperationalPoliceAccess =
    isPolice &&
    rankLevel >= POLICE_RANK_LEVELS.chunin_patrouilleur;
  const hasChiefAccess =
    isPolice &&
    rankLevel >= POLICE_RANK_LEVELS.chef_unite;
  const hasInspectorAccess =
    isPolice &&
    rankLevel >= POLICE_RANK_LEVELS.inspecteur;
  const hasLieutenantAccess =
    isPolice &&
    rankLevel >= POLICE_RANK_LEVELS.lieutenant;

  const canCreateReports = isAdmin || hasOperationalPoliceAccess;
  const canViewReportForms = canCreateReports;
  const canUsePoliceService = isAdmin || hasOperationalPoliceAccess;
  const canGeneratePoliceCard = canUsePoliceService;
  const canViewDashboard = isAdmin || isJustice || hasChiefAccess;
  const canManageReports = isAdmin || hasInspectorAccess;
  const canViewReports = canManageReports || isJustice;
  const canViewPatrolReports = isAdmin || hasInspectorAccess;
  const canCreateComplaints = isAdmin || hasOperationalPoliceAccess;
  const canViewComplaints = isAdmin || isJustice || hasInspectorAccess;
  const canManageComplaints = isAdmin || hasInspectorAccess;
  const canDeleteComplaints = isAdmin || hasLieutenantAccess;
  const canCreateInvestigations = isAdmin || hasChiefAccess;
  const canViewInvestigations = canCreateInvestigations || isJustice;
  const canManageInvestigations = canCreateInvestigations;
  const canDeleteInvestigations = isAdmin || hasLieutenantAccess;
  const canAccessDRI = isAdmin || isDRI;
  const canManageDRI = canAccessDRI;
  const canAddRegisterMembers = isAdmin || hasInspectorAccess;
  const canEditReferenceData = isAdmin || hasInspectorAccess;
  const canViewHistoryPanel = isAdmin || hasInspectorAccess;
  const canEditCodePenal = canEditReferenceData || isJustice;
  const canDeleteRegisterMembers = isAdmin || hasLieutenantAccess;

  return {
    isGuest,
    isAdmin,
    isJustice,
    isPolice,
    isDRI,
    rankLevel,
    normalizedRank,
    canViewHierarchy: !!user,
    canViewRegister: !!user,
    canViewCodePenal: !!user,
    canViewIncidentReportPage: canViewReportForms,
    canViewPatrolReportPage: canViewReportForms,
    canCreateIncidentReport: canCreateReports,
    canCreatePatrolReport: canCreateReports,
    canUsePoliceService,
    canGeneratePoliceCard,
    canCreateComplaints,
    canViewComplaints,
    canManageComplaints,
    canDeleteComplaints,
    canCreateInvestigations,
    canViewInvestigations,
    canManageInvestigations,
    canDeleteInvestigations,
    canAccessDRI,
    canManageDRI,
    canViewDashboard,
    canViewReports,
    canViewPatrolReports,
    canManageReports,
    canDeleteDossiers: isAdmin || hasLieutenantAccess,
    canViewHistory: canViewHistoryPanel,
    canEditHierarchy: canEditReferenceData,
    canEditRegister: canEditReferenceData,
    canAddRegisterMembers,
    canDeleteRegisterMembers,
    canEditCodePenal,
    canManagePoliceRanks: canEditReferenceData,
    canTransferInvestigationsAcrossDivisions: isDRI
  };
}

function canEditCP(user) {
  return getUserCapabilities(user).canEditCodePenal;
}

function canManagePoliceRanks(user) {
  return getUserCapabilities(user).canManagePoliceRanks;
}

function canAddRegisterMembers(user) {
  return getUserCapabilities(user).canAddRegisterMembers;
}

function canViewCasierStats(user) {
  return getUserCapabilities(user).canViewDashboard;
}

function canManageCasierRecords(user) {
  return getUserCapabilities(user).canManageReports;
}

function canViewCasierRecords(user) {
  return getUserCapabilities(user).canViewReports;
}

function canViewHistory(user) {
  return getUserCapabilities(user).canViewHistory;
}

function canDeleteDossiers(user) {
  return getUserCapabilities(user).canDeleteDossiers;
}

function canDeleteRegisterMembers(user) {
  return getUserCapabilities(user).canDeleteRegisterMembers;
}

function canCreateComplaints(user) {
  return getUserCapabilities(user).canCreateComplaints;
}

function canViewComplaints(user) {
  return getUserCapabilities(user).canViewComplaints;
}

function canManageComplaints(user) {
  return getUserCapabilities(user).canManageComplaints;
}

function canDeleteComplaints(user) {
  return getUserCapabilities(user).canDeleteComplaints;
}

function canCreateInvestigations(user) {
  return getUserCapabilities(user).canCreateInvestigations;
}

function canViewInvestigations(user) {
  return getUserCapabilities(user).canViewInvestigations;
}

function canManageInvestigations(user) {
  return getUserCapabilities(user).canManageInvestigations;
}

function canDeleteInvestigations(user) {
  return getUserCapabilities(user).canDeleteInvestigations;
}

function canCreateReports(user) {
  return getUserCapabilities(user).canCreateIncidentReport;
}

function canViewPatrolReports(user) {
  return getUserCapabilities(user).canViewPatrolReports;
}

function canAccessDRI(user) {
  return getUserCapabilities(user).canAccessDRI;
}

function canManageDRI(user) {
  return getUserCapabilities(user).canManageDRI;
}

module.exports = {
  canDeleteDossiers,
  canDeleteRegisterMembers,
  canEditCP,
  canAddRegisterMembers,
  canCreateReports,
  canCreateComplaints,
  canDeleteComplaints,
  canDeleteInvestigations,
  canManageCasierRecords,
  canManageComplaints,
  canCreateInvestigations,
  canManageInvestigations,
  canManagePoliceRanks,
  canViewCasierRecords,
  canViewComplaints,
  canViewInvestigations,
  canViewPatrolReports,
  canViewHistory,
  canViewCasierStats,
  canAccessDRI,
  canManageDRI,
  getPoliceRankLevel,
  getUserCapabilities,
  getLinkedMembreForUser,
  normalizePoliceRank
};
