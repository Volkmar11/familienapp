// Unit-Tests Phase 5A: Abbildung LEGACY family-main → FAMILY (reine Funktionen, synthetische Daten).
// Ausführen:  node --test tests/legacyMigration.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildMigrationPlan, normalizeChampionHistory, matchNotifications, deriveLastChampionWeek, analyzeLegacy,
  expectedCounts, computeReference, compareWithReference, clampText, MIGRATION_FAMILY_NAME,
} from "../scripts/lib/legacyMigration.mjs";
import { assertSafeTarget, MigrationGuardError, main, readBackup } from "../scripts/migrate-legacy-family.mjs";
import { mapFamilyToChampionData } from "../src/lib/familyMapping.js";

const NOW = new Date("2026-09-28T10:00:00Z"); // Montag
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

// Synthetische Legacy-Familie (keine echten Daten)
function legacy() {
  return {
    members: [
      { id: "m1", name: "Alex", emoji: "🦊", color: "#ff0000", photo: "data:image/png;base64,AAAA", isAdmin: true },
      { id: "m2", name: "Sam", emoji: "🐼", color: "rot", photo: null, isAdmin: false },
      { id: "m3", name: "Kim", emoji: "🐯", color: "#00ff00", photo: null, isAdmin: false },
    ],
    customCategories: [
      { id: "c1", name: "Haushalt", emoji: "🏠", assignedTo: [] },
      { id: "c2", name: "Garten", emoji: "🌱", assignedTo: ["m2", "zz"] },
      { id: "c3", name: " haushalt ", emoji: "🏡", assignedTo: [] }, // Dublette (Groß-/Kleinschreibung)
    ],
    tasks: [
      { id: "t1", name: "Aufgabe Eins", emoji: "🍴", points: 10, category: "Haushalt", recurring: "daily", assignedTo: [], photo: null },
      { id: "t2", name: "x".repeat(85), emoji: "🌱", points: 20, category: "Garten", recurring: "weekly", assignedTo: ["m2", "m3"], photo: "data:," },
      { id: "t3", name: "Schuhe", emoji: "👟", points: 5, category: "Ordnung", recurring: "fortnightly", assignedTo: [], photo: null },
    ],
    completions: [
      // 22:30 UTC am 27.09. = 28.09. 00:30 Berlin → lokaler Tag 28.09.
      { id: "k1", date: "2026-09-27T22:30:00.000Z", points: 7, taskId: "t1", memberId: "m2", taskName: "Aufgabe Eins", category: "Haushalt", confirmed: true, needsConfirm: false },
      { id: "k2", date: "2026-09-21T08:00:00.000Z", points: 20, taskId: "t2", memberId: "m2", taskName: "alt", category: "Garten", confirmed: false, needsConfirm: true },
      { id: "k3", date: "2026-09-14T08:00:00.000Z", points: 15, taskId: "gone", memberId: "m3", taskName: "gelöscht", category: "Sonstiges", confirmed: true, needsConfirm: false },
      { id: "k4", date: "2026-09-15T08:00:00.000Z", points: 5, taskId: "t3", memberId: "m1", taskName: "Schuhe", category: "Ordnung" }, // ohne confirmed → zählt
    ],
    rewards: [{ id: "r1", name: "Eis", emoji: "🍦", pointsCost: 10, assignedTo: ["m2"] }],
    redeemedRewards: [
      { id: "x1", date: "2026-09-16T10:00:00.000Z", memberId: "m3", rewardId: "r1", pointsCost: 8, rewardName: "Eis" },
      { id: "x2", date: "2026-09-17T10:00:00.000Z", memberId: "m3", rewardId: "weg", pointsCost: 3, rewardName: "Kino" },
    ],
    notifications: [
      { id: "n1", date: "2026-09-16T10:00:00.001Z", read: true, type: "reward", memberId: "m3", message: "Kim hat \"Eis\" eingelöst" },
      { id: "n2", date: "2026-09-20T10:00:00.000Z", read: false, type: "reward", memberId: "m3", message: "Kim hat \"Kino\" eingelöst" },
    ],
    championHistory: [
      { memberId: "m3", name: "Kim", emoji: "🐯", pts: 50, week: "2026-09-06" }, // Sonntag → 07.09.
      { memberId: "m2", name: "Sam", emoji: "🐼", pts: 40, week: "2026-09-07" }, // Montag, gleiche Woche → gewinnt
      { memberId: "m1", name: "Alex", emoji: "🦊", pts: 30, week: "2026-08-31" },
    ],
    lastChampionWeek: "2026-09-20",
    needsConfirmation: true,
    adminPin: "9999",
  };
}
const plan = (d = legacy()) => buildMigrationPlan(d, { now: NOW, uuid });

