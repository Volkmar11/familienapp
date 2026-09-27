// Kalenderlogik für Wochen Champion.
// Alle spielrelevanten Tage sind LOKALE Kalendertage als Schlüssel "YYYY-MM-DD"
// in einer festen Zeitzone (Standard Europe/Berlin, später family_settings.timezone).
// Schlüssel lassen sich als Strings direkt vergleichen ("2026-09-21" < "2026-09-28").
// Keine Nutzung von toISOString() für lokale Kalendertage.

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

const formatters = new Map();
const formatterFor = (timeZone) => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
};

// Zeitpunkt (Date, ISO-String oder ms) → lokaler Kalendertag "YYYY-MM-DD"
export function toDateKey(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = {};
  for (const { type, value: v } of formatterFor(timeZone).formatToParts(d)) p[type] = v;
  return `${p.year}-${p.month}-${p.day}`;
}

// Reine Kalenderarithmetik auf Schlüsseln (zeitzonen- und sommerzeitunabhängig)
const keyToUtc = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const utcToKey = (date) => date.toISOString().slice(0, 10); // nur für reine UTC-Kalenderdaten korrekt

export function addDays(key, days) {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToKey(d);
}

// 0 = Sonntag … 6 = Samstag
export function weekdayOfKey(key) {
  return keyToUtc(key).getUTCDay();
}

// Montag der Woche, zu der der Zeitpunkt lokal gehört
export function weekStartKey(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const key = toDateKey(value, timeZone);
  const wd = weekdayOfKey(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export function monthStartKey(value = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return toDateKey(value, timeZone).slice(0, 8) + "01";
}

// Ältere Versionen speicherten den Wochenbeginn per toISOString() (UTC). In
// Zeitzonen östlich von UTC wurde der lokale Montag dadurch zum Sonntag davor.
// Ein korrekter Wochenschlüssel ist nie ein Sonntag → Sonntag auf Montag heben.
export function normalizeWeekKey(key) {
  if (!key || typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return weekdayOfKey(key) === 0 ? addDays(key, 1) : key;
}
