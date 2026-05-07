const { DEFAULT_GLOBAL_COLUMNS, normalizeColumnDef } = require('./code-penal');

// ── Effective columns ──────────────────────────────────────────────────────────
// For a given section, returns global columns + section-specific columns merged.
// If a section column has the same key as a global one it overrides it;
// otherwise it is appended after the globals.
function buildEffectiveColumns(codePenal, sectionId) {
  const globalCols = resolveGlobalColumns(codePenal);

  const section = Array.isArray(codePenal && codePenal.sections)
    ? codePenal.sections.find((s) => s.id === sectionId)
    : null;
  const sectionCols = (section && Array.isArray(section.columns) ? section.columns : [])
    .map(normalizeColumnDef)
    .filter(Boolean);

  if (!sectionCols.length) return globalCols;

  const merged = new Map();
  globalCols.forEach((col) => merged.set(col.key, col));
  sectionCols.forEach((col) => merged.set(col.key, col));

  return Array.from(merged.values());
}

function resolveGlobalColumns(codePenal) {
  const cols = codePenal && Array.isArray(codePenal.columns) && codePenal.columns.length
    ? codePenal.columns
    : DEFAULT_GLOBAL_COLUMNS;
  return cols.map(normalizeColumnDef).filter(Boolean);
}

// ── Schema summary ─────────────────────────────────────────────────────────────
// Returned by GET /api/v1/codepenal/schema.
// Gives each section its effective column list so clients never have to merge.
function buildCodePenalSchemaSummary(codePenal) {
  const globalColumns = resolveGlobalColumns(codePenal);

  const sections = Array.isArray(codePenal && codePenal.sections)
    ? codePenal.sections.map((section) => ({
        id: section.id,
        title: section.title,
        sectionColumns: Array.isArray(section.columns) ? section.columns : [],
        effectiveColumns: buildEffectiveColumns(codePenal, section.id),
        rowCount: Array.isArray(section.rows) ? section.rows.length : 0
      }))
    : [];

  return {
    schemaVersion: codePenal && codePenal.schemaVersion || 2,
    globalColumns,
    sections
  };
}

// ── Intelligent column role detection ─────────────────────────────────────────
// Uses keyword lists to guess a column's semantic role from its label.
// Returns { role, confidence, suggestionKey } — never makes decisions alone;
// the caller must present the suggestion to the user for confirmation.

const DETECTION_RULES = [
  {
    suggestionKey: 'money_auto_fill',
    detectedType: 'money',
    confidence: 'high',
    keywords: ['amende', 'ryo', 'ryos', 'montant', 'prix', 'argent', 'sanction financiere', 'penalite', 'cout', 'remboursement', 'dette']
  },
  {
    suggestionKey: 'duration_cell',
    detectedType: 'duration',
    confidence: 'high',
    keywords: ['cellule', 'prison', 'detention', 'emprisonnement', 'peine de prison', 'temps de cellule']
  },
  {
    suggestionKey: 'duration_generic',
    detectedType: 'duration',
    confidence: 'medium',
    keywords: ['duree', 'temps', 'minutes', 'heures', 'delai', 'periode']
  },
  {
    suggestionKey: 'level_severity',
    detectedType: 'level',
    confidence: 'high',
    keywords: ['niveau', 'gravite', 'severite', 'dangerosité', 'dangereux', 'criticite', 'priorite', 'poids']
  },
  {
    suggestionKey: 'boolean_mandate',
    detectedType: 'boolean',
    confidence: 'high',
    keywords: ['mandat', 'mandat obligatoire', 'arrestation obligatoire']
  },
  {
    suggestionKey: 'boolean_flag',
    detectedType: 'boolean',
    confidence: 'medium',
    keywords: ['obligatoire', 'requis', 'actif', 'valide', 'interdit', 'autorise', 'autorisé', 'force', 'forcé']
  },
  {
    suggestionKey: 'recidive',
    detectedType: 'level',
    confidence: 'high',
    keywords: ['recidive', 'recidiviste', 'rechute', 'cumul recidive', 'repetition']
  },
  {
    suggestionKey: 'peine_complementaire',
    detectedType: 'text',
    confidence: 'medium',
    keywords: ['peine complementaire', 'peine rp', 'peine supplementaire', 'sanction complementaire', 'mesure complementaire']
  }
];

