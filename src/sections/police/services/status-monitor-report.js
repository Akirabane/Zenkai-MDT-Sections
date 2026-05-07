const fs = require('fs');
const http = require('http');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const Database = require('better-sqlite3');

const env = require('../../../config/env');
const { listSnapshots } = require('../../../core/utils/backups');
const packageJson = require('../../../../package.json');

const execFileAsync = promisify(execFile);

const STATUS_ACTIONS = ['auth_login', 'auth_logout', 'system_start', 'system_shutdown', 'system_error', 'system_http_error'];
const DEFAULT_MONITORED_SERVICES = ['police-status', 'police-konoha', 'data-guard', 'police-backup'];
const monitorStartedAt = new Date();

let cachedOverview = null;
let cachedOverviewExpiresAt = 0;
let cachedOverviewPromise = null;

function toMb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024).toFixed(1));
}

function formatDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonitorServiceName() {
  return env.statusServiceName || 'police-status';
}

function getMonitoredServices() {
  const configured = Array.isArray(env.statusMonitoredServices) ? env.statusMonitoredServices.filter(Boolean) : [];
  const base = configured.length ? configured : DEFAULT_MONITORED_SERVICES;
  const merged = Array.from(new Set([getMonitorServiceName(), ...base]));
  return merged;
}

function getPm2Command() {
  return process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
}

function mapServiceLabel(name) {
  switch (String(name || '').trim()) {
    case 'police-status':
      return 'Monitor public';
    case 'police-konoha':
      return 'MDT general';
    case 'police-backup':
      return 'Backup automatique';
    case 'data-guard':
      return 'Data Guard';
    default:
      return name || 'Service';
  }
}

function mapProcessHealth(status) {
  const value = String(status || '').trim().toLowerCase();

  if (value === 'online') {
    return { status: 'ok', label: 'En ligne dans PM2' };
  }

  if (['launching', 'waiting restart', 'stopping'].includes(value)) {
    return { status: 'warning', label: 'Transition PM2 en cours' };
  }

  if (value) {
    return { status: 'error', label: `Etat PM2: ${value}` };
  }

  return { status: 'error', label: 'Etat PM2 inconnu' };
}

function mapEventLabel(event) {
  const target = event.targetLabel ? ` - ${event.targetLabel}` : '';

  switch (event.action) {
    case 'auth_login':
      return `Connexion${target}`;
    case 'auth_logout':
      return `Deconnexion${target}`;
    case 'system_start':
      return 'Demarrage application';
    case 'system_shutdown':
      return 'Arret application';
    case 'system_error':
      return `Erreur processus${target}`;
    case 'system_http_error':
      return `Erreur HTTP${target}`;
    default:
      return event.action;
  }
}

function mapSeverity(action) {
  if (action === 'system_error' || action === 'system_http_error') return 'error';
  if (action === 'system_shutdown') return 'warning';
  return 'info';
}

async function readPm2Processes() {
  try {
    const result = await execFileAsync(getPm2Command(), ['jlist'], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });

    const processes = JSON.parse(result.stdout || '[]');
    return {
      available: true,
      processes: Array.isArray(processes) ? processes : [],
      error: ''
    };
  } catch (error) {
    return {
      available: false,
      processes: [],
      error: error.message || 'pm2 indisponible'
    };
  }
}

function mapPm2Process(processRow) {
  const pm2Env = processRow.pm2_env || {};
  const monit = processRow.monit || {};
  const pmUptime = Number(pm2Env.pm_uptime || 0);
  const now = Date.now();

  return {
    name: processRow.name || pm2Env.name || '',
    status: pm2Env.status || 'unknown',
    mode: pm2Env.exec_mode || processRow.pm2_env?.exec_mode || 'fork',
    instances: Number(pm2Env.instances || processRow.instances || 1) || 1,
    pmId: Number.isFinite(Number(processRow.pm_id)) ? Number(processRow.pm_id) : null,
    restarts: Number(pm2Env.restart_time || 0),
    unstableRestarts: Number(pm2Env.unstable_restarts || 0),
    cpu: Number(monit.cpu || 0),
    memoryMb: toMb(monit.memory || 0),
    uptimeSeconds: pmUptime > 0 ? Math.max(0, Math.round((now - pmUptime) / 1000)) : 0,
    startedAt: pmUptime > 0 ? new Date(pmUptime).toISOString() : null
  };
}

