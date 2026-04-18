const db = require('../db');
const { getState, setState } = require('../db/bootstrap');

const STATE_KEY = 'visitMetrics';
const KEEP_DAYS = 60;

function formatDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};
  return {
    days: state.days && typeof state.days === 'object' ? state.days : {}
  };
}

function saveState(state) {
  setState(db, STATE_KEY, state);
}

function loadState() {
  return normalizeState(getState(db, STATE_KEY));
}

function ensureDayBucket(state, dayKey) {
  if (!state.days[dayKey] || typeof state.days[dayKey] !== 'object') {
    state.days[dayKey] = {
      police: [],
      justice: [],
      visitors: []
    };
  }
  const day = state.days[dayKey];
  day.police = Array.isArray(day.police) ? day.police : [];
  day.justice = Array.isArray(day.justice) ? day.justice : [];
  day.visitors = Array.isArray(day.visitors) ? day.visitors : [];
  return day;
}

function trimState(state) {
  const keys = Object.keys(state.days).sort();
  const excess = keys.length - KEEP_DAYS;
  if (excess <= 0) return;
  keys.slice(0, excess).forEach((key) => {
    delete state.days[key];
  });
}

function uniquePush(list, value) {
  if (!value) return false;
  if (list.includes(value)) return false;
  list.push(value);
  return true;
}

function recordPoliceVisit(user, now = new Date()) {
  const pseudo = String((user && user.pseudo) || '').trim();
  if (!pseudo) return;

  const state = loadState();
  const day = ensureDayBucket(state, formatDayKey(now));
  const bucket = String((user && user.permission) || '').toUpperCase() === 'JUSTICE'
    ? day.justice
    : day.police;

  if (uniquePush(bucket, pseudo.toLowerCase())) {
    trimState(state);
    saveState(state);
  }
}

function recordGuestVisit(guestId, now = new Date()) {
  const value = String(guestId || '').trim();
  if (!value) return;

  const state = loadState();
  const day = ensureDayBucket(state, formatDayKey(now));
  if (uniquePush(day.visitors, value)) {
    trimState(state);
    saveState(state);
  }
}

function buildVisitSeries(days = 30, now = new Date()) {
  const state = loadState();
  const result = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const current = new Date(now);
    current.setHours(0, 0, 0, 0);
    current.setDate(current.getDate() - index);

    const key = formatDayKey(current);
    const day = ensureDayBucket(state, key);
    result.push({
      key,
      label: current.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      police: day.police.length,
      justice: day.justice.length,
      visitors: day.visitors.length
    });
  }

  return result;
}

module.exports = {
  buildVisitSeries,
  recordGuestVisit,
  recordPoliceVisit
};
