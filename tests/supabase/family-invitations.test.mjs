// Integrationstest Phase 5D (Einladungen, Rollen, Entfernen, Verlassen, Membership-Realtime)
// gegen das Supabase-TESTPROJEKT. Nur Wegwerf-Konten „wc-p5d-…@example.com“; andere Familien werden nie berührt.
// Voraussetzung: Migration 20260929300000_family_invitations.sql.
// Ablauf von TTL und Rate-Limit-Fenstern prüft supabase/tests/family_invitations_check.sql (Zeit zurückdatieren).
// Aufräumen danach per SQL: delete from public.families where created_by in (select id from auth.users where email like 'wc-p5d-%@example.com');
//                           delete from auth.users where email like 'wc-p5d-%@example.com';
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import { fetchMemberships } from "../../src/lib/familyMembership.js";
import { createMembershipRealtime } from "../../src/lib/familyRealtime.js";
import * as Inv from "../../src/lib/familyInvitations.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.warn = () => {};
const R = []; const check = (n, ok, d = "") => R.push({ n, ok: !!ok, d });
const stamp = Date.now(); const PIN = "4827";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GENERIC = "Diese Einladung ist ungültig oder nicht mehr verfügbar.";

async function user(tag) {
  const c = mk(); const email = `wc-p5d-${tag}-${stamp}@example.com`; const password = randomUUID();
  const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, email, password, id: r.data.user.id };
}
async function onboard(u, name) {
  const s = initialOnboardingState(); s.familyName = name; s.pin = s.pin2 = PIN;
  s.children = [{ id: "0", name: "Kind", avatar: "🦊", color: "#16a34a" }];
  STARTER_TASKS.forEach((t, i) => { s.tasks[t.key] = { selected: i < 1, points: "10" }; });
  STARTER_REWARDS.forEach((x) => { s.rewards[x.key] = { selected: false, points: "5" }; });
  s.settings = { showDailyCrown: true, requireConfirmation: false };
  const r = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s)); if (!r.ok) throw new Error(r.error); return r.familyId;
}
const join = async (owner, fid, member) => { const i = await Inv.createInvitation(owner.c, fid); const a = await Inv.acceptInvitation(member.c, i.token); return a.ok && a.status === "joined"; };
const roleOf = async (u, fid) => (await fetchMemberships(u.c, u.id)).memberships.find((m) => m.familyId === fid)?.role ?? null;
const canRead = async (u, fid) => (await loadFamilyData(u.c, fid)).ok;
const memberCount = async (u, fid) => (await Inv.listAdults(u.c, fid)).list.length;

// ---------------- Einladung erzeugen ----------------
const A = await user("owner"), B = await user("parent"), C = await user("c"), X = await user("fremd");
const fA = await onboard(A, "Einladung A");
const i1 = await Inv.createInvitation(A.c, fA);
check("01 owner erzeugt Einladung: 128-Bit-Token (32 Hex), Ablauf in ~7 Tagen", i1.ok && /^[0-9a-f]{32}$/.test(i1.token) && Math.abs(new Date(i1.expiresAt) - Date.now() - 7 * 864e5) < 120e3, JSON.stringify({ ok: i1.ok, e: i1.error }));
let r = await Inv.createInvitation(X.c, fA);
check("02 Nicht-Mitglied kann keine Einladung erzeugen", !r.ok);
const anon = mk();
const an = await anon.rpc("create_family_invitation", { p_family_id: fA });
const an2 = await anon.rpc("inspect_family_invitation", { p_token: i1.token });
check("03 anon: RPCs nicht ausführbar", !!an.error && !!an2.error);

