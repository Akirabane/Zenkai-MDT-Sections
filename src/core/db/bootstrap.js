const fs = require('fs');
const path = require('path');
const { getLexique } = require('../../services/lexique');
const { DEFAULT_GLOBAL_COLUMNS, generateRowUid } = require('../../services/code-penal');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function setState(db, key, value) {
  db.prepare(`
    INSERT INTO app_state (state_key, json_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET
      json_value = excluded.json_value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

function getState(db, key) {
  const row = db.prepare('SELECT json_value FROM app_state WHERE state_key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.json_value);
  } catch (error) {
    return null;
  }
}

function hasColumn(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureUsersPermissionSchema(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  const sql = String((row && row.sql) || '');
  if (!sql || sql.includes("'JUSTICE'")) return;

  db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      permission TEXT NOT NULL CHECK (permission IN ('READ', 'UPDATE', 'ADMIN', 'JUSTICE')),
      police_role INTEGER NOT NULL DEFAULT 0,
      linked_membre TEXT,
      avatar TEXT,
      created_at TEXT NOT NULL,
      token_version INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO users_new (
      id, pseudo, password_hash, salt, permission, police_role, linked_membre, avatar, created_at, token_version
    )
    SELECT
      id, pseudo, password_hash, salt, permission, police_role, linked_membre, avatar, created_at, token_version
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}

function ensureInvestigationsAgentDefault(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'investigations'").get();
  const sql = String((row && row.sql) || '');
  if (!sql.includes("DEFAULT 'soullera'")) return;

  // FK must be OFF during table restructure to avoid cascade-deleting child rows on DROP TABLE
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE investigations_new (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'En cours',
          assigned_agent TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL,
          summary TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT,
          assigned_agents_json TEXT NOT NULL DEFAULT '[]'
        );

        INSERT INTO investigations_new (
          id, title, status, assigned_agent, author, summary,
          created_at, updated_at, closed_at, assigned_agents_json
        )
        SELECT
          id, title, status, assigned_agent, author, summary,
          created_at, updated_at, closed_at, assigned_agents_json
        FROM investigations;

        DROP TABLE investigations;
        ALTER TABLE investigations_new RENAME TO investigations;

        CREATE INDEX IF NOT EXISTS idx_investigations_status_updated ON investigations(status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_investigations_created ON investigations(created_at DESC);
      `);
    })();
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function ensureInvestigationsMigration(db) {
  if (!hasColumn(db, 'investigations', 'assigned_agents_json')) {
    db.exec("ALTER TABLE investigations ADD COLUMN assigned_agents_json TEXT NOT NULL DEFAULT '[]'");
  }
  db.prepare(`
    UPDATE investigations
    SET assigned_agents_json = json_array(assigned_agent)
    WHERE (assigned_agents_json IS NULL OR TRIM(assigned_agents_json) = '' OR assigned_agents_json = '[]')
      AND TRIM(COALESCE(assigned_agent, '')) <> ''
  `).run();
  db.exec('CREATE INDEX IF NOT EXISTS idx_investigations_status_updated ON investigations(status, updated_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_investigation_updates_parent ON investigation_updates(investigation_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_investigation_links_parent ON investigation_links(investigation_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_investigation_attachments_parent ON investigation_attachments(investigation_id, uploaded_at DESC)');
}

function ensureNotificationsMigration(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_pseudo TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      entity_type TEXT,
      entity_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      read_at TEXT
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created ON user_notifications(user_pseudo, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread ON user_notifications(user_pseudo, read_at, created_at DESC)');
}

function ensureDRIMigration(db) {
  if (!hasColumn(db, 'dri_ninja_files', 'photo_data_url')) {
    db.exec("ALTER TABLE dri_ninja_files ADD COLUMN photo_data_url TEXT NOT NULL DEFAULT ''");
  }

  if (!hasColumn(db, 'dri_internal_investigations', 'linked_ninja_ids_json')) {
    db.exec("ALTER TABLE dri_internal_investigations ADD COLUMN linked_ninja_ids_json TEXT NOT NULL DEFAULT '[]'");
  }

  if (!hasColumn(db, 'users', 'dri_role')) {
    db.exec('ALTER TABLE users ADD COLUMN dri_role INTEGER NOT NULL DEFAULT 0');
  }
}

function ensureLegacyIndexesMigration(db) {
  // Harmonise les index audit_log entre les deux instances (Konoha/Suna ont divergé)
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_pseudo, timestamp DESC)');
}

