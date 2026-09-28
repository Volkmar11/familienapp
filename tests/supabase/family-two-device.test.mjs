// Zwei-Geräte-Synchronisation (Phase 4C2B2) gegen das Supabase-TESTPROJEKT über ECHTE
// Realtime-WebSockets. Jedes „Gerät“ nutzt exakt die App-Bausteine des FAMILY-Wrappers:
// createFamilyRealtime (Signal family_sync) → createReloadScheduler (Debounce/Single Flight)
// → loadFamilyData. Geprüft wird, dass Änderungen auf Gerät B ohne manuelles Neuladen im
// Datenmodell von Gerät A ankommen – inkl. Reconnect nach Verbindungsabbruch.
// Wegwerf-Konto „wc-p4c2b2-sync-…@example.com“. Aufräumen: Familie löscht der Test;
// Konto per SQL: delete from auth.users where email like 'wc-p4c2b2-%@example.com';
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { deleteTestAccounts } from "./_cleanup.mjs";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import * as M from "../../src/lib/familyMutations.js";
import { memberPointSummary, dayLeaderIds } from "../../src/shared/points.js";
import { createFamilyRealtime } from "../../src/lib/familyRealtime.js";
import { createReloadScheduler } from "../../src/lib/reloadScheduler.js";
import { toDateKey } from "../../src/lib/dateUtils.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.error = () => {};
const R = []; const check = (n, ok, d = "") => { R.push({ n, ok: !!ok, d }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(200); } return false; };

const email = `wc-p4c2b2-sync-${Date.now()}@example.com`, password = randomUUID();
const owner = mk(); if ((await owner.auth.signUp({ email, password })).error) throw new Error("signUp");
const s = initialOnboardingState(); s.familyName = "Testfamilie Zwei Geräte";
s.children = ["Alex", "Sam", "Kim"].map((n, i) => ({ id: String(i), name: n, avatar: "🦊", color: "#16a34a" }));
s.pin = s.pin2 = "4827";
STARTER_TASKS.forEach((t, i) => { s.tasks[t.key] = { selected: i < 3, points: "10" }; });
STARTER_REWARDS.forEach((r, i) => { s.rewards[r.key] = { selected: i < 1, points: "10" }; });
s.settings = { showDailyCrown: true, requireConfirmation: true };
const familyId = (await createFamilyWithOnboarding(owner, randomUUID(), buildOnboardingPayload(s))).familyId;

// Ein „Gerät“ = eigener Client + Realtime + Scheduler + aktuelles Modell
async function device(name) {
  const c = mk(); await c.auth.signInWithPassword({ email, password });
  const d = { name, c, model: null, loads: 0, statuses: [] };
  d.sched = createReloadScheduler(async () => { const r = await loadFamilyData(c, familyId); d.loads++; if (r.ok) d.model = r.model; return r.ok; }, { debounceMs: 200 });
  await d.sched.request({ immediate: true });
  d.rt = createFamilyRealtime({ client: c, familyId, onChange: () => d.sched.request(), onStatus: (st) => d.statuses.push(st) });
  await until(() => d.rt.status === "connected");
  await sleep(4000); // Postgres-Changes kurz nach SUBSCRIBED aktiv werden lassen
  return d;
}
const A = await device("A"), B = await device("B");
check("beide Geräte verbunden (echter WebSocket)", A.rt.status === "connected" && B.rt.status === "connected", `${A.statuses} / ${B.statuses}`);
const P = Object.fromEntries(A.model.data.members.map((m) => [m.name, m.id]));
const t0 = A.model.data.tasks[0], reward = A.model.data.rewards[0];

// Pending → Bestätigung
let r = await M.completeTask(A.c, { familyId, profileId: P.Alex, taskId: t0.id }); await A.sched.request({ immediate: true });
check("A: Erledigung pending", r.ok && r.status === "pending");
check("B: Pending erscheint automatisch", await until(() => B.model.data.completions.some((c) => c.memberId === P.Alex && c.needsConfirm && !c.confirmed)));
const loadsA0 = A.loads;
r = await M.confirmCompletion(B.c, { familyId, completionId: r.completion.id }); await B.sched.request({ immediate: true });
check("A: Bestätigung von B kommt automatisch an, Punkte steigen", await until(() => memberPointSummary(A.model.data, P.Alex).total === 10));
await sleep(1500);
check("A: entprellt (höchstens 2 Reloads für eine Bestätigung)", A.loads - loadsA0 >= 1 && A.loads - loadsA0 <= 2, String(A.loads - loadsA0));

