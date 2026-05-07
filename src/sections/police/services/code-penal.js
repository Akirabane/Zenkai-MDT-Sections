const DEFAULT_SECTION_DEFINITIONS = [
  {
    id: 'c',
    cssClass: 'section-c',
    title: 'C - Infractions Civiles',
    shortTitle: 'C - Civiles',
    color: '#68b046',
    codePrefix: 'C1'
  },
  {
    id: 'n',
    cssClass: 'section-n',
    title: 'N - Infractions Ninja / Militaire',
    shortTitle: 'N - Ninja',
    color: '#c9a030',
    codePrefix: 'N2'
  },
  {
    id: 'g',
    cssClass: 'section-g',
    title: 'G - Crimes (Casier Judiciaire)',
    shortTitle: 'G - Crimes',
    color: '#c03030',
    codePrefix: 'G3'
  },
  {
    id: 'k',
    cssClass: 'section-k',
    title: 'K - Infractions Claniques',
    shortTitle: 'K - Claniques',
    color: '#a07030',
    codePrefix: 'K5'
  },
  {
    id: 'r',
    cssClass: 'section-r',
    title: 'R - Infractions Speciales / De Crise',
    shortTitle: 'R - Speciales',
    color: '#20a0b0',
    codePrefix: 'R6'
  }
];

// Fields that are part of the fixed row schema — everything else is a custom column value.
const SYSTEM_ROW_KEYS = new Set(['uid', 'code', 'infraction', 'description', 'peine', 'status', 'expiresAt', 'notes']);

const VALID_COLUMN_TYPES = ['text', 'number', 'money', 'duration', 'boolean', 'list', 'level', 'reference'];
const VALID_COLUMN_ROLES = ['code', 'infraction', 'description', 'peine', 'status', 'notes', 'custom'];

// Default global columns that apply to every section unless overridden.
// system: true  = cannot be deleted via the UI.
// required: true = the field must be non-empty for a row to be valid.
const DEFAULT_GLOBAL_COLUMNS = [
  {
    key: 'code',
    label: 'Code',
    type: 'text',
    role: 'code',
    impact: {
      displayInCasier: true,
      autoFillInCasier: false,
      usedInPenaltyCalc: false,
      showInReports: true,
      usedInStats: false,
      exportToDocuments: true
    },
    system: true,
    required: true,
    deletedAt: null
  },
  {
    key: 'infraction',
    label: 'Infraction',
    type: 'text',
    role: 'infraction',
    impact: {
      displayInCasier: true,
      autoFillInCasier: false,
      usedInPenaltyCalc: false,
      showInReports: true,
      usedInStats: false,
      exportToDocuments: true
    },
    system: true,
    required: true,
    deletedAt: null
  },
  {
    key: 'description',
    label: 'Description',
    type: 'text',
    role: 'description',
    impact: {
      displayInCasier: true,
      autoFillInCasier: false,
      usedInPenaltyCalc: false,
      showInReports: false,
      usedInStats: false,
      exportToDocuments: true
    },
    system: true,
    required: true,
    deletedAt: null
  },
  {
    key: 'peine',
    label: 'Peine recommandee',
    type: 'text',
    role: 'peine',
    impact: {
      displayInCasier: true,
      autoFillInCasier: true,
      usedInPenaltyCalc: true,
      showInReports: true,
      usedInStats: true,
      exportToDocuments: true
    },
    system: true,
    required: true,
    deletedAt: null
  },
  {
    key: 'status',
    label: 'Statut',
    type: 'list',
    role: 'status',
    options: ['active', 'suspended', 'abrogated', 'provisional', 'temporary'],
    impact: {
      displayInCasier: false,
      autoFillInCasier: false,
      usedInPenaltyCalc: false,
      showInReports: false,
      usedInStats: false,
      exportToDocuments: false
    },
    system: true,
    required: false,
    deletedAt: null
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'text',
    role: 'notes',
    impact: {
      displayInCasier: false,
      autoFillInCasier: false,
      usedInPenaltyCalc: false,
      showInReports: false,
      usedInStats: false,
      exportToDocuments: false
    },
    system: true,
    required: false,
    deletedAt: null
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function findDefaultSectionDefinition(sectionId) {
  return DEFAULT_SECTION_DEFINITIONS.find((section) => section.id === sectionId) || null;
}

function normalizeColor(value, fallback) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw;
  }
  return fallback;
}

