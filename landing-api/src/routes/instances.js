const express = require('express');
const { requireAdmin } = require('../middleware/requireAdmin');
const { getDb } = require('../db');
const { allocatePort, provision, runCertbot, stopInstance, deleteInstance } = require('../services/provisioning');

const router = express.Router();

router.use(requireAdmin);

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM instances ORDER BY created_at DESC').all();
  res.json(rows.map(parseInstance));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance introuvable' });
  res.json(parseInstance(row));
});

router.post('/', (req, res) => {
  const db = getDb();
  const {
    name, subdomain, sections, theme, categories,
    justice_pseudo, justice_password, bootstrap_admins,
    discord_casier_webhook, discord_sanctions_webhook, discord_plaintes_webhook,
    registry_sync_enabled, registry_sync_url, registry_sync_api_key, registry_sync_auth_mode,
    registry_sync_interval, registry_sync_page_size, registry_sync_timeout_ms, registry_sync_bypass_canonicalize,
    log_level, jwt_expires_in,
    login_rate_limit_max, login_rate_limit_window, login_rate_limit_lock,
    backup_interval, backup_max_snapshots, backup_timezone,
    cors_origin, status_service_name, status_monitored_services, grade_bot_token,
  } = req.body;

  if (!name || !subdomain) return res.status(400).json({ error: 'name et subdomain requis' });

  const id = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const existing = db.prepare('SELECT id FROM instances WHERE id = ? OR subdomain = ?').get(id, subdomain);
  if (existing) return res.status(409).json({ error: 'Un MDT avec cet identifiant ou sous-domaine existe déjà' });

  const port = allocatePort(db);

  const instance = {
    id, name, subdomain: subdomain.toLowerCase(), port,
    sections: JSON.stringify(sections || ['police']),
    theme: JSON.stringify(theme || { primary: '#2e7d32', accent: '#76c442', dark: '#081508', border: '#2a5e1e' }),
    categories: JSON.stringify(categories || []),
    justice_pseudo: justice_pseudo || null,
    justice_password: justice_password || null,
    bootstrap_admins: JSON.stringify(bootstrap_admins || []),
    discord_casier_webhook: discord_casier_webhook || null,
    discord_sanctions_webhook: discord_sanctions_webhook || null,
    discord_plaintes_webhook: discord_plaintes_webhook || null,
    registry_sync_enabled: registry_sync_enabled ? 1 : 0,
    registry_sync_url: registry_sync_url || null,
    registry_sync_api_key: registry_sync_api_key || null,
    registry_sync_auth_mode: registry_sync_auth_mode || 'x-api-key',
    registry_sync_interval: registry_sync_interval || 5,
    registry_sync_page_size: registry_sync_page_size || 100,
    registry_sync_timeout_ms: registry_sync_timeout_ms || 15000,
    registry_sync_bypass_canonicalize: registry_sync_bypass_canonicalize ? 1 : 0,
    log_level: log_level || 'info',
    jwt_expires_in: jwt_expires_in || '12h',
    login_rate_limit_max: login_rate_limit_max || 5,
    login_rate_limit_window: login_rate_limit_window || 15,
    login_rate_limit_lock: login_rate_limit_lock || 15,
    backup_interval: backup_interval || 30,
    backup_max_snapshots: backup_max_snapshots || 10,
    backup_timezone: backup_timezone || 'Europe/Paris',
    cors_origin: cors_origin || null,
    status_service_name: status_service_name || null,
    status_monitored_services: JSON.stringify(status_monitored_services || []),
    grade_bot_token: grade_bot_token || null,
    status: 'provisioning',
    dir: `/var/www/instances/${id}`,
  };

  db.prepare(`INSERT INTO instances (
    id, name, subdomain, port, sections, theme, categories,
    justice_pseudo, justice_password, bootstrap_admins,
    discord_casier_webhook, discord_sanctions_webhook, discord_plaintes_webhook,
    registry_sync_enabled, registry_sync_url, registry_sync_api_key, registry_sync_auth_mode,
    registry_sync_interval, registry_sync_page_size, registry_sync_timeout_ms, registry_sync_bypass_canonicalize,
    log_level, jwt_expires_in, login_rate_limit_max, login_rate_limit_window, login_rate_limit_lock,
    backup_interval, backup_max_snapshots, backup_timezone,
    cors_origin, status_service_name, status_monitored_services, grade_bot_token,
    status, dir
  ) VALUES (
    @id, @name, @subdomain, @port, @sections, @theme, @categories,
    @justice_pseudo, @justice_password, @bootstrap_admins,
    @discord_casier_webhook, @discord_sanctions_webhook, @discord_plaintes_webhook,
    @registry_sync_enabled, @registry_sync_url, @registry_sync_api_key, @registry_sync_auth_mode,
    @registry_sync_interval, @registry_sync_page_size, @registry_sync_timeout_ms, @registry_sync_bypass_canonicalize,
    @log_level, @jwt_expires_in, @login_rate_limit_max, @login_rate_limit_window, @login_rate_limit_lock,
    @backup_interval, @backup_max_snapshots, @backup_timezone,
    @cors_origin, @status_service_name, @status_monitored_services, @grade_bot_token,
    @status, @dir
  )`).run(instance);

  db.prepare('INSERT INTO audit_log (action, instance_id, details) VALUES (?, ?, ?)').run('create', id, JSON.stringify({ name, subdomain, port }));

  try {
    const result = provision(parseInstance(db.prepare('SELECT * FROM instances WHERE id = ?').get(id)), db);
    res.status(201).json({
      ok: true,
      instance: parseInstance(db.prepare('SELECT * FROM instances WHERE id = ?').get(id)),
      provisioning: result,
      dns_instructions: `Ajoutez chez OVH : A  ${subdomain}.zenkai-police.tech  →  ${result.serverIp}`,
    });
  } catch (err) {
    db.prepare('UPDATE instances SET status = ? WHERE id = ?').run('error', id);
    db.prepare('INSERT INTO audit_log (action, instance_id, details) VALUES (?, ?, ?)').run('provision_error', id, err.message);
    res.status(500).json({ error: 'Provisioning échoué', detail: err.message });
  }
});

