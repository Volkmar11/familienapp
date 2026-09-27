// Integrationstest Phase 4C2B1 (Elternverwaltung) gegen das Supabase-TESTPROJEKT.
// Aufgaben/Kategorien/Belohnungen/Profile (CRUD), atomare Assignments, Sortierung,
// Archivierungsregeln, Korrektur bestätigter Erledigungen, Quittierung von Einlösungen.
// Wegwerf-Konten „wc-p4c2b1-…@example.com“, neutrale Profile (Alex, Sam, Kim).
// Aufräumen danach per SQL im Testprojekt:
//   delete from public.families where created_by in (select id from auth.users where email like 'wc-p4c2b1-%@example.com');
//   delete from auth.users where email like 'wc-p4c2b1-%@example.com';
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-admin.test.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import * as M from "../../src/lib/familyMutations.js";
import { memberPointSummary } from "../../src/shared/points.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.error = () => {}; // erwartete Fehlerpfade nicht ausgeben

const R = []; const check = (group, n, ok, d = "") => R.push({ group, n, ok: !!ok, d });
const stamp = Date.now();
async function user(tag) {
  const c = mk(); const email = `wc-p4c2b1-${tag}-${stamp}@example.com`;
  const r = await c.auth.signUp({ email, password: randomUUID() });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, id: r.data.user.id };
}
async function onboard(u, name, kids) {
  const s = initialOnboardingState(); s.familyName = name;
  s.children = kids.map((n, i) => ({ id: String(i), name: n, avatar: "🦊", color: "#16a34a" }));
  s.pin = s.pin2 = "4827";
  STARTER_TASKS.forEach((t, i) => { s.tasks[t.key] = { selected: i < 3, points: "10" }; });
  STARTER_REWARDS.forEach((r, i) => { s.rewards[r.key] = { selected: i < 2, points: "20" }; });
  s.settings = { showDailyCrown: true, requireConfirmation: false };
  const r = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s)); if (!r.ok) throw new Error(r.error); return r.familyId;
}
const one = async (q) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; };
const load = async (c, f) => (await loadFamilyData(c, f)).model.data;
const assigned = async (c, table, col, id) => (await one(c.from(table).select("profile_id").eq(col, id))).map((x) => x.profile_id).sort();
const sorted = (a) => [...a].sort();

const A = await user("a"), B = await user("b"), anon = mk();
const f = await onboard(A, "Testfamilie Verwaltung", ["Alex", "Sam", "Kim"]);
const fB = await onboard(B, "Fremde Familie", ["Kim"]);
let d = await load(A.c, f);
const P = Object.fromEntries(d.members.map((m) => [m.name, m.id]));
const PB = (await load(B.c, fB)).members[0].id;
const cat0 = d.customCategories[0], cat1 = d.customCategories[1] || d.customCategories[0];

