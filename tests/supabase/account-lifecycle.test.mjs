// Integrationstest Phase 5C (Account löschen / Familie löschen) gegen das Supabase-TESTPROJEKT.
// Nur Wegwerf-Konten „wc-p5c-…@example.com“ und Wegwerf-Familien; die Migrationsfamilie wird nie berührt.
// Voraussetzungen im Testprojekt: Migration 20260929200000_account_lifecycle.sql, Edge Functions
// delete-account und delete-family, Test-Hilfsfunktion supabase/test-support/add_family_member.sql.
// Optional: TRACK_OUT=<Datei außerhalb des Repos> schreibt die IDs gelöschter Familien/Nutzer für eine
// anschließende SQL-Prüfung (Kaskaden, Storage) · STALE=1 prüft zusätzlich die Frische-Regel (> 5 min Wartezeit).
// Aufräumen danach per SQL: delete from public.families where created_by in (select id from auth.users where email like 'wc-p5c-%@example.com');
//                           delete from auth.users where email like 'wc-p5c-%@example.com';
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import { fetchMemberships } from "../../src/lib/familyMembership.js";
import * as M from "../../src/lib/familyMutations.js";
import * as Media from "../../src/lib/familyMedia.js";
import { deleteAccount, deleteFamily } from "../../src/lib/accountLifecycle.js";
import { memberPointSummary } from "../../src/shared/points.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.warn = () => {};
const R = []; const check = (n, ok, d = "") => R.push({ n, ok: !!ok, d });
const stamp = Date.now(); const PIN = "4827";
const JPEG = fs.readFileSync(new URL("../fixtures/synthetic-8x8.jpg", import.meta.url));
const track = { deletedFamilies: [], deletedUsers: [], keptFamilies: [] };