function buildMonitorFallback() {
  const memory = process.memoryUsage();

  return {
    name: getMonitorServiceName(),
    label: mapServiceLabel(getMonitorServiceName()),
    status: 'online',
    health: 'ok',
    note: 'Service de supervision actif',
    mode: 'fork',
    instances: 1,
    pmId: Number.isFinite(Number(process.env.pm_id)) ? Number(process.env.pm_id) : null,
    restarts: 0,
    unstableRestarts: 0,
    cpu: 0,
    memoryMb: toMb(memory.rss || 0),
    uptimeSeconds: Math.max(0, Math.round((Date.now() - monitorStartedAt.getTime()) / 1000)),
    startedAt: monitorStartedAt.toISOString()
  };
}

function isStatusMonitorProcess() {
  return String(process.argv[1] || '').replace(/\\/g, '/').endsWith('/src/status-server.js');
}

function buildServiceList(pm2State) {
  const processes = new Map(
    (pm2State.processes || []).map((processRow) => {
      const mapped = mapPm2Process(processRow);
      return [mapped.name, mapped];
    })
  );

  return getMonitoredServices().map((name) => {
    if (name === getMonitorServiceName() && !processes.has(name) && isStatusMonitorProcess()) {
      return buildMonitorFallback();
    }

    const processRow = processes.get(name);
    if (!processRow) {
      return {
        name,
        label: mapServiceLabel(name),
        status: 'missing',
        health: 'error',
        note: pm2State.available ? 'Service absent de PM2' : 'PM2 indisponible depuis le monitor',
        mode: '-',
        instances: 0,
        pmId: null,
        restarts: 0,
        unstableRestarts: 0,
        cpu: 0,
        memoryMb: 0,
        uptimeSeconds: 0,
        startedAt: null
      };
    }

    const health = mapProcessHealth(processRow.status);
    return {
      ...processRow,
      label: mapServiceLabel(name),
      health: health.status,
      note: health.label
    };
  });
}

function requestJson(port, pathName) {
  return new Promise((resolve) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: pathName,
      method: 'GET',
      timeout: 2500
    }, (response) => {
      let raw = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (error) {}

        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          data: parsed
        });
      });
    });

    request.on('error', (error) => {
      resolve({
        ok: false,
        statusCode: 0,
        data: null,
        error: error.message || 'probe_failed'
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });

    request.end();
  });
}

function openReadOnlyDb() {
  if (!fs.existsSync(env.dbPath)) {
    return null;
  }

  try {
    return new Database(env.dbPath, {
      readonly: true,
      fileMustExist: true
    });
  } catch (error) {
    return null;
  }
}

function safeTotal(db, query, params = []) {
  try {
    const row = db.prepare(query).get(...params);
    return Number(row && row.total) || 0;
  } catch (error) {
    return 0;
  }
}

function safeRow(db, query, params = []) {
  try {
    return db.prepare(query).get(...params) || null;
  } catch (error) {
    return null;
  }
}

function safeRows(db, query, params = []) {
  try {
    return db.prepare(query).all(...params);
  } catch (error) {
    return [];
  }
}

function countEventsByActions(db, actions, startAt, endAt) {
  if (!db || !actions.length) return 0;

  const clauses = [`action IN (${actions.map(() => '?').join(', ')})`];
  const params = actions.slice();

  if (startAt) {
    clauses.push('timestamp >= ?');
    params.push(startAt);
  }

  if (endAt) {
    clauses.push('timestamp <= ?');
    params.push(endAt);
  }

  return safeTotal(db, `
    SELECT COUNT(*) AS total
    FROM audit_log
    WHERE ${clauses.join(' AND ')}
  `, params);
}

