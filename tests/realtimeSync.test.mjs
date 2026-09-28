// Unit-Tests Phase 4C2B2: Reload-Scheduler, Realtime-Service, App-Lebenszyklus,
// Konflikterkennung (updated_at) und Champion-Ergebnis.
// Ausführen:  node --test tests/realtimeSync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReloadScheduler } from "../src/lib/reloadScheduler.js";
import { createFamilyRealtime } from "../src/lib/familyRealtime.js";
import { onAppForeground } from "../src/lib/appLifecycle.js";
import * as M from "../src/lib/familyMutations.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (fn) => async () => { const e = console.error; console.error = () => {}; try { await fn(); } finally { console.error = e; } };

// ---------------------------------------------------------------- Scheduler
test("Scheduler: 10 Anlässe kurz hintereinander → 1 Reload (Debounce)", async () => {
  let runs = 0;
  const s = createReloadScheduler(async () => { runs++; return true; }, { debounceMs: 20 });
  const ps = Array.from({ length: 10 }, () => s.request());
  assert.deepEqual(await Promise.all(ps), Array(10).fill(true));
  assert.equal(runs, 1);
});

test("Scheduler: Single Flight + genau ein Nachlauf für Anlässe während des Reloads", async () => {
  let runs = 0, active = 0, maxActive = 0;
  const s = createReloadScheduler(async () => { runs++; active++; maxActive = Math.max(maxActive, active); await sleep(40); active--; return runs; }, { debounceMs: 5 });
  const first = s.request({ immediate: true });
  await sleep(10); // erster Reload läuft
  const during = [s.request(), s.request(), s.request()];
  assert.equal(await first, 1);
  assert.deepEqual(await Promise.all(during), [2, 2, 2], "Anlässe während des Laufs warten auf den NÄCHSTEN Reload (keine verlorenen Änderungen)");
  assert.equal(runs, 2);
  assert.equal(maxActive, 1);
});

test("Scheduler: stop() → keine weiteren Reloads, wartende Promises lösen false", async () => {
  let runs = 0;
  const s = createReloadScheduler(async () => { runs++; return true; }, { debounceMs: 30 });
  const p = s.request();
  s.stop();
  assert.equal(await p, false);
  assert.equal(await s.request(), false);
  await sleep(50);
  assert.equal(runs, 0);
});

test("Scheduler: Fehler im Reload bricht den Scheduler nicht", async () => {
  let n = 0;
  const s = createReloadScheduler(async () => { n++; if (n === 1) throw new Error("x"); return true; }, { debounceMs: 1 });
  assert.equal(await s.request(), false);
  assert.equal(await s.request(), true);
});

// ---------------------------------------------------------------- Realtime (Fake-Client)
function fakeClient() {
  const channels = [];
  return {
    channels,
    removed: [],
    channel(name) {
      const ch = { name, handlers: [], statusCb: null, params: null,
        on(type, params, cb) { ch.params = { type, ...params }; ch.handlers.push(cb); return ch; },
        subscribe(cb) { ch.statusCb = cb; return ch; },
        emit(payload) { ch.handlers.forEach((h) => h(payload)); },
        status(s) { ch.statusCb?.(s); } };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch) { this.removed.push(ch); },
  };
}

test("Realtime: nur family_sync der eigenen Familie, gefiltert", () => {
  const c = fakeClient();
  const events = [];
  const rt = createFamilyRealtime({ client: c, familyId: "fam-A", onChange: (e) => events.push(e) });
  const ch = c.channels[0];
  assert.deepEqual(ch.params, { type: "postgres_changes", event: "*", schema: "public", table: "family_sync", filter: "family_id=eq.fam-A" });
  ch.status("SUBSCRIBED");
  ch.emit({ new: { family_id: "fam-A", version: 2 } });
  ch.emit({ new: { family_id: "fam-B", version: 9 } }); // fremde Familie (dürfte per Filter/RLS nie ankommen)
  assert.deepEqual(events, ["subscribed", "change"]);
  rt.stop();
});