const SUGGESTION_TEXTS = {
  money_auto_fill: 'Cette colonne ressemble à une amende (valeur monétaire). Voulez-vous qu\'elle alimente automatiquement le montant dans les casiers et le calcul des sanctions ?',
  duration_cell: 'Cette colonne ressemble à un temps de cellule. Voulez-vous qu\'elle soit utilisée pour le calcul automatique de la durée de détention ?',
  duration_generic: 'Cette colonne ressemble à une durée. Voulez-vous l\'intégrer dans le calcul des peines ?',
  level_severity: 'Cette colonne ressemble à un niveau de gravité. Voulez-vous l\'inclure dans les statistiques et l\'afficher dans les casiers ?',
  boolean_mandate: 'Cette colonne ressemble à un indicateur de mandat d\'arrêt. Voulez-vous l\'afficher dans les casiers et rapports ?',
  boolean_flag: 'Cette colonne ressemble à un indicateur (oui/non). Voulez-vous pouvoir filtrer les casiers sur ce critère ?',
  recidive: 'Cette colonne ressemble à un niveau de récidive. Voulez-vous l\'afficher dans les casiers et dans les rapports Discord ?',
  peine_complementaire: 'Cette colonne ressemble à une peine complémentaire. Voulez-vous l\'inclure dans les rapports et les exports ?'
};

const SUGGESTED_IMPACTS = {
  money_auto_fill: { displayInCasier: true, autoFillInCasier: true, usedInPenaltyCalc: true, showInReports: true, usedInStats: true, exportToDocuments: true },
  duration_cell: { displayInCasier: true, autoFillInCasier: true, usedInPenaltyCalc: true, showInReports: true, usedInStats: false, exportToDocuments: true },
  duration_generic: { displayInCasier: true, autoFillInCasier: false, usedInPenaltyCalc: false, showInReports: false, usedInStats: false, exportToDocuments: false },
  level_severity: { displayInCasier: true, autoFillInCasier: false, usedInPenaltyCalc: false, showInReports: false, usedInStats: true, exportToDocuments: false },
  boolean_mandate: { displayInCasier: true, autoFillInCasier: false, usedInPenaltyCalc: false, showInReports: true, usedInStats: false, exportToDocuments: true },
  boolean_flag: { displayInCasier: true, autoFillInCasier: false, usedInPenaltyCalc: false, showInReports: false, usedInStats: false, exportToDocuments: false },
  recidive: { displayInCasier: true, autoFillInCasier: false, usedInPenaltyCalc: false, showInReports: true, usedInStats: true, exportToDocuments: false },
  peine_complementaire: { displayInCasier: true, autoFillInCasier: false, usedInPenaltyCalc: false, showInReports: true, usedInStats: false, exportToDocuments: true }
};

const EMPTY_IMPACT = {
  displayInCasier: false, autoFillInCasier: false, usedInPenaltyCalc: false,
  showInReports: false, usedInStats: false, exportToDocuments: false
};

function normalizeForDetection(label) {
  return String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .trim()
    .toLowerCase();
}

function detectColumnRole(label) {
  const normalized = normalizeForDetection(label);
  for (const rule of DETECTION_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return {
        detectedType: rule.detectedType,
        confidence: rule.confidence,
        suggestionKey: rule.suggestionKey,
        suggestionText: SUGGESTION_TEXTS[rule.suggestionKey] || null,
        suggestedImpact: SUGGESTED_IMPACTS[rule.suggestionKey] || EMPTY_IMPACT
      };
    }
  }
  return { detectedType: null, confidence: 'none', suggestionKey: null, suggestionText: null, suggestedImpact: null };
}

