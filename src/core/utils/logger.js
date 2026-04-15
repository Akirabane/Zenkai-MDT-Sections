const env = require('../../config/env');
const { getClientIp } = require('./network');

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = Object.prototype.hasOwnProperty.call(LEVELS, env.logLevel)
  ? LEVELS[env.logLevel]
  : LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function sanitizeContext(context = {}) {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(' ');
}

function write(level, message, context) {
  if (LEVELS[level] > currentLevel) {
    return;
  }

  const printer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  const contextPart = sanitizeContext(context);
  printer(`[${timestamp()}] [${level.toUpperCase()}] ${message}${contextPart ? ` ${contextPart}` : ''}`);
}

function shouldSkipRequest(req) {
  if (req.method === 'OPTIONS') {
    return true;
  }

  const url = req.path || req.originalUrl || '';
  if (url === '/health' || url === '/presence/ping' || url === '/presence/guest-ping') {
    return true;
  }

  return /\.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url);
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    if (shouldSkipRequest(req)) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    write('info', 'HTTP request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      ip: getClientIp(req)
    });
  });

  next();
}

module.exports = {
  debug: (message, context) => write('debug', message, context),
  error: (message, context) => write('error', message, context),
  info: (message, context) => write('info', message, context),
  requestLogger,
  warn: (message, context) => write('warn', message, context)
};
