const fs = require('fs');
const path = require('path');

const env = require('../../config/env');

const dbDir = path.dirname(env.dbPath);
const backupDir = path.join(dbDir, 'backups');
const exportDir = path.join(dbDir, 'exports');

function getBackupDir() {
  return backupDir;
}

function getExportDir() {
  return exportDir;
}

function getTrackedFiles() {
  return [
    env.dbPath,
    `${env.dbPath}-wal`,
    `${env.dbPath}-shm`,
    env.legacyCodePenalPath
  ];
}

function buildSnapshotName(prefix, date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${prefix}_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function listSnapshots() {
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('snapshot_'))
    .map((entry) => {
      const absolutePath = path.join(backupDir, entry.name);
      const stats = fs.statSync(absolutePath);
      return {
        name: entry.name,
        absolutePath,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString()
      };
    })
    .sort((left, right) => right.name.localeCompare(left.name));
}

function resolveSnapshotDir(snapshotName) {
  const absoluteBackupDir = path.resolve(backupDir);
  const absoluteSnapshotDir = path.resolve(path.join(backupDir, snapshotName));

  if (!absoluteSnapshotDir.startsWith(`${absoluteBackupDir}${path.sep}`)) {
    throw new Error('Snapshot hors du dossier de sauvegarde');
  }

  if (!fs.existsSync(absoluteSnapshotDir)) {
    throw new Error(`Snapshot introuvable: ${snapshotName}`);
  }

  return absoluteSnapshotDir;
}

module.exports = {
  buildSnapshotName,
  getBackupDir,
  getExportDir,
  getTrackedFiles,
  listSnapshots,
  resolveSnapshotDir
};
