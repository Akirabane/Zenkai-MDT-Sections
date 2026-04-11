const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_state (
  state_key TEXT PRIMARY KEY,
  json_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('READ', 'UPDATE', 'ADMIN', 'JUSTICE')),
  police_role INTEGER NOT NULL DEFAULT 0,
  dri_role INTEGER NOT NULL DEFAULT 0,
  linked_membre TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS membres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo_hrp TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nom_rp TEXT,
  grade TEXT,
  chakra TEXT,
  specialisation TEXT,
  division TEXT,
  rang TEXT,
  date_arrivee TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS arrests (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  author TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'incident',
  suspect_nom TEXT,
  suspect_prenom TEXT,
  suspect_grade TEXT,
  suspect_photo TEXT,
  agent_nom TEXT,
  agent_prenom TEXT,
  agent_grade TEXT,
  date_faits TEXT,
  rapport TEXT,
  grave_event INTEGER NOT NULL DEFAULT 0,
  grave_event_details TEXT,
  peine TEXT,
  peine_details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS arrest_delits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arrest_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  delit TEXT NOT NULL,
  FOREIGN KEY (arrest_id) REFERENCES arrests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  author TEXT NOT NULL,
  officer_nom TEXT NOT NULL,
  officer_prenom TEXT NOT NULL,
  officer_grade_section TEXT NOT NULL,
  plaintiff_nom TEXT NOT NULL,
  plaintiff_prenom TEXT NOT NULL,
  plaintiff_grade TEXT NOT NULL,
  accused_nom TEXT,
  accused_prenom TEXT,
  date_faits TEXT NOT NULL,
  objet TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_complaints_timestamp ON complaints(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_objet ON complaints(objet);
CREATE INDEX IF NOT EXISTS idx_complaints_plaintiff ON complaints(plaintiff_nom, plaintiff_prenom);

CREATE TABLE IF NOT EXISTS complaint_discord_threads (
  accused_key TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'En cours',
  assigned_agent TEXT NOT NULL DEFAULT '',
  assigned_agents_json TEXT NOT NULL DEFAULT '[]',
  author TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_investigations_status_updated ON investigations(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigations_created ON investigations(created_at DESC);

CREATE TABLE IF NOT EXISTS investigation_updates (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Suivi',
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_investigation_updates_parent ON investigation_updates(investigation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS investigation_links (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  linked_label TEXT NOT NULL,
  linked_meta_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_investigation_links_parent ON investigation_links(investigation_id, link_type);

CREATE TABLE IF NOT EXISTS investigation_attachments (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_investigation_attachments_parent ON investigation_attachments(investigation_id, uploaded_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created ON user_notifications(user_pseudo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread ON user_notifications(user_pseudo, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER NOT NULL,
  last_attempt_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dri_ninja_files (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  category TEXT NOT NULL,
  clan TEXT NOT NULL DEFAULT 'Aucun',
  rank TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'Aucune',
  nature TEXT NOT NULL DEFAULT 'Aucune',
  kekkai_genkai TEXT NOT NULL DEFAULT 'Aucun',
  artefact TEXT NOT NULL DEFAULT 'Aucun',
  photo_data_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dri_ninja_files_name ON dri_ninja_files(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_dri_ninja_files_rank ON dri_ninja_files(rank);
CREATE INDEX IF NOT EXISTS idx_dri_ninja_files_updated ON dri_ninja_files(updated_at DESC);

CREATE TABLE IF NOT EXISTS dri_artifacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  holder_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dri_artifacts_name ON dri_artifacts(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_dri_artifacts_status ON dri_artifacts(status);
CREATE INDEX IF NOT EXISTS idx_dri_artifacts_updated ON dri_artifacts(updated_at DESC);

CREATE TABLE IF NOT EXISTS dri_internal_investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_agents_json TEXT NOT NULL DEFAULT '[]',
  linked_ninja_ids_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dri_internal_investigations_status ON dri_internal_investigations(status);
CREATE INDEX IF NOT EXISTS idx_dri_internal_investigations_updated ON dri_internal_investigations(updated_at DESC);

CREATE TABLE IF NOT EXISTS dri_internal_investigation_updates (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Suivi',
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES dri_internal_investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dri_internal_investigation_updates_parent ON dri_internal_investigation_updates(investigation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dri_internal_investigation_links (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  linked_label TEXT NOT NULL,
  linked_meta_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES dri_internal_investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dri_internal_investigation_links_parent ON dri_internal_investigation_links(investigation_id, link_type);

CREATE TABLE IF NOT EXISTS dri_internal_investigation_attachments (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES dri_internal_investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dri_internal_investigation_attachments_parent ON dri_internal_investigation_attachments(investigation_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS dri_external_investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_agents_json TEXT NOT NULL DEFAULT '[]',
  target_zone TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dri_external_investigations_status ON dri_external_investigations(status);
CREATE INDEX IF NOT EXISTS idx_dri_external_investigations_updated ON dri_external_investigations(updated_at DESC);

CREATE TABLE IF NOT EXISTS dri_external_investigation_updates (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Suivi',
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES dri_external_investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dri_external_investigation_updates_parent ON dri_external_investigation_updates(investigation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dri_external_investigation_links (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  linked_id TEXT NOT NULL,
  linked_label TEXT NOT NULL,
  linked_meta_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES dri_external_investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dri_external_investigation_links_parent ON dri_external_investigation_links(investigation_id, link_type);

CREATE TABLE IF NOT EXISTS dri_external_investigation_attachments (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES dri_external_investigations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dri_external_investigation_attachments_parent ON dri_external_investigation_attachments(investigation_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  actor_pseudo TEXT NOT NULL,
  actor_permission TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  target_label TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_pseudo, timestamp DESC);

CREATE TABLE IF NOT EXISTS service_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_service_sessions_pseudo ON service_sessions(pseudo, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_sessions_status ON service_sessions(status, started_at DESC);

CREATE TABLE IF NOT EXISTS police_academies (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  author TEXT NOT NULL,
  officer_nom TEXT NOT NULL,
  officer_prenom TEXT NOT NULL,
  officer_grade_section TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  candidate_nom TEXT,
  candidate_prenom TEXT,
  candidate_age TEXT,
  chakra_nature TEXT,
  kg TEXT,
  army_rank TEXT,
  epreuve_1 TEXT,
  epreuve_2 TEXT,
  epreuve_3 TEXT,
  commentaire TEXT,
  outcome TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_police_academies_status_started ON police_academies(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_police_academies_completed_at ON police_academies(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_police_academies_candidate ON police_academies(candidate_nom, candidate_prenom);
CREATE INDEX IF NOT EXISTS idx_police_academies_session ON police_academies(session_id);

CREATE TABLE IF NOT EXISTS police_academy_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  author TEXT NOT NULL,
  officer_nom TEXT NOT NULL,
  officer_prenom TEXT NOT NULL,
  officer_grade_section TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  finalized_by TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_police_academy_sessions_author_status ON police_academy_sessions(author, status);
CREATE INDEX IF NOT EXISTS idx_police_academy_sessions_started ON police_academy_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_police_academy_sessions_completed ON police_academy_sessions(completed_at DESC);
`;

module.exports = schema;