function countAllAuditEvents(db, startAt) {
  if (!db) return 0;

  if (!startAt) {
    return safeTotal(db, 'SELECT COUNT(*) AS total FROM audit_log');
  }

  return safeTotal(db, `
    SELECT COUNT(*) AS total
    FROM audit_log
    WHERE timestamp >= ?
  `, [startAt]);
}

function listRecentEvents(db, limit = 18) {
  if (!db) return [];

  const rows = safeRows(db, `
    SELECT timestamp, actor_pseudo, action, target_label, metadata_json
    FROM audit_log
    WHERE action IN (${STATUS_ACTIONS.map(() => '?').join(', ')})
    ORDER BY timestamp DESC, id DESC
    LIMIT ${Math.max(1, Math.min(100, Number(limit) || 18))}
  `, STATUS_ACTIONS);

  return rows.map((row) => {
    let metadata = {};
    try {
      metadata = JSON.parse(row.metadata_json || '{}');
    } catch (error) {}

    return {
      timestamp: row.timestamp,
      actorPseudo: row.actor_pseudo || '',
      action: row.action,
      targetLabel: row.target_label || '',
      severity: mapSeverity(row.action),
      label: mapEventLabel({
        action: row.action,
        targetLabel: row.target_label || ''
      }),
      metadata
    };
  });
}

function buildDailyActionSeries(db, days, actions, now = new Date()) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 14));
  const safeActions = Array.from(new Set((actions || []).filter(Boolean)));

  if (!db || !safeActions.length) {
    return [];
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (safeDays - 1));

  const rows = safeRows(db, `
    SELECT substr(timestamp, 1, 10) AS day_key, action, COUNT(*) AS total
    FROM audit_log
    WHERE action IN (${safeActions.map(() => '?').join(', ')})
      AND timestamp >= ?
    GROUP BY day_key, action
  `, [...safeActions, start.toISOString()]);

  const rowIndex = new Map();
  rows.forEach((row) => {
    rowIndex.set(`${row.day_key}:${row.action}`, Number(row.total || 0));
  });

  const items = [];
  for (let index = 0; index < safeDays; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);

    const key = formatDayKey(day);
    const item = {
      key,
      label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    };

    safeActions.forEach((action) => {
      item[action] = rowIndex.get(`${key}:${action}`) || 0;
    });

    items.push(item);
  }

  return items;
}

function buildVisitSeries(db, days, now = new Date()) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 14));
  const row = db ? safeRow(db, `
    SELECT json_value
    FROM app_state
    WHERE state_key = 'visitMetrics'
  `) : null;

  let state = { days: {} };
  try {
    const parsed = row ? JSON.parse(row.json_value || '{}') : {};
    state = parsed && typeof parsed === 'object' ? parsed : { days: {} };
  } catch (error) {}

  const buckets = state.days && typeof state.days === 'object' ? state.days : {};
  const items = [];

  for (let index = safeDays - 1; index >= 0; index -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - index);
    const key = formatDayKey(day);
    const bucket = buckets[key] && typeof buckets[key] === 'object' ? buckets[key] : {};

    items.push({
      key,
      label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      police: Array.isArray(bucket.police) ? bucket.police.length : 0,
      justice: Array.isArray(bucket.justice) ? bucket.justice.length : 0,
      visitors: Array.isArray(bucket.visitors) ? bucket.visitors.length : 0
    });
  }

  return items;
}

function buildServiceSeries(db, days, now = new Date()) {
  const safeDays = Math.max(1, Math.min(90, Number(days) || 14));
  if (!db) return [];

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (safeDays - 1));

  const rows = safeRows(db, `
    SELECT
      substr(started_at, 1, 10) AS day_key,
      COUNT(*) AS sessions,
      ROUND(SUM(duration_seconds) / 3600.0, 2) AS hours
    FROM service_sessions
    WHERE started_at >= ?
    GROUP BY day_key
  `, [start.toISOString()]);

  const rowIndex = new Map();
  rows.forEach((row) => {
    rowIndex.set(row.day_key, {
      sessions: Number(row.sessions || 0),
      hours: Number(row.hours || 0)
    });
  });

  const items = [];
  for (let index = 0; index < safeDays; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = formatDayKey(day);
    const row = rowIndex.get(key) || { sessions: 0, hours: 0 };

    items.push({
      key,
      label: day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      sessions: row.sessions,
      hours: Number(row.hours.toFixed(2))
    });
  }

  return items;
}