// ================= Aufgaben =================
let r = await M.saveTask(A.c, { familyId: f, task: { title: "  Fenster putzen ", points: 15, recurrence: "weekly", icon: "🪟", categoryId: cat0.id, assignedTo: [] } });
check("Aufgaben", "erstellen (getrimmt, für alle)", r.ok && r.created);
const tNew = r.id;
d = await load(A.c, f); let t = d.tasks.find((x) => x.id === tNew);
check("Aufgaben", "gespeichert: Titel/Punkte/Wiederholung/Kategorie/Icon", t && t.name === "Fenster putzen" && t.points === 15 && t.recurring === "weekly" && t.categoryId === cat0.id && t.emoji === "🪟" && t.assignedTo.length === 0);
r = await M.saveTask(A.c, { familyId: f, task: { title: "Neu mit Auswahl", points: 5, recurrence: "daily", categoryId: cat0.id, assignedTo: [P.Kim] } });
d = await load(A.c, f); t = d.tasks.find((x) => x.id === r.id);
check("Aufgaben", "erstellen mit Teilmenge → aktiv und nur Kim", r.ok && t && t.assignedTo.join() === P.Kim);
// Historie: Erledigung mit 15 Punkten, dann Aufgabe auf 40 Punkte ändern
const comp = await M.completeTask(A.c, { familyId: f, profileId: P.Alex, taskId: tNew });
r = await M.saveTask(A.c, { familyId: f, task: { id: tNew, title: "Fenster putzen (groß)", points: 40, recurrence: "daily", categoryId: cat1.id, assignedTo: [P.Alex, P.Sam] } });
d = await load(A.c, f); t = d.tasks.find((x) => x.id === tNew);
check("Aufgaben", "bearbeiten: Titel/Punkte/Kategorie", r.ok && t.name === "Fenster putzen (groß)" && t.points === 40 && t.categoryId === cat1.id);
check("Aufgaben", "Assignment Teilmenge (Alex+Sam)", sorted(t.assignedTo).join() === sorted([P.Alex, P.Sam]).join());
const hist = d.completions.find((c) => c.id === comp.completion.id);
check("Aufgaben", "historische Completion unverändert (15 Punkte, alter Titel)", hist.points === 15 && hist.taskName === "Fenster putzen");
r = await M.saveTask(A.c, { familyId: f, task: { id: tNew, title: "Fenster putzen (groß)", points: 40, recurrence: "daily", categoryId: cat1.id, assignedTo: [] } });
check("Aufgaben", "Assignment wieder „für alle“", r.ok && (await assigned(A.c, "task_assignments", "task_id", tNew)).length === 0);
r = await M.saveTask(A.c, { familyId: f, task: { id: tNew, title: "Fenster putzen (groß)", points: 40, recurrence: "daily", categoryId: cat1.id, assignedTo: [], active: false } });
d = await load(A.c, f);
check("Aufgaben", "inaktiv → aus Hauptansicht, im Archiv", r.ok && !d.tasks.some((x) => x.id === tNew) && d.archived.tasks.some((x) => x.id === tNew));
r = await M.restoreTask(A.c, { familyId: f, taskId: tNew });
check("Aufgaben", "wieder aktivieren", r.ok && (await load(A.c, f)).tasks.some((x) => x.id === tNew));
r = await M.removeTask(A.c, { familyId: f, taskId: tNew });
const tRow = await one(A.c.from("tasks").select("active").eq("id", tNew));
check("Aufgaben", "benutzte Aufgabe „löschen“ → archiviert, Historie bleibt", r.ok && r.mode === "archived" && tRow[0]?.active === false && (await load(A.c, f)).completions.some((c) => c.id === comp.completion.id));
const tUnused = (await M.saveTask(A.c, { familyId: f, task: { title: "Unbenutzt", points: 1, recurrence: "once", assignedTo: [] } })).id;
r = await M.removeTask(A.c, { familyId: f, taskId: tUnused });
check("Aufgaben", "unbenutzte Aufgabe wird physisch gelöscht", r.ok && r.mode === "deleted" && (await one(A.c.from("tasks").select("id").eq("id", tUnused))).length === 0);
check("Aufgaben", "Validierung: leerer Titel / Punkte außerhalb", !(await M.saveTask(A.c, { familyId: f, task: { title: " ", points: 1, recurrence: "daily" } })).ok && !(await M.saveTask(A.c, { familyId: f, task: { title: "x", points: 10001, recurrence: "daily" } })).ok);
r = await M.saveTask(B.c, { familyId: f, task: { title: "Eindringling", points: 1, recurrence: "daily", assignedTo: [] } });
const r2 = await M.removeTask(B.c, { familyId: f, taskId: d.tasks[0].id });
check("Aufgaben", "fremde Familie blockiert (anlegen/löschen)", !r.ok && !r2.ok);
const an = await anon.rpc("remove_task", { p_family_id: f, p_task_id: d.tasks[0].id });
const an2 = await anon.from("tasks").insert({ family_id: f, title: "anon", points: 1 });
check("Aufgaben", "anon blockiert", !!an.error && !!an2.error);
r = await M.saveTask(A.c, { familyId: f, task: { title: "Fremdkategorie", points: 1, recurrence: "daily", categoryId: (await load(B.c, fB)).customCategories[0].id, assignedTo: [] } });
check("Aufgaben", "Kategorie einer fremden Familie abgelehnt", !r.ok);

