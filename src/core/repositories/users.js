const db = require('../db');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    pseudo: row.pseudo,
    passwordHash: row.password_hash,
    salt: row.salt,
    permission: row.permission,
    policeRole: Boolean(row.police_role),
    driRole: Boolean(row.dri_role),
    linkedMembre: row.linked_membre || null,
    avatar: row.avatar || null,
    createdAt: row.created_at,
    tokenVersion: row.token_version
  };
}

function mapUserSafe(row) {
  if (!row) return null;
  return {
    id: row.id,
    pseudo: row.pseudo,
    permission: row.permission,
    policeRole: Boolean(row.police_role),
    driRole: Boolean(row.dri_role),
    linkedMembre: row.linked_membre || null,
    avatar: row.avatar || null,
    createdAt: row.created_at,
    tokenVersion: row.token_version
  };
}

function findByPseudo(pseudo) {
  return mapUser(
    db.prepare('SELECT * FROM users WHERE pseudo = ? COLLATE NOCASE').get(pseudo)
  );
}

function findById(id) {
  return mapUserSafe(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function listUsers() {
  return db.prepare('SELECT * FROM users ORDER BY LOWER(pseudo) ASC').all().map(mapUserSafe);
}

function countAdmins() {
  return db.prepare("SELECT COUNT(*) AS total FROM users WHERE permission = 'ADMIN'").get().total;
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
}

function createUser(input) {
  const statement = db.prepare(`
    INSERT INTO users (
      pseudo, password_hash, salt, permission, police_role, dri_role, linked_membre, avatar, created_at, token_version
    ) VALUES (
      @pseudo, @password_hash, @salt, @permission, @police_role, @dri_role, @linked_membre, @avatar, @created_at, 0
    )
  `);

  const result = statement.run({
    pseudo: input.pseudo,
    password_hash: input.passwordHash,
    salt: input.salt,
    permission: input.permission,
    police_role: input.policeRole ? 1 : 0,
    dri_role: input.driRole ? 1 : 0,
    linked_membre: input.linkedMembre || null,
    avatar: input.avatar || null,
    created_at: input.createdAt
  });

  return findById(result.lastInsertRowid);
}

function upsertSharedUser(input) {
  const existing = findByPseudo(input.pseudo);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET password_hash = @password_hash,
          salt = @salt,
          permission = @permission,
          police_role = @police_role,
          linked_membre = @linked_membre
      WHERE pseudo = @pseudo COLLATE NOCASE
    `).run({
      pseudo: input.pseudo,
      password_hash: input.passwordHash,
      salt: input.salt,
      permission: input.permission,
      police_role: input.policeRole ? 1 : 0,
      linked_membre: input.linkedMembre || null
    });
    return findByPseudo(input.pseudo);
  }

  return createUser(input);
}

function updateDriRole(pseudo, driRole) {
  db.prepare('UPDATE users SET dri_role = ? WHERE pseudo = ? COLLATE NOCASE').run(driRole ? 1 : 0, pseudo);
  return findByPseudo(pseudo);
}

function updateLinkedMembre(pseudo, linkedMembre) {
  db.prepare('UPDATE users SET linked_membre = ? WHERE pseudo = ? COLLATE NOCASE').run(linkedMembre || null, pseudo);
  return findByPseudo(pseudo);
}

function updatePermission(pseudo, permission) {
  db.prepare('UPDATE users SET permission = ? WHERE pseudo = ? COLLATE NOCASE').run(permission, pseudo);
  return findByPseudo(pseudo);
}

function updatePoliceRole(pseudo, policeRole) {
  db.prepare('UPDATE users SET police_role = ? WHERE pseudo = ? COLLATE NOCASE').run(policeRole ? 1 : 0, pseudo);
  return findByPseudo(pseudo);
}

function updateAvatar(userId, avatar) {
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, userId);
  return findById(userId);
}

function updatePassword(userId, input) {
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(input.passwordHash, input.salt, userId);
  return findById(userId);
}

function deleteUser(pseudo) {
  return db.prepare('DELETE FROM users WHERE pseudo = ? COLLATE NOCASE').run(pseudo);
}

function bumpTokenVersion(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  return findById(userId);
}

module.exports = {
  countAdmins,
  countUsers,
  createUser,
  deleteUser,
  findById,
  findByPseudo,
  listUsers,
  upsertSharedUser,
  updateAvatar,
  updatePassword,
  updateLinkedMembre,
  updatePermission,
  updatePoliceRole,
  updateDriRole,
  bumpTokenVersion
};
