const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function clearProjectModules() {
  Object.keys(require.cache).forEach((cacheKey) => {
    if (cacheKey.includes(`${path.sep}src${path.sep}`)) {
      delete require.cache[cacheKey];
    }
  });
}

function loadArrestsRepoWithTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'police-konoha-tests-'));
  process.env.SQLITE_PATH = path.join(tempDir, 'test.db');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.POLICE_SECRET = 'test-police-secret';

  clearProjectModules();

  const db = require('../src/db');
  const arrestsRepo = require('../src/repositories/arrests');

  db.exec(`
    DELETE FROM arrest_delits;
    DELETE FROM arrests;
  `);

  return {
    arrestsRepo,
    cleanup() {
      db.close();
      clearProjectModules();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test('filters arrests in SQLite and aggregates suspect totals correctly', () => {
  const { arrestsRepo, cleanup } = loadArrestsRepoWithTempDb();

  try {
    arrestsRepo.createArrest({
      id: 'incident-1',
      timestamp: '2026-04-01T10:00:00.000Z',
      author: 'Akirabane',
      reportType: 'incident',
      suspectNom: 'Uchiha',
      suspectPrenom: 'Sasuke',
      suspectGrade: 'Jonin',
      suspectPhoto: '',
      agentNom: 'Hatake',
      agentPrenom: 'Kakashi',
      agentGrade: 'Commandant',
      date: '01/04/2026',
      rapport: 'Incident grave sur la place centrale',
      delits: ['Desertion', 'Agression'],
      peine: 'Cellule',
      peineDetails: { totals: { avertissements: 1, celluleMinutes: 30, avertEquivalent: 1 } },
      graveEvent: false,
      graveEventDetails: ''
    });

    arrestsRepo.createArrest({
      id: 'incident-2',
      timestamp: '2026-04-02T10:00:00.000Z',
      author: 'Akirabane',
      reportType: 'incident',
      suspectNom: 'Uchiha',
      suspectPrenom: 'Sasuke',
      suspectGrade: 'Jonin',
      suspectPhoto: '',
      agentNom: 'Hatake',
      agentPrenom: 'Kakashi',
      agentGrade: 'Commandant',
      date: '02/04/2026',
      rapport: 'Deuxieme incident',
      delits: ['Agression'],
      peine: 'TIG',
      peineDetails: { totals: { tig: 1, avertEquivalent: 0 } },
      graveEvent: false,
      graveEventDetails: ''
    });

    arrestsRepo.createArrest({
      id: 'patrol-1',
      timestamp: '2026-04-03T10:00:00.000Z',
      author: 'Temari',
      reportType: 'patrol',
      suspectNom: '',
      suspectPrenom: '',
      suspectGrade: '',
      suspectPhoto: '',
      agentNom: 'Temari',
      agentPrenom: '',
      agentGrade: 'Chunin',
      date: '2026-04-03',
      rapport: 'Patrouille sans incident',
      delits: [],
      peine: '',
      peineDetails: {},
      graveEvent: false,
      graveEventDetails: ''
    });

    const filtered = arrestsRepo.listArrestsWithDelits({
      reportType: 'incident',
      suspect: 'sasuke uchiha',
      delit: 'agression',
      sort: 'oldest'
    });

    assert.deepEqual(filtered.map((item) => item.id), ['incident-1', 'incident-2']);
    assert.deepEqual(filtered[0].delits, ['Desertion', 'Agression']);

    const arrest = arrestsRepo.findArrestById('incident-1');
    assert.equal(arrest.id, 'incident-1');
    assert.equal(arrest.delits.length, 2);

    const totals = arrestsRepo.getIncidentTotalsForSuspect('UCHIHA', 'sasuke');
    assert.equal(totals.avertissements, 1);
    assert.equal(totals.celluleMinutes, 30);
    assert.equal(totals.tig, 1);
  } finally {
    cleanup();
  }
});
