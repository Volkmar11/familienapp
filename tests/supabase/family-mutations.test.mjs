// Integrationstest Phase 4C2A (Kernaktionen) gegen das Supabase-TESTPROJEKT.
// Deckt ab: Erledigen/Rückgängig, Bestätigen/Ablehnen, PIN (prüfen, Sperre, ändern),
// redeem_reward (inkl. paralleler Einlösungen) und Familien-Einstellungen.
// Wegwerf-Konten „wc-p4c2a-…@example.com“, neutrale Profile (Alex, Sam, Kim).
// Aufräumen danach per SQL im Testprojekt:
//   delete from public.families where created_by in (select id from auth.users where email like 'wc-p4c2a-%@example.com');
//   delete from auth.users where email like 'wc-p4c2a-%@example.com';
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-mutations.test.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { deleteTestAccounts } from "./_cleanup.mjs";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import * as M from "../../src/lib/familyMutations.js";
import { memberPointSummary } from "../../src/shared/points.js";
import { toDateKey } from "../../src/lib/dateUtils.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.error = () => {}; // erwartete Fehlerpfade der Mutationsschicht nicht ausgeben (enthalten nie PINs)

const R = []; const check = (group, n, ok, d = "") => R.push({ group, n, ok: !!ok, d });
const stamp = Date.now();
async function user(tag) {
  const c = mk(); const email = `wc-p4c2a-${tag}-${stamp}@example.com`; const password = randomUUID();
  const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, id: r.data.user.id, email, password };
}
async function onboard(u, name, children, settings, pin = "4827") {
  const s = initialOnboardingState();
  s.familyName = name;
  s.children = children.map((n, i) => ({ id: String(i), name: n, avatar: "🦊", color: "#16a34a" }));
  s.pin = s.pin2 = pin;
  for (const t of STARTER_TASKS) s.tasks[t.key] = { selected: true, points: "10" };
  for (const r of STARTER_REWARDS) s.rewards[r.key] = { selected: true, points: "50" };
  s.settings = settings;
  const res = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s));
  if (!res.ok) throw new Error("Onboarding: " + res.error);
  return res.familyId;
}
const one = async (q) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; };
const profilesOf = async (c, f) => Object.fromEntries((await one(c.from("profiles").select("id,name").eq("family_id", f))).map((p) => [p.name, p.id]));
const tasksOf = async (c, f) => one(c.from("tasks").select("id,title,points").eq("family_id", f).order("sort_order"));
const rewardsOf = async (c, f) => one(c.from("rewards").select("id,title").eq("family_id", f).order("sort_order"));
const summary = async (c, f, pid) => { const r = await loadFamilyData(c, f); return memberPointSummary(r.model.data, pid); };

const A = await user("a"), A2 = mk(), B = await user("b"), anon = mk();
await A2.auth.signInWithPassword({ email: A.email, password: A.password }); // zweites Gerät desselben Elternteils
const f1 = await onboard(A, "Testfamilie Bestätigung", ["Alex", "Sam"], { showDailyCrown: true, requireConfirmation: true });
const f2 = await onboard(A, "Testfamilie Direkt", ["Sam", "Kim"], { showDailyCrown: true, requireConfirmation: false });
const fB = await onboard(B, "Fremde Familie", ["Kim"], { showDailyCrown: true, requireConfirmation: true });
const P1 = await profilesOf(A.c, f1), P2 = await profilesOf(A.c, f2), PB = await profilesOf(B.c, fB);
const T1 = await tasksOf(A.c, f1), T2 = await tasksOf(A.c, f2), TB = await tasksOf(B.c, fB);
const today = toDateKey(new Date());