test("Mitglieder → Profile: Reihenfolge, Emoji, Farbe, isAdmin → is_parent, kein Foto", () => {
  const p = plan();
  assert.deepEqual(p.profiles.map((x) => x.ref), ["profile-1", "profile-2", "profile-3"]);
  assert.deepEqual(p.profiles.map((x) => x.sort_order), [0, 1, 2]);
  assert.deepEqual(p.profiles.map((x) => x.is_parent), [true, false, false]);
  assert.equal(p.profiles[0].avatar_emoji, "🦊");
  assert.equal(p.profiles[1].color, null); // ungültige Farbe → Standard
  assert.equal(p.photos.members, 1);
  assert.equal(p.photos.tasks, 1);
  assert.ok(!JSON.stringify(p.profiles).includes("base64"));
});

test("Kategorien: Dubletten zusammengeführt, fehlende referenzierte ergänzt, Zuordnungen bereinigt", () => {
  const p = plan();
  assert.deepEqual(p.categories.map((c) => c.name), ["Haushalt", "Garten", "Ordnung"]);
  assert.equal(p.categories[2].derived, true);
  assert.equal(p.categories[2].icon, "🧹");
  assert.deepEqual(p.categories[1].assignedRefs, ["profile-2"]);
  assert.ok(p.warnings.some((w) => /doppelter Name/.test(w)));
  assert.ok(p.warnings.some((w) => /unbekannte Zuordnung/.test(w)));
});

test("Kategorien null → Legacy-Standardkategorien rekonstruiert", () => {
  const d = legacy(); d.customCategories = null;
  const p = plan(d);
  assert.deepEqual(p.categories.slice(0, 5).map((c) => c.name), ["Ordnung", "Küche", "Haushalt", "Garten", "Sonstiges"]);
  assert.ok(p.tasks.every((t) => t.category_id));
});

test("Aufgaben: neue IDs, Kategorie, Wiederholung, Titelkürzung, Zuordnungen", () => {
  const p = plan();
  assert.equal(new Set(p.tasks.map((t) => t.id)).size, 3);
  assert.ok(p.tasks.every((t) => /^0{8}-/.test(t.id)));
  assert.equal(p.tasks[0].category_id, p.categories[0].id);
  assert.equal(p.tasks[1].title.length, 80);
  assert.ok(p.tasks[1].title.endsWith("…"));
  assert.deepEqual(p.tasks[1].assignedRefs, ["profile-2", "profile-3"]);
  assert.deepEqual(p.tasks[0].assignedRefs, []); // leer = alle → keine Zeilen
  assert.equal(p.tasks[2].recurrence, "daily");
  assert.equal(clampText("  abc  ", 80), "abc");
});

test("Erledigungen: Status, lokaler Tag Europe/Berlin, Punkte-Snapshot, fehlende Aufgabe", () => {
  const p = plan();
  const [k1, k2, k3, k4] = p.completions;
  assert.equal(k1.completion_date, "2026-09-28"); // keine UTC-Verschiebung
  assert.equal(k1.points, 7); // Snapshot, nicht aktueller Aufgabenwert (10)
  assert.equal(k1.status, "confirmed");
  assert.equal(k1.confirmed_at, k1.completed_at);
  assert.equal(k2.status, "pending");
  assert.equal(k2.confirmed_at, null);
  assert.equal(k3.task_id, null); // Aufgabe gelöscht → Historie bleibt
  assert.equal(k3.task_title, "gelöscht");
  assert.equal(k4.status, "confirmed");
});

test("Erledigungen: doppelt am selben lokalen Tag und unbekanntes Profil → Fehler", () => {
  const d = legacy();
  d.completions.push({ ...d.completions[0], id: "dup", date: "2026-09-28T09:00:00.000Z" });
  d.completions.push({ ...d.completions[0], id: "orph", memberId: "nope" });
  const p = plan(d);
  assert.ok(p.errors.some((e) => /doppelt/.test(e)));
  assert.ok(p.errors.some((e) => /unbekanntes Profil/.test(e)));
});

test("Belohnungen und Einlösungen: Kosten-Snapshot, gelöschte Belohnung, Zuordnung", () => {
  const p = plan();
  assert.equal(p.rewards[0].points_required, 10);
  assert.deepEqual(p.rewards[0].assignedRefs, ["profile-2"]);
  assert.equal(p.redemptions[0].points_spent, 8);
  assert.equal(p.redemptions[0].reward_id, p.rewards[0].id);
  assert.equal(p.redemptions[1].reward_id, null);
  assert.equal(p.redemptions[1].reward_title, "Kino");
  assert.equal(p.redemptions[0].redeemed_at, "2026-09-16T10:00:00.000Z");
});

