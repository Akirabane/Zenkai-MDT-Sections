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
  const { name, subdomain, sections, theme, categories, discord_webhook, discord_events } = req.body;

  if (!name || !subdomain) return res.status(400).json({ error: 'name et subdomain requis' });

  const id = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const existing = db.prepare('SELECT id FROM instances WHERE id = ? OR subdomain = ?').get(id, subdomain);
  if (existing) return res.status(409).json({ error: 'Un MDT avec cet identifiant ou sous-domaine existe déjà' });

  const port = allocatePort(db);

  const instance = {
    id,
    name,
    subdomain: subdomain.toLowerCase(),
    port,
    sections: JSON.stringify(sections || ['police']),
    theme: JSON.stringify(theme || { primary: '#2e7d32', accent: '#76c442', dark: '#081508', border: '#2a5e1e' }),
    categories: JSON.stringify(categories || []),
    discord_webhook: discord_webhook || null,
    discord_events: JSON.stringify(discord_events || []),
    status: 'provisioning',
    dir: `/var/www/instances/${id}`,
  };

  db.prepare(`INSERT INTO instances (id, name, subdomain, port, sections, theme, categories, discord_webhook, discord_events, status, dir)
    VALUES (@id, @name, @subdomain, @port, @sections, @theme, @categories, @discord_webhook, @discord_events, @status, @dir)`).run(instance);

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

  const { name, sections, theme, categories, discord_webhook, discord_events } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (sections !== undefined) updates.sections = JSON.stringify(sections);
  if (theme !== undefined) updates.theme = JSON.stringify(theme);
  if (categories !== undefined) updates.categories = JSON.stringify(categories);
  if (discord_webhook !== undefined) updates.discord_webhook = discord_webhook || null;
  if (discord_events !== undefined) updates.discord_events = JSON.stringify(discord_events);

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });

  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE instances SET ${setClauses} WHERE id = @id`).run({ ...updates, id: req.params.id });
  db.prepare('INSERT INTO audit_log (action, instance_id, details) VALUES (?, ?, ?)').run('update', req.params.id, JSON.stringify(updates));

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
    discord_events: JSON.parse(row.discord_events || '[]'),
  };
}

module.exports = router;
