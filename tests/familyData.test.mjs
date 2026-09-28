// Unit-Tests für den FAMILY-Datenadapter (Phase 4C1): Mapping, Punkte, Tageskrone, Integrität.
// Ausführen:  node --test tests/familyData.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapFamilyToChampionData } from "../src/lib/familyMapping.js";
import { validateFamilyRaw, fetchFamilyRaw, loadFamilyData, FAMILY_SELECT } from "../src/lib/familyData.js";
import { memberPointSummary, dayLeaderIds } from "../src/shared/points.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Mittwoch, 30.09.2026, 10:00 Europe/Berlin (UTC+2)
const NOW = new Date("2026-09-30T08:00:00Z");

// Neutrale Beispielfamilie (keine echten Personen)
function rawFamily(overrides = {}) {
  return {
    id: "fam-1", name: "Familie Beispiel",
    family_settings: { show_daily_crown: true, require_confirmation: true, last_champion_week: "2026-09-28", timezone: "Europe/Berlin" },
    profiles: [
      { id: "p-sam", name: "Sam", avatar_emoji: "🦊", avatar_url: null, color: "#f00", sort_order: 1, active: true, is_parent: false },
      { id: "p-alex", name: "Alex", avatar_emoji: null, avatar_url: null, color: null, sort_order: 0, active: true, is_parent: false },
      { id: "p-kim", name: "Kim", avatar_emoji: "🐼", avatar_url: null, color: "#0f0", sort_order: 2, active: true, is_parent: true },
      { id: "p-old", name: "Alt", avatar_emoji: "👻", avatar_url: null, color: "#000", sort_order: 3, active: false, is_parent: false },
    ],
    categories: [
      { id: "c-kue", name: "Küche", icon: "🍳", sort_order: 1, category_assignments: [] },
      { id: "c-ord", name: "Ordnung", icon: "🧹", sort_order: 0, category_assignments: [{ profile_id: "p-sam" }] },
    ],
    tasks: [
      { id: "t-1", category_id: "c-ord", title: "Zimmer aufräumen", icon: "🧸", image_url: null, points: 10, recurrence: "daily", active: true, sort_order: 0, task_assignments: [] },
      { id: "t-2", category_id: "c-kue", title: "Tisch decken", icon: "🍽️", image_url: null, points: 5, recurrence: "daily", active: true, sort_order: 1, task_assignments: [{ profile_id: "p-alex" }, { profile_id: "p-kim" }] },
      { id: "t-3", category_id: null, title: "Inaktiv", icon: null, image_url: null, points: 3, recurrence: "daily", active: false, sort_order: 2, task_assignments: [] },
    ],
    rewards: [
      { id: "r-1", title: "Spieleabend", icon: "🎲", points_required: 50, active: true, sort_order: 0, reward_assignments: [] },
      { id: "r-2", title: "Kino", icon: null, points_required: 100, active: true, sort_order: 1, reward_assignments: [{ profile_id: "p-sam" }] },
    ],
    completions: [
      { id: "k-1", profile_id: "p-alex", task_id: "t-1", task_title: "Zimmer aufräumen", category_name: "Ordnung", points: 10, completed_at: "2026-09-30T06:00:00Z", completion_date: "2026-09-30", status: "confirmed" },
      { id: "k-2", profile_id: "p-alex", task_id: "t-2", task_title: "Tisch decken", category_name: "Küche", points: 5, completed_at: "2026-09-30T07:00:00Z", completion_date: "2026-09-30", status: "pending" },
      { id: "k-3", profile_id: "p-sam", task_id: "t-1", task_title: "Zimmer aufräumen", category_name: "Ordnung", points: 10, completed_at: "2026-09-30T07:30:00Z", completion_date: "2026-09-30", status: "rejected" },
      { id: "k-4", profile_id: "p-sam", task_id: "t-1", task_title: "Zimmer aufräumen", category_name: "Ordnung", points: 10, completed_at: "2026-09-28T05:00:00Z", completion_date: "2026-09-28", status: "confirmed" },
      // Sonntag 27.09. 23:30 Berlin = 21:30 UTC → Vorwoche, aber gleicher Monat
      { id: "k-5", profile_id: "p-sam", task_id: "t-1", task_title: "Zimmer aufräumen", category_name: "Ordnung", points: 20, completed_at: "2026-09-27T21:30:00Z", completion_date: "2026-09-27", status: "confirmed" },
      // 31.08. → Vormonat
      { id: "k-6", profile_id: "p-kim", task_id: "t-2", task_title: "Tisch decken", category_name: "Küche", points: 40, completed_at: "2026-08-31T10:00:00Z", completion_date: "2026-08-31", status: "confirmed" },
    ],
    redemptions: [
      { id: "d-1", profile_id: "p-kim", reward_id: "r-1", reward_title: "Spieleabend", points_spent: 30, redeemed_at: "2026-09-01T10:00:00Z", acknowledged_at: null },
      { id: "d-2", profile_id: "p-sam", reward_id: "r-1", reward_title: "Spieleabend", points_spent: 5, redeemed_at: "2026-09-02T10:00:00Z", acknowledged_at: "2026-09-02T11:00:00Z" },
    ],
    champion_history: [
      { id: "h-1", profile_id: "p-sam", profile_name: "Sam", profile_avatar: "🦊", week_start: "2026-09-21", points: 70 },
    ],
    ...overrides,
  };
}

