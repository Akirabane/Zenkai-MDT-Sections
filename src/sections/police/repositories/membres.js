const db = require('../../../core/db');
const { setState, getState } = require('../../../core/db/bootstrap');

const GRADE_OPTIONS = [
  'Hokage',
  'Sannin',
  'Commandant-Jonin',
  'Jonin',
  'Tokubetsu-Jonin',
  'Konin',
  'Chunin',
  'Genin Confirme',
  'Genin',
  'Apprenti Genin'
];

const DIVISION_OPTIONS = ['Aucune', 'DRI', 'DPE', 'DA'];
const DIVISION_ALIASES = {
  DJN: 'DPE',
  'Division Judiciaire Ninja et de Jugement': 'DPE',
  'Division de la Discipline et Enquete': 'DPE',
  'Division de la Discipline et Enquête': 'DPE'
};

function normalizeLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(left, right) {
  const a = normalizeLookup(left);
  const b = normalizeLookup(right);

  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const costs = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let previous = i - 1;
    costs[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const current = costs[j];
      const substitution = a[i - 1] === b[j - 1] ? previous : previous + 1;
      costs[j] = Math.min(
        costs[j] + 1,
        costs[j - 1] + 1,
        substitution
      );
      previous = current;
    }
  }

  return costs[b.length];
}

function mapMembre(row) {
  return {
    pseudoHRP: row.pseudo_hrp,
    nomRP: row.nom_rp || '',
    grade: row.grade || '',
    chakra: row.chakra || '',
    specialisation: row.specialisation || '',
    division: canonicalizeDivision(row.division || ''),
    rang: row.rang || '',
    dateArrivee: row.date_arrivee || '',
    notes: row.notes || ''
  };
}

function findBestOption(value, options, fallback = '') {
  const lookup = normalizeLookup(value);
  if (!lookup) {
    return fallback;
  }

  const exact = options.find((option) => normalizeLookup(option) === lookup);
  if (exact) {
    return exact;
  }

  const scored = options.map((option) => {
    const normalized = normalizeLookup(option);
    let score = 0;

    if (normalized.startsWith(lookup) || lookup.startsWith(normalized)) {
      score = 0.95;
    } else if (normalized.includes(lookup) || lookup.includes(normalized)) {
      score = 0.9;
    } else {
      const distance = levenshtein(normalized, lookup);
      const maxLength = Math.max(normalized.length, lookup.length) || 1;
      score = 1 - (distance / maxLength);
    }

    return { option, score };
  }).sort((left, right) => right.score - left.score);

  return scored[0] && scored[0].score >= 0.45 ? scored[0].option : fallback;
}

function canonicalizeGrade(value) {
  return findBestOption(value, GRADE_OPTIONS, String(value || '').trim());
}

function canonicalizeDivision(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return 'Aucune';
  }

  if (DIVISION_ALIASES[trimmed]) {
    return DIVISION_ALIASES[trimmed];
  }

  const normalized = normalizeLookup(trimmed);
  for (const [alias, target] of Object.entries(DIVISION_ALIASES)) {
    if (normalizeLookup(alias) === normalized) {
      return target;
    }
  }

  return findBestOption(trimmed, DIVISION_OPTIONS, 'Aucune');
}

function canonicalizeMembre(membre) {
  return {
    ...membre,
    grade: canonicalizeGrade(membre.grade || ''),
    division: canonicalizeDivision(membre.division || '')
  };
}

function publicMembre(membre) {
  return {
    pseudoHRP: (membre.pseudoHRP || '').trim() || null,
    nomRP: (membre.nomRP || '').trim() || null,
    rang: (membre.rang || '').trim() || null,
    grade: (membre.grade || '').trim() || null,
    chakra: (membre.chakra || '').trim() || null,
    specialisation: (membre.specialisation || '').trim() || null,
    division: canonicalizeDivision((membre.division || '').trim()) || null,
    dateArrivee: (membre.dateArrivee || '').trim() || null,
    notes: (membre.notes || '').trim() || ''
  };
}

function listMembres() {
  return db.prepare('SELECT * FROM membres ORDER BY LOWER(pseudo_hrp) ASC').all().map(mapMembre);
}

function findByPseudoHRP(pseudoHRP) {
  const row = db.prepare('SELECT * FROM membres WHERE pseudo_hrp = ? COLLATE NOCASE').get(pseudoHRP);
  return row ? mapMembre(row) : null;
}