test("Benachrichtigungen: nur eindeutige Treffer quittieren, kein Raten", () => {
  const p = plan();
  assert.equal(p.redemptions[0].acknowledged, true);  // n1 read, 1 ms Abstand
  assert.equal(p.redemptions[1].acknowledged, false); // n2 3 Tage später → kein Treffer
  assert.equal(p.notifications.unmatched, 1);
  const R = [{ id: "a", memberId: "m", date: "2026-01-01T00:00:00.000Z", rewardName: "Eis" }, { id: "b", memberId: "m", date: "2026-01-01T00:00:00.500Z", rewardName: "Eis" }];
  const amb = matchNotifications([{ type: "reward", memberId: "m", date: "2026-01-01T00:00:00.200Z", read: true, message: "Eis" }], R);
  assert.equal(amb.byRedemption.size, 0); // zwei Kandidaten ohne exakten Zeitstempel
  const two = matchNotifications([
    { type: "reward", memberId: "m", date: "2026-01-01T00:00:00.000Z", read: true, message: "Eis" },
    { type: "reward", memberId: "m", date: "2026-01-01T00:00:00.000Z", read: false, message: "Eis" },
  ], R);
  assert.equal(two.byRedemption.size, 0); // Einlösung von zwei Hinweisen beansprucht
  assert.equal(two.stats.ambiguous, 2);
});

test("Champion-Historie: Sonntag → Montag, Dubletten deterministisch", () => {
  const h = normalizeChampionHistory(legacy().championHistory);
  assert.deepEqual(h.kept.map((x) => x.week), ["2026-08-31", "2026-09-07"]);
  assert.equal(h.kept[1].memberId, "m2"); // Montagseintrag gewinnt
  assert.equal(h.dropped, 1);
  const noMon = normalizeChampionHistory([{ week: "2026-09-06", memberId: "a", pts: 1 }, { week: "2026-09-06", memberId: "b", pts: 2 }]);
  assert.equal(noMon.kept[0].memberId, "b"); // sonst zuletzt gespeicherter
  const p = plan();
  assert.equal(p.championHistory.length, 2);
  assert.ok(p.championHistory.every((x) => new Date(x.week_start + "T12:00:00Z").getUTCDay() === 1));
});

test("lastChampionWeek: Marker normalisieren, minus 7 Tage, gegen Historie prüfen", () => {
  const r = deriveLastChampionWeek("2026-09-20", [{ week: "2026-08-17" }], NOW);
  assert.equal(r.normalizedMarker, "2026-09-21");
  assert.equal(r.value, "2026-09-14");
  assert.equal(r.source, "marker-7");
  assert.equal(deriveLastChampionWeek("2026-09-20", [{ week: "2026-09-21" }], NOW).value, "2026-09-21"); // Historie jünger → angehoben
  assert.equal(deriveLastChampionWeek(null, [], NOW).value, "2026-09-21"); // fehlt → keine Nachberechnung
  assert.equal(deriveLastChampionWeek("2026-10-12", [], NOW).value, "2026-09-21"); // Zukunft → gekappt
  assert.equal(plan().settings.last_champion_week, "2026-09-14");
  assert.equal(plan().settings.require_confirmation, true);
});

test("Admin-PIN wird nie in Plan, Statistik oder Referenz übernommen", () => {
  const d = legacy(); const p = plan(d);
  const s = JSON.stringify({ p, a: analyzeLegacy(d), r: computeReference(d, p, NOW) });
  assert.ok(!s.includes("9999"));
  assert.equal(analyzeLegacy(d).hasAdminPin, true);
});

test("Referenz enthält keine Namen/Texte; Round-Trip über FAMILY-Mapping ergibt Diff 0", () => {
  const d = legacy(); const p = plan(d);
  const ref = computeReference(d, p, NOW);
  const refJson = JSON.stringify(ref);
  for (const secret of ["Alex", "Sam", "Kim", "Aufgabe Eins", "Eis", "Kino"]) assert.ok(!refJson.includes(secret), secret);
  // Plan → Rohzeilen wie aus der DB → mapFamilyToChampionData
  const idByRef = new Map(p.profiles.map((x, i) => [x.ref, `p${i}`]));
  const raw = {
    id: "f", name: MIGRATION_FAMILY_NAME,
    family_settings: { show_daily_crown: true, require_confirmation: true, last_champion_week: p.settings.last_champion_week, timezone: "Europe/Berlin" },
    profiles: p.profiles.map((x) => ({ id: idByRef.get(x.ref), name: x.name, avatar_emoji: x.avatar_emoji, color: x.color, sort_order: x.sort_order, active: true, is_parent: x.is_parent })),
    categories: p.categories.map((c) => ({ ...c, category_assignments: [] })), tasks: [], rewards: [],
    completions: p.completions.map((c) => ({ ...c, profile_id: idByRef.get(c.profileRef) })),
    redemptions: p.redemptions.map((r) => ({ ...r, profile_id: idByRef.get(r.profileRef), acknowledged_at: r.acknowledged ? "x" : null })),
    champion_history: p.championHistory.map((h) => ({ ...h, profile_id: h.profileRef ? idByRef.get(h.profileRef) : null })),
  };
  const cmp = compareWithReference(ref, mapFamilyToChampionData(raw).data, idByRef);
  assert.equal(cmp.ok, true, JSON.stringify(cmp.rows.filter((r) => !r.ok)));
  assert.ok(cmp.timelineChecks > 0);
  const r2 = ref.profiles.find((x) => x.ref === "profile-2");
  assert.equal(r2.today, 7); assert.equal(r2.pendingCount, 1); assert.equal(r2.championCount, 1);
  const r3 = ref.profiles.find((x) => x.ref === "profile-3");
  assert.equal(r3.redeemed, 11); assert.equal(r3.available, 4);
  // Abweichung wird erkannt
  raw.completions[0].points = 8;
  assert.equal(compareWithReference(ref, mapFamilyToChampionData(raw).data, idByRef).ok, false);
});

