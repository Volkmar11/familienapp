// Datumstests ohne zusätzliche Abhängigkeiten (Node.js >= 18, eingebautes node:test).
// Ausführen:  node --test tests/dateUtils.test.mjs
// Die Ergebnisse müssen unabhängig von der Zeitzone des Rechners sein, z. B.:
//   TZ=UTC node --test tests/dateUtils.test.mjs   ·   TZ=America/New_York node --test tests/dateUtils.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TIME_ZONE, toDateKey, addDays, weekdayOfKey, weekStartKey, monthStartKey, normalizeWeekKey,
} from "../src/lib/dateUtils.js";

test("Standard-Zeitzone ist Europe/Berlin", () => {
  assert.equal(DEFAULT_TIME_ZONE, "Europe/Berlin");
});

test("Montag, 21.09.2026 → 2026-09-21 (Mittag)", () => {
  assert.equal(toDateKey(new Date("2026-09-21T12:00:00+02:00")), "2026-09-21");
});

test("Wochenbeginn von Montag, 21.09.2026 → 2026-09-21", () => {
  assert.equal(weekStartKey(new Date("2026-09-21T12:00:00+02:00")), "2026-09-21");
});

test("Sonntag, 27.09.2026 (23:30 lokal) gehört zur Woche ab 2026-09-21", () => {
  const sonntagSpaet = new Date("2026-09-27T23:30:00+02:00");
  assert.equal(toDateKey(sonntagSpaet), "2026-09-27");
  assert.equal(weekStartKey(sonntagSpaet), "2026-09-21");
});

test("Montag, 28.09.2026 → neue Woche ab 2026-09-28", () => {
  assert.equal(weekStartKey(new Date("2026-09-28T08:00:00+02:00")), "2026-09-28");
});

test("Nahe Mitternacht: Montag 21.09.2026, 00:30 lokal (= Sonntag 22:30 UTC)", () => {
  const kurzNachMitternacht = new Date("2026-09-21T00:30:00+02:00");
  // Die alte UTC-Logik lieferte hier "2026-09-20" (Sonntag)
  assert.equal(kurzNachMitternacht.toISOString().slice(0, 10), "2026-09-20");
  assert.equal(toDateKey(kurzNachMitternacht), "2026-09-21");
  assert.equal(weekStartKey(kurzNachMitternacht), "2026-09-21");
});

test("Nahe Mitternacht im Winter (MEZ, UTC+1): 01.01.2027, 00:15 lokal", () => {
  const neujahr = new Date("2027-01-01T00:15:00+01:00");
  assert.equal(neujahr.toISOString().slice(0, 10), "2026-12-31");
  assert.equal(toDateKey(neujahr), "2027-01-01");
  assert.equal(monthStartKey(neujahr), "2027-01-01");
});

test("Kurz vor Mitternacht bleibt derselbe Tag: 27.09.2026, 23:59 lokal", () => {
  assert.equal(toDateKey(new Date("2026-09-27T23:59:59+02:00")), "2026-09-27");
});

test("Sommerzeit-Umstellung (25.10.2026) verschiebt keine Tage", () => {
  assert.equal(addDays("2026-10-24", 1), "2026-10-25");
  assert.equal(addDays("2026-10-25", 1), "2026-10-26");
  assert.equal(weekStartKey(new Date("2026-10-25T12:00:00+01:00")), "2026-10-19");
  assert.equal(weekStartKey(new Date("2026-10-26T00:10:00+01:00")), "2026-10-26");
});

test("addDays über Monats- und Jahresgrenzen", () => {
  assert.equal(addDays("2026-09-28", -7), "2026-09-21");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-03-01", -1), "2028-02-29");
});

test("weekdayOfKey", () => {
  assert.equal(weekdayOfKey("2026-09-21"), 1); // Montag
  assert.equal(weekdayOfKey("2026-09-27"), 0); // Sonntag
});

test("Vorwoche für Champion-Auswertung", () => {
  const ws = weekStartKey(new Date("2026-09-30T10:00:00+02:00"));
  assert.equal(ws, "2026-09-28");
  assert.equal(addDays(ws, -7), "2026-09-21"); // prevWeekStart
  assert.equal(addDays(ws, -1), "2026-09-27"); // prevWeekEnd (inklusive)
});

test("Alte UTC-Wochenschlüssel (Sonntag) werden auf Montag normalisiert", () => {
  assert.equal(normalizeWeekKey("2026-09-20"), "2026-09-21");
  assert.equal(normalizeWeekKey("2026-09-21"), "2026-09-21");
  assert.equal(normalizeWeekKey(null), null);
  assert.equal(normalizeWeekKey(undefined), undefined);
});

test("Ungültige Eingaben", () => {
  assert.equal(toDateKey("kein Datum"), "");
});

test("Andere Zeitzone als Parameter (Vorbereitung family_settings.timezone)", () => {
  const t = new Date("2026-09-21T02:00:00Z"); // Berlin: 04:00 Mo · New York: 22:00 So
  assert.equal(toDateKey(t, "Europe/Berlin"), "2026-09-21");
  assert.equal(toDateKey(t, "America/New_York"), "2026-09-20");
  assert.equal(weekStartKey(t, "America/New_York"), "2026-09-14");
});