// ================= Task Completion =================
let r = await M.completeTask(A.c, { familyId: f1, profileId: P1.Alex, taskId: T1[0].id });
check("Completion", "1 require_confirmation=true → pending", r.ok && r.status === "pending", JSON.stringify(r));
r = await M.completeTask(A.c, { familyId: f2, profileId: P2.Kim, taskId: T2[0].id });
check("Completion", "2 require_confirmation=false → confirmed", r.ok && r.status === "confirmed", JSON.stringify(r));
check("Completion", "3 confirmed gibt Punkte (Kim +10)", (await summary(A.c, f2, P2.Kim)).total === 10);
const sA = await summary(A.c, f1, P1.Alex);
check("Completion", "4 pending gibt keine Punkte (Alex 0, 1 wartend)", sA.total === 0 && sA.pending === 1, JSON.stringify(sA));
r = await M.completeTask(A.c, { familyId: f1, profileId: P1.Alex, taskId: T1[0].id });
const dupCount = (await one(A.c.from("completions").select("id").eq("family_id", f1).eq("profile_id", P1.Alex).eq("task_id", T1[0].id))).length;
check("Completion", "5 Duplikat am selben Tag blockiert (verständliche Meldung, 1 Eintrag)", !r.ok && r.message === "Diese Aufgabe wurde heute bereits erledigt." && dupCount === 1, r.message);
r = await M.undoCompletion(A.c, { familyId: f1, profileId: P1.Alex, taskId: T1[0].id, completionDate: today });
check("Completion", "6 pending kann zurückgenommen werden", r.ok);
r = await M.undoCompletion(A.c, { familyId: f2, profileId: P2.Kim, taskId: T2[0].id, completionDate: today });
const kimStill = (await one(A.c.from("completions").select("id").eq("family_id", f2).eq("profile_id", P2.Kim))).length;
check("Completion", "7 confirmed kann das Kind nicht zurücknehmen", !r.ok && r.reason === "confirmed" && kimStill === 1, r.message);
r = await M.completeTask(A.c, { familyId: f1, profileId: PB.Kim, taskId: T1[1].id });
check("Completion", "8 fremdes Profil blockiert", !r.ok && r.reason === "profile");
r = await M.completeTask(B.c, { familyId: f1, profileId: P1.Alex, taskId: T1[1].id });
const direct = await B.c.from("completions").insert({ family_id: f1, profile_id: P1.Alex, task_id: T1[1].id, task_title: "x", points: 10, completion_date: today });
check("Completion", "9 fremde Familie blockiert (Mutation und direkter Insert)", !r.ok && !!direct.error);
const late = new Date(`${today}T21:30:00Z`); // 23:30 Berlin (MESZ) bzw. 22:30 (MEZ) → gleicher lokaler Tag
r = await M.completeTask(A.c, { familyId: f1, profileId: P1.Sam, taskId: T1[2].id, now: late });
check("Completion", "10 Datum = lokaler Kalendertag (spätabends kein UTC-Versatz)", r.ok && r.completion.completion_date === toDateKey(late) && toDateKey(late) === today, JSON.stringify(r.completion));

// ================= Confirmation =================
const c1 = (await M.completeTask(A.c, { familyId: f1, profileId: P1.Alex, taskId: T1[3].id })).completion;
const c2 = (await M.completeTask(A.c, { familyId: f1, profileId: P1.Alex, taskId: T1[4].id })).completion;
const before = await summary(A.c, f1, P1.Alex);
r = await M.confirmCompletion(A.c, { familyId: f1, completionId: c1.id });
check("Confirmation", "1 owner bestätigt pending", r.ok);
check("Confirmation", "2 Status confirmed", r.completion?.status === "confirmed");
check("Confirmation", "3 confirmed_at gesetzt", !!r.completion?.confirmed_at);
check("Confirmation", "4 confirmed_by = auth.uid()", r.completion?.confirmed_by === A.id);
const after = await summary(A.c, f1, P1.Alex);
check("Confirmation", "5 Punkte steigen (+10)", after.total === before.total + 10, `${before.total}→${after.total}`);
r = await M.rejectCompletion(A.c, { familyId: f1, completionId: c2.id });
check("Confirmation", "6 Ablehnen → rejected (mit Zeitpunkt/Person)", r.ok && r.completion.status === "rejected" && r.completion.confirmed_by === A.id);
const afterRej = await loadFamilyData(A.c, f1);
check("Confirmation", "7 rejected gibt keine Punkte und ist ausgeblendet", memberPointSummary(afterRej.model.data, P1.Alex).total === after.total && !afterRej.model.data.completions.some((c) => c.id === c2.id));
const c3 = (await M.completeTask(A.c, { familyId: f1, profileId: P1.Sam, taskId: T1[5].id })).completion;
r = await M.confirmCompletion(B.c, { familyId: f1, completionId: c3.id });
const c3row = await one(A.c.from("completions").select("status").eq("id", c3.id).single());
check("Confirmation", "8 fremde Familie kann nicht bestätigen", !r.ok && c3row.status === "pending");
const an = await anon.from("completions").update({ status: "confirmed" }).eq("id", c3.id).select("id");
check("Confirmation", "9 anon blockiert", !!an.error || (an.data || []).length === 0);
await A.c.from("completions").update({ confirmed_by: B.id }).eq("id", c1.id);
const c1row = await one(A.c.from("completions").select("confirmed_by").eq("id", c1.id).single());
check("Confirmation", "  confirmed_by nicht vom Client fälschbar (Trigger)", c1row.confirmed_by === A.id);