// Einlösen / Quittieren
r = await M.redeemReward(A.c, { familyId, profileId: P.Alex, rewardId: reward.id });
check("B: Einlösung/Hinweis automatisch sichtbar", r.ok && await until(() => B.model.data.notifications.length === 1));
await M.acknowledgeRedemptions(B.c, { familyId, redemptionIds: [B.model.data.notifications[0].redemptionId] });
check("A: Hinweis nach Quittieren auf B verschwunden", await until(() => A.model.data.notifications.length === 0));

// Verwaltung auf B → A
r = await M.saveTask(B.c, { familyId, task: { title: "Realtime Aufgabe", points: 12, recurrence: "daily", assignedTo: [] } });
check("A: neue Aufgabe erscheint automatisch", await until(() => A.model.data.tasks.some((t) => t.name === "Realtime Aufgabe")));
const rtTask = A.model.data.tasks.find((t) => t.name === "Realtime Aufgabe");
await M.saveTask(B.c, { familyId, task: { id: rtTask.id, title: "Realtime Aufgabe", points: 15, recurrence: "daily", assignedTo: [], expectedUpdatedAt: rtTask.updatedAt } });
check("A: Punkteänderung automatisch (15)", await until(() => A.model.data.tasks.find((t) => t.id === rtTask.id)?.points === 15));
const kim = B.model.data.members.find((m) => m.name === "Kim");
await M.saveProfile(B.c, { familyId, profile: { id: kim.id, name: "Kimi", avatarEmoji: kim.emoji, color: kim.color, expectedUpdatedAt: kim.updatedAt } });
check("A: Profiländerung automatisch", await until(() => A.model.data.members.some((m) => m.name === "Kimi")));
await M.saveCategory(B.c, { familyId, category: { name: "RT Kategorie", assignedTo: [] } });
check("A: neue Kategorie automatisch", await until(() => A.model.data.customCategories.some((c) => c.name === "RT Kategorie")));
await M.saveReward(B.c, { familyId, reward: { title: "RT Belohnung", pointsRequired: 3, assignedTo: [] } });
check("A: neue Belohnung automatisch", await until(() => A.model.data.rewards.some((x) => x.name === "RT Belohnung")));
await M.setTaskAssignments(B.c, { familyId, taskId: rtTask.id, profileIds: [P.Sam] });
check("A: Zuordnungsänderung automatisch (Assignment-Tabellen)", await until(() => A.model.data.tasks.find((t) => t.id === rtTask.id)?.assignedTo.join() === P.Sam));

// Tageskrone
check("Krone: A zeigt heute Alex als Tagesbesten", dayLeaderIds(A.model.data.completions, A.model.data.members, toDateKey(new Date()), A.model.settings.showDailyCrown).join() === P.Alex);
await M.updateFamilySettings(B.c, { familyId, showDailyCrown: false, expectedUpdatedAt: B.model.settings.updatedAt });
check("A: Tageskrone aus → automatisch keine Krone", await until(() => A.model.settings.showDailyCrown === false && dayLeaderIds(A.model.data.completions, A.model.data.members, toDateKey(new Date()), false).length === 0));
await B.sched.request({ immediate: true });
await M.updateFamilySettings(B.c, { familyId, showDailyCrown: true, expectedUpdatedAt: B.model.settings.updatedAt });
check("A: Tageskrone an → automatisch wieder da", await until(() => A.model.settings.showDailyCrown === true));

// Konflikt: A bearbeitet mit altem Stand, B hat zwischenzeitlich geändert
const stale = A.model.data.tasks.find((t) => t.id === rtTask.id);
await M.saveTask(B.c, { familyId, task: { id: rtTask.id, title: "Realtime Aufgabe", points: 20, recurrence: "daily", assignedTo: [P.Sam], expectedUpdatedAt: B.model.data.tasks.find((t) => t.id === rtTask.id).updatedAt } });
r = await M.saveTask(A.c, { familyId, task: { id: rtTask.id, title: "Überschrieben?", points: 1, recurrence: "daily", assignedTo: [], expectedUpdatedAt: stale.updatedAt } });
const row = (await A.c.from("tasks").select("title,points").eq("id", rtTask.id).single()).data;
check("Konflikt erkannt, kein Last-Writer-Wins", r.reason === "conflict" && row.title === "Realtime Aufgabe" && row.points === 20, JSON.stringify(r));
check("A: nach Konflikt aktueller Stand (20) im Modell", await until(() => A.model.data.tasks.find((t) => t.id === rtTask.id)?.points === 20));