async function user(tag) {
  const c = mk(); const email = `wc-p5c-${tag}-${stamp}@example.com`; const password = randomUUID();
  const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, email, password, id: r.data.user.id };
}
async function onboard(u, name) {
  const s = initialOnboardingState(); s.familyName = name; s.pin = s.pin2 = PIN;
  s.children = [{ id: "0", name: "Kind", avatar: "🦊", color: "#16a34a" }];
  STARTER_TASKS.forEach((t, i) => { s.tasks[t.key] = { selected: i < 1, points: "10" }; });
  STARTER_REWARDS.forEach((x, i) => { s.rewards[x.key] = { selected: i < 1, points: "5" }; });
  s.settings = { showDailyCrown: true, requireConfirmation: true };
  const r = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s)); if (!r.ok) throw new Error(r.error); return r.familyId;
}
const addMember = async (owner, fid, member, role = "parent") => { const r = await owner.c.rpc("test_add_family_member", { p_family_id: fid, p_email: member.email, p_role: role }); if (r.error) throw new Error(r.error.message); };
const blob = () => new Blob([JPEG], { type: "image/jpeg" });
// Familie mit Daten: bestätigte Erledigung (Audit confirmed_by), Einlösung (quittiert), Profil- und Aufgabenbild
async function seed(u, fid) {
  const d = (await loadFamilyData(u.c, fid)).model.data;
  const kid = d.members[0].id, task = d.tasks[0].id, reward = d.rewards[0].id;
  const c = await M.completeTask(u.c, { familyId: fid, profileId: kid, taskId: task });
  await M.confirmCompletion(u.c, { familyId: fid, completionId: c.completion.id });
  const red = await M.redeemReward(u.c, { familyId: fid, profileId: kid, rewardId: reward });
  await M.acknowledgeRedemptions(u.c, { familyId: fid, redemptionIds: [red.redemptionId || red.id].filter(Boolean) });
  const p = await Media.uploadProfileImage(u.c, { familyId: fid, profileId: kid, blob: blob() });
  const t = await Media.uploadTaskImage(u.c, { familyId: fid, taskId: task, blob: blob() });
  return { kid, photo: p.path, image: t.path };
}
const canLogin = async (u) => !(await mk().auth.signInWithPassword({ email: u.email, password: u.password })).error;
const snapshot = async (c, fid) => { const r = await loadFamilyData(c, fid); if (!r.ok) return null; const d = r.model.data; return { kids: d.members.length, tasks: d.tasks.length, rewards: d.rewards.length, completions: d.completions.length, redemptions: d.redeemedRewards.length, points: memberPointSummary(d, d.members[0]?.id).total, photo: d.members[0]?.photoPath }; };
const roleOf = async (u, fid) => (await fetchMemberships(u.c, u.id)).memberships.find((m) => m.familyId === fid)?.role ?? null;
const readable = async (c, p) => !(await c.storage.from("family-media").createSignedUrl(p, 60)).error;
const raw = async (name, { token, body = {}, origin } = {}) => {
  const res = await fetch(`${cfg.url}/functions/v1/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  let j = null; try { j = await res.json(); } catch { /* */ }
  return { status: res.status, body: j, acao: res.headers.get("access-control-allow-origin") };
};
const tokenOf = async (u) => (await u.c.auth.getSession()).data.session.access_token;

// Optional: Frische-Regel (Anmeldung älter als 5 Minuten) – startet sofort, wird am Ende ausgewertet
let staleCheck = null;
if (process.env.STALE === "1") {
  const S = await user("stale");
  staleCheck = (async () => { await new Promise((r) => setTimeout(r, 310_000)); const r = await raw("delete-account", { token: await tokenOf(S) }); return { r, alive: await canLogin(S) }; })();
}

// ---------------- 1. Einzelner owner, einzige Familie, Daten + Medien ----------------
const A1 = await user("solo");
const f1 = await onboard(A1, "Solo");
const s1 = await seed(A1, f1);
let r = await deleteAccount(A1.c, { password: A1.password, phrase: "LÖSCHEN" });
check("1 Account löschen (einzelner owner) erfolgreich", r.ok && r.deletedFamilies === 1 && r.mediaRemoved === 2, JSON.stringify(r));
check("1 Auth-User gelöscht (kein Login mehr)", !(await canLogin(A1)));
check("1 lokale Session entfernt", !(await A1.c.auth.getSession()).data.session);
track.deletedFamilies.push(f1); track.deletedUsers.push(A1.id);

// ---------------- 2. owner A löscht sich, parent B bleibt → B wird owner ----------------
const A2 = await user("owner"), B2 = await user("parent");
const f2 = await onboard(A2, "Geteilt");
const s2 = await seed(A2, f2);
await addMember(A2, f2, B2);
const before2 = await snapshot(B2.c, f2);
r = await deleteAccount(A2.c, { password: A2.password, phrase: "LÖSCHEN" });
check("2 owner löscht Account (andere Eltern bleiben)", r.ok && r.deletedFamilies === 0 && r.leftFamilies === 1 && r.ownershipTransferred === 1, JSON.stringify(r));
check("2 A kann sich nicht mehr anmelden", !(await canLogin(A2)));
check("2 B ist jetzt owner", (await roleOf(B2, f2)) === "owner");
const after2 = await snapshot(B2.c, f2);
check("2 Familie + Kinder/Aufgaben/Belohnungen/Punkte/Erledigungen/Einlösungen unverändert", JSON.stringify(before2) === JSON.stringify(after2), JSON.stringify(after2));
check("2 Bilder bleiben für B lesbar", (await readable(B2.c, s2.photo)) && (await readable(B2.c, s2.image)));
const comp2 = (await B2.c.from("completions").select("confirmed_by, confirmed_at, status").eq("family_id", f2)).data;
const red2 = (await B2.c.from("redemptions").select("acknowledged_by, acknowledged_at").eq("family_id", f2)).data;
check("2 Audit-Felder konsistent (confirmed_by/acknowledged_by → NULL, Zeitpunkte bleiben)", comp2.every((c) => c.confirmed_by === null && c.confirmed_at && c.status === "confirmed") && red2.every((x) => x.acknowledged_by === null && x.acknowledged_at));
const mem2 = (await B2.c.from("family_members").select("user_id, role").eq("family_id", f2)).data;
check("2 Mitgliedschaft von A entfernt, B einziges Mitglied", mem2.length === 1 && mem2[0].user_id === B2.id);
track.keptFamilies.push(f2); track.deletedUsers.push(A2.id);

// ---------------- 3. parent löscht sich, owner bleibt ----------------
const A3 = await user("owner3"), B3 = await user("parent3");
const f3 = await onboard(A3, "Parent verlässt");
await seed(A3, f3);
await addMember(A3, f3, B3);
const before3 = await snapshot(A3.c, f3);
await B3.c.auth.signInWithPassword({ email: B3.email, password: B3.password });
r = await deleteAccount(B3.c, { password: B3.password, phrase: "LÖSCHEN" });
check("3 parent löscht Account", r.ok && r.leftFamilies === 1 && r.ownershipTransferred === 0 && r.deletedFamilies === 0);
check("3 A bleibt owner, Familie unverändert", (await roleOf(A3, f3)) === "owner" && JSON.stringify(before3) === JSON.stringify(await snapshot(A3.c, f3)));
check("3 B-Mitgliedschaft entfernt", (await A3.c.from("family_members").select("user_id").eq("family_id", f3)).data.length === 1);
track.keptFamilies.push(f3);

// ---------------- 4. mehrere Familien ----------------
const Mu = await user("multi"), P4 = await user("p4"), Q4 = await user("q4"), R4 = await user("r4");
const f4a = await onboard(Mu, "Multi allein");            // → löschen
const f4b = await onboard(Mu, "Multi mit parent");        // → P4 wird owner
const f4c = await onboard(Q4, "Q gehört");                // Mu ist parent → austreten
const f4d = await onboard(Mu, "Zwei owner");              // R4 ist owner → keine Rollenänderung
await seed(Mu, f4a);
await addMember(Mu, f4b, P4); await addMember(Q4, f4c, Mu); await addMember(Mu, f4d, R4, "owner");
const qBefore = await snapshot(Q4.c, f4c);
r = await deleteAccount(Mu.c, { password: Mu.password, phrase: "LÖSCHEN" });
check("4 mehrere Familien: 1 gelöscht, 3 verlassen, 1 Übergabe", r.ok && r.deletedFamilies === 1 && r.leftFamilies === 3 && r.ownershipTransferred === 1, JSON.stringify(r));
check("4 P4 ist owner von f4b", (await roleOf(P4, f4b)) === "owner");
check("4 Q4 bleibt owner, Familie unverändert", (await roleOf(Q4, f4c)) === "owner" && JSON.stringify(qBefore) === JSON.stringify(await snapshot(Q4.c, f4c)));
check("4 R4 bleibt owner (kein weiterer Wechsel)", (await roleOf(R4, f4d)) === "owner");
check("4 Mu kann sich nicht mehr anmelden", !(await canLogin(Mu)));
track.deletedFamilies.push(f4a); track.keptFamilies.push(f4b, f4c, f4d); track.deletedUsers.push(Mu.id);

// ---------------- 5. Familie löschen ----------------
const O5 = await user("owner5"), P5 = await user("parent5");
const f5 = await onboard(O5, "Wird gelöscht");
const s5 = await seed(O5, f5);
await addMember(O5, f5, P5);
await P5.c.auth.signInWithPassword({ email: P5.email, password: P5.password });
r = await deleteFamily(P5.c, { familyId: f5, password: P5.password, pin: PIN, phrase: "FAMILIE LÖSCHEN" });
check("5 parent darf Familie nicht löschen", !r.ok && r.reason === "forbidden");
r = await deleteFamily(O5.c, { familyId: f5, password: O5.password, pin: "0000", phrase: "FAMILIE LÖSCHEN" });
check("5 falsche PIN blockiert", !r.ok && r.reason === "pin");
r = await deleteFamily(O5.c, { familyId: f5, password: "falsch", pin: PIN, phrase: "FAMILIE LÖSCHEN" });
check("5 falsches Passwort blockiert (ohne Serveraufruf)", !r.ok && r.reason === "password");
check("5 Familie nach Fehlversuchen unverändert", (await snapshot(O5.c, f5)) !== null);
r = await deleteFamily(O5.c, { familyId: f5, password: O5.password, pin: PIN, phrase: "FAMILIE LÖSCHEN" });
check("5 owner löscht Familie", r.ok && r.mediaRemoved === 2, JSON.stringify(r));
check("5 Auth-Konto bleibt, keine Familie mehr (→ Onboarding)", (await canLogin(O5)) && (await fetchMemberships(O5.c, O5.id)).memberships.length === 0);
check("5 parent-Mitgliedschaft ebenfalls weg, Konto bleibt", (await fetchMemberships(P5.c, P5.id)).memberships.length === 0 && (await canLogin(P5)));
check("5 Medien entfernt (keine signierte URL mehr)", !(await readable(O5.c, s5.photo)));
track.deletedFamilies.push(f5);

// ---------------- 6. Angriffe / falsche Auth ----------------
let a = await raw("delete-account", {});
check("6 anon (kein Token) → 401", a.status === 401);
a = await raw("delete-family", { body: { familyId: f2, pin: PIN } });
check("6 anon delete-family → 401", a.status === 401);
a = await raw("delete-account", { token: "kein.gueltiges.token" });
check("6 ungültiges Token → 401", a.status === 401);
const X = await user("x"), Y = await user("y");
const fY = await onboard(Y, "Fremd");
a = await raw("delete-family", { token: await tokenOf(X), body: { familyId: fY, pin: PIN } });
check("6 fremde Familie löschen → 403", a.status === 403 && a.body?.reason === "forbidden");
a = await raw("delete-family", { token: await tokenOf(Y), body: { familyId: "../../etc", pin: PIN } });
check("6 manipulierte family_id → 400", a.status === 400);
a = await raw("delete-account", { token: await tokenOf(X), body: { user_id: Y.id, userId: Y.id } });
check("6 fremde user_id im Body ignoriert: nur Aufrufer gelöscht", a.status === 200 && !(await canLogin(X)) && (await canLogin(Y)) && (await snapshot(Y.c, fY)) !== null);
a = await raw("delete-account", { token: await tokenOf(X) });
check("6 Wiederholung mit Token des gelöschten Kontos → 401 (kein Schaden)", a.status === 401);
a = await raw("delete-account", { origin: "https://evil.example.com" });
const b = await raw("delete-account", { origin: "http://localhost:5173" });
check("6 CORS: fremde Origin ohne Freigabe, localhost erlaubt", !a.acao && b.acao === "http://localhost:5173");
track.keptFamilies.push(fY); track.deletedUsers.push(X.id);

if (staleCheck) {
  const s = await staleCheck;
  check("6 Anmeldung älter als 5 Minuten → reauth_required, Konto bleibt", s.r.status === 401 && s.r.body?.reason === "reauth_required" && s.alive);
}

if (process.env.TRACK_OUT) fs.writeFileSync(process.env.TRACK_OUT, JSON.stringify(track));
const failed = R.filter((x) => !x.ok);
for (const x of R) console.log(`${x.ok ? "✅" : "❌"} ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
console.log(`\n${R.length - failed.length}/${R.length} bestanden`);
process.exit(failed.length ? 1 : 0);