test("Profile → members: nur aktive, sortiert, Emoji-Fallback, nie isAdmin (Elternprofil nur neutral markiert)", () => {
  const { data } = mapFamilyToChampionData(rawFamily());
  assert.deepEqual(data.members.map((m) => m.name), ["Alex", "Sam", "Kim"]);
  assert.equal(data.members[0].emoji, "🙂");
  assert.deepEqual(data.members.map((m) => m.isAdmin), [false, false, false]);
  assert.deepEqual(data.members.map((m) => m.isParentPlayer), [false, false, true]);
  assert.ok(!("adminPin" in data), "kein adminPin im FAMILY-Datenmodell");
});

test("Kategorien und Aufgaben: Namen, Zuordnungen, keine Assignments = für alle sichtbar", () => {
  const { data } = mapFamilyToChampionData(rawFamily());
  assert.deepEqual(data.customCategories.map((c) => c.name), ["Ordnung", "Küche"]);
  assert.deepEqual(data.customCategories[0].assignedTo, ["p-sam"]);
  assert.deepEqual(data.customCategories[1].assignedTo, []);
  assert.equal(data.tasks.length, 2, "inaktive Aufgabe ausgeblendet");
  const t1 = data.tasks.find((t) => t.id === "t-1");
  const t2 = data.tasks.find((t) => t.id === "t-2");
  assert.equal(t1.name, "Zimmer aufräumen");
  assert.equal(t1.category, "Ordnung");
  assert.deepEqual(t1.assignedTo, []);
  assert.deepEqual(t2.assignedTo, ["p-alex", "p-kim"]);
  assert.deepEqual(data.rewards.map((r) => [r.name, r.pointsCost, r.assignedTo.length]), [["Spieleabend", 50, 0], ["Kino", 100, 1]]);
  assert.equal(data.rewards[1].emoji, "🎁");
});

test("Completions: rejected entfernt, pending sichtbar aber unbestätigt", () => {
  const { data } = mapFamilyToChampionData(rawFamily());
  assert.ok(!data.completions.some((c) => c.id === "k-3"));
  const p = data.completions.find((c) => c.id === "k-2");
  assert.equal(p.needsConfirm, true);
  assert.equal(p.confirmed, false);
  assert.equal(p.memberName, "Alex");
  assert.equal(data.completions.find((c) => c.id === "k-1").confirmed, true);
});

test("Punkte heute/Woche/Monat/gesamt/verfügbar (Europe/Berlin, nur confirmed)", () => {
  const { data } = mapFamilyToChampionData(rawFamily());
  assert.deepEqual(memberPointSummary(data, "p-alex", NOW), { today: 10, week: 10, month: 10, total: 10, available: 10, pending: 1 });
  // Sam: 28.09. (Woche) + 27.09. 23:30 Berlin (Vorwoche, gleicher Monat); rejected zählt nicht
  assert.deepEqual(memberPointSummary(data, "p-sam", NOW), { today: 0, week: 10, month: 30, total: 30, available: 25, pending: 0 });
  assert.deepEqual(memberPointSummary(data, "p-kim", NOW), { today: 0, week: 0, month: 0, total: 40, available: 10, pending: 0 });
});

