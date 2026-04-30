const fs = require('fs');
const path = require('path');

const env = require('../src/config/env');
const { buildSnapshotName, getExportDir } = require('../src/utils/backups');

if (!fs.existsSync(env.dbPath)) {
  console.error(`[db:export] Base SQLite introuvable: ${env.dbPath}`);
  process.exit(1);
}

const exportDir = getExportDir();
fs.mkdirSync(exportDir, { recursive: true });

const fileName = `${buildSnapshotName('police-export')}.db`;
const target = path.join(exportDir, fileName);
fs.copyFileSync(env.dbPath, target);

const metadataPath = path.join(exportDir, `${fileName}.json`);
fs.writeFileSync(metadataPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  source: env.dbPath,
  target
}, null, 2));

console.log(`[db:export] Export cree: ${target}`);
