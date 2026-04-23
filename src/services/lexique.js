const { findPenaltyRow, normalizeCodePenal, normalizeText } = require('./code-penal');
const { buildEffectiveColumns } = require('./column-impact');

const DEFAULT_LEXIQUE = {
  detention: {
    label: 'Detention',
    description: 'Temps de cellule jusqu au Jugement'
  },
  cellule: {
    label: 'Cellule',
    description: 'Temps de cellule par rapport a la peine appliquee'
  },
  avertissement: {
    label: 'Avertissement',
    description: 'x2 Avert = Signalement',
    thresholdForSignalement: 2
  },
  signalement: {
    label: 'Signalement',
    description: 'Exclusion du prochain examen ou avis de retrogradation',
    thresholdForJugement: 1
  },
  jugement: {
    label: 'Jugement',
    description: 'Instruction judiciaire interne ou passage devant l autorite competente'
  },
  tig: {
    label: 'Travaux d Interet Generaux (TIG)',
    description: 'Travaux de reparation, nettoyage, renovation, casernement, entretien de l espace vert et du village'
  },
  rules: {
    propagateEscalationToDossiers: true
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getLexique(codePenal) {
  const merged = clone(DEFAULT_LEXIQUE);
  const normalizedCodePenal = normalizeCodePenal(codePenal);
  if (!normalizedCodePenal.lexique) {
    return merged;
  }

  Object.keys(normalizedCodePenal.lexique).forEach((key) => {
    if (!merged[key]) {
      merged[key] = {};
    }
    Object.assign(merged[key], normalizedCodePenal.lexique[key] || {});
  });

  return merged;
}

function getLexiqueRules(lexique) {
  const source = lexique && typeof lexique === 'object' ? lexique : {};
  return {
    thresholdForSignalement: Number((((source.avertissement || {}).thresholdForSignalement) || DEFAULT_LEXIQUE.avertissement.thresholdForSignalement)) || DEFAULT_LEXIQUE.avertissement.thresholdForSignalement,
    thresholdForJugement: Number((((source.signalement || {}).thresholdForJugement) || DEFAULT_LEXIQUE.signalement.thresholdForJugement)) || DEFAULT_LEXIQUE.signalement.thresholdForJugement,
    propagateEscalationToDossiers: !source.rules || source.rules.propagateEscalationToDossiers !== false
  };
}

function extractMoney(text) {
  let total = 0;
  const regex = /(\d[\d\s]*)\s*r\b/gi;
  let match;
  while ((match = regex.exec(text))) {
    total += Number.parseInt(String(match[1]).replace(/\s+/g, ''), 10) || 0;
  }
  return total;
}

function parseDurationMinutes(text, keyword) {
  const regex = new RegExp(keyword + '\\s*(\\d+)\\s*min', 'i');
  const match = String(text || '').match(regex);
  return match ? (Number.parseInt(match[1], 10) || 0) : 0;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLabelVariants(primary, fallbacks) {
  return Array.from(new Set(
    [primary].concat(fallbacks || [])
      .map((value) => normalizeText(value))
      .filter(Boolean)
  ));
}

function countLabelMatches(text, variants) {
  return variants.reduce((count, variant) => {
    const pattern = variant
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegex)
      .join('\\s+');

    if (!pattern) return count;
    const regex = new RegExp(`\\b${pattern}\\b`, 'g');
    return count + ((text.match(regex) || []).length);
  }, 0);
}

function parseSanctionsFromText(text, lexique) {
  const raw = String(text || '');
  const normalized = normalizeText(raw);
  const rules = getLexiqueRules(lexique);

  const avertissements = countLabelMatches(normalized, buildLabelVariants(
    lexique && lexique.avertissement && lexique.avertissement.label,
    ['Avertissement', 'Avert']
  ));
  const signalements = countLabelMatches(normalized, buildLabelVariants(
    lexique && lexique.signalement && lexique.signalement.label,
    ['Signalement']
  ));
  const tig = countLabelMatches(normalized, buildLabelVariants(
    lexique && lexique.tig && lexique.tig.label,
    ['TIG']
  ));
  const detention = countLabelMatches(normalized, buildLabelVariants(
    lexique && lexique.detention && lexique.detention.label,
    ['Detention']
  ));
  const jugement = countLabelMatches(normalized, buildLabelVariants(
    lexique && lexique.jugement && lexique.jugement.label,
    ['Jugement']
  ));
  const confiscationMatches = normalized.match(/\bconfiscation\b/g) || [];

  const celluleMinutes = parseDurationMinutes(normalized, 'cellule');

  return {
    source: raw,
    avertissements,
    signalements,
    tig,
    detention,
    jugement,
    confiscations: confiscationMatches.length,
    celluleMinutes,
    amendeRyo: extractMoney(raw),
    avertEquivalent: avertissements + (signalements * rules.thresholdForSignalement)
  };
}

// Extracts a non-negative number from a raw cell value (stripping non-numeric chars).
function parseNumericValue(value) {
  if (value == null || value === '') return 0;
  const num = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

// Sums monetary and duration contributions from custom columns that have
// usedInPenaltyCalc: true. System columns (peine text) are excluded here
// because those are already handled via parseSanctionsFromText.
function buildCustomFieldContributions(row, effectiveColumns) {
  let amendeRyo = 0;
  let celluleMinutes = 0;
  for (const col of (effectiveColumns || [])) {
    if (col.system || !col.impact || !col.impact.usedInPenaltyCalc || col.deletedAt) continue;
    const val = row && row[col.key];
    if (val == null || val === '') continue;
    if (col.type === 'money') {
      amendeRyo += parseNumericValue(val);
    } else if (col.type === 'duration') {
      celluleMinutes += parseNumericValue(val);
    }
  }
  return { amendeRyo, celluleMinutes };
}

// Snapshots the values of custom columns visible in casiers at arrest time.
// This keeps future Code Penal edits from making historical arrests unreadable.
// Returns an array of { key, label, type, value } entries for non-system columns.
function buildCustomFieldSnapshot(row, effectiveColumns) {
  const snapshot = [];
  for (const col of (effectiveColumns || [])) {
    const impact = col && col.impact ? col.impact : null;
    const shouldSnapshot = impact && (impact.autoFillInCasier || impact.displayInCasier);
    if (col.system || !shouldSnapshot || col.deletedAt) continue;
    const value = row && row[col.key];
    if (value != null) {
      snapshot.push({ key: col.key, label: col.label, type: col.type, value });
    }
  }
  return snapshot;
}

function buildPenaltyDetails(delits, customPeine, codePenal) {
  const lexique = getLexique(codePenal);
  const customPeineValue = String(customPeine || '').trim();
  const items = (Array.isArray(delits) ? delits : []).map((delit) => {
    const resolved = findPenaltyRow(codePenal, delit);
    const recommendedPeine = resolved ? (resolved.peine || '') : '';
    const appliedPeine = customPeineValue || String(recommendedPeine || '').trim();

    const sectionId = resolved ? (resolved.sectionId || null) : null;
    const effectiveColumns = sectionId ? buildEffectiveColumns(codePenal, sectionId) : [];
    const customFields = resolved ? buildCustomFieldSnapshot(resolved, effectiveColumns) : [];

    const textSanctions = parseSanctionsFromText(appliedPeine || recommendedPeine, lexique);

    // Apply numeric contributions from custom money/duration columns only when
    // no whole-arrest custom peine overrides individual row sanctions.
    let sanctions = textSanctions;
    if (!customPeineValue && resolved) {
      const contrib = buildCustomFieldContributions(resolved, effectiveColumns);
      if (contrib.amendeRyo || contrib.celluleMinutes) {
        sanctions = {
          ...textSanctions,
          amendeRyo: textSanctions.amendeRyo + contrib.amendeRyo,
          celluleMinutes: textSanctions.celluleMinutes + contrib.celluleMinutes,
          avertEquivalent: textSanctions.avertEquivalent
        };
      }
    }

    return {
      delit,
      uid: resolved ? (resolved.uid || '') : '',
      sectionId,
      code: resolved ? resolved.code : '',
      infraction: resolved ? resolved.infraction : '',
      description: resolved ? resolved.description : '',
      recommendedPeine,
      appliedPeine,
      customFields,
      sanctions
    };
  });

  const zeroTotals = {
    avertissements: 0,
    signalements: 0,
    tig: 0,
    detention: 0,
    jugement: 0,
    confiscations: 0,
    celluleMinutes: 0,
    amendeRyo: 0,
    avertEquivalent: 0
  };

  const totals = customPeineValue
    ? Object.assign(zeroTotals, parseSanctionsFromText(customPeineValue, lexique))
    : items.reduce((acc, item) => {
      const sanctions = item.sanctions || {};
      acc.avertissements += sanctions.avertissements || 0;
      acc.signalements += sanctions.signalements || 0;
      acc.tig += sanctions.tig || 0;
      acc.detention += sanctions.detention || 0;
      acc.jugement += sanctions.jugement || 0;
      acc.confiscations += sanctions.confiscations || 0;
      acc.celluleMinutes += sanctions.celluleMinutes || 0;
      acc.amendeRyo += sanctions.amendeRyo || 0;
      acc.avertEquivalent += sanctions.avertEquivalent || 0;
      return acc;
    }, zeroTotals);

  return {
    customPeine: customPeineValue,
    lexique,
    items,
    totals: finalizePenaltyTotals(totals, lexique)
  };
}

function finalizePenaltyTotals(totals, lexique) {
  const rules = getLexiqueRules(lexique);
  const base = {
    avertissements: Number(totals && totals.avertissements || 0),
    signalements: Number(totals && totals.signalements || 0),
    tig: Number(totals && totals.tig || 0),
    detention: Number(totals && totals.detention || 0),
    jugement: Number(totals && totals.jugement || 0),
    confiscations: Number(totals && totals.confiscations || 0),
    celluleMinutes: Number(totals && totals.celluleMinutes || 0),
    amendeRyo: Number(totals && totals.amendeRyo || 0),
    avertEquivalent: Number(totals && totals.avertEquivalent || 0)
  };

  if (rules.propagateEscalationToDossiers) {
    const derivedSignalements = Math.floor(base.avertEquivalent / rules.thresholdForSignalement);
    if (derivedSignalements > base.signalements) {
      base.signalements = derivedSignalements;
    }

    const derivedJugements = Math.floor(base.signalements / rules.thresholdForJugement);
    if (derivedJugements > base.jugement) {
      base.jugement = derivedJugements;
    }
  }

  return base;
}

module.exports = {
  DEFAULT_LEXIQUE,
  buildCustomFieldContributions,
  buildCustomFieldSnapshot,
  buildPenaltyDetails,
  finalizePenaltyTotals,
  findPenaltyRow,
  getLexique,
  getLexiqueRules,
  normalizeString: normalizeText,
  parseSanctionsFromText
};
