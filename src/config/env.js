const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..', '..');
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const envFileCandidates = [
  process.env.ENV_FILE,
  isProduction ? path.join(rootDir, '..', '.env') : null,
  path.join(rootDir, '.env')
].filter(Boolean);

const resolvedEnvFile = envFileCandidates
  .map((candidate) => (path.isAbsolute(candidate) ? candidate : path.join(rootDir, candidate)))
  .find((candidate) => fs.existsSync(candidate));

dotenv.config({ path: resolvedEnvFile || path.join(rootDir, '.env'), override: true });

function resolveFromRoot(filePath, fallback) {
  const value = filePath || fallback;
  if (!value) return value;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

function resolveFromBase(baseDir, filePath, fallback) {
  const value = filePath || fallback;
  if (!value) return value;
  if (path.isAbsolute(value)) return value;
  return path.join(baseDir, value);
}

function intFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function csvFromEnv(name) {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const dataDir = resolveFromRoot(
  process.env.DATA_DIR,
  isProduction ? path.join('..', 'secure-data') : 'DB'
);
const uploadsDir = resolveFromRoot(
  process.env.UPLOADS_DIR,
  isProduction ? path.join('..', 'secure-data', 'uploads') : 'uploads'
);

const env = {
  nodeEnv,
  isProduction,
  rootDir,
  envFilePath: resolvedEnvFile || path.join(rootDir, '.env'),
  dataDir,
  uploadsDir,
  port: intFromEnv('PORT', 3000),
  statusPort: intFromEnv('STATUS_PORT', 3010),
  dbPath: process.env.SQLITE_PATH
    ? resolveFromRoot(process.env.SQLITE_PATH)
    : resolveFromBase(dataDir, null, 'police.db'),
  legacyDataPath: process.env.LEGACY_DATA_PATH
    ? resolveFromRoot(process.env.LEGACY_DATA_PATH)
    : path.join(rootDir, 'DB', 'data.json'),
  legacyUsersPath: process.env.LEGACY_USERS_PATH
    ? resolveFromRoot(process.env.LEGACY_USERS_PATH)
    : path.join(rootDir, 'DB', 'users.json'),
  legacyCodePenalPath: process.env.LEGACY_CODEPENAL_PATH
    ? resolveFromRoot(process.env.LEGACY_CODEPENAL_PATH)
    : path.join(rootDir, 'codepenal.json'),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'dev-jwt-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  justiceAccountPseudo: (process.env.JUSTICE_ACCOUNT_PSEUDO || 'JusticeKonoha').trim() || 'JusticeKonoha',
  justiceAccountPassword: (process.env.JUSTICE_ACCOUNT_PASSWORD || '').trim(),
  gradeBotToken: (process.env.GRADE_BOT_TOKEN || '').trim(),
  policeSecret: process.env.POLICE_SECRET || (isProduction ? '' : 'dev-police-secret-change-me'),
  discordCasierWebhookUrl: (process.env.DISCORD_CASIER_WEBHOOK_URL || '').trim(),
  discordSanctionsWebhookUrl: (process.env.DISCORD_SANCTIONS_WEBHOOK_URL || '').trim(),
  discordPlaintesWebhookUrl: (process.env.DISCORD_PLAINTES_WEBHOOK_URL || '').trim(),
  corsOrigin: process.env.CORS_ORIGIN || '',
  corsOrigins: csvFromEnv('CORS_ORIGIN'),
  bootstrapAdminPseudos: csvFromEnv('BOOTSTRAP_ADMIN_PSEUDOS'),
  village: (process.env.VILLAGE || '').trim(),
  enabledSections: csvFromEnv('ENABLED_SECTIONS').filter(Boolean),
};

env.logLevel = (process.env.LOG_LEVEL || 'info').trim().toLowerCase();
env.trustProxy = boolFromEnv('TRUST_PROXY', false);
env.backupIntervalMinutes = intFromEnv('BACKUP_INTERVAL_MINUTES', 30);
env.backupMaxSnapshots = intFromEnv('BACKUP_MAX_SNAPSHOTS', 10);
env.backupTimezone = process.env.BACKUP_TIMEZONE || 'Europe/Paris';
env.statusServiceName = (process.env.STATUS_SERVICE_NAME || 'police-status').trim() || 'police-status';
env.statusMonitoredServices = csvFromEnv('STATUS_MONITORED_SERVICES');
env.loginRateLimitMaxAttempts = intFromEnv('LOGIN_RATE_LIMIT_MAX_ATTEMPTS', 5);
env.loginRateLimitWindowMinutes = intFromEnv('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15);
env.loginRateLimitLockMinutes = intFromEnv('LOGIN_RATE_LIMIT_LOCK_MINUTES', 15);
env.registrySyncEnabled = boolFromEnv('REGISTRY_SYNC_ENABLED', false);
env.registrySyncUrl = (process.env.REGISTRY_SYNC_URL || '').trim();
env.registrySyncApiKey = (process.env.REGISTRY_SYNC_API_KEY || '').trim();
env.registrySyncAuthMode = ((process.env.REGISTRY_SYNC_AUTH_MODE || 'x-api-key').trim().toLowerCase() || 'x-api-key');
env.registrySyncIntervalMinutes = intFromEnv('REGISTRY_SYNC_INTERVAL_MINUTES', 5);
env.registrySyncPageSize = intFromEnv('REGISTRY_SYNC_PAGE_SIZE', 100);
env.registrySyncTimeoutMs = intFromEnv('REGISTRY_SYNC_TIMEOUT_MS', 15000);
env.registrySyncBypassCanonicalize = boolFromEnv('REGISTRY_SYNC_BYPASS_CANONICALIZE', false);

if (isProduction) {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET est obligatoire en production.');
  }
  if (!env.policeSecret) {
    throw new Error('POLICE_SECRET est obligatoire en production.');
  }
  if (env.registrySyncEnabled) {
    if (!env.registrySyncUrl) {
      throw new Error('REGISTRY_SYNC_URL est obligatoire si REGISTRY_SYNC_ENABLED=true.');
    }
    if (!env.registrySyncApiKey) {
      throw new Error('REGISTRY_SYNC_API_KEY est obligatoire si REGISTRY_SYNC_ENABLED=true.');
    }
  }
}

module.exports = env;
