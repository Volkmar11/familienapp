// Integrationstest Phase 4C1 (FAMILY-Datenadapter, read-only) gegen das Supabase-TESTPROJEKT.
// Legt Wegwerf-Konten „wc-p4c1-…@example.com“ und Wegwerf-Familien mit neutralen Profilen
// (Alex, Sam, Kim) an. Testdaten entstehen über die Onboarding-RPC und Inserts des Owners (RLS).
// Aufräumen danach per SQL im Testprojekt:
//   delete from public.families where created_by in (select id from auth.users where email like 'wc-p4c1-%@example.com');
//   delete from auth.users where email like 'wc-p4c1-%@example.com';
// Mit KEEP=1 und CRED_OUT=<Datei außerhalb des Repos> bleiben Daten für den Browsertest erhalten.
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-data.test.mjs
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import { memberPointSummary, dayLeaderIds } from "../../src/shared/points.js";
import { toDateKey, addDays, weekStartKey } from "../../src/lib/dateUtils.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });

// Zählt alle Nicht-Auth-Anfragen nach Methode (Nachweis: Laden = genau 1 GET, keine Writes)
const log = [];
const countingFetch = (url, init = {}) => {
  const u = String(url);
  if (!u.includes("/auth/v1/")) log.push({ method: (init.method || "GET").toUpperCase(), path: new URL(u).pathname });
  return fetch(url, init);
};
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: countingFetch } });

const R = []; const check = (n, ok, d = "") => R.push({ n, ok: !!ok, d });
const stamp = Date.now();
async function user(tag) {
  const c = mk(); const email = `wc-p4c1-${tag}-${stamp}@example.com`; const password = randomUUID();
  const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, id: r.data.user.id, email, password };
}
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function onboard(u, name, children, settings) {
  const s = initialOnboardingState();
  s.familyName = name;
  s.children = children.map((n, i) => ({ id: String(i), name: n, avatar: ["🦊", "🐼", "🚀"][i % 3], color: ["#16a34a", "#2563eb", "#8b5cf6"][i % 3] }));
  s.pin = s.pin2 = "4827";
  for (const t of STARTER_TASKS) s.tasks[t.key] = { selected: true, points: "10" };
  for (const r of STARTER_REWARDS) s.rewards[r.key] = { selected: true, points: "50" };
  s.settings = settings;
  const res = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s));
  if (!res.ok) throw new Error("Onboarding: " + res.error);
  return res.familyId;
}

const A = await user("a"), B = await user("b"), anon = mk();
const f1 = await onboard(A, "Testfamilie Daten", ["Alex", "Sam", "Kim"], { showDailyCrown: true, requireConfirmation: true });
const f2 = await onboard(A, "Testfamilie Zwei", ["Alex"], { showDailyCrown: false, requireConfirmation: false });
const fB = await onboard(B, "Fremde Familie", ["Sam"], { showDailyCrown: true, requireConfirmation: true });

// Testdaten in f1 (als Owner, unter RLS)
const prof = must(await A.c.from("profiles").select("id,name").eq("family_id", f1).order("sort_order"), "profiles");
const P = Object.fromEntries(prof.map((p) => [p.name, p.id]));
const tasks = must(await A.c.from("tasks").select("id,title,points,category_id").eq("family_id", f1).order("sort_order"), "tasks");
const rewards = must(await A.c.from("rewards").select("id,title,points_required").eq("family_id", f1).order("sort_order"), "rewards");
const [t0, t1] = tasks;
const now = new Date(), today = toDateKey(now);
const ago = (min) => new Date(now.getTime() - min * 60000).toISOString();
const old = new Date(now.getTime() - 40 * 86400000);
must(await A.c.from("completions").insert([
  { family_id: f1, profile_id: P.Alex, task_id: t0.id, task_title: t0.title, points: 10, completed_at: ago(2), completion_date: today, status: "confirmed" },
  { family_id: f1, profile_id: P.Alex, task_id: t1.id, task_title: t1.title, points: 10, completed_at: ago(1), completion_date: today, status: "pending" },
  { family_id: f1, profile_id: P.Sam, task_id: t0.id, task_title: t0.title, points: 10, completed_at: ago(3), completion_date: today, status: "rejected" },
  { family_id: f1, profile_id: P.Kim, task_id: t0.id, task_title: t0.title, points: 30, completed_at: old.toISOString(), completion_date: toDateKey(old), status: "confirmed" },
]), "completions");
must(await A.c.from("redemptions").insert({ family_id: f1, profile_id: P.Kim, reward_id: rewards[0].id, reward_title: rewards[0].title, points_spent: 20 }), "redemptions");
must(await A.c.from("champion_history").insert({ family_id: f1, profile_id: P.Sam, profile_name: "Sam", profile_avatar: "🐼", week_start: addDays(weekStartKey(now), -14), points: 70 }), "champion_history");
must(await A.c.from("task_assignments").insert({ family_id: f1, task_id: t1.id, profile_id: P.Sam }), "task_assignments");

