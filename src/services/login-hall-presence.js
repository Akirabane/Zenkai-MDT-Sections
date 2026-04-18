const presences = new Map();
const subscribers = new Set();

const STALE_AFTER_MS = 15000;
const MAX_PRESENCES = 200;
const MAX_SSE_CONNECTIONS = 50;
const cleanupTimer = setInterval(() => {
  let changed = false;
  const now = Date.now();
  presences.forEach((presence, id) => {
    if (now - presence.updatedAt > STALE_AFTER_MS) {
      presences.delete(id);
      changed = true;
    }
  });
  if (changed) {
    broadcastSnapshot();
  }
}, 5000);

if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

function sanitizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeName(value) {
  if (typeof value !== 'string') return 'Shinobi';
  const trimmed = value.trim().slice(0, 32);
  return trimmed || 'Shinobi';
}

function buildSnapshot() {
  return Array.from(presences.values()).map((presence) => ({
    id: presence.id,
    name: presence.name,
    x: presence.x,
    z: presence.z,
    yaw: presence.yaw,
    pitch: presence.pitch,
    updatedAt: presence.updatedAt
  }));
}

function getSnapshot() {
  return buildSnapshot();
}

function writeEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastSnapshot() {
  const payload = {
    type: 'snapshot',
    peers: buildSnapshot()
  };

  subscribers.forEach((response) => {
    try {
      writeEvent(response, payload);
    } catch (error) {
      subscribers.delete(response);
    }
  });
}

function subscribe(response) {
  if (subscribers.size >= MAX_SSE_CONNECTIONS) {
    response.status?.(503);
    response.end?.();
    return () => {};
  }
  subscribers.add(response);
  writeEvent(response, {
    type: 'snapshot',
    peers: buildSnapshot()
  });

  const heartbeat = setInterval(() => {
    try {
      response.write(': keepalive\n\n');
    } catch (error) {
      clearInterval(heartbeat);
      subscribers.delete(response);
    }
  }, 20000);

  if (typeof heartbeat.unref === 'function') {
    heartbeat.unref();
  }

  return () => {
    clearInterval(heartbeat);
    subscribers.delete(response);
  };
}

function upsertPresence(payload) {
  const id = typeof payload.id === 'string' ? payload.id.trim().slice(0, 64) : '';
  if (!id) return false;

  // Cap: reject new IDs once the map is full (existing IDs are always updated)
  if (!presences.has(id) && presences.size >= MAX_PRESENCES) {
    return false;
  }

  presences.set(id, {
    id,
    name: sanitizeName(payload.name),
    x: sanitizeNumber(payload.x, 0, -60, 60),
    z: sanitizeNumber(payload.z, 0, -70, 30),
    yaw: sanitizeNumber(payload.yaw, 0, -Math.PI * 4, Math.PI * 4),
    pitch: sanitizeNumber(payload.pitch, 0, -1.4, 1.4),
    updatedAt: Date.now()
  });

  broadcastSnapshot();
  return true;
}

function removePresence(id) {
  if (!presences.delete(id)) return false;
  broadcastSnapshot();
  return true;
}

module.exports = {
  getSnapshot,
  subscribe,
  upsertPresence,
  removePresence
};