// ---------------- Einladung prüfen / annehmen ----------------
const ins = await Inv.inspectInvitation(B.c, i1.token);
check("04 inspect: Familienname, Rolle parent, Ablauf – kein Beitritt", ins.ok && ins.familyName === "Einladung A" && !ins.alreadyMember && (await fetchMemberships(B.c, B.id)).memberships.length === 0);
const insRaw = (await B.c.rpc("inspect_family_invitation", { p_token: i1.token })).data;
check("05 inspect gibt keine Familiendaten/Hash preis", insRaw && insRaw.role === "parent" && !("token_hash" in insRaw) && Object.keys(insRaw).every((k) => ["ok", "family_id", "family_name", "expires_at", "role", "already_member"].includes(k)), JSON.stringify(Object.keys(insRaw || {})));
check("06 vor Beitritt kein Zugriff auf Familiendaten", !(await canRead(B, fA)));
r = await Inv.acceptInvitation(B.c, Inv.formatInviteCode(i1.token).toLowerCase().replace(/-/g, " - "));
check("07 accept (Code mit Leerzeichen/Bindestrichen, Kleinschreibung) → beigetreten als parent", r.ok && r.status === "joined" && (await roleOf(B, fA)) === "parent", JSON.stringify(r));
check("08 nach Beitritt: Familiendaten lesbar", await canRead(B, fA));
r = await Inv.acceptInvitation(B.c, i1.token);
check("09 erneutes accept desselben Nutzers → already_member (idempotent)", r.ok && r.status === "already_member");
r = await Inv.acceptInvitation(C.c, i1.token);
check("10 verwendeter Token für anderen Nutzer → generische Meldung", !r.ok && r.error === GENERIC);
r = await Inv.inspectInvitation(C.c, "0".repeat(32));
check("11 falscher Token → generische Meldung", !r.ok && r.error === GENERIC);

// Widerruf (owner und parent derselben Familie)
const i2 = await Inv.createInvitation(B.c, fA);
check("12 parent erzeugt Einladung", i2.ok);
check("13 Fremder kann nicht widerrufen", !(await Inv.revokeInvitation(X.c, i2.id)).ok);
check("14 owner widerruft Einladung des parent", (await Inv.revokeInvitation(A.c, i2.id)).ok);
r = await Inv.acceptInvitation(C.c, i2.token);
check("15 widerrufener Token → generische Meldung", !r.ok && r.error === GENERIC);

// Listen
const i3 = await Inv.createInvitation(A.c, fA);
const li = await Inv.listInvitations(B.c, fA);
const liRaw = (await B.c.rpc("list_family_invitations", { p_family_id: fA })).data;
check("16 list_family_invitations: nur aktive, ohne token_hash", li.ok && li.list.length === 1 && li.list[0].id === i3.id && liRaw.every((x) => !("token_hash" in x) && !("token" in x)), JSON.stringify(li.list.length));
const ad = await Inv.listAdults(A.c, fA);
check("17 list_family_adults: E-Mail, Rolle, self-Flag", ad.ok && ad.list.length === 2 && ad.list.some((x) => x.isSelf && x.role === "owner") && ad.list.some((x) => !x.isSelf && x.role === "parent" && x.email === B.email));
check("18 Nicht-Mitglied: keine Listen", !(await Inv.listAdults(X.c, fA)).ok && !(await Inv.listInvitations(X.c, fA)).ok);

// Direkter Zugriff
let q = await X.c.from("family_members").insert({ family_id: fA, user_id: X.id, role: "parent" });
check("19 direktes INSERT in family_members → abgelehnt", !!q.error);
q = await B.c.from("family_members").insert({ family_id: fA, user_id: C.id, role: "parent" });
check("20 auch Mitglied kann niemanden direkt eintragen", !!q.error);
q = await A.c.from("family_members").delete().eq("family_id", fA).eq("user_id", B.id).select("user_id");
check("21 direktes DELETE in family_members wirkt nicht (nur RPC)", (q.data || []).length === 0 && (await roleOf(B, fA)) === "parent");
q = await A.c.from("family_members").update({ role: "owner" }).eq("family_id", fA).eq("user_id", B.id).select("user_id");
check("22 direktes UPDATE der Rolle wirkt nicht", (q.data || []).length === 0 && (await roleOf(B, fA)) === "parent");
q = await A.c.schema("private").from("family_invitations").select("*");
check("23 private.family_invitations per API nicht lesbar", !!q.error || (q.data || []).length === 0);