// ---- Prüfungen ----
log.length = 0;
const r1 = await loadFamilyData(A.c, f1);
check("1 Owner lädt eigene Familie", r1.ok, r1.error);
check("2 genau eine Leseanfrage (GET /rest/v1/families)", log.length === 1 && log[0].method === "GET" && log[0].path === "/rest/v1/families", JSON.stringify(log));
const d = r1.model?.data;
check("3 drei Profile in Reihenfolge, keine Elternprofile als Spieler", d?.members.map((m) => m.name).join() === "Alex,Sam,Kim" && d.members.every((m) => !m.isAdmin && !m.isParentPlayer));
check("4 Aufgaben/Kategorien/Belohnungen vollständig", d?.tasks.length === tasks.length && d.rewards.length === rewards.length && d.customCategories.length > 0 && d.tasks.every((t) => t.category));
check("5 Assignments: zugeordnete Aufgabe nur für Sam, übrige für alle", d?.tasks.find((t) => t.id === t1.id)?.assignedTo.join() === P.Sam && d.tasks.filter((t) => t.id !== t1.id).every((t) => t.assignedTo.length === 0));
check("6 pending sichtbar (unbestätigt), rejected ausgeblendet", d?.completions.length === 3 && d.completions.some((c) => c.memberId === P.Alex && c.needsConfirm && !c.confirmed) && !d.completions.some((c) => c.memberId === P.Sam));
const sa = d && memberPointSummary(d, P.Alex), sk = d && memberPointSummary(d, P.Kim), ss = d && memberPointSummary(d, P.Sam);
check("7 Punkte Alex: heute 10 (pending zählt nicht)", sa?.today === 10 && sa.week === 10 && sa.total === 10 && sa.pending === 1, JSON.stringify(sa));
check("8 Punkte Kim: gesamt 30, verfügbar 10, Monat 0", sk?.total === 30 && sk.available === 10 && sk.month === 0, JSON.stringify(sk));
check("9 Punkte Sam: rejected zählt nicht", ss?.total === 0, JSON.stringify(ss));
check("10 Einlösung + offener Eltern-Hinweis + Champion-Historie", d?.redeemedRewards.length === 1 && d.notifications.length === 1 && d.championHistory[0]?.name === "Sam" && d.championHistory[0].pts === 70);
check("11 Tageskrone an (f1): Alex", r1.model?.settings.showDailyCrown === true && dayLeaderIds(d.completions, d.members, today, true).join() === P.Alex);

const r2 = await loadFamilyData(A.c, f2);
check("12 zweite Familie: getrennte Daten, Krone aus, Bestätigung aus", r2.ok && r2.model.family.id === f2 && r2.model.data.members.length === 1 && r2.model.data.completions.length === 0 && r2.model.settings.showDailyCrown === false && r2.model.data.needsConfirmation === false
  && dayLeaderIds(r2.model.data.completions, r2.model.data.members, today, r2.model.settings.showDailyCrown).length === 0);
check("13 keine Datenvermischung zwischen f1 und f2", r2.ok && !r2.model.data.members.some((m) => d.members.some((x) => x.id === m.id)));

const rb = await loadFamilyData(B.c, f1);
check("14 fremder Benutzer: f1 nicht ladbar (RLS)", !rb.ok && rb.kind === "not_found", rb.kind);
const rbo = await loadFamilyData(B.c, fB);
check("15 fremder Benutzer: eigene Familie ladbar, nur eigene Daten", rbo.ok && rbo.model.data.members.length === 1 && rbo.model.data.completions.length === 0);
const ra = await loadFamilyData(anon, f1);
check("16 anonym: kein Zugriff (Rechtefehler oder leer, keine Daten)", !ra.ok && !ra.model, ra.kind);

log.length = 0;
for (const [c, f] of [[A.c, f1], [A.c, f2], [B.c, fB], [B.c, f1]]) await loadFamilyData(c, f);
check("17 Laden erzeugt keine Schreibanfragen (nur GET)", log.length === 4 && log.every((x) => x.method === "GET"), JSON.stringify(log.map((x) => x.method)));

// Unveränderte Daten nach dem Laden
const after = must(await A.c.from("completions").select("status").eq("family_id", f1), "after");
check("18 Datenbestand unverändert (4 Erledigungen, Status unverändert)", after.length === 4 && after.filter((x) => x.status === "pending").length === 1);

for (const r of R) console.log(`${r.ok ? "✅" : "❌"} ${r.n}${r.ok || !r.d ? "" : " – " + r.d}`);
const failed = R.filter((r) => !r.ok).length;
console.log(`\n${R.length - failed}/${R.length} bestanden`);
if (process.env.KEEP === "1" && process.env.CRED_OUT) {
  fs.writeFileSync(process.env.CRED_OUT, JSON.stringify({ a: { email: A.email, password: A.password }, b: { email: B.email, password: B.password }, f1, f2, fB }));
  console.log("KEEP=1: Testdaten bleiben erhalten (Zugangsdaten nur in CRED_OUT).");
} else {
  for (const [c, f] of [[A.c, f1], [A.c, f2], [B.c, fB]]) await c.from("families").delete().eq("id", f);
  console.log("Wegwerf-Familien gelöscht; Auth-Konten per SQL entfernen (siehe Kopfkommentar).");
}
process.exit(failed ? 1 : 0);