// Generates a stable unique identifier for a row. Called once per row during
// migration or when a new row is created. Never changes after that.
function generateRowUid() {
  const rand = Math.random().toString(36).slice(2, 9);
  const ts = Date.now().toString(36);
  return `row_${rand}${ts}`;
}

function normalizeColumnImpact(impact) {
  const src = impact && typeof impact === 'object' ? impact : {};
  return {
    displayInCasier: src.displayInCasier === true,
    autoFillInCasier: src.autoFillInCasier === true,
    usedInPenaltyCalc: src.usedInPenaltyCalc === true,
    showInReports: src.showInReports === true,
    usedInStats: src.usedInStats === true,
    exportToDocuments: src.exportToDocuments === true
  };
}

// Normalizes a column definition. Returns null if the key is missing/invalid
// so callers can filter(Boolean) the result.
function normalizeColumnDef(col) {
  if (!col || typeof col !== 'object') return null;
  const key = String(col.key || '').trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  if (!key) return null;

  const normalized = {
    key,
    label: String(col.label || col.key || '').trim() || key,
    type: VALID_COLUMN_TYPES.includes(col.type) ? col.type : 'text',
    role: VALID_COLUMN_ROLES.includes(col.role) ? col.role : 'custom',
    impact: normalizeColumnImpact(col.impact),
    system: col.system === true,
    required: col.required === true,
    deletedAt: col.deletedAt ? String(col.deletedAt) : null
  };

  if (Array.isArray(col.options) && col.options.length) {
    normalized.options = col.options.map((o) => String(o)).filter(Boolean);
  }

  return normalized;
}

const VALID_ROW_STATUSES = ['active', 'suspended', 'abrogated', 'provisional', 'temporary'];

function normalizeRow(row) {
  // Collect any custom column values that live alongside the system fields.
  // These must never be silently dropped.
  const custom = {};
  if (row && typeof row === 'object') {
    Object.keys(row).forEach((key) => {
      if (!SYSTEM_ROW_KEYS.has(key)) {
        custom[key] = row[key];
      }
    });
  }

  return {
    uid: String(row && row.uid || '').trim(),
    code: String(row && row.code || '').trim(),
    infraction: String(row && row.infraction || '').trim(),
    description: String(row && row.description || '').trim(),
    peine: String(row && row.peine || '').trim(),
    status: VALID_ROW_STATUSES.includes(row && row.status) ? row.status : 'active',
    expiresAt: (row && row.expiresAt) ? String(row.expiresAt) : null,
    notes: String(row && row.notes || '').trim(),
    ...custom
  };
}

function normalizeSection(section, index) {
  const base = findDefaultSectionDefinition(section && section.id) || DEFAULT_SECTION_DEFINITIONS[index] || {
    id: `section-${index + 1}`,
    cssClass: `section-custom-${index + 1}`,
    title: `Section ${index + 1}`,
    shortTitle: `Section ${index + 1}`,
    color: '#9a7a2a',
    codePrefix: `X${index + 1}`
  };

  const rows = Array.isArray(section && section.rows)
    ? section.rows.map(normalizeRow).filter((row) => row.code && row.infraction)
    : [];

  return {
    id: String(section && section.id || base.id).trim() || base.id,
    cssClass: String(section && section.cssClass || base.cssClass).trim() || base.cssClass,
    title: String(section && section.title || base.title).trim() || base.title,
    shortTitle: String(section && section.shortTitle || base.shortTitle).trim() || base.shortTitle,
    color: normalizeColor(section && section.color, base.color),
    codePrefix: String(section && section.codePrefix || base.codePrefix).trim() || base.codePrefix,
    icon: String(section && section.icon || '').trim().slice(0, 8),
    preamble: String(section && section.preamble || '').trim(),
    // Section-specific extra columns (beyond the global ones). Empty array = uses globals only.
    columns: Array.isArray(section && section.columns)
      ? section.columns.map(normalizeColumnDef).filter(Boolean)
      : [],
    rows
  };
}

