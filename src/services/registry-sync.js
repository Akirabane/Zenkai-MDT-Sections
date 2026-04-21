const env = require('../config/env');
const membersRepo = require('../repositories/membres');
const stateRepo = require('../repositories/state');
const logger = require('../utils/logger');
const { normalizeText } = require('../utils/normalize');

let syncTimer = null;
let syncInFlight = false;

const TEXT_FIXUPS = new Map([
  ['auxilaire de police', 'Auxiliaire de Police'],
  ['chef d unite', "Chef d'Unité"],
  ['genin confirme', 'Genin Confirmé'],
  ['tokubetsu jonin', 'Tokubetsu-Jônin'],
  ['commandant jonin', 'Commandant-Jônin'],
  ['chunin eclaireur', 'Chûnin Éclaireur'],
  ['chunin patrouilleur', 'Chûnin Patrouilleur'],
  ['konin', 'Kônin']
]);

const SECTION_RANK_FIXUPS = new Map([
  ['commandant de la police', 'CMD Police'],
  ['cmd police', 'CMD Police'],
  ['lieutenant jonin de la police', 'Lieutenant-Jônin'],
  ['lieutenant jonin', 'Lieutenant-Jônin'],
  ['tokubetsu inspecteur', 'Tokubetsu-Inspecteur'],
  ['inspecteur', 'Inspecteur'],
  ['chef d unite', "Chef d'Unité"],
  ['chef d\'unite', "Chef d'Unité"],
  ['chunin patrouilleur', 'Chûnin Patrouilleur'],
  ['chunin eclaireur', 'Chûnin Éclaireur'],
  ['auxiliaire de police', 'Auxiliaire de Police'],
  ['auxilaire de police', 'Auxiliaire de Police']
]);

function repairMojibake(value) {
  const text = String(value || '').trim();
  if (!text || !/[ÃÂ]/.test(text)) {
    return text;
  }

  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8').trim();
    return repaired && !repaired.includes('\uFFFD') ? repaired : text;
  } catch (error) {
    return text;
  }
}

function collapseWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  const text = collapseWhitespace(value);
  if (!text) {
    return '';
  }

  return text
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (part.includes("'")) {
        return part
          .split("'")
          .map((subPart) => (subPart ? subPart.charAt(0).toUpperCase() + subPart.slice(1).toLowerCase() : subPart))
          .join("'");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function cleanSourceText(value, options = {}) {
  const repaired = repairMojibake(value);
  const collapsed = collapseWhitespace(repaired);
  if (!collapsed) {
    return '';
  }

  const normalized = normalizeText(collapsed);
  if (TEXT_FIXUPS.has(normalized)) {
    return TEXT_FIXUPS.get(normalized);
  }

  if (options.titleCase) {
    return titleCase(collapsed);
  }

  return collapsed;
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleDateString('fr-FR');
}

function joinChakra(values) {
  if (!Array.isArray(values)) {
    return cleanSourceText(values, { titleCase: true });
  }

  return values
    .map((item) => cleanSourceText(item, { titleCase: true }))
    .filter(Boolean)
    .join(' / ');
}

function joinChakraAndKg(chakraValues, kgValue) {
  const parts = [];
  const chakraText = joinChakra(chakraValues);
  const kgText = Array.isArray(kgValue)
    ? kgValue.map((item) => cleanSourceText(item, { titleCase: true })).filter(Boolean).join(' / ')
    : cleanSourceText(kgValue, { titleCase: true });

  if (chakraText) {
    chakraText.split('/').map((item) => item.trim()).filter(Boolean).forEach((item) => {
      if (!parts.includes(item)) {
        parts.push(item);
      }
    });
  }

  if (kgText) {
    kgText.split('/').map((item) => item.trim()).filter(Boolean).forEach((item) => {
      if (!parts.includes(item)) {
        parts.push(item);
      }
    });
  }

  return parts.join(' / ');
}

function canonicalizeSectionRank(rawValue, order) {
  const cleaned = cleanSourceText(rawValue, { titleCase: true });

  if (env.registrySyncBypassCanonicalize) {
    return cleaned;
  }

  const normalized = normalizeText(cleaned);

  if (SECTION_RANK_FIXUPS.has(normalized)) {
    return SECTION_RANK_FIXUPS.get(normalized);
  }

  const numericOrder = Number(order);
  if (Number.isFinite(numericOrder)) {
    if (numericOrder <= 1) return 'CMD Police';
    if (numericOrder === 2) return 'Lieutenant-Jônin';
    if (numericOrder === 3) return 'Tokubetsu-Inspecteur';
    if (numericOrder === 4) return 'Inspecteur';
    if (numericOrder === 5) return "Chef d'Unité";
    if (numericOrder === 6) return 'Chûnin Patrouilleur';
    if (numericOrder === 7) return 'Chûnin Éclaireur';
  }

  return cleaned;
}

function buildSourceKey(lastName, firstName) {
  const left = normalizeText(lastName);
  const right = normalizeText(firstName);
  if (!left && !right) {
    return '';
  }
  return `${left}|${right}`;
}

function getSourceIdentity(source) {
  return {
    firstName: cleanSourceText(source.nom_rp, { titleCase: true }),
    lastName: cleanSourceText(source.prenom_rp, { titleCase: true })
  };
}

function buildPseudoFallback(source, usedPseudos, index) {
  const identity = getSourceIdentity(source);
  const first = normalizeText(identity.firstName).replace(/\s+/g, '_');
  const last = normalizeText(identity.lastName).replace(/\s+/g, '_');
  const base = collapseWhitespace(`${first}_${last}`).replace(/\s+/g, '_') || `membre_${index + 1}`;
  let candidate = base;
  let suffix = 2;

  while (usedPseudos.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  usedPseudos.add(candidate);
  return candidate;
}

function buildLocalIndex(membres) {
  const byKey = new Map();
  (membres || []).forEach((membre) => {
    const fullName = cleanSourceText(membre.nomRP, { titleCase: true });
    const parts = fullName.split(' ').filter(Boolean);
    let firstName = '';
    let lastName = '';

    if (parts.length > 1) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else {
      firstName = fullName;
    }

    const key = buildSourceKey(lastName, firstName);
    if (key && !byKey.has(key)) {
      byKey.set(key, membre);
    }
  });

  return byKey;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.registrySyncTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Sync registre externe en echec (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders() {
  if (env.registrySyncAuthMode === 'bearer') {
    return {
      Authorization: `Bearer ${env.registrySyncApiKey}`
    };
  }

  return {
    'X-API-Key': env.registrySyncApiKey
  };
}

function extractMembers(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload && payload.members)) {
    return payload.members;
  }

  if (Array.isArray(payload && payload.data)) {
    return payload.data;
  }

  return [];
}

function extractTotal(payload, fallback) {
  if (Number.isFinite(Number(payload && payload.total))) {
    return Number(payload.total);
  }

  if (Number.isFinite(Number(payload && payload.count))) {
    return Number(payload.count);
  }

  return fallback;
}

async function fetchAllMembersFromSource() {
  const headers = buildHeaders();
  const limit = Math.max(1, env.registrySyncPageSize || 100);
  const results = [];
  let offset = 0;
  let total = null;

  while (total === null || results.length < total) {
    const url = new URL(env.registrySyncUrl);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    const payload = await fetchJson(url.toString(), { headers });
    const batch = extractMembers(payload);

    if (total === null) {
      total = extractTotal(payload, batch.length);
    }

    results.push(...batch);

    if (batch.length < limit) {
      break;
    }

    offset += batch.length;
  }

  return results;
}

function mapSourceMember(source, existing, usedPseudos, index) {
  const identity = getSourceIdentity(source);
  const nomRP = collapseWhitespace(`${identity.firstName} ${identity.lastName}`).trim();
  const sourceSpecialisation = cleanSourceText(source.specialisation, { titleCase: true });

  return {
    pseudoHRP: existing && existing.pseudoHRP
      ? existing.pseudoHRP
      : buildPseudoFallback(source, usedPseudos, index),
    nomRP,
    grade: cleanSourceText(source.village_rank, { titleCase: true }),
    chakra: joinChakraAndKg(source.chakra, source.kg),
    specialisation: sourceSpecialisation || (existing && existing.specialisation) || '',
    division: (existing && existing.division) || 'Aucune',
    rang: canonicalizeSectionRank(source.section_rank, source.section_rank_order),
    dateArrivee: formatDate(source.joined_at) || (existing && existing.dateArrivee) || '',
    notes: (existing && existing.notes) || ''
  };
}

function summarizeDiff(previousByKey, nextMembers) {
  const nextKeys = new Set();
  let createdCount = 0;
  let updatedCount = 0;

  nextMembers.forEach((membre) => {
    const fullName = cleanSourceText(membre.nomRP, { titleCase: true });
    const parts = fullName.split(' ').filter(Boolean);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');
    const key = buildSourceKey(lastName, firstName);
    if (key) {
      nextKeys.add(key);
    }

    const previous = previousByKey.get(key);
    if (!previous) {
      createdCount += 1;
      return;
    }

    if (
      previous.nomRP !== membre.nomRP ||
      previous.grade !== membre.grade ||
      previous.chakra !== membre.chakra ||
      previous.specialisation !== membre.specialisation ||
      previous.division !== membre.division ||
      previous.rang !== membre.rang ||
      previous.dateArrivee !== membre.dateArrivee ||
      previous.notes !== membre.notes ||
      previous.pseudoHRP !== membre.pseudoHRP
    ) {
      updatedCount += 1;
    }
  });

  let removedCount = 0;
  previousByKey.forEach((_, key) => {
    if (!nextKeys.has(key)) {
      removedCount += 1;
    }
  });

  return { createdCount, updatedCount, removedCount };
}

function dedupeSourceMembers(sourceMembers) {
  const deduped = [];
  const seen = new Set();

  sourceMembers.forEach((source) => {
    const identity = getSourceIdentity(source);
    const key = buildSourceKey(identity.lastName, identity.firstName);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(source);
  });

  return deduped;
}

async function runRegistrySync() {
  if (!env.registrySyncEnabled || !env.registrySyncUrl || !env.registrySyncApiKey) {
    return {
      skipped: true,
      reason: 'disabled'
    };
  }

  if (syncInFlight) {
    return {
      skipped: true,
      reason: 'busy'
    };
  }

  syncInFlight = true;
  const startedAt = new Date().toISOString();
  stateRepo.saveRegistrySyncState({
    lastStartedAt: startedAt
  });

  try {
    const sourceMembers = dedupeSourceMembers(await fetchAllMembersFromSource());
    const existingMembers = membersRepo.listMembres();

    if (!sourceMembers.length && existingMembers.length) {
      throw new Error("La source externe a repondu 0 membre alors que le registre local n'est pas vide.");
    }

    const previousByKey = buildLocalIndex(existingMembers);
    const usedPseudos = new Set(existingMembers.map((item) => String(item.pseudoHRP || '').trim()).filter(Boolean));

    const mappedMembers = sourceMembers
      .map((source, index) => {
        const identity = getSourceIdentity(source);
        const key = buildSourceKey(identity.lastName, identity.firstName);
        const existing = previousByKey.get(key) || null;
        return mapSourceMember(source, existing, usedPseudos, index);
      })
      .filter((member) => member.nomRP);

    const diff = summarizeDiff(previousByKey, mappedMembers);
    membersRepo.replaceMembres(mappedMembers, startedAt);

    const syncState = {
      lastStartedAt: startedAt,
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: null,
      lastErrorMessage: '',
      sourceCount: sourceMembers.length,
      syncedCount: mappedMembers.length,
      createdCount: diff.createdCount,
      updatedCount: diff.updatedCount,
      removedCount: diff.removedCount
    };
    stateRepo.saveRegistrySyncState(syncState);

    logger.info('Synchronisation du registre terminee', {
      sourceCount: sourceMembers.length,
      syncedCount: mappedMembers.length,
      createdCount: diff.createdCount,
      updatedCount: diff.updatedCount,
      removedCount: diff.removedCount
    });

    return {
      skipped: false,
      ...syncState
    };
  } catch (error) {
    const errorState = {
      lastErrorAt: new Date().toISOString(),
      lastErrorMessage: error.message
    };
    stateRepo.saveRegistrySyncState(errorState);
    logger.error('Synchronisation du registre echouee', {
      message: error.message
    });
    return {
      skipped: false,
      failed: true,
      ...errorState
    };
  } finally {
    syncInFlight = false;
  }
}

function startRegistrySyncScheduler() {
  if (!env.registrySyncEnabled) {
    logger.info('Synchronisation du registre desactivee');
    return null;
  }

  runRegistrySync().catch((error) => {
    logger.error('Echec lancement initial du sync registre', {
      message: error.message
    });
  });

  const intervalMs = Math.max(1, env.registrySyncIntervalMinutes || 5) * 60 * 1000;
  syncTimer = setInterval(() => {
    runRegistrySync().catch((error) => {
      logger.error('Echec job sync registre', {
        message: error.message
      });
    });
  }, intervalMs);

  return syncTimer;
}

module.exports = {
  runRegistrySync,
  startRegistrySyncScheduler
};