// ================= Kategorien =================
r = await M.saveCategory(A.c, { familyId: f, category: { name: "Garten neu", icon: "🌱", assignedTo: [] } });
const cNew = r.id;
check("Kategorien", "erstellen", r.ok && (await load(A.c, f)).customCategories.some((c) => c.id === cNew && c.emoji === "🌱"));
r = await M.saveCategory(A.c, { familyId: f, category: { id: cNew, name: "Garten", icon: "🌻", assignedTo: [P.Sam, P.Kim] } });
let cc = (await load(A.c, f)).customCategories.find((c) => c.id === cNew);
check("Kategorien", "umbenennen + Teilmenge", r.ok && cc.name === "Garten" && sorted(cc.assignedTo).join() === sorted([P.Sam, P.Kim]).join());
r = await M.saveCategory(A.c, { familyId: f, category: { id: cNew, name: "Garten", icon: "🌻", assignedTo: [] } });
check("Kategorien", "Assignment „für alle“", r.ok && (await assigned(A.c, "category_assignments", "category_id", cNew)).length === 0);
r = await M.saveCategory(A.c, { familyId: f, category: { name: "garten ", assignedTo: [] } });
check("Kategorien", "doppelter Name → verständliche Meldung", !r.ok && r.message === "Eine Kategorie mit diesem Namen gibt es schon.");
const tInCat = (await M.saveTask(A.c, { familyId: f, task: { title: "Rasen", points: 5, recurrence: "daily", categoryId: cNew, assignedTo: [] } })).id;
r = await M.deleteCategory(A.c, { familyId: f, categoryId: cNew });
const direct = await A.c.from("categories").delete().eq("id", cNew);
check("Kategorien", "mit aktiven Aufgaben nicht löschbar (RPC + direkter DELETE)", !r.ok && r.reason === "has_tasks" && /1 aktive Aufgabe/.test(r.message) && (await one(A.c.from("categories").select("id").eq("id", cNew))).length === 1, direct.error?.hint);
await M.saveTask(A.c, { familyId: f, task: { id: tInCat, title: "Rasen", points: 5, recurrence: "daily", categoryId: cat0.id, assignedTo: [] } });
r = await M.deleteCategory(A.c, { familyId: f, categoryId: cNew });
check("Kategorien", "leere Kategorie löschbar", r.ok && r.mode === "deleted");
r = await M.saveCategory(B.c, { familyId: f, category: { id: cat0.id, name: "gehackt", assignedTo: [] } });
const r3 = await M.deleteCategory(B.c, { familyId: f, categoryId: cat0.id });
check("Kategorien", "fremde Familie blockiert", !r.ok && !r3.ok);