test("expectedCounts zählt Zuordnungszeilen und Status", () => {
  const c = expectedCounts(plan());
  assert.equal(c.profiles, 3); assert.equal(c.parentProfiles, 1);
  assert.equal(c.taskAssignments, 2); assert.equal(c.categoryAssignments, 1); assert.equal(c.rewardAssignments, 1);
  assert.equal(c.completionsPending, 1); assert.equal(c.completionsConfirmed, 3);
  assert.equal(c.redemptionsAcknowledged, 1); assert.equal(c.championHistory, 2);
});

test("Produktionsziel wird blockiert", () => {
  const ok = { url: "https://otejitifgcrrwmudrnhs.supabase.co", key: "sb_publishable_x", projectName: "wochen-champion-test" };
  assert.equal(assertSafeTarget(ok, "gkkzjmszcjivtaygbmfw"), "otejitifgcrrwmudrnhs");
  assert.throws(() => assertSafeTarget({ ...ok, url: "https://gkkzjmszcjivtaygbmfw.supabase.co" }), MigrationGuardError);
  assert.throws(() => assertSafeTarget({ ...ok, url: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co" }, "aaaaaaaaaaaaaaaaaaaa"), MigrationGuardError); // Quelle des Backups
  assert.throws(() => assertSafeTarget({ ...ok, projectName: "wochen-champion" }), MigrationGuardError);
  assert.throws(() => assertSafeTarget({ ...ok, key: "sb_secret_abc" }), MigrationGuardError);
  assert.throws(() => assertSafeTarget({ ...ok, url: "https://example.com" }), MigrationGuardError);
});

function tmpBackup(data = legacy()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wc5a-"));
  const file = path.join(dir, "family-main-test.json");
  fs.writeFileSync(file, JSON.stringify({ source_project: "gkkzjmszcjivtaygbmfw", record: { id: "family-main", data, updated_at: "2026-09-27T00:00:00Z" } }));
  return { dir, file };
}

test("Dry-Run: kein Client, keine Schreibvorgänge, keine Namen/PIN in der Ausgabe", async () => {
  const { file } = tmpBackup();
  const out = [];
  let clients = 0;
  const r = await main(["--dry-run", "--backup", file], {}, { log: (...a) => out.push(a.join(" ")), createClient: () => { clients++; return {}; }, now: NOW });
  assert.equal(clients, 0);
  assert.equal(r.mode, "--dry-run");
  const text = out.join("\n");
  for (const s of ["Alex", "Sam", "Kim", "9999", "base64", "Aufgabe Eins"]) assert.ok(!text.includes(s), s);
  assert.match(text, /keine Verbindung, keine Schreibvorgänge/);
});

test("Apply gegen Produktion bricht vor jedem Client ab", async () => {
  const { file } = tmpBackup();
  let clients = 0;
  await assert.rejects(main(["--apply", "--backup", file], {
    MIGRATION_TARGET_URL: "https://gkkzjmszcjivtaygbmfw.supabase.co", MIGRATION_TARGET_PUBLISHABLE_KEY: "k", MIGRATION_TARGET_PROJECT_NAME: "test",
  }, { log: () => {}, createClient: () => { clients++; return {}; }, now: NOW }), MigrationGuardError);
  assert.equal(clients, 0);
});

test("Backup-Validierung", () => {
  const { dir } = tmpBackup();
  const bad = path.join(dir, "family-main-bad.json");
  fs.writeFileSync(bad, JSON.stringify({ record: { id: "other", data: {}, updated_at: "x" } }));
  assert.throws(() => readBackup(bad), /family-main/);
  const ok = readBackup(path.join(dir, "family-main-test.json"));
  assert.equal(ok.sourceRef, "gkkzjmszcjivtaygbmfw");
  assert.match(ok.sha256, /^[0-9a-f]{64}$/);
});