function orderSections(sections) {
  const list = Array.isArray(sections) ? sections : [];
  if (!list.length) {
    return DEFAULT_SECTION_DEFINITIONS.map((definition, index) => normalizeSection(definition, index));
  }

  const seen = new Set();
  return list.reduce((ordered, section, index) => {
    const normalized = normalizeSection(section, index);
    if (seen.has(normalized.id)) {
      return ordered;
    }
    seen.add(normalized.id);
    ordered.push(normalized);
    return ordered;
  }, []);
}

function normalizeCodePenal(codePenal) {
  const rawSections = codePenal && Array.isArray(codePenal.sections) ? codePenal.sections : [];
  const rawVersion = Number(codePenal && codePenal.schemaVersion) || 1;

  return {
    schemaVersion: rawVersion >= 2 ? rawVersion : 1,
    // Global columns that apply to all sections. Empty = defaults will be used.
    columns: Array.isArray(codePenal && codePenal.columns)
      ? codePenal.columns.map(normalizeColumnDef).filter(Boolean)
      : [],
    sections: orderSections(rawSections),
    lexique: codePenal && typeof codePenal.lexique === 'object' && codePenal.lexique
      ? clone(codePenal.lexique)
      : {},
    preamble: String(codePenal && codePenal.preamble || '').trim()
  };
}

function collectRows(codePenal) {
  return normalizeCodePenal(codePenal).sections.reduce((accumulator, section) => {
    section.rows.forEach((row) => {
      accumulator.push({
        ...row,
        sectionId: section.id,
        sectionTitle: section.title,
        sectionShortTitle: section.shortTitle,
        sectionColor: section.color
      });
    });
    return accumulator;
  }, []);
}

function extractDelitCode(value) {
  const match = String(value || '')
    .trim()
    .replace(/[‐‑‒–—−]/g, '-')
    .match(/^([A-Z]\d+(?:\.\d+)*)\b/i);
  return match ? match[1].toUpperCase() : '';
}

function formatDelitLabel(row) {
  if (!row) return '';
  if (row.code && row.infraction) {
    return `${row.code} - ${row.infraction}`;
  }
  return String(row.code || row.infraction || '').trim();
}

function findPenaltyRow(codePenal, delitLabel) {
  const rows = collectRows(codePenal);
  const target = normalizeText(delitLabel);
  const codeOnly = normalizeText(extractDelitCode(delitLabel));

  // Try matching by uid first for new-style references, then fall back to
  // label/code matching for legacy arrest_delits entries.
  const asUid = String(delitLabel || '').trim();
  const byUid = asUid ? rows.find((row) => row.uid && row.uid === asUid) : null;
  if (byUid) return byUid;

  return rows.find((row) => {
    const rowCode = normalizeText(row.code);
    const full = normalizeText(formatDelitLabel(row));
    return target === full || target === rowCode || (codeOnly && codeOnly === rowCode);
  }) || null;
}

function resolveDelitLabel(codePenal, delitLabel) {
  const row = findPenaltyRow(codePenal, delitLabel);
  return row ? formatDelitLabel(row) : String(delitLabel || '').trim();
}

module.exports = {
  DEFAULT_GLOBAL_COLUMNS,
  DEFAULT_SECTION_DEFINITIONS,
  collectRows,
  extractDelitCode,
  findDefaultSectionDefinition,
  findPenaltyRow,
  formatDelitLabel,
  generateRowUid,
  normalizeCodePenal,
  normalizeColumnDef,
  normalizeText,
  resolveDelitLabel
};
