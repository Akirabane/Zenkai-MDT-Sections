const fs = require('fs');
const path = require('path');

const env = require('../src/config/env');
const {
  buildSnapshotName,
  getBackupDir,
  getTrackedFiles,
  resolveSnapshotDir
} = require('../src/utils/backups');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--snapshot') {
      args.snapshot = argv[index + 1];
      index += 1;
    } else if (token === '--force') {
      args.force = true;
    }
  }
  return args;
}

function backupCurrentFiles() {
  const safetyDir = path.join(getBackupDir(), buildSnapshotName('restore-preflight'));
  fs.mkdirSync(safetyDir, { recursive: true });

  for (const file of getTrackedFiles()) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(safetyDir, path.basename(file)));
    }
  }

  return safetyDir;
}

function restoreSnapshot(snapshotDir) {
  const entries = fs.readdirSync(snapshotDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'manifest.json');

  const targetByFile = {
    'police.db': env.dbPath,
    'police.db-wal': `${env.dbPath}-wal`,
    'police.db-shm': `${env.dbPath}-shm`,
    'codepenal.json': env.legacyCodePenalPath
  };

  for (const entry of entries) {
    const target = targetByFile[entry.name];
    if (!target) {
      continue;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(snapshotDir, entry.name), target);
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.snapshot || !args.force) {
  console.error('Usage: node scripts/restore-backup.js --snapshot snapshot_YYYY-MM-DD_HHMMSS --force');
  process.exit(1);
}

const snapshotDir = resolveSnapshotDir(args.snapshot);
const safetyDir = backupCurrentFiles();
restoreSnapshot(snapshotDir);

console.log(`[backup:restore] Snapshot restaure: ${args.snapshot}`);
console.log(`[backup:restore] Backup de securite cree: ${safetyDir}`);
