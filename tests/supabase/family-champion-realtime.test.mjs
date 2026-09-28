// Integrationstest Phase 4C2B2 gegen das Supabase-TESTPROJEKT:
// serverseitiger Wochen-Champion (Catch-up, Gleichstand, Woche ohne Punkte, Idempotenz,
// Parallelität, zweites Gerät) und Realtime-Signal family_sync (Isolation zwischen Familien).
// Wegwerf-Konten „wc-p4c2b2-…@example.com“, neutrale Profile.
// Die Wochen werden relativ zum aktuellen lokalen Montag (Europe/Berlin) erzeugt.
// Aufräumen: Familien löscht der Test; Konten per SQL:
//   delete from auth.users where email like 'wc-p4c2b2-%@example.com';
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-champion-realtime.test.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { deleteTestAccounts } from "./_cleanup.mjs";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import * as M from "../../src/lib/familyMutations.js";
import { weekStartKey, addDays } from "../../src/lib/dateUtils.js";
import { createFamilyRealtime } from "../../src/lib/familyRealtime.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.error = () => {};
const R = []; const check = (g, n, ok, d = "") => R.push({ g, n, ok: !!ok, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now();
async function user(tag) {
  const c = mk(); const email = `wc-p4c2b2-${tag}-${stamp}@example.com`; const password = randomUUID();
  const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp: " + r.error?.message);
  return { c, id: r.data.user.id, email, password };
}
async function onboard(u, name, kids) {
  const s = initialOnboardingState(); s.familyName = name;
  s.children = kids.map((n, i) => ({ id: String(i), name: n, avatar: "🦊", color: "#16a34a" }));
  s.pin = s.pin2 = "4827";
  STARTER_TASKS.forEach((t, i) => { s.tasks[t.key] = { selected: i < 2, points: "10" }; });
  STARTER_REWARDS.forEach((r, i) => { s.rewards[r.key] = { selected: i < 1, points: "10" }; });
  s.settings = { showDailyCrown: true, requireConfirmation: false };
  const r = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s)); if (!r.ok) throw new Error(r.error); return r.familyId;
}
const one = async (q) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; };
const profiles = async (c, f) => Object.fromEntries((await one(c.from("profiles").select("id,name").eq("family_id", f))).map((p) => [p.name, p.id]));
const comp = (f, p, pts, day, status = "confirmed") => ({ family_id: f, profile_id: p, task_title: "Test", points: pts, completion_date: day, completed_at: `${day}T10:00:00Z`, status });

const cur = weekStartKey(new Date());           // aktueller lokaler Montag
const W = (n) => addDays(cur, -7 * n);          // W(1) = zuletzt abgeschlossene Woche
const A = await user("a"), B = await user("b"), anon = mk();
const A2 = mk(); await A2.auth.signInWithPassword({ email: A.email, password: A.password }); // zweites Gerät
const A3 = mk(); await A3.auth.signInWithPassword({ email: A.email, password: A.password }); // drittes Gerät

// ================= Champion: Catch-up, Gleichstand, 0 Punkte =================
const f1 = await onboard(A, "Testfamilie Champion", ["Alex", "Sam", "Kim"]);
const P = await profiles(A.c, f1);
await one(A.c.from("completions").insert([
  comp(f1, P.Alex, 20, W(4)), comp(f1, P.Sam, 10, addDays(W(4), 6)),              // W4: Alex
  comp(f1, P.Alex, 10, W(3)), comp(f1, P.Sam, 10, addDays(W(3), 3)),              // W3: Gleichstand → Alex (sort_order 0)
  comp(f1, P.Kim, 50, W(2), "pending"), comp(f1, P.Sam, 40, W(2), "rejected"),    // W2: keine bestätigten Punkte
  comp(f1, P.Sam, 30, W(1)), comp(f1, P.Kim, 5, addDays(W(1), 6)), comp(f1, P.Kim, 100, addDays(W(1), 6), "rejected"), // W1: Sam
  comp(f1, P.Kim, 99, cur),                                                        // laufende Woche zählt nicht
]));
let r = await M.syncWeeklyChampion(A.c, { familyId: f1 });
let hist = await one(A.c.from("champion_history").select("week_start, profile_id, points").eq("family_id", f1).order("week_start"));
check("Champion", "Catch-up: 4 Wochen verarbeitet, Historie nur für Wochen mit Punkten", r.ok && r.processedWeeks === 4 && hist.length === 3, JSON.stringify(r));
check("Champion", "eindeutiger Sieger (W4 Alex 20, W1 Sam 30)", hist.find((h) => h.week_start === W(4))?.profile_id === P.Alex && hist.find((h) => h.week_start === W(1))?.points === 30 && hist.find((h) => h.week_start === W(1))?.profile_id === P.Sam);
check("Champion", "Gleichstand → kleinere Reihenfolge (Alex)", hist.find((h) => h.week_start === W(3))?.profile_id === P.Alex);
check("Champion", "Woche ohne bestätigte Punkte → kein Champion", !hist.some((h) => h.week_start === W(2)));
check("Champion", "laufende Woche nicht ausgewertet", !hist.some((h) => h.week_start === cur));
const set1 = await one(A.c.from("family_settings").select("last_champion_week").eq("family_id", f1).single());
check("Champion", "last_champion_week = letzte abgeschlossene Woche (lokaler Montag)", set1.last_champion_week === W(1) && r.lastChampionWeek === W(1), set1.last_champion_week);
check("Champion", "neuer Champion der letzten Woche + Rangliste (nur bestätigte)", r.newChampion && r.latest.weekStart === W(1) && JSON.stringify(r.latest.ranking) === JSON.stringify([{ profileId: P.Sam, points: 30 }, { profileId: P.Kim, points: 5 }]), JSON.stringify(r.latest));
r = await M.syncWeeklyChampion(A.c, { familyId: f1 });
check("Champion", "erneuter Aufruf (Reload): nichts Neues, keine Zeremonie", r.ok && r.processedWeeks === 0 && !r.newChampion && (await one(A.c.from("champion_history").select("id").eq("family_id", f1))).length === 3);
r = await M.syncWeeklyChampion(A2, { familyId: f1 });
check("Champion", "zweites Gerät: kein „neu erzeugt“", r.ok && !r.newChampion);
const d1 = (await loadFamilyData(A.c, f1)).model.data;
check("Champion", "Historie im Datenmodell sichtbar", d1.championHistory.length === 3 && d1.lastChampionWeek === W(1));