// ================= Belohnungen =================
r = await M.saveReward(A.c, { familyId: f, reward: { title: "Kinoabend", pointsRequired: 10, icon: "🎬", assignedTo: [] } });
const wNew = r.id;
check("Belohnungen", "erstellen", r.ok && (await load(A.c, f)).rewards.some((x) => x.id === wNew && x.pointsCost === 10));
const red = await M.redeemReward(A.c, { familyId: f, profileId: P.Alex, rewardId: wNew }); // Alex hat 15
r = await M.saveReward(A.c, { familyId: f, reward: { id: wNew, title: "Kinoabend deluxe", pointsRequired: 99, icon: "🍿", assignedTo: [P.Sam] } });
d = await load(A.c, f); let w = d.rewards.find((x) => x.id === wNew);
check("Belohnungen", "bearbeiten + Kosten ändern + Teilmenge", red.ok && r.ok && w.name === "Kinoabend deluxe" && w.pointsCost === 99 && w.assignedTo.join() === P.Sam);
const redRow = await one(A.c.from("redemptions").select("points_spent,reward_title").eq("id", red.redemptionId).single());
check("Belohnungen", "historische Einlösung unverändert (points_spent 10, alter Titel)", redRow.points_spent === 10 && redRow.reward_title === "Kinoabend");
r = await M.saveReward(A.c, { familyId: f, reward: { id: wNew, title: "Kinoabend deluxe", pointsRequired: 99, assignedTo: [P.Sam], active: false } });
d = await load(A.c, f);
check("Belohnungen", "inaktiv → archiviert sichtbar, restore", r.ok && d.archived.rewards.some((x) => x.id === wNew) && (await M.restoreReward(A.c, { familyId: f, rewardId: wNew })).ok);
r = await M.removeReward(A.c, { familyId: f, rewardId: wNew });
check("Belohnungen", "eingelöste Belohnung „löschen“ → archiviert", r.ok && r.mode === "archived" && (await one(A.c.from("redemptions").select("id").eq("id", red.redemptionId))).length === 1);
const wUnused = (await M.saveReward(A.c, { familyId: f, reward: { title: "Unbenutzt", pointsRequired: 1, assignedTo: [] } })).id;
r = await M.removeReward(A.c, { familyId: f, rewardId: wUnused });
check("Belohnungen", "unbenutzte Belohnung gelöscht", r.ok && r.mode === "deleted");
r = await M.saveReward(B.c, { familyId: f, reward: { title: "x", pointsRequired: 1, assignedTo: [] } });
check("Belohnungen", "fremde Familie blockiert", !r.ok && !(await M.removeReward(B.c, { familyId: f, rewardId: wNew })).ok);

// ================= Profile =================
r = await M.saveProfile(A.c, { familyId: f, profile: { name: "Robin", avatarEmoji: "🐱", color: "#8b5cf6" } });
const pNew = r.id;
d = await load(A.c, f); let pr = d.members.find((m) => m.id === pNew);
check("Profile", "erstellen (Emoji/Farbe, am Ende, kein Admin)", r.ok && pr && pr.emoji === "🐱" && pr.color === "#8b5cf6" && d.members.at(-1).id === pNew && !pr.isAdmin && !pr.isParentPlayer);
r = await M.saveProfile(A.c, { familyId: f, profile: { id: pNew, name: "Robin B.", avatarEmoji: "🐶", color: "#2563eb" } });
pr = (await load(A.c, f)).members.find((m) => m.id === pNew);
check("Profile", "umbenennen + Emoji + Farbe", r.ok && pr.name === "Robin B." && pr.emoji === "🐶" && pr.color === "#2563eb");
const order = [pNew, P.Kim, P.Alex, P.Sam];
r = await M.reorderItems(A.c, { familyId: f, kind: "profiles", ids: order });
check("Profile", "Reihenfolge ändern (bleibt nach Reload)", r.ok && (await load(A.c, f)).members.map((m) => m.id).join() === order.join());
check("Profile", "moveInList ▲/▼", M.moveInList(order, P.Kim, -1)?.join() === [P.Kim, pNew, P.Alex, P.Sam].join() && M.moveInList(order, pNew, -1) === null);
r = await M.removeProfile(A.c, { familyId: f, profileId: P.Alex }); // Alex hat Verlauf
const alexRow = await one(A.c.from("profiles").select("active").eq("id", P.Alex).single());
check("Profile", "historisch verwendetes Profil → archiviert, nicht gelöscht", r.ok && r.mode === "archived" && alexRow.active === false);
const dd = await load(A.c, f);
check("Profile", "Hauptansicht nur aktive; Historie lesbar", !dd.members.some((m) => m.id === P.Alex) && dd.archived.members.some((m) => m.id === P.Alex) && dd.completions.some((c) => c.memberId === P.Alex && c.memberName === "Alex"));
const delDirect = await A.c.from("profiles").delete().eq("id", P.Alex);
check("Profile", "direkter DELETE eines Profils mit Verlauf blockiert", !!delDirect.error && (await one(A.c.from("profiles").select("id").eq("id", P.Alex))).length === 1);
r = await M.removeProfile(A.c, { familyId: f, profileId: pNew });
check("Profile", "unbenutztes Profil wird gelöscht", r.ok && r.mode === "deleted");
r = await M.removeProfile(A.c, { familyId: f, profileId: P.Sam }); // hat Zuordnung (Belohnung) → archiviert
check("Profile", "Profil mit Zuordnungen → archiviert (Zuordnung bleibt, nichts wird „für alle“)", r.ok && r.mode === "archived" && (await assigned(A.c, "reward_assignments", "reward_id", wNew)).join() === P.Sam);
const delAssigned = await A.c.from("profiles").delete().eq("id", P.Sam);
check("Profile", "direkter DELETE eines zugeordneten Profils blockiert", !!delAssigned.error);
r = await M.removeProfile(A.c, { familyId: f, profileId: P.Kim });
const r4 = await M.saveProfile(A.c, { familyId: f, profile: { id: P.Kim, name: "Kim", active: false } });
check("Profile", "letztes aktives Profil geschützt (RPC + Deaktivieren)", !r.ok && r.message === "Mindestens ein Kinderprofil muss aktiv bleiben." && !r4.ok && r4.message === "Mindestens ein Kinderprofil muss aktiv bleiben.", r4.message);
check("Profile", "Profil erzeugt keine Adminrechte (is_parent bleibt false, Rolle unverändert)",
  (await one(A.c.from("profiles").select("is_parent").eq("family_id", f))).every((p) => !p.is_parent) && (await one(A.c.from("family_members").select("user_id").eq("family_id", f))).length === 1);