// user_membership_sync
const ms = await B.c.from("user_membership_sync").select("user_id, version");
check("24 user_membership_sync: nur eigene Zeile lesbar", !ms.error && ms.data.length === 1 && ms.data[0].user_id === B.id);
q = await B.c.from("user_membership_sync").update({ version: 0 }).eq("user_id", B.id).select("user_id");
const q2 = await B.c.from("user_membership_sync").insert({ user_id: C.id });
check("25 user_membership_sync: Clients können nicht schreiben", ((q.data || []).length === 0 || !!q.error) && !!q2.error);

// ---------------- Parallel accept ----------------
const P = await Promise.all([1, 2, 3, 4, 5].map((n) => user("race" + n)));
const iR = await Inv.createInvitation(A.c, fA);
const res = await Promise.all(P.map((u) => Inv.acceptInvitation(u.c, iR.token)));
const joined = res.filter((x) => x.ok && x.status === "joined").length;
check("26 paralleles accept (5 Nutzer) → genau einer tritt bei", joined === 1 && res.filter((x) => !x.ok && x.error === GENERIC).length === 4, JSON.stringify(res.map((x) => x.status || x.code)));
const fam = (await Inv.listAdults(A.c, fA)).list.length;
check("27 Familie hat danach genau ein zusätzliches Elternkonto", fam === 3, String(fam));

// ---------------- Anti-Abuse ----------------
const fL = await onboard(C, "Limits");
const made = [];
for (let n = 0; n < 11; n++) made.push(await Inv.createInvitation(C.c, fL));
check("28 max. 10 aktive Einladungen je Familie", made.slice(0, 10).every((x) => x.ok) && !made[10].ok && /10 aktive/.test(made[10].error), made[10].error);
for (const m of made.slice(0, 10)) await Inv.revokeInvitation(C.c, m.id);
const more = [];
for (let n = 0; n < 10; n++) more.push(await Inv.createInvitation(C.c, fL));
for (const m of more.slice(0, 9)) await Inv.revokeInvitation(C.c, m.id); // nur 1 aktiv → Aktiv-Limit greift nicht
// C hat in dieser Stunde 10 + 10 = 20 erzeugt → die 21. scheitert am Stundenlimit
const extra = await Inv.createInvitation(C.c, fL);
check("29 max. 20 neue Einladungen je Nutzer und Stunde", more.every((x) => x.ok) && !extra.ok && /Zu viele neue Einladungen/.test(extra.error), extra.error);
more[0] = more[9]; // aktive Einladung für die folgenden Prüfungen
const RL = await user("ratelimit");
const bad = [];
for (let n = 0; n < 20; n++) bad.push(await Inv.inspectInvitation(RL.c, randomUUID().replace(/-/g, "")));
const validButBlocked = await Inv.inspectInvitation(RL.c, more[0].token);
check("30 20 ungültige Versuche → danach gesperrt (auch gültiger Token), eigene Meldung", bad.every((x) => x.error === GENERIC) && !validButBlocked.ok && validButBlocked.code === "rate_limited");
check("31 Rate-Limit gilt nur für diesen Nutzer", (await Inv.inspectInvitation(X.c, more[0].token)).ok);

// ---------------- Rollen ----------------
check("32 parent kann nicht befördern", !(await Inv.promoteParent(B.c, fA, P.find(Boolean).id)).ok);
check("33 owner befördert parent → owner", (await Inv.promoteParent(A.c, fA, B.id)).ok && (await roleOf(B, fA)) === "owner");
check("34 kein Downgrade/Entfernen eines owner", !(await Inv.removeParent(A.c, fA, B.id)).ok && (await roleOf(B, fA)) === "owner");