// ================= PIN =================
check("PIN", "richtige PIN", (await M.verifyParentPin(A.c, { familyId: f1, pin: "4827" })).ok);
r = await M.verifyParentPin(A.c, { familyId: f1, pin: "1111" });
check("PIN", "falsche PIN", !r.ok && r.reason === "wrong");
await M.verifyParentPin(A.c, { familyId: f1, pin: "4827" }); // Zähler zurücksetzen
r = await M.changeParentPin(A.c, { familyId: f1, currentPin: "0000", newPin: "5931", newPin2: "5931" });
check("PIN", "PIN ändern mit falscher aktueller PIN abgelehnt", !r.ok && r.message === "Die aktuelle PIN ist falsch.");
await M.verifyParentPin(A.c, { familyId: f1, pin: "4827" });
r = await M.changeParentPin(A.c, { familyId: f1, currentPin: "4827", newPin: "5931", newPin2: "5931" });
check("PIN", "PIN-Änderung erfolgreich", r.ok);
check("PIN", "neue PIN funktioniert", (await M.verifyParentPin(A.c, { familyId: f1, pin: "5931" })).ok);
check("PIN", "alte PIN funktioniert nicht mehr", !(await M.verifyParentPin(A.c, { familyId: f1, pin: "4827" })).ok);
for (let i = 0; i < 5; i++) await M.verifyParentPin(A.c, { familyId: f2, pin: "0000" });
r = await M.verifyParentPin(A.c, { familyId: f2, pin: "4827" });
check("PIN", "Sperre nach 5 Fehlversuchen (auch richtige PIN, verständliche Meldung)", !r.ok && r.reason === "locked" && r.message === "Zu viele Fehlversuche. Bitte versucht es in einer Minute erneut.", r.message);
r = await M.verifyParentPin(B.c, { familyId: f1, pin: "5931" });
check("PIN", "fremde Familie: PIN nicht prüfbar", !r.ok && r.reason === "forbidden");

