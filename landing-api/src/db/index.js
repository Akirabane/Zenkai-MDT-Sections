const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let _db = null;

function getDb() {
  if (_db) return _db;
  const dbPath = process.env.DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  bootstrap(_db);
  return _db;
}

function bootstrap(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subdomain TEXT UNIQUE NOT NULL,
      port INTEGER UNIQUE NOT NULL,
      sections TEXT NOT NULL DEFAULT '["police"]',
      theme TEXT NOT NULL DEFAULT '{"primary":"#2e7d32","accent":"#76c442","dark":"#081508","border":"#2a5e1e"}',
      categories TEXT NOT NULL DEFAULT '[]',
      discord_webhook TEXT,
      discord_events TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'provisioning',
      dir TEXT NOT NULL,
      nginx_conf TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      instance_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrations = [
    "ALTER TABLE instances ADD COLUMN justice_pseudo TEXT",
    "ALTER TABLE instances ADD COLUMN justice_password TEXT",
    "ALTER TABLE instances ADD COLUMN bootstrap_admins TEXT DEFAULT '[]'",
    "ALTER TABLE instances ADD COLUMN discord_casier_webhook TEXT",
    "ALTER TABLE instances ADD COLUMN discord_sanctions_webhook TEXT",
    "ALTER TABLE instances ADD COLUMN discord_plaintes_webhook TEXT",
    "ALTER TABLE instances ADD COLUMN registry_sync_enabled INTEGER DEFAULT 0",
    "ALTER TABLE instances ADD COLUMN registry_sync_url TEXT",
    "ALTER TABLE instances ADD COLUMN registry_sync_api_key TEXT",
    "ALTER TABLE instances ADD COLUMN registry_sync_auth_mode TEXT DEFAULT 'x-api-key'",
    "ALTER TABLE instances ADD COLUMN registry_sync_interval INTEGER DEFAULT 5",
    "ALTER TABLE instances ADD COLUMN registry_sync_page_size INTEGER DEFAULT 100",
    "ALTER TABLE instances ADD COLUMN registry_sync_timeout_ms INTEGER DEFAULT 15000",
    "ALTER TABLE instances ADD COLUMN registry_sync_bypass_canonicalize INTEGER DEFAULT 0",
    "ALTER TABLE instances ADD COLUMN log_level TEXT DEFAULT 'info'",
    "ALTER TABLE instances ADD COLUMN jwt_expires_in TEXT DEFAULT '12h'",
    "ALTER TABLE instances ADD COLUMN login_rate_limit_max INTEGER DEFAULT 5",
    "ALTER TABLE instances ADD COLUMN login_rate_limit_window INTEGER DEFAULT 15",
    "ALTER TABLE instances ADD COLUMN login_rate_limit_lock INTEGER DEFAULT 15",
    "ALTER TABLE instances ADD COLUMN backup_interval INTEGER DEFAULT 30",
    "ALTER TABLE instances ADD COLUMN backup_max_snapshots INTEGER DEFAULT 10",
    "ALTER TABLE instances ADD COLUMN backup_timezone TEXT DEFAULT 'Europe/Paris'",
    "ALTER TABLE instances ADD COLUMN cors_origin TEXT",
    "ALTER TABLE instances ADD COLUMN status_service_name TEXT",
    "ALTER TABLE instances ADD COLUMN status_monitored_services TEXT DEFAULT '[]'",
    "ALTER TABLE instances ADD COLUMN grade_bot_token TEXT",
  ];

  for (const sql of migrations) {
    try { db.exec(sql); } catch {}
  }
}

module.exports = { getDb };
