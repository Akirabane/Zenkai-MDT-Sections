const os = require('os');

const logger = require('../utils/logger');
const historyRepo = require('../repositories/history');
const packageJson = require('../../../package.json');

const startedAt = new Date();
const instanceId = `${process.pid}-${Date.now()}`;

let shutdownLogged = false;
let errorCount = 0;

function safeLogEvent(action, metadata = {}, options = {}) {
  try {
    historyRepo.logEvent({
      actorPseudo: options.actorPseudo || 'system',
      actorPermission: options.actorPermission || '',
      action,
      entityType: options.entityType || 'system',
      entityId: options.entityId || instanceId,
      targetLabel: options.targetLabel || packageJson.name,
      metadata: {
        pid: process.pid,
        instanceId,
        ...metadata
      }
    });
  } catch (error) {
    logger.warn('Impossible d enregistrer un evenement systeme', {
      action,
      message: error.message
    });
  }
}

function formatErrorPayload(kind, error) {
  const source = error instanceof Error ? error : new Error(String(error));
  return {
    kind,
    message: source.message,
    stack: source.stack || '',
    count: ++errorCount
  };
}

function markStart(extra = {}) {
  safeLogEvent('system_start', {
    startedAt: startedAt.toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    ...extra
  });
}

function markShutdown(reason) {
  if (shutdownLogged) return;
  shutdownLogged = true;

  safeLogEvent('system_shutdown', {
    reason: reason || 'shutdown',
    uptimeSeconds: getRuntimeInfo().uptimeSeconds
  });
}

function markProcessError(kind, error) {
  safeLogEvent('system_error', formatErrorPayload(kind, error));
}

function markHttpError(context = {}) {
  safeLogEvent('system_http_error', context, {
    entityType: 'http_request',
    targetLabel: context.path || packageJson.name
  });
}

function getRuntimeInfo() {
  const memory = process.memoryUsage();

  return {
    service: packageJson.name,
    version: packageJson.version,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)),
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    loadAverage: os.loadavg(),
    memory: {
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(1)),
      externalMb: Number((memory.external / 1024 / 1024).toFixed(1))
    }
  };
}

function installProcessHooks(server) {
  process.on('SIGINT', function onSigint() {
    markShutdown('SIGINT');
    if (server && typeof server.close === 'function') {
      server.close(function() {
        process.exit(0);
      });
      setTimeout(function() {
        process.exit(0);
      }, 2000).unref();
      return;
    }
    process.exit(0);
  });

  process.on('SIGTERM', function onSigterm() {
    markShutdown('SIGTERM');
    if (server && typeof server.close === 'function') {
      server.close(function() {
        process.exit(0);
      });
      setTimeout(function() {
        process.exit(0);
      }, 2000).unref();
      return;
    }
    process.exit(0);
  });

  process.on('uncaughtException', function onUncaughtException(error) {
    markProcessError('uncaughtException', error);
    logger.error('Uncaught exception', { message: error.message, stack: error.stack });
    setTimeout(function() {
      process.exit(1);
    }, 50).unref();
  });

  process.on('unhandledRejection', function onUnhandledRejection(reason) {
    markProcessError('unhandledRejection', reason);
    logger.error('Unhandled rejection', {
      message: reason instanceof Error ? reason.message : String(reason)
    });
  });
}

module.exports = {
  getRuntimeInfo,
  installProcessHooks,
  markHttpError,
  markProcessError,
  markShutdown,
  markStart
};