// Gleichzeitig erledigen / einlösen
const t1 = A.model.data.tasks[1];
const par = await Promise.all([M.completeTask(A.c, { familyId, profileId: P.Sam, taskId: t1.id }), M.completeTask(B.c, { familyId, profileId: P.Sam, taskId: t1.id })]);
check("gleichzeitig erledigt → genau eine Erledigung, anderes Gerät mit Hinweis", par.filter((x) => x.ok).length === 1 && par.find((x) => !x.ok)?.message === "Diese Aufgabe wurde heute bereits erledigt.");
check("beide Modelle zeigen genau eine Erledigung", await until(() => [A, B].every((d) => d.model.data.completions.filter((c) => c.memberId === P.Sam && c.taskId === t1.id).length === 1)));
await owner.from("completions").insert({ family_id: familyId, profile_id: P.Kim, task_title: "Bonus", points: 15, completion_date: toDateKey(new Date()), status: "confirmed" });
const pr = await Promise.all([M.redeemReward(A.c, { familyId, profileId: P.Kim, rewardId: reward.id }), M.redeemReward(B.c, { familyId, profileId: P.Kim, rewardId: reward.id })]);
check("gleichzeitig eingelöst (15 Punkte, Kosten 10) → genau eine Einlösung", pr.filter((x) => x.ok).length === 1 && pr.some((x) => x.reason === "insufficient_points"));
check("beide Geräte zeigen denselben verfügbaren Punktestand (5)", await until(() => [A, B].every((d) => memberPointSummary(d.model.data, P.Kim).available === 5)));

// Verbindungsabbruch → Änderungen verpasst → Reconnect → vollständiger Reload
A.c.realtime.disconnect();
check("A: Verbindungsverlust erkannt", await until(() => A.rt.status === "disconnected", 10000), A.statuses.join());
await M.saveTask(B.c, { familyId, task: { title: "Während Offline", points: 7, recurrence: "daily", assignedTo: [] } });
check("A: automatischer Reconnect (Status getrennt → verbunden)", await until(() => A.rt.status === "connected", 30000) && A.statuses.lastIndexOf("connected") > A.statuses.lastIndexOf("disconnected"), A.statuses.join());
check("A: verpasste Änderung nach Reconnect nachgeladen", await until(() => A.model.data.tasks.some((t) => t.name === "Während Offline")));

// Gleicher Zustand
await sleep(2000);
const sig = (d) => JSON.stringify({ m: d.model.data.members.map((m) => [m.name, memberPointSummary(d.model.data, m.id)]), t: d.model.data.tasks.map((t) => [t.name, t.points, t.assignedTo]), r: d.model.data.rewards.map((x) => [x.name, x.pointsCost]), c: d.model.data.completions.length, s: d.model.settings.showDailyCrown });
check("beide Geräte haben denselben Zustand", sig(A) === sig(B));

// Stop → keine Ereignisse/Reloads mehr (Logout/Familienwechsel)
A.rt.stop(); A.sched.stop(); const la = A.loads;
await M.saveTask(B.c, { familyId, task: { title: "Nach Stop", points: 1, recurrence: "daily", assignedTo: [] } });
await sleep(3000);
check("nach Stop keine Reloads mehr auf A", A.loads === la);

for (const x of R) console.log(`${x.ok ? "✅" : "❌"} ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
const failed = R.filter((x) => !x.ok).length;
console.log(`\n${R.length - failed}/${R.length} bestanden`);
B.rt.stop(); B.sched.stop();
await Promise.all([A.c, B.c].map((c) => c.removeAllChannels()));
const cl = await deleteTestAccounts(cfg, [{ email, password }]);
if (!cl.ok) console.log("WARNUNG: Aufräumen unvollständig");
process.exit(failed ? 1 : 0);
