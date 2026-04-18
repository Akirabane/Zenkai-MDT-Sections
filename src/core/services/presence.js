const presence = new Map();
const guestPresence = new Map();

function buildSessionKey(user, clientId) {
  const pseudo = String((user && user.pseudo) || '').trim() || 'unknown';
  return `${pseudo}::${String(clientId || 'default').trim() || 'default'}`;
}

function cleanPresence() {
  const cutoff = Date.now() - 15000;
  for (const [sessionKey, data] of presence.entries()) {
    if (data.lastSeen < cutoff) {
      presence.delete(sessionKey);
    }
  }
}

function pickStatus(statuses) {
  if (statuses.includes('active')) return 'active';
  if (statuses.includes('mobile')) return 'mobile';
  return 'away';
}

function cleanGuests() {
  const cutoff = Date.now() - 20000;
  for (const [guestId, lastSeen] of guestPresence.entries()) {
    if (lastSeen < cutoff) {
      guestPresence.delete(guestId);
    }
  }
}

function getFullPresence() {
  cleanPresence();
  cleanGuests();

  const grouped = new Map();
  for (const [, data] of presence.entries()) {
    const pseudo = String((data && data.pseudo) || '').trim();
    if (!pseudo) continue;
    const key = pseudo.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        pseudo,
        statuses: [],
        policeRole: Boolean(data.policeRole),
        permission: data.permission || '',
        count: 0
      });
    }
    const item = grouped.get(key);
    item.statuses.push(data.status);
    item.policeRole = item.policeRole || Boolean(data.policeRole);
    item.permission = item.permission || data.permission || '';
    item.count += 1;
  }

  const users = Array.from(grouped.values())
    .map((item) => ({
      pseudo: String(item.pseudo || '').trim(),
      status: pickStatus(item.statuses.filter(Boolean)),
      policeRole: Boolean(item.policeRole),
      permission: item.permission || '',
      count: item.count
    }))
    .filter((item) => item.pseudo)
    .sort((a, b) => {
      if (a.status === b.status) {
        return String(a.pseudo || '').localeCompare(String(b.pseudo || ''));
      }
      return a.status === 'active' ? -1 : 1;
    });

  return {
    users,
    guestCount: guestPresence.size
  };
}

function pingUser(user, status, clientId) {
  presence.set(buildSessionKey(user, clientId), {
    pseudo: String((user && user.pseudo) || '').trim(),
    status: ['active', 'away', 'mobile'].includes(status) ? status : 'away',
    lastSeen: Date.now(),
    policeRole: Boolean(user && user.policeRole),
    permission: (user && user.permission) || ''
  });

  return getFullPresence();
}

function pingGuest(guestId) {
  guestPresence.set(guestId, Date.now());
  return getFullPresence();
}

function removeUser(pseudo) {
  for (const [sessionKey, data] of presence.entries()) {
    if (String(data.pseudo || '').toLowerCase() === String(pseudo || '').toLowerCase()) {
      presence.delete(sessionKey);
    }
  }
}

function updateUserRole(pseudo, policeRole) {
  for (const [, data] of presence.entries()) {
    if (String(data.pseudo || '').toLowerCase() === String(pseudo || '').toLowerCase()) {
      data.policeRole = Boolean(policeRole);
    }
  }
}

function getPublicPresence() {
  cleanPresence();
  cleanGuests();
  const users = Array.from(getFullPresence().users).map((data) => ({
    pseudo: data.pseudo,
    statut: data.status === 'active' ? 'en_ligne' : 'absent',
    police: Boolean(data.policeRole),
    permission: data.permission || '',
    count: data.count || 1
  }));

  return {
    enLigne: users.filter((user) => user.statut === 'en_ligne').length,
    absents: users.filter((user) => user.statut !== 'en_ligne').length,
    visiteurs: guestPresence.size,
    shinobis: users
  };
}

module.exports = {
  cleanPresence,
  getFullPresence,
  getPublicPresence,
  pingGuest,
  pingUser,
  removeUser,
  updateUserRole
};