function buildDatabaseStats() {
  const sqliteExists = fs.existsSync(env.dbPath);
  const sqliteSizeBytes = sqliteExists ? fs.statSync(env.dbPath).size : 0;
  const database = openReadOnlyDb();

  const now = new Date();
  const since7d = new Date(now);
  since7d.setDate(now.getDate() - 6);
  since7d.setHours(0, 0, 0, 0);

  const since30d = new Date(now);
  since30d.setDate(now.getDate() - 29);
  since30d.setHours(0, 0, 0, 0);

  if (!database) {
    return {
      sqliteExists,
      sqliteSizeBytes,
      sqliteSizeMb: toMb(sqliteSizeBytes),
      totals: {
        users: 0,
        membres: 0,
        reports: 0,
        dossiers: 0,
        activeServiceSessions: 0,
        auditEvents: 0
      },
      counters: {
        logins7d: 0,
        logouts7d: 0,
        restarts30d: 0,
        shutdowns30d: 0,
        errors30d: 0
      },
      series: {
        visits: [],
        auth: [],
        system: [],
        service: []
      },
      recentEvents: []
    };
  }

  try {
    return {
      sqliteExists,
      sqliteSizeBytes,
      sqliteSizeMb: toMb(sqliteSizeBytes),
      totals: {
        users: safeTotal(database, 'SELECT COUNT(*) AS total FROM users'),
        membres: safeTotal(database, 'SELECT COUNT(*) AS total FROM membres'),
        reports: safeTotal(database, 'SELECT COUNT(*) AS total FROM arrests'),
        dossiers: safeTotal(database, `
          SELECT COUNT(*) AS total
          FROM (
            SELECT LOWER(TRIM(COALESCE(suspect_prenom, '') || '|' || COALESCE(suspect_nom, ''))) AS suspect_key
            FROM arrests
            WHERE LOWER(COALESCE(report_type, 'incident')) = 'incident'
            GROUP BY suspect_key
          ) dossiers
        `),
        activeServiceSessions: safeTotal(database, `
          SELECT COUNT(*) AS total
          FROM service_sessions
          WHERE status = 'active'
        `),
        auditEvents: countAllAuditEvents(database, since30d.toISOString())
      },
      counters: {
        logins7d: countEventsByActions(database, ['auth_login'], since7d.toISOString()),
        logouts7d: countEventsByActions(database, ['auth_logout'], since7d.toISOString()),
        restarts30d: countEventsByActions(database, ['system_start'], since30d.toISOString()),
        shutdowns30d: countEventsByActions(database, ['system_shutdown'], since30d.toISOString()),
        errors30d: countEventsByActions(database, ['system_error', 'system_http_error'], since30d.toISOString())
      },
      series: {
        visits: buildVisitSeries(database, 14, now),
        auth: buildDailyActionSeries(database, 14, ['auth_login', 'auth_logout'], now),
        system: buildDailyActionSeries(database, 14, ['system_start', 'system_shutdown', 'system_error', 'system_http_error'], now),
        service: buildServiceSeries(database, 14, now)
      },
      recentEvents: listRecentEvents(database, 18)
    };
  } finally {
    database.close();
  }
}

function buildRuntimeInfo() {
  const memory = process.memoryUsage();

  return {
    service: getMonitorServiceName(),
    version: packageJson.version,
    environment: env.nodeEnv,
    startedAt: monitorStartedAt.toISOString(),
    uptimeSeconds: Math.max(0, Math.round((Date.now() - monitorStartedAt.getTime()) / 1000)),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    loadAverage: os.loadavg(),
    memory: {
      rssMb: toMb(memory.rss),
      heapUsedMb: toMb(memory.heapUsed),
      heapTotalMb: toMb(memory.heapTotal),
      externalMb: toMb(memory.external)
    }
  };
}