// ── Preview impact ─────────────────────────────────────────────────────────────
// Compares the current Code Pénal with a proposed update and returns a
// structured impact report. Does NOT modify anything.
function buildPreviewImpact(current, proposed) {
  const currentGlobal = new Map(resolveGlobalColumns(current).map((c) => [c.key, c]));
  const proposedGlobal = new Map(
    (Array.isArray(proposed && proposed.columns) ? proposed.columns : [])
      .map(normalizeColumnDef)
      .filter(Boolean)
      .map((c) => [c.key, c])
  );

  const added = [];
  const removed = [];
  const renamed = [];
  const impactChanged = [];
  const warnings = [];
  const errors = [];

  // Added global columns
  for (const [key, col] of proposedGlobal) {
    if (!currentGlobal.has(key)) {
      const detection = detectColumnRole(col.label);
      added.push({
        key,
        label: col.label,
        type: col.type,
        role: col.role,
        detection
      });
    }
  }

  // Removed global columns
  for (const [key, col] of currentGlobal) {
    if (!proposedGlobal.has(key)) {
      if (col.system) {
        errors.push(`La colonne "${col.label}" (${key}) est une colonne système — elle ne peut pas être supprimée.`);
        removed.push({ key, label: col.label, cannotDelete: true, reason: 'Colonne système non supprimable' });
      } else {
        const usedInCalc = col.impact && col.impact.usedInPenaltyCalc;
        if (usedInCalc) {
          warnings.push(`La colonne "${col.label}" est utilisée pour le calcul des sanctions. Les futurs casiers n'auront plus ce calcul automatique.`);
        }
        removed.push({ key, label: col.label, cannotDelete: false, wasUsedInPenaltyCalc: !!usedInCalc });
      }
    }
  }

  // Renamed and impact-changed global columns
  for (const [key, proposedCol] of proposedGlobal) {
    const currentCol = currentGlobal.get(key);
    if (!currentCol) continue;

    if (currentCol.label !== proposedCol.label) {
      renamed.push({ key, oldLabel: currentCol.label, newLabel: proposedCol.label });
    }

    const impactKeys = ['displayInCasier', 'autoFillInCasier', 'usedInPenaltyCalc', 'showInReports', 'usedInStats', 'exportToDocuments'];
    const oldImpact = currentCol.impact || {};
    const newImpact = proposedCol.impact || {};
    const changedImpactKeys = impactKeys.filter((k) => !!oldImpact[k] !== !!newImpact[k]);
    if (changedImpactKeys.length) {
      impactChanged.push({
        key,
        label: proposedCol.label,
        changedKeys: changedImpactKeys,
        oldImpact,
        newImpact
      });

      // Warn specifically when usedInPenaltyCalc is turned off
      if (oldImpact.usedInPenaltyCalc && !newImpact.usedInPenaltyCalc) {
        warnings.push(`La colonne "${proposedCol.label}" ne sera plus utilisée pour le calcul des sanctions — les futurs casiers ne calculeront plus ce champ automatiquement.`);
      }
    }
  }

  // Duplicate-key validation on the proposed structure
  const keyValidation = validateColumnKeys(proposed);
  for (const err of keyValidation.errors) {
    errors.push(err);
  }

  // Section-level column changes (summary only — keys added/removed per section)
  const sectionChanges = buildSectionColumnChanges(current, proposed);

  return {
    columns: { added, removed, renamed, impactChanged },
    sectionChanges,
    warnings,
    errors,
    canSave: errors.length === 0,
    // Existing arrests are not re-computed (snapshots are frozen at arrest time).
    // Only NEW arrests created after saving will use the updated columns.
    estimatedAffectedArrests: 0,
    note: 'Les casiers existants gardent leurs données figées au moment de l\'arrestation. Seuls les nouveaux casiers utiliseront la nouvelle configuration.'
  };
}

function buildSectionColumnChanges(current, proposed) {
  const currentSections = new Map(
    (current && Array.isArray(current.sections) ? current.sections : []).map((s) => [s.id, s])
  );
  const proposedSections = new Map(
    (proposed && Array.isArray(proposed.sections) ? proposed.sections : []).map((s) => [s.id, s])
  );

  const changes = [];

  for (const [id, proposedSection] of proposedSections) {
    const currentSection = currentSections.get(id);
    const currentCols = new Map(
      (currentSection && Array.isArray(currentSection.columns) ? currentSection.columns : []).map((c) => [c.key, c])
    );
    const proposedCols = new Map(
      (Array.isArray(proposedSection.columns) ? proposedSection.columns : [])
        .map(normalizeColumnDef)
        .filter(Boolean)
        .map((c) => [c.key, c])
    );

    const addedSectionCols = [...proposedCols.keys()].filter((k) => !currentCols.has(k));
    const removedSectionCols = [...currentCols.keys()].filter((k) => !proposedCols.has(k));

    if (addedSectionCols.length || removedSectionCols.length) {
      changes.push({
        sectionId: id,
        sectionTitle: proposedSection.title || id,
        addedColumns: addedSectionCols.map((k) => proposedCols.get(k)),
        removedColumns: removedSectionCols.map((k) => currentCols.get(k))
      });
    }
  }

  return changes;
}

