const express = require('express');

const env = require('./config/env');
const logger = require('./core/utils/logger');
const { loadSections } = require('./core/loader');
const { markHttpError } = require('./core/services/runtime-status');
const { globalRateLimit } = require('./core/middleware/globalRateLimit');
const authRoutes = require('./core/routes/auth');
const notificationRoutes = require('./core/routes/notifications');
const presenceRoutes = require('./core/routes/presence');
const serviceRoutes = require('./core/routes/service');

const policeSection = require('./sections/police');

const app = express();
app.set('trust proxy', env.trustProxy ? 1 : false);

function staticGuard(req, res, next) {
  const blockedPrefixes = ['/DB/', '/src/', '/node_modules/', '/uploads/'];
  const blockedFiles = ['/package.json', '/package-lock.json', '/default'];
  const isDotfilePath = /(^|\/)\.[^/]+/.test(req.path);

  if (isDotfilePath || blockedPrefixes.some((prefix) => req.path.startsWith(prefix)) || blockedFiles.includes(req.path)) {
    return res.status(404).end();
  }

  return next();
}

app.use(express.json({ limit: '16mb' }));
app.use(globalRateLimit);
app.use(logger.requestLogger);
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  let allowOrigin = env.isProduction ? '' : '*';

  if (env.corsOrigins.length > 0) {
    if (requestOrigin && env.corsOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else {
      allowOrigin = '';
    }
    res.setHeader('Vary', 'Origin');
  }

  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (env.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self' https://zenkai-police.tech",
      "font-src 'self' https://fonts.gstatic.com data:",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: https://fonts.gstatic.com",
      "media-src 'self' data: blob:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "worker-src 'self' blob:"
    ].join('; ')
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  return next();
});

// Routes core
app.use(authRoutes);
app.use(presenceRoutes);
app.use(notificationRoutes);
app.use(serviceRoutes);

// Sections
loadSections(app, [policeSection]);

app.use(staticGuard);
app.use(express.static(env.rootDir, {
  index: false,
  extensions: ['html']
}));

app.use((error, req, res, next) => {
  logger.error('Unhandled application error', {
    path: req.originalUrl,
    method: req.method,
    message: error.message,
    stack: env.isProduction ? undefined : error.stack
  });

  try {
    markHttpError({
      path: req.originalUrl,
      method: req.method,
      message: error.message,
      status: 500
    });
  } catch (loggingError) {}

  return res.status(500).json({ error: 'Erreur interne du serveur' });
});

module.exports = app;
