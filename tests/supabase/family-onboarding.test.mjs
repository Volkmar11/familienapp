// Integrationstest Phase 4B (Onboarding-RPC, PIN, Idempotenz) gegen das Supabase-TESTPROJEKT.
// Wegwerf-Konten „wc-p4b-…@example.com“; Familien löscht der Test selbst (owner),
// Auth-Konten danach per SQL im Testprojekt entfernen:
//   delete from auth.users where email like 'wc-p4b-%@example.com';
// Mit KEEP=1 bleiben die Daten für die Admin-Prüfung (supabase/tests/onboarding_security_check.sql) erhalten.
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-onboarding.test.mjs
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { deleteTestAccounts } from "./_cleanup.mjs";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });

const R = []; const check = (n, ok, d = "") => R.push({ n, ok: !!ok, d });
const stamp = Date.now();
async function user(tag) {
  const c = mk(); const email = `wc-p4b-${tag}-${stamp}@example.com`, password = randomUUID();
  const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, id: r.data.user.id, email, password };
}
const A = await user("a"), B = await user("b"), anon = mk();
const rpc = (c, rid, payload) => c.rpc("create_family_with_onboarding", { p_request_id: rid, ...payload });

// Gültiges Onboarding über dieselbe Logik wie die App
const s = initialOnboardingState();
s.familyName = "Familie Beispiel";
s.children = [{ id: "1", name: "Kind Eins", avatar: "🦊", color: "#16a34a" }, { id: "2", name: "Kind Zwei", avatar: "🐼", color: "#2563eb" }, { id: "3", name: "Kind Drei", avatar: "🚀", color: "#8b5cf6" }];
s.pin = s.pin2 = "4827";
const chosen = STARTER_TASKS.filter((t) => t.category !== "alltag").slice(0, 4); // Aufgaben aus 2 von 3 Kategorien
for (const t of STARTER_TASKS) s.tasks[t.key] = { selected: chosen.includes(t), points: "7" };
s.tasks[chosen[0].key].points = "33";
const chosenRewards = STARTER_REWARDS.slice(0, 2);
for (const r of STARTER_REWARDS) s.rewards[r.key] = { selected: chosenRewards.includes(r), points: "55" };
s.settings = { showDailyCrown: false, requireConfirmation: true };
const payload = buildOnboardingPayload(s);
const rid = randomUUID();