// ── Column key validation ──────────────────────────────────────────────────────
// Detects duplicate keys within global columns and within each section.
// Returns { valid: bool, errors: string[] }
function validateColumnKeys(codePenal) {
  const errors = [];

  const globalCols = Array.isArray(codePenal && codePenal.columns) ? codePenal.columns : [];
  const globalKeys = new Set();
  for (const col of globalCols) {
    if (!col || !col.key) continue;
    if (globalKeys.has(col.key)) {
      errors.push(`Clé dupliquée dans les colonnes globales : "${col.key}"`);
    }
    globalKeys.add(col.key);
  }

  const sections = Array.isArray(codePenal && codePenal.sections) ? codePenal.sections : [];
  for (const section of sections) {
    const sectionKeys = new Set();
    const sectionCols = Array.isArray(section.columns) ? section.columns : [];
    for (const col of sectionCols) {
      if (!col || !col.key) continue;
      if (sectionKeys.has(col.key)) {
        errors.push(`Clé dupliquée dans la section "${section.id || '?'}" : "${col.key}"`);
      }
      sectionKeys.add(col.key);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Soft-delete a column ───────────────────────────────────────────────────────
// Sets deletedAt on the column instead of removing it.
// Searches global columns first, then section columns.
// Returns { codePenal: updated, changed: bool, error: string|null }
function applyColumnSoftDelete(codePenal, key) {
  const now = new Date().toISOString();

  const globalCols = Array.isArray(codePenal && codePenal.columns) ? [...codePenal.columns] : [];
  const globalIdx = globalCols.findIndex((c) => c && c.key === key);
  if (globalIdx !== -1) {
    const col = globalCols[globalIdx];
    if (col.system) {
      return { codePenal, changed: false, error: `La colonne "${col.label}" est une colonne système et ne peut pas être supprimée.` };
    }
    if (col.deletedAt) {
      return { codePenal, changed: false, error: null };
    }
    globalCols[globalIdx] = { ...col, deletedAt: now };
    return { codePenal: { ...codePenal, columns: globalCols }, changed: true, error: null };
  }

  const sections = Array.isArray(codePenal && codePenal.sections) ? codePenal.sections : [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionCols = Array.isArray(section.columns) ? [...section.columns] : [];
    const sectionIdx = sectionCols.findIndex((c) => c && c.key === key);
    if (sectionIdx !== -1) {
      const col = sectionCols[sectionIdx];
      if (col.system) {
        return { codePenal, changed: false, error: `La colonne "${col.label}" est une colonne système et ne peut pas être supprimée.` };
      }
      if (col.deletedAt) {
        return { codePenal, changed: false, error: null };
      }
      sectionCols[sectionIdx] = { ...col, deletedAt: now };
      const updatedSections = [...sections];
      updatedSections[i] = { ...section, columns: sectionCols };
      return { codePenal: { ...codePenal, sections: updatedSections }, changed: true, error: null };
    }
  }

  return { codePenal, changed: false, error: `Colonne introuvable : "${key}"` };
}

// ── Promote a section column to global scope ───────────────────────────────────
// Soft-deletes the section copy and appends the column to the global column list.
// If the key already exists globally (and is not soft-deleted), returns an error.
// Returns { codePenal: updated, changed: bool, error: string|null }
function promoteColumnToGlobal(codePenal, sectionId, columnKey) {
  const sections = Array.isArray(codePenal && codePenal.sections) ? codePenal.sections : [];
  const sectionIdx = sections.findIndex((s) => s && s.id === sectionId);
  if (sectionIdx === -1) {
    return { codePenal, changed: false, error: `Section introuvable : "${sectionId}"` };
  }

  const section = sections[sectionIdx];
  const sectionCols = Array.isArray(section.columns) ? section.columns : [];
  const colIdx = sectionCols.findIndex((c) => c && c.key === columnKey);
  if (colIdx === -1) {
    return { codePenal, changed: false, error: `Colonne "${columnKey}" introuvable dans la section "${sectionId}"` };
  }

  const col = sectionCols[colIdx];
  const globalCols = Array.isArray(codePenal.columns) ? codePenal.columns : [];

  if (globalCols.some((c) => c && c.key === columnKey && !c.deletedAt)) {
    return { codePenal, changed: false, error: `Une colonne globale avec la clé "${columnKey}" existe déjà.` };
  }

  const now = new Date().toISOString();
  const newSectionCols = [...sectionCols];
  newSectionCols[colIdx] = { ...col, deletedAt: now };
  const updatedSections = [...sections];
  updatedSections[sectionIdx] = { ...section, columns: newSectionCols };

  // Replace soft-deleted global entry if one exists, otherwise append.
  const existingGlobalIdx = globalCols.findIndex((c) => c && c.key === columnKey);
  const newGlobalCols = [...globalCols];
  if (existingGlobalIdx !== -1) {
    newGlobalCols[existingGlobalIdx] = { ...col, deletedAt: null };
  } else {
    newGlobalCols.push({ ...col, deletedAt: null });
  }

  return {
    codePenal: { ...codePenal, columns: newGlobalCols, sections: updatedSections },
    changed: true,
    error: null
  };
}

module.exports = {
  applyColumnSoftDelete,
  buildCodePenalSchemaSummary,
  buildEffectiveColumns,
  buildPreviewImpact,
  detectColumnRole,
  promoteColumnToGlobal,
  resolveGlobalColumns,
  validateColumnKeys
};