// ---------------- Parent entfernen ----------------
const racer = P[res.findIndex((x) => x.ok && x.status === "joined")];
const rInv = await Inv.createInvitation(racer.c, fA);
let sig = 0; const st = [];
const rt = createMembershipRealtime({ client: racer.c, userId: racer.id, onChange: (e) => { if (e === "change") sig++; }, onStatus: (s) => st.push(s) });
for (let n = 0; n < 40 && !st.includes("connected"); n++) await sleep(250);
await sleep(1500);
check("35 parent kann niemanden entfernen", !(await Inv.removeParent(racer.c, fA, A.id)).ok);
check("36 owner kann sich nicht selbst entfernen", !(await Inv.removeParent(A.c, fA, A.id)).ok);
r = await Inv.removeParent(A.c, fA, racer.id);
check("37 owner entfernt parent", r.ok);
check("38 entfernter parent: kein Zugriff mehr", !(await canRead(racer, fA)) && (await roleOf(racer, fA)) === null);
check("39 Einladungen des Entfernten widerrufen", !(await Inv.inspectInvitation(X.c, rInv.token)).ok);
await sleep(3000);
check("40 Membership-Realtime: Entfernter erhält Signal", sig > 0, `status=${st.join(",")} sig=${sig}`);
rt.stop();

// ---------------- Familie verlassen ----------------
// a) parent verlässt
const L1 = await user("l1"), L2 = await user("l2"), L3 = await user("l3");
const fV = await onboard(L1, "Verlassen");
await join(L1, fV, L2); await sleep(20); await join(L1, fV, L3);
const l2Inv = await Inv.createInvitation(L2.c, fV);
r = await Inv.leaveFamily(L2.c, fV);
check("41 parent verlässt Familie", r.ok && !r.ownershipTransferred && (await roleOf(L2, fV)) === null);
check("42 Einladungen des Austretenden widerrufen", !(await Inv.inspectInvitation(X.c, l2Inv.token)).ok);
// b) Nicht-Mitglied
check("43 Nicht-Mitglied kann nicht austreten", !(await Inv.leaveFamily(L2.c, fV)).ok);
// c) owner mit weiterem owner
await Inv.promoteParent(L1.c, fV, L3.id);
r = await Inv.leaveFamily(L1.c, fV);
check("44 owner verlässt bei weiterem owner (keine Übergabe nötig)", r.ok && !r.ownershipTransferred && (await roleOf(L3, fV)) === "owner");
// d) letzter owner mit parent → ältester parent wird owner
await join(L3, fV, L2); await sleep(20);
const L4 = await user("l4"); await join(L3, fV, L4);
r = await Inv.leaveFamily(L3.c, fV);
check("45 letzter owner verlässt → ältester parent wird owner", r.ok && r.ownershipTransferred && (await roleOf(L2, fV)) === "owner" && (await roleOf(L4, fV)) === "parent");
// e) letztes Elternkonto blockiert
await Inv.removeParent(L2.c, fV, L4.id);
r = await Inv.leaveFamily(L2.c, fV);
check("46 letztes Elternkonto kann nicht austreten (Hinweis Gefahrenzone)", !r.ok && /letzte Elternkonto dieser Familie\. Lösche die Familie stattdessen über die Gefahrenzone\./.test(r.error) && (await canRead(L2, fV)));
// f) Wiederbeitritt über neue Einladung
check("47 Wiederbeitritt nach Austritt über neue Einladung", await join(L2, fV, L1) && (await roleOf(L1, fV)) === "parent");
// g) paralleles Verlassen: zwei Erwachsene gleichzeitig → genau einer darf gehen
const pl = await Promise.all([Inv.leaveFamily(L1.c, fV), Inv.leaveFamily(L2.c, fV)]);
const okN = pl.filter((x) => x.ok).length;
check("48 paralleles Verlassen: genau einer erfolgreich, Familie behält ein Elternkonto (owner)", okN === 1 && pl.some((x) => !x.ok && /letzte Elternkonto/.test(x.error)), JSON.stringify(pl.map((x) => x.ok)));
const stay = pl[0].ok ? L2 : L1;
check("49 verbleibendes Konto ist owner und hat Zugriff", (await roleOf(stay, fV)) === "owner" && (await canRead(stay, fV)) && (await memberCount(stay, fV)) === 1);

const failed = R.filter((x) => !x.ok);
for (const x of R) console.log(`${x.ok ? "✅" : "❌"} ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
console.log(`\n${R.length - failed.length}/${R.length} bestanden`);
process.exit(failed.length ? 1 : 0);