router.patch('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance introuvable' });

  const ALLOWED = [
    'name', 'sections', 'theme', 'categories',
    'justice_pseudo', 'justice_password', 'bootstrap_admins',
    'discord_casier_webhook', 'discord_sanctions_webhook', 'discord_plaintes_webhook',
    'registry_sync_enabled', 'registry_sync_url', 'registry_sync_api_key', 'registry_sync_auth_mode',
    'registry_sync_interval', 'registry_sync_page_size', 'registry_sync_timeout_ms', 'registry_sync_bypass_canonicalize',
    'log_level', 'jwt_expires_in', 'login_rate_limit_max', 'login_rate_limit_window', 'login_rate_limit_lock',
    'backup_interval', 'backup_max_snapshots', 'backup_timezone',
    'cors_origin', 'status_service_name', 'status_monitored_services', 'grade_bot_token',
  ];

  const JSON_FIELDS = new Set(['sections', 'theme', 'categories', 'bootstrap_admins', 'status_monitored_services']);
  const BOOL_FIELDS = new Set(['registry_sync_enabled', 'registry_sync_bypass_canonicalize']);

  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] === undefined) continue;
    const val = req.body[key];
    if (JSON_FIELDS.has(key)) updates[key] = JSON.stringify(val);
    else if (BOOL_FIELDS.has(key)) updates[key] = val ? 1 : 0;
    else updates[key] = val === '' ? null : val;
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });

  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE instances SET ${setClauses} WHERE id = @id`).run({ ...updates, id: req.params.id });
  db.prepare('INSERT INTO audit_log (action, instance_id, details) VALUES (?, ?, ?)').run('update', req.params.id, JSON.stringify(Object.keys(updates)));

  res.json(parseInstance(db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id)));
});

router.post('/:id/ssl', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance introuvable' });

  try {
    runCertbot(parseInstance(row));
    db.prepare('UPDATE instances SET status = ? WHERE id = ?').run('running', row.id);
    db.prepare('INSERT INTO audit_log (action, instance_id) VALUES (?, ?)').run('ssl_issued', row.id);
    res.json({ ok: true, message: 'SSL activé avec succès' });
  } catch (err) {
    res.status(500).json({ error: 'Certbot échoué', detail: err.message });
  }
});

router.post('/:id/restart', (req, res) => {
  const { execSync } = require('child_process');
  const db = getDb();
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance introuvable' });

  try {
    execSync(`pm2 restart mdt-${row.id}`);
    db.prepare('UPDATE instances SET status = ? WHERE id = ?').run('running', row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance introuvable' });

  try {
    stopInstance(`mdt-${row.id}`, db, row.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM instances WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Instance introuvable' });

  try {
    deleteInstance(parseInstance(row), db);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseInstance(row) {
  if (!row) return null;
  return {
    ...row,
    sections: JSON.parse(row.sections || '[]'),
    theme: JSON.parse(row.theme || '{}'),
    categories: JSON.parse(row.categories || '[]'),
    bootstrap_admins: JSON.parse(row.bootstrap_admins || '[]'),
    status_monitored_services: JSON.parse(row.status_monitored_services || '[]'),
    registry_sync_enabled: Boolean(row.registry_sync_enabled),
    registry_sync_bypass_canonicalize: Boolean(row.registry_sync_bypass_canonicalize),
  };
}

module.exports = router;