test("Realtime: CHANNEL_ERROR/TIMED_OUT/CLOSED → disconnected, neuer Channel, Reconnect lädt neu", () => {
  const c = fakeClient();
  const events = [], statuses = [];
  const timers = [];
  const rt = createFamilyRealtime({ client: c, familyId: "f", onChange: (e) => events.push(e), onStatus: (s) => statuses.push(s),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
  c.channels[0].status("SUBSCRIBED");
  for (const [i, bad] of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].entries()) {
    c.channels[i].status(bad);
    assert.equal(rt.status, "disconnected");
    timers.at(-1).fn(); // Wiederverbindungs-Timer
    assert.equal(c.channels.length, i + 2, "neuer Channel");
    assert.ok(c.removed.includes(c.channels[i]), "alter Channel entfernt");
    c.channels[i].status("SUBSCRIBED"); // verspätete Rückmeldung des ALTEN Channels → ignoriert
    c.channels[i + 1].status("SUBSCRIBED");
  }
  assert.deepEqual(timers.map((t) => t.ms), [1000, 1000, 1000], "nach Erfolg beginnt die Wartezeit wieder klein");
  assert.equal(events.filter((e) => e === "subscribed").length, 4, "jede (Wieder-)Verbindung → vollständiger Reload");
  assert.deepEqual(statuses, ["connected", "disconnected", "connected", "disconnected", "connected", "disconnected", "connected"]);
  rt.stop();
});

test("Realtime: stop() entfernt Channel, danach keine Ereignisse; reconnectNow nur wenn getrennt", () => {
  const c = fakeClient();
  const events = [];
  const rt = createFamilyRealtime({ client: c, familyId: "f", onChange: (e) => events.push(e), setTimer: () => 1, clearTimer: () => {} });
  c.channels[0].status("SUBSCRIBED");
  rt.reconnectNow();
  assert.equal(c.channels.length, 1, "verbunden → kein neuer Channel");
  rt.stop();
  assert.ok(c.removed.includes(c.channels[0]));
  c.channels[0].emit({ new: { family_id: "f" } });
  c.channels[0].status("SUBSCRIBED");
  assert.deepEqual(events, ["subscribed"]);
});

// ---------------------------------------------------------------- Lebenszyklus
function fakeEnv() {
  const listeners = {};
  const mk = () => ({ addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); } });
  const doc = { ...mk(), visibilityState: "visible" };
  const win = mk();
  return { doc, win, fire: (t) => (listeners[t] || []).forEach((f) => f()), listeners };
}

test("Lebenszyklus: visibilitychange + focus → ein Ereignis (entprellt); unsichtbar → keins", () => {
  const env = fakeEnv();
  let t = 0; const calls = [];
  const off = onAppForeground((src) => calls.push(src), { doc: env.doc, win: env.win, now: () => t, debounceMs: 800 });
  env.fire("visibilitychange"); env.fire("focus");
  assert.deepEqual(calls, ["visibility"]);
  t = 1000; env.doc.visibilityState = "hidden"; env.fire("visibilitychange");
  assert.equal(calls.length, 1);
  env.doc.visibilityState = "visible"; env.fire("visibilitychange"); env.fire("online");
  assert.deepEqual(calls, ["visibility", "visibility"]);
  off();
  t = 5000; env.fire("focus");
  assert.equal(calls.length, 2, "nach Abmelden keine Ereignisse");
});

// ---------------------------------------------------------------- Konflikterkennung
function stub(responses) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = { table, op: "select", filters: [], payload: null };
      calls.push(q);
      const b = {
        select() { return b; }, insert(p) { q.op = "insert"; q.payload = p; return b; }, update(p) { q.op = "update"; q.payload = p; return b; },
        eq(c, v) { q.filters.push([c, v]); return b; }, in() { return b; }, is() { return b; }, order() { return b; }, limit() { return b; },
        single() { return Promise.resolve(responses(q)); }, maybeSingle() { return Promise.resolve(responses(q)); },
        then(res, rej) { return Promise.resolve(responses(q)).then(res, rej); },
      };
      return b;
    },
    rpc(name, args) { const q = { table: "rpc:" + name, op: "rpc", payload: args }; calls.push(q); return Promise.resolve(responses(q)); },
  };
  return client;
}