test("Einlösungen, Eltern-Hinweise (unquittiert) und Champion-Historie", () => {
  const { data } = mapFamilyToChampionData(rawFamily());
  assert.deepEqual(data.redeemedRewards.map((r) => [r.memberId, r.pointsCost, r.acknowledged]), [["p-kim", 30, false], ["p-sam", 5, true]]);
  assert.equal(data.notifications.length, 1);
  assert.match(data.notifications[0].message, /Kim hat "Spieleabend"/);
  assert.deepEqual(data.championHistory, [{ memberId: "p-sam", name: "Sam", emoji: "🦊", pts: 70, week: "2026-09-21" }]);
  assert.equal(data.lastChampionWeek, "2026-09-28");
});

test("Einstellungen: show_daily_crown und require_confirmation werden übernommen", () => {
  const on = mapFamilyToChampionData(rawFamily());
  assert.deepEqual(on.settings, { showDailyCrown: true, requireConfirmation: true, timezone: "Europe/Berlin", updatedAt: null });
  assert.equal(on.data.needsConfirmation, true);
  const off = mapFamilyToChampionData(rawFamily({ family_settings: { show_daily_crown: false, require_confirmation: false, last_champion_week: null, timezone: "Europe/Berlin" } }));
  assert.equal(off.settings.showDailyCrown, false);
  assert.equal(off.settings.requireConfirmation, false);
  assert.equal(off.data.needsConfirmation, false);
  assert.equal(off.data.lastChampionWeek, null);
});

test("Tageskrone: an → Tagesbester (nur confirmed); aus → niemand; Punkte unverändert", () => {
  const { data } = mapFamilyToChampionData(rawFamily());
  assert.deepEqual(dayLeaderIds(data.completions, data.members, "2026-09-30", true), ["p-alex"]);
  assert.deepEqual(dayLeaderIds(data.completions, data.members, "2026-09-30", false), []);
  assert.equal(memberPointSummary(data, "p-alex", NOW).today, 10);
  // Gleichstand → mehrere Kronen; keine Punkte → keine Krone
  const tie = [...data.completions, { id: "x", memberId: "p-sam", points: 10, date: "2026-09-30T09:00:00Z", confirmed: true }];
  assert.deepEqual(dayLeaderIds(tie, data.members, "2026-09-30", true).sort(), ["p-alex", "p-sam"]);
  assert.deepEqual(dayLeaderIds(data.completions, data.members, "2026-09-29", true), []);
  // nur pending → keine Krone
  const onlyPending = data.completions.filter((c) => c.id === "k-2");
  assert.deepEqual(dayLeaderIds(onlyPending, data.members, "2026-09-30", true), []);
});

test("Leere Familie: leere Listen statt Standarddaten", () => {
  const raw = rawFamily({ profiles: [], categories: [], tasks: [], rewards: [], completions: [], redemptions: [], champion_history: [] });
  assert.deepEqual(validateFamilyRaw(raw), []);
  const { data } = mapFamilyToChampionData(raw);
  for (const k of ["members", "tasks", "completions", "rewards", "redeemedRewards", "championHistory", "customCategories", "notifications"]) assert.deepEqual(data[k], [], k);
});

test("Integrität: fehlende Einstellungen/Listen/Referenzen → Fehler statt Defaults", () => {
  assert.deepEqual(validateFamilyRaw(rawFamily()), []);
  assert.match(validateFamilyRaw(rawFamily({ family_settings: null })).join(), /Einstellungen fehlen/);
  assert.match(validateFamilyRaw(rawFamily({ family_settings: [] })).join(), /Einstellungen fehlen/);
  assert.match(validateFamilyRaw(rawFamily({ tasks: undefined })).join(), /tasks fehlt/);
  assert.match(validateFamilyRaw(rawFamily({ completions: [{ id: "z", profile_id: "unbekannt", points: 1, completed_at: "2026-09-30T08:00:00Z", status: "confirmed" }] })).join(), /Erledigung/);
  assert.match(validateFamilyRaw(rawFamily({ tasks: [{ id: "t", category_id: "fehlt", title: "X", points: 1, task_assignments: [] }] })).join(), /unbekannter Kategorie/);
  assert.match(validateFamilyRaw(rawFamily({ rewards: [{ id: "r", title: "X", points_required: 5, reward_assignments: [{ profile_id: "weg" }] }] })).join(), /unbekanntem Profil/);
  assert.match(validateFamilyRaw(rawFamily({ profiles: [{ id: "p", name: "" }] })).join(), /Profil ohne Namen/);
});