function findBestByPseudoHRP(query) {
  const lookup = normalizeLookup(query);
  if (!lookup) {
    return null;
  }

  const membres = listMembres();
  if (!membres.length) {
    return null;
  }

  for (const membre of membres) {
    if (normalizeLookup(membre.pseudoHRP) === lookup) {
      return { membre, matchType: 'exact', score: 1 };
    }
  }

  const scored = membres.map((membre) => {
    const pseudoLookup = normalizeLookup(membre.pseudoHRP);
    let score = 0;
    let matchType = 'closest';

    if (pseudoLookup.startsWith(lookup) || lookup.startsWith(pseudoLookup)) {
      score = 0.95;
      matchType = 'prefix';
    } else if (pseudoLookup.includes(lookup) || lookup.includes(pseudoLookup)) {
      score = 0.9;
      matchType = 'contains';
    } else {
      const distance = levenshtein(pseudoLookup, lookup);
      const maxLength = Math.max(pseudoLookup.length, lookup.length) || 1;
      score = 1 - (distance / maxLength);
    }

    return { membre, matchType, score };
  }).sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best || best.score < 0.45) {
    return null;
  }

  return best;
}

function countMembres() {
  return db.prepare('SELECT COUNT(*) AS total FROM membres').get().total;
}

function updateMembreGrade(pseudoHRP, grade) {
  const canonicalGrade = canonicalizeGrade(grade || '');
  const result = db.prepare(`
    UPDATE membres
    SET grade = ?
    WHERE pseudo_hrp = ? COLLATE NOCASE
  `).run(canonicalGrade, pseudoHRP);

  if (!result.changes) {
    return null;
  }

  const meta = getState(db, 'meta') || { version: 1 };
  setState(db, 'meta', {
    ...meta,
    lastUpdated: new Date().toISOString()
  });

  return findByPseudoHRP(pseudoHRP);
}

function replaceMembres(membres, lastUpdated) {
  const insert = db.prepare(`
    INSERT INTO membres (
      pseudo_hrp, nom_rp, grade, chakra, specialisation, division, rang, date_arrivee, notes
    ) VALUES (
      @pseudo_hrp, @nom_rp, @grade, @chakra, @specialisation, @division, @rang, @date_arrivee, @notes
    )
  `);

  const transaction = db.transaction((rows) => {
    db.prepare('DELETE FROM membres').run();
    for (const membre of rows) {
      const canonical = canonicalizeMembre(membre);
      insert.run({
        pseudo_hrp: canonical.pseudoHRP,
        nom_rp: canonical.nomRP || '',
        grade: canonical.grade || '',
        chakra: canonical.chakra || '',
        specialisation: canonical.specialisation || '',
        division: canonical.division || '',
        rang: canonical.rang || '',
        date_arrivee: canonical.dateArrivee || '',
        notes: canonical.notes || ''
      });
    }
  });

  transaction(membres);

  const meta = getState(db, 'meta') || { version: 1 };
  setState(db, 'meta', {
    ...meta,
    lastUpdated: lastUpdated || new Date().toISOString()
  });
}

function appendMembre(input) {
  const pseudoHRP = String(input.pseudoHRP || '').trim();
  const nomRP = String(input.nomRP || '').trim();
  const grade = canonicalizeGrade(input.grade || '');
  const chakra = String(input.chakra || '').trim();
  const specialisation = String(input.specialisation || '').trim();
  const division = canonicalizeDivision(input.division || '');
  const rang = String(input.rang || '').trim();
  const dateArrivee = String(input.dateArrivee || '').trim();
  const notes = String(input.notes || '').trim();

  // Generate a pseudoHRP placeholder if empty (nomRP lowercased, spaces to underscores)
  const effectivePseudo = pseudoHRP || nomRP.toLowerCase().replace(/\s+/g, '_') || ('candidat_' + Date.now().toString(36));

  // Check for duplicate pseudo_hrp
  const existing = findByPseudoHRP(effectivePseudo);
  if (existing) {
    throw new Error('Un membre avec le pseudo HRP "' + effectivePseudo + '" existe deja dans le registre');
  }

  db.prepare(`
    INSERT INTO membres (
      pseudo_hrp, nom_rp, grade, chakra, specialisation, division, rang, date_arrivee, notes
    ) VALUES (
      @pseudo_hrp, @nom_rp, @grade, @chakra, @specialisation, @division, @rang, @date_arrivee, @notes
    )
  `).run({
    pseudo_hrp: effectivePseudo,
    nom_rp: nomRP,
    grade,
    chakra,
    specialisation,
    division,
    rang,
    date_arrivee: dateArrivee,
    notes
  });

  const meta = getState(db, 'meta') || { version: 1 };
  setState(db, 'meta', {
    ...meta,
    lastUpdated: new Date().toISOString()
  });

  return findByPseudoHRP(effectivePseudo);
}

function getMeta() {
  return getState(db, 'meta') || { version: 1, lastUpdated: null };
}

module.exports = {
  GRADE_OPTIONS,
  DIVISION_OPTIONS,
  appendMembre,
  canonicalizeDivision,
  canonicalizeGrade,
  countMembres,
  findBestByPseudoHRP,
  findByPseudoHRP,
  getMeta,
  listMembres,
  publicMembre,
  replaceMembres,
  updateMembreGrade
};