// ================= Reward RPC =================
const RW2 = await rewardsOf(A.c, f2);
for (let i = 1; i <= 3; i++) await M.completeTask(A.c, { familyId: f2, profileId: P2.Kim, taskId: T2[i].id }); // Kim: 40
await one(A.c.from("rewards").update({ points_required: 30 }).eq("id", RW2[0].id));
r = await M.redeemReward(A.c, { familyId: f2, profileId: P2.Kim, rewardId: RW2[0].id });
check("Reward", "1 genug Punkte → Erfolg", r.ok, r.message);
const red = await one(A.c.from("redemptions").select("points_spent,reward_title").eq("id", r.redemptionId).single());
check("Reward", "8 points_spent korrekt (30, Snapshot Titel)", red.points_spent === 30 && red.reward_title === RW2[0].title);
check("Reward", "9 verfügbare Punkte sinken (40 → 10)", r.available === 10 && (await summary(A.c, f2, P2.Kim)).available === 10);
r = await M.redeemReward(A.c, { familyId: f2, profileId: P2.Kim, rewardId: RW2[0].id });
check("Reward", "2 nicht genug Punkte → abgelehnt mit Fehlbetrag", !r.ok && r.reason === "insufficient_points" && r.message === "Dafür fehlen noch 20 Punkte.", r.message);
r = await M.redeemReward(B.c, { familyId: f2, profileId: P2.Kim, rewardId: RW2[1].id });
check("Reward", "3 falsche Familie → abgelehnt", !r.ok && r.reason === "forbidden");
r = await M.redeemReward(A.c, { familyId: f2, profileId: PB.Kim, rewardId: RW2[1].id });
check("Reward", "4 falsches Profil → abgelehnt", !r.ok && r.reason === "profile_not_found");
const RWB = await rewardsOf(B.c, fB);
r = await M.redeemReward(A.c, { familyId: f2, profileId: P2.Kim, rewardId: RWB[0].id });
check("Reward", "5 falsche Belohnung → abgelehnt", !r.ok && r.reason === "reward_not_found");
await one(A.c.from("rewards").update({ active: false, points_required: 1 }).eq("id", RW2[2].id));
r = await M.redeemReward(A.c, { familyId: f2, profileId: P2.Kim, rewardId: RW2[2].id });
check("Reward", "6 inaktive Belohnung → abgelehnt", !r.ok && r.reason === "reward_inactive");
await one(A.c.from("rewards").update({ points_required: 1 }).eq("id", RW2[3].id));
await one(A.c.from("reward_assignments").insert({ family_id: f2, reward_id: RW2[3].id, profile_id: P2.Sam }));
r = await M.redeemReward(A.c, { familyId: f2, profileId: P2.Kim, rewardId: RW2[3].id });
check("Reward", "7 nicht zugewiesene Belohnung → abgelehnt", !r.ok && r.reason === "not_assigned");
// Parallel: Sam 100 Punkte, zwei Geräte lösen gleichzeitig je 80 ein → genau eine erfolgreich (3 Runden)
for (let i = 0; i < 10; i++) await M.completeTask(A.c, { familyId: f2, profileId: P2.Sam, taskId: T2[i].id });
let races = [];
for (let round = 0; round < 3; round++) {
  const x = RW2[4 + (round % 2)], y = RW2[5 - (round % 2)];
  await one(A.c.from("rewards").update({ points_required: 80 }).in("id", [x.id, y.id]));
  if (round > 0) { // Sam wieder auf genau 100 verfügbare Punkte bringen
    const avail = (await summary(A.c, f2, P2.Sam)).available;
    await one(A.c.from("completions").insert({ family_id: f2, profile_id: P2.Sam, task_id: null, task_title: "Ausgleich Test", points: 100 - avail, completion_date: today, status: "confirmed" }));
  }
  const res = await Promise.all([
    M.redeemReward(A.c, { familyId: f2, profileId: P2.Sam, rewardId: x.id }),
    M.redeemReward(A2, { familyId: f2, profileId: P2.Sam, rewardId: y.id }),
  ]);
  races.push(res.filter((q) => q.ok).length + ":" + res.filter((q) => q.reason === "insufficient_points").length);
}
const samAvail = (await summary(A.c, f2, P2.Sam)).available;
check("Reward", "10 parallele Einlösung über Restpunkte → nur eine erfolgreich (3 Runden)", races.every((x) => x === "1:1") && samAvail === 20, `${races.join(" ")} / verfügbar ${samAvail}`);
const ar = await anon.rpc("redeem_reward", { p_family_id: f2, p_profile_id: P2.Kim, p_reward_id: RW2[1].id });
check("Reward", "11 anon blockiert", !!ar.error);
const di = await A.c.from("redemptions").insert({ family_id: f2, profile_id: P2.Kim, reward_id: RW2[1].id, reward_title: "x", points_spent: 0 });
const du = await A.c.from("redemptions").update({ points_spent: 0 }).eq("family_id", f2).select("id");
check("Reward", "  direkter Insert/Punkte-Update auf redemptions blockiert", !!di.error && (!!du.error || du.data.length === 0));

// ================= Settings =================
r = await M.updateFamilySettings(A.c, { familyId: f1, showDailyCrown: false });
check("Settings", "Tageskrone ausschalten (owner)", r.ok && r.settings.show_daily_crown === false);
const pendingBefore = (await one(A.c.from("completions").select("id").eq("family_id", f1).eq("status", "pending"))).length;
r = await M.updateFamilySettings(A.c, { familyId: f1, requireConfirmation: false });
const pendingAfter = (await one(A.c.from("completions").select("id").eq("family_id", f1).eq("status", "pending"))).length;
check("Settings", "Bestätigungspflicht aus: bestehende pending bleiben pending", r.ok && pendingBefore > 0 && pendingAfter === pendingBefore);
r = await M.completeTask(A.c, { familyId: f1, profileId: P1.Sam, taskId: T1[6].id });
check("Settings", "danach neue Erledigung direkt confirmed", r.ok && r.status === "confirmed");
r = await M.updateFamilySettings(B.c, { familyId: f1, showDailyCrown: true });
const s1 = await one(A.c.from("family_settings").select("show_daily_crown").eq("family_id", f1).single());
check("Settings", "fremde Familie kann Einstellungen nicht ändern (RLS)", !r.ok && s1.show_daily_crown === false);

for (const x of R) console.log(`${x.ok ? "✅" : "❌"} [${x.group}] ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
const failed = R.filter((x) => !x.ok).length;
console.log(`\n${R.length - failed}/${R.length} bestanden`);
const cl = await deleteTestAccounts(cfg, [A, B]);
console.log(cl.ok ? `Wegwerf-Konten und ${cl.deletedFamilies} Familien über delete-account gelöscht.` : "WARNUNG: Aufräumen unvollständig");
process.exit(failed ? 1 : 0);
