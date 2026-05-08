require('dotenv').config({ path: '/etc/zenkai-landing/.env' });

const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const instancesRoutes = require('./routes/instances');

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'landing-api' }));

app.use('/admin-api/auth', authRoutes);
app.use('/admin-api/instances', instancesRoutes);

app.use((err, req, res, _next) => {
  console.error('[landing-api]', err);
  res.status(500).json({ error: 'Erreur interne' });
});

module.exports = app;