async function buildOverviewPayloadRaw() {
  const now = new Date();
  const runtime = buildRuntimeInfo();
  const pm2State = await readPm2Processes();
  const services = buildServiceList(pm2State);
  const databaseStats = buildDatabaseStats();
  const snapshots = listSnapshots();
  const latestSnapshot = snapshots[0] || null;
  const latestSnapshotAgeHours = latestSnapshot
    ? Math.max(0, (now.getTime() - new Date(latestSnapshot.updatedAt || latestSnapshot.createdAt).getTime()) / 3600000)
    : null;
  const latestBackupFresh = latestSnapshotAgeHours !== null && latestSnapshotAgeHours <= 36;
  const appProbe = await requestJson(env.port, '/health');

  const monitorService = services.find((item) => item.name === getMonitorServiceName()) || buildMonitorFallback();
  const mdtService = services.find((item) => item.name === 'police-konoha') || null;
  const backupService = services.find((item) => item.name === 'police-backup') || null;

  const onlineServices = services.filter((item) => item.health === 'ok').length;
  const restartTotal = services.reduce((sum, item) => sum + Number(item.restarts || 0), 0);

  return {
    generatedAt: now.toISOString(),
    summary: {
      monitor: {
        status: monitorService.health || 'ok',
        label: monitorService.note || 'Service de supervision actif'
      },
      server: {
        status: mdtService ? mdtService.health : 'error',
        label: mdtService ? mdtService.note : 'MDT general absent de PM2'
      },
      api: {
        status: appProbe.ok ? 'ok' : (mdtService && mdtService.health === 'ok' ? 'warning' : 'error'),
        label: appProbe.ok
          ? 'API MDT repond sur le port local'
          : (appProbe.error || `Probe HTTP impossible (${appProbe.statusCode || 'n/a'})`)
      },
      database: {
        status: databaseStats.sqliteExists ? 'ok' : 'error',
        label: databaseStats.sqliteExists ? 'SQLite detectee et lisible' : 'Base SQLite introuvable ou verrouillee'
      },
      backups: {
        status: latestBackupFresh && backupService && backupService.health === 'ok' ? 'ok' : 'warning',
        label: latestBackupFresh
          ? 'Snapshots presents et recents'
          : 'Backup a verifier ou trop ancien'
      }
    },
    services,
    runtime: {
      ...runtime,
      pm2Available: pm2State.available,
      pm2Error: pm2State.error || '',
      sqlite: {
        exists: databaseStats.sqliteExists,
        sizeBytes: databaseStats.sqliteSizeBytes,
        sizeMb: databaseStats.sqliteSizeMb
      }
    },
    totals: databaseStats.totals,
    counters: {
      ...databaseStats.counters,
      onlineServices,
      monitoredServices: services.length,
      restartTotal
    },
    backups: {
      count: snapshots.length,
      latest: latestSnapshot,
      latestAgeHours: latestSnapshotAgeHours === null ? null : Number(latestSnapshotAgeHours.toFixed(1))
    },
    apiProbe: {
      ok: appProbe.ok,
      statusCode: appProbe.statusCode,
      error: appProbe.error || '',
      payload: appProbe.data
    },
    series: databaseStats.series,
    recentEvents: databaseStats.recentEvents
  };
}

async function buildOverviewPayload() {
  const now = Date.now();
  if (cachedOverview && now < cachedOverviewExpiresAt) {
    return cachedOverview;
  }

  if (cachedOverviewPromise) {
    return cachedOverviewPromise;
  }

  cachedOverviewPromise = buildOverviewPayloadRaw()
    .then((payload) => {
      cachedOverview = payload;
      cachedOverviewExpiresAt = Date.now() + 5000;
      return payload;
    })
    .finally(() => {
      cachedOverviewPromise = null;
    });

  return cachedOverviewPromise;
}

function getHeartbeatPayload() {
  return {
    status: 'ok',
    service: getMonitorServiceName(),
    version: packageJson.version,
    monitoredServices: getMonitoredServices(),
    time: new Date().toISOString()
  };
}

module.exports = {
  buildOverviewPayload,
  getHeartbeatPayload,
  mapProcessHealth,
  mapServiceLabel
};