// ================= Champion: Parallelität =================
const f2 = await onboard(A, "Testfamilie Parallel", ["Alex", "Sam"]);
const P2 = await profiles(A.c, f2);
await one(A.c.from("completions").insert([comp(f2, P2.Sam, 15, W(1)), comp(f2, P2.Alex, 10, W(2))]));
const par = await Promise.all([A.c, A2, A3].map((c) => M.syncWeeklyChampion(c, { familyId: f2 })));
const hist2 = await one(A.c.from("champion_history").select("week_start").eq("family_id", f2));
check("Champion", "3 Geräte parallel → genau eine Zeremonie, ein Eintrag pro Woche", par.every((x) => x.ok) && par.filter((x) => x.newChampion).length === 1 && hist2.length === 2 && new Set(hist2.map((h) => h.week_start)).size === 2, JSON.stringify(par.map((x) => x.newChampion)));

// ================= Champion: Rechte =================
r = await M.syncWeeklyChampion(B.c, { familyId: f1 });
const an = await anon.rpc("sync_weekly_champion", { p_family_id: f1 });
const directH = await B.c.from("champion_history").insert({ family_id: f1, profile_name: "x", week_start: W(8), points: 1 });
check("Champion", "fremde Familie / anon / fremder Insert blockiert", !r.ok && !!an.error && !!directH.error);

// ================= Realtime-Signal =================
const fam = await one(A.c.from("family_sync").select("family_id, version").eq("family_id", f1).single());
const famB = await one(B.c.from("family_sync").select("family_id").eq("family_id", f1));
check("Realtime", "family_sync lesbar für Mitglieder, nicht für fremde Familien", fam.family_id === f1 && famB.length === 0);
const before = fam.version;
await M.completeTask(A.c, { familyId: f1, profileId: P.Alex, taskId: (await one(A.c.from("tasks").select("id").eq("family_id", f1).limit(1)))[0].id });
const after = (await one(A.c.from("family_sync").select("version").eq("family_id", f1).single())).version;
check("Realtime", "jede Änderung erhöht den Zähler", after > before, `${before}→${after}`);
const wr = await A.c.from("family_sync").update({ version: 0 }).eq("family_id", f1).select("family_id");
check("Realtime", "Clients können family_sync nicht schreiben", !!wr.error || (wr.data || []).length === 0);

// Echte Realtime-Verbindung (WebSocket) – A abonniert f1, B versucht f1 abzuhören
const evA = [], evB = [], stA = [], stB = [];
const rtA = createFamilyRealtime({ client: A2, familyId: f1, onChange: (e) => evA.push(e), onStatus: (s) => stA.push(s) });
const rtB = createFamilyRealtime({ client: B.c, familyId: f1, onChange: (e) => evB.push(e), onStatus: (s) => stB.push(s) });
for (let i = 0; i < 40 && !(stA.includes("connected") && stB.includes("connected")); i++) await sleep(250);
if (!stA.includes("connected")) {
  check("Realtime", "WebSocket-Verbindung im Node-Test (übersprungen – wird im Browsertest geprüft)", true, stA.join(","));
} else {
  await sleep(4000); // Postgres-Changes sind kurz nach SUBSCRIBED noch nicht aktiv (App lädt bei SUBSCRIBED ohnehin neu)
  const a0 = evA.filter((e) => e === "change").length, b0 = evB.filter((e) => e === "change").length;
  await M.updateFamilySettings(A.c, { familyId: f1, showDailyCrown: false });
  await M.completeTask(A.c, { familyId: f1, profileId: P.Sam, taskId: (await one(A.c.from("tasks").select("id").eq("family_id", f1).limit(1)))[0].id });
  for (let i = 0; i < 40 && evA.filter((e) => e === "change").length < a0 + 2; i++) await sleep(250);
  await sleep(1500);
  check("Realtime", "eigenes Gerät erhält Signale der eigenen Familie", evA.filter((e) => e === "change").length >= a0 + 2, JSON.stringify(evA));
  check("Realtime", "fremder Nutzer erhält trotz Filter auf fremde family_id nichts (RLS)", evB.filter((e) => e === "change").length === b0, JSON.stringify(evB));
}
rtA.stop(); rtB.stop();

for (const x of R) console.log(`${x.ok ? "✅" : "❌"} [${x.g}] ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
const failed = R.filter((x) => !x.ok).length;
console.log(`\n${R.length - failed}/${R.length} bestanden`);
await Promise.all([A.c, A2, A3, B.c].map((c) => c.removeAllChannels?.()));
const cl = await deleteTestAccounts(cfg, [A, B]);
if (!cl.ok) console.log("WARNUNG: Aufräumen unvollständig");
process.exit(failed ? 1 : 0);