const res = await createFamilyWithOnboarding(A.c, rid, payload);
check("1 gültiges Onboarding", res.ok && !res.replayed, res.error);
const fid = res.familyId;
const fam = await A.c.from("families").select("id,name").eq("id", fid).maybeSingle();
check("2 Familie erzeugt", fam.data?.name === "Familie Beispiel");
const mem = await A.c.from("family_members").select("user_id,role").eq("family_id", fid);
check("3 owner erzeugt", mem.data?.length === 1 && mem.data[0].user_id === A.id && mem.data[0].role === "owner");
const set = await A.c.from("family_settings").select("*").eq("family_id", fid).maybeSingle();
check("4 family_settings erzeugt", !!set.data);
check("5 show_daily_crown = false (wie gewählt)", set.data?.show_daily_crown === false);
check("6 require_confirmation = true (wie gewählt)", set.data?.require_confirmation === true);
check("  family_settings enthält keine PIN-Spalte mehr", set.data && !("parent_pin_hash" in set.data), Object.keys(set.data || {}).join(","));
const prof = await A.c.from("profiles").select("name,avatar_emoji,color,sort_order,is_parent").eq("family_id", fid).order("sort_order");
check("7 Kinderprofile korrekt", prof.data?.length === 3 && prof.data.every((p, i) => p.name === s.children[i].name && p.avatar_emoji === s.children[i].avatar && p.color === s.children[i].color && !p.is_parent));
check("8 Reihenfolge korrekt", prof.data?.map((p) => p.sort_order).join() === "0,1,2");
const cats = await A.c.from("categories").select("id,name,icon").eq("family_id", fid).order("sort_order");
const expectedCats = [...new Set(payload.p_tasks.map((t) => t.category))];
check("9 nur Kategorien mit gewählten Aufgaben", cats.data?.map((c) => c.name).join() === expectedCats.join() && !cats.data.some((c) => c.name === "Alltag"), cats.data?.map((c) => c.name).join());
const tasks = await A.c.from("tasks").select("title,points,category_id,recurrence").eq("family_id", fid).order("sort_order");
check("10 gewählte Aufgaben korrekt (inkl. Punkte, Kategorie)", tasks.data?.length === chosen.length && tasks.data[0].points === 33 && tasks.data.every((t) => cats.data.some((c) => c.id === t.category_id)));
check("11 abgewählte Aufgaben fehlen", !tasks.data?.some((t) => STARTER_TASKS.filter((x) => !chosen.includes(x)).some((x) => x.title === t.title)));
const rew = await A.c.from("rewards").select("title,points_required").eq("family_id", fid);
check("12 Belohnungen korrekt", rew.data?.length === 2 && rew.data.every((r) => r.points_required === 55));
const assigns = await Promise.all(["task_assignments", "reward_assignments", "category_assignments"].map((t) => A.c.from(t).select("family_id", { count: "exact", head: true }).eq("family_id", fid)));
check("  keine Assignment-Zeilen (= für alle sichtbar)", assigns.every((a) => a.count === 0));
const sec = await A.c.schema("private").from("family_security").select("*");
check("13/14 PIN-Tabelle für Client nicht lesbar", !!sec.error || (sec.data || []).length === 0, sec.error?.message);
let v = await A.c.rpc("verify_parent_pin", { p_family_id: fid, p_pin: "4827" });
check("15 korrekte PIN serverseitig verifiziert", v.data === true, v.error?.message);
v = await A.c.rpc("verify_parent_pin", { p_family_id: fid, p_pin: "1111" });
check("16 falsche PIN abgelehnt", v.data === false, v.error?.message);
let e = await rpc(anon, randomUUID(), payload);
check("17 anonymer Aufruf blockiert", !!e.error, e.error?.message);
const bSee = await Promise.all([B.c.from("families").select("id").eq("id", fid), B.c.from("profiles").select("id").eq("family_id", fid), B.c.from("tasks").select("id").eq("family_id", fid)]);
const bVerify = await B.c.rpc("verify_parent_pin", { p_family_id: fid, p_pin: "4827" });
const bSet = await B.c.rpc("set_parent_pin", { p_family_id: fid, p_current_pin: "4827", p_new_pin: "0000" });
check("18 fremder Benutzer: kein Lesen, kein PIN-Prüfen/-Setzen", bSee.every((x) => (x.data || []).length === 0) && !!bVerify.error && !!bSet.error);
const bFamCount = async () => (await B.c.from("family_members").select("family_id").eq("user_id", B.id)).data?.length ?? -1;
e = await rpc(B.c, randomUUID(), { ...payload, p_pin: "12a4" });
check("19 ungültige PIN blockiert (nichts angelegt)", !!e.error && (await bFamCount()) === 0, e.error?.message);
e = await rpc(B.c, randomUUID(), { ...payload, p_children: [] });
check("20 leeres Kinderarray blockiert", !!e.error && (await bFamCount()) === 0, e.error?.message);
const badPts = [-1, 10.5, 10001];
const badRes = await Promise.all(badPts.map((p) => rpc(B.c, randomUUID(), { ...payload, p_tasks: [{ ...payload.p_tasks[0], points: p }] })));
const badRew = await rpc(B.c, randomUUID(), { ...payload, p_rewards: [{ title: "X", points_required: -5 }] });
check("21 ungültige Punkte blockiert (Aufgaben −1/10.5/10001, Belohnung −5)", badRes.every((r) => !!r.error) && !!badRew.error && (await bFamCount()) === 0);
const replay = await createFamilyWithOnboarding(A.c, rid, payload);
const aFam = (await A.c.from("family_members").select("family_id").eq("user_id", A.id)).data;
check("22 gleiche request-id → keine zweite Familie", replay.ok && replay.replayed && replay.familyId === fid && aFam.length === 1);
e = await rpc(B.c, rid, payload);
const bAfter = await B.c.from("profiles").select("id").eq("family_id", fid);
check("23 fremde request-id → abgelehnt, keine Rechte", !!e.error && (await bFamCount()) === 0 && (bAfter.data || []).length === 0, e.error?.message);

// Zusätzlich: gleichzeitiger Doppelklick mit neuer request-id
const rid2 = randomUUID();
const [d1, d2] = await Promise.all([createFamilyWithOnboarding(B.c, rid2, payload), createFamilyWithOnboarding(B.c, rid2, payload)]);
check("  Doppelklick gleichzeitig → genau eine Familie", d1.ok && d2.ok && d1.familyId === d2.familyId && (await bFamCount()) === 1 && (d1.replayed !== d2.replayed));
// PIN ändern
let sp = await A.c.rpc("set_parent_pin", { p_family_id: fid, p_current_pin: "0000", p_new_pin: "5555" });
check("  PIN ändern mit falscher aktueller PIN → false", sp.data === false, sp.error?.message);
sp = await A.c.rpc("set_parent_pin", { p_family_id: fid, p_current_pin: "4827", p_new_pin: "5555" });
v = await A.c.rpc("verify_parent_pin", { p_family_id: fid, p_pin: "5555" });
check("  PIN ändern mit korrekter PIN → neue PIN gilt", sp.data === true && v.data === true);
sp = await A.c.rpc("set_parent_pin", { p_family_id: fid, p_current_pin: "5555", p_new_pin: "55a5" });
check("  neue PIN mit ungültigem Format abgelehnt", !!sp.error);
// Fehlversuchsschutz: 5 falsche → auch richtige PIN kurz gesperrt
for (let i = 0; i < 5; i++) await A.c.rpc("verify_parent_pin", { p_family_id: fid, p_pin: "9999" });
v = await A.c.rpc("verify_parent_pin", { p_family_id: fid, p_pin: "5555" });
check("  nach 5 Fehlversuchen gesperrt (60 s)", v.data === false);

if (!process.env.KEEP) {
  const cl = await deleteTestAccounts(cfg, [A, B]);
  if (!cl.ok) console.log("WARNUNG: Aufräumen unvollständig");
}
for (const x of R) console.log(`${x.ok ? "PASS" : "FAIL"} | ${x.n}${x.ok || !x.d ? "" : " | " + x.d}`);
console.log(`\n${R.filter((x) => x.ok).length}/${R.length} bestanden · family_id A: ${fid}${process.env.KEEP ? " (behalten)" : ""}`);
process.exit(R.every((x) => x.ok) ? 0 : 1);
