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
}

module.exports = { getDb };