check("Profile", "fremde Familie blockiert", !(await M.saveProfile(B.c, { familyId: f, profile: { name: "x" } })).ok && !(await M.removeProfile(B.c, { familyId: f, profileId: P.Kim })).ok);
r = await M.restoreProfile(A.c, { familyId: f, profileId: P.Alex });
check("Profile", "archiviertes Profil reaktivieren", r.ok && (await load(A.c, f)).members.some((m) => m.id === P.Alex));

// ================= Assignments atomar =================
const tA = (await load(A.c, f)).tasks[0].id;
await M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Alex, P.Kim] });
r = await M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Kim, PB] }); // fremdes Profil → Fehler
check("Assignments", "Validierungsfehler (fremdes Profil) → alte Zuordnung vollständig erhalten", !r.ok && (await assigned(A.c, "task_assignments", "task_id", tA)).join() === sorted([P.Alex, P.Kim]).join());
r = await M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Kim, P.Kim] });
check("Assignments", "Ersetzung exakt (Duplikate entfernt)", r.ok && (await assigned(A.c, "task_assignments", "task_id", tA)).join() === P.Kim);
r = await M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Kim, pNew] }); // pNew gelöscht
check("Assignments", "gelöschtes Profil abgelehnt, Zustand erhalten", !r.ok && (await assigned(A.c, "task_assignments", "task_id", tA)).join() === P.Kim);
r = await M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Kim, P.Sam] }); // Sam archiviert → erlaubt (Zuordnung bleibt beim Bearbeiten erhalten)
check("Assignments", "archiviertes Profil der Familie bleibt zuordenbar", r.ok && (await assigned(A.c, "task_assignments", "task_id", tA)).join() === sorted([P.Kim, P.Sam]).join());
await M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Kim] });
const par = await Promise.all([
  M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Alex] }),
  M.setTaskAssignments(A.c, { familyId: f, taskId: tA, profileIds: [P.Kim] }),
]);
const fin = await assigned(A.c, "task_assignments", "task_id", tA);
check("Assignments", "parallele Ersetzungen → exakt eine der beiden Zuordnungen, kein Mischzustand", par.every((x) => x.ok) && (fin.join() === P.Alex || fin.join() === P.Kim), fin.join());
check("Assignments", "fremde Familie blockiert", !(await M.setTaskAssignments(B.c, { familyId: f, taskId: tA, profileIds: [] })).ok);

