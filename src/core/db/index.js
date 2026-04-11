const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const env = require('../../config/env');
const schema = require('./schema');
const { bootstrapDatabase } = require('./bootstrap');
const { normalizeText } = require('../utils/normalize');

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

const db = new Database(env.dbPath);
db.function('normalize_lookup', (value) => normalizeText(value));
db.exec(schema);
bootstrapDatabase(db, env);

module.exports = db;