// Minimaler Client-Stub: zeichnet Aufrufe auf, kennt nur select/eq/maybeSingle.
function stubClient(result) {
  const calls = [];
  const q = {
    select(s) { calls.push(["select", s]); return q; },
    eq(c, v) { calls.push(["eq", c, v]); return q; },
    maybeSingle() { calls.push(["maybeSingle"]); return typeof result === "function" ? result() : Promise.resolve(result); },
  };
  return { calls, from(t) { calls.push(["from", t]); return q; } };
}

test("Service: genau eine Leseabfrage auf families mit allen Tabellen eingebettet", async () => {
  const c = stubClient({ data: rawFamily(), error: null });
  const r = await loadFamilyData(c, "fam-1");
  assert.equal(r.ok, true);
  assert.deepEqual(c.calls.map((x) => x[0]), ["from", "select", "eq", "maybeSingle"]);
  assert.deepEqual(c.calls[0], ["from", "families"]);
  assert.deepEqual(c.calls[2], ["eq", "id", "fam-1"]);
  for (const t of ["family_settings", "profiles", "categories", "category_assignments", "tasks", "task_assignments", "rewards", "reward_assignments", "completions", "redemptions", "champion_history"]) {
    assert.match(FAMILY_SELECT, new RegExp(`\\b${t} \\(`), t);
  }
});

test("Service: Fehlerarten network / not_found / incomplete", async () => {
  assert.deepEqual(await loadFamilyData(stubClient({ data: null, error: { message: "x" } }), "f"), { ok: false, kind: "network", error: "Daten konnten nicht geladen werden." });
  assert.equal((await loadFamilyData(stubClient(() => Promise.reject(new Error("offline"))), "f")).kind, "network");
  assert.equal((await loadFamilyData(stubClient({ data: null, error: null }), "f")).kind, "not_found");
  const inc = await loadFamilyData(stubClient({ data: rawFamily({ family_settings: null }), error: null }), "f");
  assert.equal(inc.kind, "incomplete");
  await assert.rejects(fetchFamilyRaw(stubClient({ data: rawFamily({ profiles: null }), error: null }), "f"), /unvollständig/);
});

// ---- Statische Prüfung: FAMILY-Pfad ohne Legacy-Daten und ohne Schreibzugriffe ----
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function importGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g)) walk(path.resolve(path.dirname(file), m[1] || m[2]));
  };
  walk(entry);
  return [...seen];
}

test("FAMILY-Import-Graph: gemeinsame UI ja, Legacy-Wrapper/-Defaults nein", () => {
  const files = importGraph(path.join(ROOT, "src/family/FamilyApp.jsx")).map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
  assert.ok(files.includes("src/shared/ChampionApp.jsx"));
  assert.ok(files.includes("src/lib/familyData.js"));
  assert.ok(!files.includes("src/App.jsx"));
  assert.ok(!files.some((f) => f.startsWith("src/legacy/")), "legacyDefaults im FAMILY-Pfad");
  assert.ok(!files.includes("src/lib/supabaseLegacy.js"));
  for (const f of files) assert.doesNotMatch(stripComments(fs.readFileSync(path.join(ROOT, f), "utf8")), /adminPin|REWARD_SUGGESTIONS|resetData=\{/, `Legacy-PIN/-Daten in ${f}`);
});

test("Schreibzugriffe nur in familyMutations.js; Laden/Mapping/UI/Wrapper schreiben nicht direkt", () => {
  for (const f of ["src/lib/familyData.js", "src/lib/familyMapping.js", "src/family/FamilyChampion.jsx", "src/shared/ChampionApp.jsx", "src/shared/points.js"]) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
    assert.doesNotMatch(src, /\.(insert|upsert|delete|rpc)\(|\.update\(\s*\{|\.channel\(/, f);
  }
});

test("FamilyChampion nutzt gezielte Aktionen (kein update(prev→next), kein readOnly)", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/family/FamilyChampion.jsx"), "utf8");
  assert.match(src, /<ChampionApp[\s\S]*actions=\{actions\}[\s\S]*/);
  assert.match(src, /showDailyCrown=\{model\.settings\.showDailyCrown\}/);
  assert.doesNotMatch(src, /\bupdate=\{/);
  assert.doesNotMatch(src, /\breadOnly\b/);
});