function ensureSchemaMigrations(db) {
  ensureUsersPermissionSchema(db);
  if (!hasColumn(db, 'arrests', 'suspect_photo')) {
    db.exec('ALTER TABLE arrests ADD COLUMN suspect_photo TEXT');
  }
  if (!hasColumn(db, 'arrests', 'report_type')) {
    db.exec("ALTER TABLE arrests ADD COLUMN report_type TEXT NOT NULL DEFAULT 'incident'");
  }
  if (!hasColumn(db, 'arrests', 'grave_event')) {
    db.exec('ALTER TABLE arrests ADD COLUMN grave_event INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn(db, 'arrests', 'grave_event_details')) {
    db.exec('ALTER TABLE arrests ADD COLUMN grave_event_details TEXT');
  }
  if (!hasColumn(db, 'arrests', 'peine_details_json')) {
    db.exec("ALTER TABLE arrests ADD COLUMN peine_details_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!hasColumn(db, 'complaints', 'accused_nom')) {
    db.exec('ALTER TABLE complaints ADD COLUMN accused_nom TEXT');
  }
  if (!hasColumn(db, 'complaints', 'accused_prenom')) {
    db.exec('ALTER TABLE complaints ADD COLUMN accused_prenom TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_complaints_accused ON complaints(accused_nom, accused_prenom)');
  ensureInvestigationsAgentDefault(db);
  ensureInvestigationsMigration(db);
  ensureNotificationsMigration(db);
  ensureDRIMigration(db);
  ensureLegacyIndexesMigration(db);
}

function bootstrapDatabase(db, env) {
  ensureSchemaMigrations(db);

  const counts = {
    users: db.prepare('SELECT COUNT(*) AS total FROM users').get().total,
    arrests: db.prepare('SELECT COUNT(*) AS total FROM arrests').get().total
  };

  const legacyUsers = readJson(env.legacyUsersPath, { users: [] });
  const legacyData = readJson(env.legacyDataPath, { membres: [], arrests: [], resetConfig: null });
  const legacyCodePenal = readJson(env.legacyCodePenalPath, { sections: [] });

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
      pseudo, password_hash, salt, permission, police_role, linked_membre, avatar, created_at, token_version
    ) VALUES (
      @pseudo, @password_hash, @salt, @permission, @police_role, @linked_membre, @avatar, @created_at, @token_version
    )
  `);

  const insertArrest = db.prepare(`
    INSERT OR IGNORE INTO arrests (
      id, timestamp, author, report_type, suspect_nom, suspect_prenom, suspect_grade,
      suspect_photo, agent_nom, agent_prenom, agent_grade, date_faits, rapport, grave_event, grave_event_details, peine, peine_details_json
    ) VALUES (
      @id, @timestamp, @author, @report_type, @suspect_nom, @suspect_prenom, @suspect_grade,
      @suspect_photo, @agent_nom, @agent_prenom, @agent_grade, @date_faits, @rapport, @grave_event, @grave_event_details, @peine, @peine_details_json
    )
  `);

  const insertDelit = db.prepare(`
    INSERT INTO arrest_delits (arrest_id, position, delit)
    VALUES (@arrest_id, @position, @delit)
  `);

  if (counts.users === 0) {
    const transaction = db.transaction((users) => {
      for (const user of users) {
        insertUser.run({
          pseudo: user.pseudo,
          password_hash: user.hash,
          salt: user.salt,
          permission: ['READ', 'UPDATE', 'ADMIN', 'JUSTICE'].includes(user.permission) ? user.permission : 'READ',
          police_role: user.policeRole ? 1 : 0,
          linked_membre: user.linkedMembre || null,
          avatar: user.avatar || null,
          created_at: user.createdAt || new Date().toISOString(),
          token_version: 0
        });
      }
    });
    transaction(legacyUsers.users || []);
  }

  if (counts.arrests === 0) {
    const transaction = db.transaction((arrests) => {
      for (const arrest of arrests) {
        insertArrest.run({
          id: arrest.id,
          timestamp: arrest.timestamp || new Date().toISOString(),
          author: arrest.author || '',
          report_type: arrest.reportType || 'incident',
          suspect_nom: arrest.suspectNom || '',
          suspect_prenom: arrest.suspectPrenom || '',
          suspect_grade: arrest.suspectGrade || '',
          suspect_photo: arrest.suspectPhoto || '',
          agent_nom: arrest.agentNom || '',
          agent_prenom: arrest.agentPrenom || '',
          agent_grade: arrest.agentGrade || '',
          date_faits: arrest.date || '',
          rapport: arrest.rapport || '',
          grave_event: arrest.graveEvent ? 1 : 0,
          grave_event_details: arrest.graveEventDetails || '',
          peine: arrest.peine || '',
          peine_details_json: JSON.stringify(arrest.peineDetails || {})
        });

        (arrest.delits || []).forEach((delit, index) => {
          insertDelit.run({
            arrest_id: arrest.id,
            position: index,
            delit
          });
        });
      }
    });
    transaction(legacyData.arrests || []);
  }

  if (!getState(db, 'resetConfig')) {
    setState(db, 'resetConfig', legacyData.resetConfig || {
      lastDailyReset: null,
      lastWeeklyReset: null
    });
  }

  if (!getState(db, 'codepenal')) {
    setState(db, 'codepenal', {
      sections: (legacyCodePenal && Array.isArray(legacyCodePenal.sections)) ? legacyCodePenal.sections : [],
      lexique: getLexique(legacyCodePenal || {})
    });
  }

  if (!getState(db, 'meta')) {
    setState(db, 'meta', {
      version: 1,
      lastUpdated: legacyData.lastUpdated || null,
      migratedFrom: {
        users: path.basename(env.legacyUsersPath),
        data: path.basename(env.legacyDataPath),
        codepenal: path.basename(env.legacyCodePenalPath)
      }
    });
  }

  if (env.bootstrapAdminPseudos.length > 0) {
    const updateAdmin = db.prepare(`
      UPDATE users
      SET permission = 'ADMIN', police_role = 1
      WHERE pseudo = ?
    `);
    for (const pseudo of env.bootstrapAdminPseudos) {
      updateAdmin.run(pseudo);
    }
  }

  // Phase 1b — run after all legacy data is in place so the codepenal key exists.
  ensureCodePenalV2Migration(db);
}

// ── Code Pénal schema v1 → v2 migration ────────────────────────────────────────
// Safe to run every startup: bails out immediately if already at v2.
// Before touching anything it writes a full snapshot to codepenal_history so
// the previous state is always recoverable.
function ensureCodePenalV2Migration(db) {
  const stored = getState(db, 'codepenal');
  if (!stored) return;

  const currentVersion = Number(stored.schemaVersion) || 1;
  if (currentVersion >= 2) return;

  // 1 ── Backup: push the untouched v1 data into history BEFORE any mutation.
  const historyBefore = getState(db, 'codepenal_history') || [];
  const totalRowsBefore = (stored.sections || []).reduce((sum, s) => sum + (s.rows || []).length, 0);
  historyBefore.unshift({
    savedAt: new Date().toISOString(),
    savedBy: 'migration_v1_to_v2',
    schemaVersion: 1,
    totalRows: totalRowsBefore,
    sections: (stored.sections || []).map((s) => ({
      id: s.id,
      title: s.title,
      rowCount: (s.rows || []).length
    })),
    _migrationBackup: true,
    snapshot: JSON.parse(JSON.stringify(stored))
  });
  setState(db, 'codepenal_history', historyBefore.slice(0, 25));

  // 2 ── Assign a stable uid to every row that doesn't already have one.
  //      UIDs are generated once here and never changed again.
  const migratedSections = (stored.sections || []).map((section) => {
    const rows = (section.rows || []).map((row) => {
      if (row.uid && String(row.uid).trim()) return row;
      return Object.assign({}, row, { uid: generateRowUid() });
    });
    return Object.assign({}, section, { rows });
  });

  // 3 ── Add global column definitions if the stored data has none.
  const existingColumns = Array.isArray(stored.columns) && stored.columns.length
    ? stored.columns
    : DEFAULT_GLOBAL_COLUMNS;

  // 4 ── Persist the migrated Code Pénal.
  setState(db, 'codepenal', Object.assign({}, stored, {
    schemaVersion: 2,
    columns: existingColumns,
    sections: migratedSections
  }));
}

module.exports = {
  bootstrapDatabase,
  getState,
  setState
};