test("Konflikt: Update mit veraltetem updated_at → 0 Zeilen → Konfliktmeldung, keine Zuordnung", async () => {
  const c = stub((q) => (q.op === "update" ? { data: [], error: null } : q.table === "tasks" ? { data: [{ id: "t" }], error: null } : { data: [], error: null }));
  const r = await M.saveTask(c, { familyId: "f", task: { id: "t", title: "Zimmer", points: 5, recurrence: "daily", assignedTo: [], expectedUpdatedAt: "2026-09-28T10:00:00.123456+00:00" } });
  assert.equal(r.reason, "conflict");
  assert.equal(r.message, "Dieser Eintrag wurde auf einem anderen Gerät geändert. Bitte lade die aktuellen Daten neu.");
  assert.ok(c.calls[0].filters.some(([k, v]) => k === "updated_at" && v === "2026-09-28T10:00:00.123456+00:00"));
  assert.ok(!c.calls.some((q) => q.op === "rpc"), "keine Zuordnung nach Konflikt");
});

test("Konflikt: Eintrag gelöscht → nicht gefunden; ohne expectedUpdatedAt kein updated_at-Filter", async () => {
  const gone = stub(() => ({ data: [], error: null }));
  assert.equal((await M.saveReward(gone, { familyId: "f", reward: { id: "r", title: "Kino", pointsRequired: 5, assignedTo: [], expectedUpdatedAt: "x" } })).reason, "not_found");
  const ok = stub((q) => (q.op === "update" ? { data: [{ id: "c" }], error: null } : { data: [], error: null }));
  await M.saveCategory(ok, { familyId: "f", category: { id: "c", name: "Küche", assignedTo: [] } });
  assert.ok(!ok.calls[0].filters.some(([k]) => k === "updated_at"));
});

test("Konflikt: Einstellungen und Profil prüfen updated_at", async () => {
  const c = stub((q) => (q.op === "update" ? { data: [], error: null } : { data: [{ family_id: "f", id: "p" }], error: null }));
  assert.equal((await M.updateFamilySettings(c, { familyId: "f", showDailyCrown: false, expectedUpdatedAt: "ts" })).reason, "conflict");
  assert.equal((await M.saveProfile(c, { familyId: "f", profile: { id: "p", name: "Alex", expectedUpdatedAt: "ts" } })).reason, "conflict");
});

test("Champion-Sync: Ergebnis abgebildet, neuer Champion nur wenn Server es meldet", async () => {
  const c = stub(() => ({ data: { ok: true, processed_weeks: 3, created: [{ week_start: "2026-09-21", profile_id: "p", points: 30 }], new_champion: true, last_champion_week: "2026-09-21", latest: { week_start: "2026-09-21", ranking: [{ profile_id: "p", points: 30 }] } }, error: null }));
  const r = await M.syncWeeklyChampion(c, { familyId: "f" });
  assert.deepEqual(r, { ok: true, processedWeeks: 3, created: [{ weekStart: "2026-09-21", profileId: "p", points: 30 }], newChampion: true, lastChampionWeek: "2026-09-21", latest: { weekStart: "2026-09-21", ranking: [{ profileId: "p", points: 30 }] } });
  assert.deepEqual(c.calls[0], { table: "rpc:sync_weekly_champion", op: "rpc", payload: { p_family_id: "f" } });
  const again = await M.syncWeeklyChampion(stub(() => ({ data: { ok: true, processed_weeks: 0, created: [], new_champion: false, latest: null }, error: null })), { familyId: "f" });
  assert.equal(again.newChampion, false);
  assert.equal(again.latest, null);
});

test("Statisch: Realtime nur im FAMILY-Pfad; LEGACY-Pfad ohne neue Module", () => {
  const legacy = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  assert.doesNotMatch(legacy, /familyRealtime|reloadScheduler|appLifecycle|sync_weekly_champion/);
  const shared = fs.readFileSync(path.join(ROOT, "src/shared/ChampionApp.jsx"), "utf8");
  assert.doesNotMatch(shared, /\.channel\(|\.rpc\(|supabase/i, "gemeinsame UI ohne Backend-Zugriffe");
  const fam = fs.readFileSync(path.join(ROOT, "src/family/FamilyChampion.jsx"), "utf8");
  assert.match(fam, /createFamilyRealtime/);
  assert.match(fam, /createReloadScheduler/);
  assert.doesNotMatch(fam, /localStorage|sessionStorage/);
});