// ================= Completion-Korrektur =================
const before = memberPointSummary(await load(A.c, f), P.Alex).total; // 15
r = await M.correctCompletion(A.c, { familyId: f, completionId: comp.completion.id });
const afterD = await load(A.c, f);
check("Korrektur", "confirmed → rejected durch owner", r.ok && r.completion.status === "rejected" && r.completion.confirmed_by === A.id);
check("Korrektur", "Punkte sinken", memberPointSummary(afterD, P.Alex).total === before - 15, `${before}→${memberPointSummary(afterD, P.Alex).total}`);
check("Korrektur", "Datensatz bleibt (als zurückgenommen sichtbar)", afterD.rejectedCompletions.some((c) => c.id === comp.completion.id));
const kid = await M.undoCompletion(A.c, { familyId: f, profileId: P.Alex, taskId: tNew, completionDate: comp.completion.completion_date });
check("Korrektur", "Kind-Handler (undo) kann bestätigte/zurückgenommene nicht löschen", !kid.ok && (await one(A.c.from("completions").select("id").eq("id", comp.completion.id))).length === 1);
check("Korrektur", "fremde Familie blockiert", !(await M.correctCompletion(B.c, { familyId: f, completionId: comp.completion.id })).ok);
r = await M.reconfirmCompletion(A.c, { familyId: f, completionId: comp.completion.id });
check("Korrektur", "Wieder bestätigen → Punkte zurück", r.ok && memberPointSummary(await load(A.c, f), P.Alex).total === before);

// ================= Quittierung =================
d = await load(A.c, f);
const notif = d.notifications.find((n) => n.redemptionId === red.redemptionId);
const availBefore = memberPointSummary(d, P.Alex).available;
check("Quittierung", "unquittierte Einlösung sichtbar", !!notif);
check("Quittierung", "fremde Familie blockiert", (await M.acknowledgeRedemptions(B.c, { familyId: f, redemptionIds: [red.redemptionId] })).count === 0);
r = await M.acknowledgeRedemptions(A.c, { familyId: f, redemptionIds: [red.redemptionId] });
const ack = await one(A.c.from("redemptions").select("acknowledged_at, acknowledged_by, points_spent").eq("id", red.redemptionId).single());
check("Quittierung", "owner quittiert: acknowledged_at gesetzt, acknowledged_by = auth.uid()", r.ok && r.count === 1 && !!ack.acknowledged_at && ack.acknowledged_by === A.id);
d = await load(A.c, f);
check("Quittierung", "Punkte unverändert, Hinweis verschwindet", ack.points_spent === 10 && memberPointSummary(d, P.Alex).available === availBefore && !d.notifications.some((n) => n.redemptionId === red.redemptionId));
const fake = await A.c.from("redemptions").update({ acknowledged_by: B.id, points_spent: 0 }).eq("id", red.redemptionId);
const ack2 = await one(A.c.from("redemptions").select("acknowledged_by, points_spent").eq("id", red.redemptionId).single());
check("Quittierung", "points_spent/acknowledged_by nicht manipulierbar", ack2.acknowledged_by === A.id && ack2.points_spent === 10, fake.error?.code);

for (const x of R) console.log(`${x.ok ? "✅" : "❌"} [${x.group}] ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
const failed = R.filter((x) => !x.ok).length;
console.log(`\n${R.length - failed}/${R.length} bestanden`);
for (const [c, fam] of [[A.c, f], [B.c, fB]]) await c.from("families").delete().eq("id", fam);
const left = await one(A.c.from("families").select("id").eq("id", f));
console.log(left.length === 0 ? "Wegwerf-Familien gelöscht (Kaskade trotz Profil-Schutz-Trigger ok)." : "WARNUNG: Familie nicht gelöscht");
process.exit(failed || left.length ? 1 : 0);
