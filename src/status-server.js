const path = require('path');

const express = require('express');

const env = require('./config/env');
const statusPublicRoutes = require('./routes/status-public');
const logger = require('./utils/logger');
const { getHeartbeatPayload } = require('./services/status-monitor-report');

const app = express();

app.set('trust proxy', env.trustProxy ? 1 : false);
app.use(logger.requestLogger);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  return next();
});

app.get('/health', (req, res) => {
  return res.json(getHeartbeatPayload());
});

app.use(statusPublicRoutes);

app.get('/', (req, res) => {
  return res.redirect('/Status_Systeme.html');
});

app.get('/Status_Systeme.html', (req, res) => {
  return res.sendFile(path.join(env.rootDir, 'Status_Systeme.html'));
});

function sendStatusCss(res) {
  res.type('text/css');
  return res.sendFile(path.join(env.rootDir, 'CSS', 'status-systeme.css'));
}

function sendStatusJs(res) {
  res.type('application/javascript');
  return res.sendFile(path.join(env.rootDir, 'JS', 'status-systeme.js'));
}

function sendFavicon(res) {
  res.type('image/svg+xml');
  return res.sendFile(path.join(env.rootDir, 'favicon.svg'));
}

app.get('/status-assets/status-systeme.css', (req, res) => sendStatusCss(res));
app.get('/status-assets/status-systeme.js', (req, res) => sendStatusJs(res));
app.get('/status-assets/favicon.svg', (req, res) => sendFavicon(res));
app.get('/CSS/status-systeme.css', (req, res) => sendStatusCss(res));
app.get('/JS/status-systeme.js', (req, res) => sendStatusJs(res));
app.get('/favicon.svg', (req, res) => sendFavicon(res));

app.use((req, res) => {
  return res.status(404).json({ error: 'Resource not found on police-status' });
});

app.use((error, req, res, next) => {
  logger.error('Unhandled status-monitor error', {
    path: req.originalUrl,
    method: req.method,
    message: error.message
  });

  return res.status(500).json({ error: 'Erreur interne du service de supervision' });
});

app.listen(env.statusPort, () => {
  logger.info('Police status monitor demarre', {
    port: env.statusPort,
    monitoredServices: env.statusMonitoredServices.length ? env.statusMonitoredServices : undefined
  });
});
