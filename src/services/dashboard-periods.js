const env = require('../config/env');

const TIMEZONE = env.backupTimezone || 'Europe/Paris';
const WEEKDAY_INDEX = {
  'lun.': 0,
  lundi: 0,
  'mar.': 1,
  mardi: 1,
  'mer.': 2,
  mercredi: 2,
  'jeu.': 3,
  jeudi: 3,
  'ven.': 4,
  vendredi: 4,
  'sam.': 5,
  samedi: 5,
  'dim.': 6,
  dimanche: 6
};

function getZonedParts(date, timeZone = TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });

  return {
    weekday: String(values.weekday || '').toLowerCase(),
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function getTimeZoneOffsetMs(date, timeZone = TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  const utcTs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcTs - date.getTime();
}

function makeZonedDate(year, month, day, hour, minute, second = 0, timeZone = TIMEZONE) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function addDaysToCalendarDate(year, month, day, delta) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getCurrentWeeklyResetBoundary(now = new Date(), timeZone = TIMEZONE) {
  const parts = getZonedParts(now, timeZone);
  const weekdayIndex = WEEKDAY_INDEX[parts.weekday] ?? 0;
  let monday = addDaysToCalendarDate(parts.year, parts.month, parts.day, -weekdayIndex);
  let boundary = makeZonedDate(monday.year, monday.month, monday.day, 15, 0, 0, timeZone);

  if (now < boundary) {
    monday = addDaysToCalendarDate(monday.year, monday.month, monday.day, -7);
    boundary = makeZonedDate(monday.year, monday.month, monday.day, 15, 0, 0, timeZone);
  }

  return boundary;
}

function getNextWeeklyResetBoundary(boundaryDate, timeZone = TIMEZONE) {
  const parts = getZonedParts(boundaryDate, timeZone);
  const nextMonday = addDaysToCalendarDate(parts.year, parts.month, parts.day, 7);
  return makeZonedDate(nextMonday.year, nextMonday.month, nextMonday.day, 15, 0, 0, timeZone);
}

function getCurrentServiceAutoCloseBoundary(now = new Date(), timeZone = TIMEZONE) {
  const parts = getZonedParts(now, timeZone);
  let boundary = makeZonedDate(parts.year, parts.month, parts.day, 3, 0, 0, timeZone);

  if (now < boundary) {
    const previousDay = addDaysToCalendarDate(parts.year, parts.month, parts.day, -1);
    boundary = makeZonedDate(previousDay.year, previousDay.month, previousDay.day, 3, 0, 0, timeZone);
  }

  return boundary;
}

function formatPeriodLabel(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startLabel = start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const endExclusive = new Date(end.getTime() - 1);
  const endLabel = endExclusive.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${startLabel} au ${endLabel}`;
}

module.exports = {
  TIMEZONE,
  formatPeriodLabel,
  getCurrentServiceAutoCloseBoundary,
  getCurrentWeeklyResetBoundary,
  getNextWeeklyResetBoundary
};
