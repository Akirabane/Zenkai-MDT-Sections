const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const env = require('../src/config/env');
const logger = require('../src/utils/logger');
const {
  buildSnapshotName,
  getBackupDir,
  getTrackedFiles,
  listSnapshots
} = require('../src/utils/backups');

const BACKUP_DIR = getBackupDir();
const BACKUP_INTERVAL_MS = env.backupIntervalMinutes * 60 * 1000;
const MAX_BACKUPS = env.backupMaxSnapshots;
const TIMEZONE = env.backupTimezone;

function getTime() {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function log(type, message) {
  logger.info(message, { source: 'backup', type, time: getTime() });
}

async function ensureBackupDir() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

async function copyIfExists(source, targetDirectory) {
  try {
    await fsp.access(source);
  } catch (error) {
    return false;
  }

  const fileName = path.basename(source);
  await fsp.copyFile(source, path.join(targetDirectory, fileName));
  return true;
}

async function createBackup() {
  await ensureBackupDir();

  const backupFolder = path.join(BACKUP_DIR, buildSnapshotName('snapshot'));
  await fsp.mkdir(backupFolder, { recursive: true });

  const copiedFiles = [];
  let copied = 0;
  for (const file of getTrackedFiles()) {
    if (await copyIfExists(file, backupFolder)) {
      copied += 1;
      copiedFiles.push(path.basename(file));
    }
  }

  if (copied === 0) {
    await fsp.rm(backupFolder, { recursive: true, force: true });
    log('WARN', 'Aucun fichier a sauvegarder.');
    return;
  }

  await fsp.writeFile(path.join(backupFolder, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    timezone: TIMEZONE,
    files: copiedFiles
  }, null, 2));
  await fsp.writeFile(path.join(BACKUP_DIR, 'latest.json'), JSON.stringify({
    snapshot: path.basename(backupFolder),
    createdAt: new Date().toISOString(),
    files: copiedFiles
  }, null, 2));

  log('BACKUP', `Snapshot cree: ${path.basename(backupFolder)} (${copied} fichier(s))`);
  await cleanupBackups();
}

async function cleanupBackups() {
  const folders = listSnapshots().map((entry) => entry.name);

  if (folders.length <= MAX_BACKUPS) {
    return;
  }

  for (const folder of folders.slice(MAX_BACKUPS)) {
    await fsp.rm(path.join(BACKUP_DIR, folder), { recursive: true, force: true });
    log('CLEAN', `Snapshot supprime: ${folder}`);
  }
}

async function main() {
  await createBackup();
  setInterval(() => {
    createBackup().catch((error) => logger.error('Backup automatique echoue', {
      source: 'backup',
      message: error.message
    }));
  }, BACKUP_INTERVAL_MS);

  log('INIT', 'Backup system demarre');
}

main().catch((error) => {
  logger.error('Backup system crash au demarrage', {
    source: 'backup',
    message: error.message
  });
  process.exitCode = 1;
});
