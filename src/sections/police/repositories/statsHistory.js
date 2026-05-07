const fs = require('fs');
const path = require('path');

const { getBackupDir } = require('../../../core/utils/backups');
const { formatPeriodLabel } = require('../services/dashboard-periods');

const HISTORY_DIR = path.join(getBackupDir(), 'stats-history');

function ensureHistoryDir() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function buildSnapshotFileName(periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const pad = (value) => String(value).padStart(2, '0');
  const startLabel = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endLabel = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return `stats-police_${startLabel}_to_${endLabel}.json`;
}

function saveSnapshot(payload) {
  ensureHistoryDir();
  const fileName = buildSnapshotFileName(payload.meta.periodStart, payload.meta.periodEnd);
  const absolutePath = path.join(HISTORY_DIR, fileName);
  fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2));
  return {
    id: fileName,
    absolutePath
  };
}

function listSnapshots(limit = 52) {
  ensureHistoryDir();
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(260, Number(limit))) : 52;

  return fs.readdirSync(HISTORY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith('stats-police_') && entry.name.endsWith('.json'))
    .map((entry) => {
      const absolutePath = path.join(HISTORY_DIR, entry.name);
      const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
      return {
        id: entry.name,
        label: raw.meta && raw.meta.label ? raw.meta.label : formatPeriodLabel(raw.meta.periodStart, raw.meta.periodEnd),
        periodStart: raw.meta.periodStart,
        periodEnd: raw.meta.periodEnd,
        createdAt: raw.meta.snapshotCreatedAt || fs.statSync(absolutePath).mtime.toISOString(),
        totals: raw.summary || {}
      };
    })
    .sort((left, right) => String(right.periodStart).localeCompare(String(left.periodStart)))
    .slice(0, safeLimit);
}

function getSnapshot(snapshotId) {
  ensureHistoryDir();
  const absoluteRoot = path.resolve(HISTORY_DIR);
  const absolutePath = path.resolve(path.join(HISTORY_DIR, snapshotId));

  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('Archive hors dossier');
  }

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

module.exports = {
  getSnapshot,
  listSnapshots,
  saveSnapshot
};
