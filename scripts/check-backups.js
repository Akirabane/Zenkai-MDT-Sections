const fs = require('fs');
const path = require('path');

const { getBackupDir, listSnapshots } = require('../src/utils/backups');

const snapshots = listSnapshots();
if (snapshots.length === 0) {
  console.error('[backup:verify] Aucun snapshot trouve');
  process.exit(1);
}

const latest = snapshots[0];
const manifestPath = path.join(latest.absolutePath, 'manifest.json');
const files = fs.readdirSync(latest.absolutePath);
const required = ['police.db', 'manifest.json'];
const missing = required.filter((file) => !files.includes(file));

if (missing.length > 0) {
  console.error(`[backup:verify] Snapshot incomplet: ${latest.name}`);
  console.error(`[backup:verify] Fichiers manquants: ${missing.join(', ')}`);
  process.exit(1);
}

let manifest = null;
if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

console.log('[backup:verify] OK');
console.log(`[backup:verify] Dossier: ${getBackupDir()}`);
console.log(`[backup:verify] Snapshots: ${snapshots.length}`);
console.log(`[backup:verify] Dernier: ${latest.name}`);
if (manifest) {
  console.log(`[backup:verify] Cree le: ${manifest.createdAt}`);
  console.log(`[backup:verify] Fichiers: ${manifest.files.join(', ')}`);
}
