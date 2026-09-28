// Unit-Tests Phase 5D: Einladungs-Token, Link, sessionStorage-Übergabe, RPC-Wrapper, Membership-Realtime.
// Ausführen:  node --test tests/familyInvitations.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Inv from "../src/lib/familyInvitations.js";
import { createMembershipRealtime, createFamilyRealtime } from "../src/lib/familyRealtime.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = "0123456789abcdef0123456789abcdef"; // Beispielwert, kein echter Token
const loc = (href) => { const u = new URL(href); return { href, origin: u.origin, hostname: u.hostname, hash: u.hash, search: u.search, pathname: u.pathname }; };

function fakeWindow(href) {
  const store = new Map();
  const win = {
    location: { href },
    history: { state: null, replaceState(_s, _t, url) { win.location.href = new URL(url, win.location.href).href; win.replaced = url; } },
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    localStorage: { setItem() { throw new Error("localStorage darf nicht verwendet werden"); } },
  };
  return { win, store };
}

test("Token normalisieren: Groß/klein, Bindestriche, Leerzeichen; sonst ungültig", () => {
  assert.equal(Inv.normalizeInviteToken(T), T);
  assert.equal(Inv.normalizeInviteToken(T.toUpperCase()), T);
  assert.equal(Inv.normalizeInviteToken(Inv.formatInviteCode(T)), T);
  assert.equal(Inv.normalizeInviteToken(" 0123 4567-89AB cdef 0123-4567 89ab-cdef "), T);
  assert.equal(Inv.normalizeInviteToken(T.slice(0, 31)), null);
  assert.equal(Inv.normalizeInviteToken(T + "0"), null);
  assert.equal(Inv.normalizeInviteToken("g" + T.slice(1)), null);
  assert.equal(Inv.normalizeInviteToken(""), null);
  assert.equal(Inv.normalizeInviteToken(null), null);
  assert.equal(Inv.normalizeInviteToken("a".repeat(500)), null);
  assert.equal(Inv.formatInviteCode(T), "0123-4567-89AB-CDEF-0123-4567-89AB-CDEF");
});

test("Einladungslink: VITE_INVITE_BASE_URL oder aktuelle Herkunft; nativ nur mit Konfiguration", () => {
  assert.equal(Inv.buildInviteLink(T, { location: loc("http://localhost:5173/x?y=1"), isNative: false }), `http://localhost:5173/?invite=${T}`);
  assert.equal(Inv.buildInviteLink(T, { env: { VITE_INVITE_BASE_URL: "https://app.example.de/" }, location: loc("http://localhost:5173/"), isNative: false }), `https://app.example.de/?invite=${T}`);
  assert.equal(Inv.buildInviteLink(T, { location: loc("capacitor://localhost/"), isNative: true }), null);
  assert.equal(Inv.buildInviteLink(T, { env: { VITE_INVITE_BASE_URL: "https://app.example.de" }, location: loc("capacitor://localhost/"), isNative: true }), `https://app.example.de/?invite=${T}`);
  assert.equal(Inv.buildInviteLink(T, { env: { VITE_INVITE_BASE_URL: "javascript:alert(1)" }, location: loc("http://localhost:5173/"), isNative: false }), `http://localhost:5173/?invite=${T}`);
  assert.equal(Inv.buildInviteLink("kaputt", { location: loc("http://localhost:5173/"), isNative: false }), null);
  // Registrierung aus Einladung: Bestätigungslink führt zur Einladung zurück
  assert.equal(Inv.getInviteSignupRedirect(T, { location: loc("http://localhost:5173/"), isNative: false }), `http://localhost:5173/?invite=${T}`);
});

test("Start mit ?invite=: sessionStorage, URL bereinigt, localStorage unberührt", () => {
  const { win, store } = fakeWindow(`http://localhost:5173/?invite=${T.toUpperCase()}&x=1#h`);
  const r = Inv.capturePendingInvite(win);
  assert.equal(r.token, T);
  assert.equal(r.invalidParam, false);
  assert.equal(store.get(Inv.PENDING_INVITE_KEY), T);
  assert.equal(win.replaced, "/?x=1#h");
  assert.ok(!win.location.href.includes("invite="));
  // erneuter Start (Reload im selben Tab): Token weiter vorhanden
  assert.equal(Inv.capturePendingInvite(win).token, T);
  Inv.clearPendingInvite(win);
  assert.equal(Inv.getPendingInvite(win), null);
});

test("Start mit ungültigem ?invite=: nichts gespeichert, Parameter entfernt, Hinweis-Flag", () => {
  const { win, store } = fakeWindow("http://localhost:5173/?invite=abc");
  const r = Inv.capturePendingInvite(win);
  assert.equal(r.token, null);
  assert.equal(r.invalidParam, true);
  assert.equal(store.size, 0);
  assert.equal(win.replaced, "/");
});

test("Start ohne Parameter: keine URL-Änderung", () => {
  const { win } = fakeWindow("http://localhost:5173/");
  assert.deepEqual(Inv.capturePendingInvite(win), { token: null, invalidParam: false });
  assert.equal(win.replaced, undefined);
});

function rpcClient(responses) {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); const r = responses[name]; return typeof r === "function" ? r(args) : r; } };
}

test("inspect/accept: generische Meldung bei ungültig; Rate-Limit; ungültiges Format ohne Serveraufruf", async () => {
  const c = rpcClient({
    inspect_family_invitation: { data: { ok: false, error: "invalid" }, error: null },
    accept_family_invitation: { data: { ok: false, error: "rate_limited" }, error: null },
  });
  const a = await Inv.inspectInvitation(c, T);
  assert.deepEqual([a.ok, a.error], [false, "Diese Einladung ist ungültig oder nicht mehr verfügbar."]);
  const b = await Inv.acceptInvitation(c, T);
  assert.equal(b.code, "rate_limited");
  assert.equal(b.error, Inv.RATE_LIMIT_MESSAGE);
  const n = c.calls.length;
  assert.equal((await Inv.inspectInvitation(c, "xyz")).error, Inv.INVALID_INVITE_MESSAGE);
  assert.equal(c.calls.length, n);
  // Token wird normalisiert übertragen
  await Inv.acceptInvitation(c, Inv.formatInviteCode(T));
  assert.equal(c.calls.at(-1).args.p_token, T);
});

test("inspect/accept: Erfolg und bereits Mitglied", async () => {
  const c = rpcClient({
    inspect_family_invitation: { data: { ok: true, family_id: "f1", family_name: "Familie X", expires_at: "2026-10-05T00:00:00Z", role: "parent", already_member: false }, error: null },
    accept_family_invitation: { data: { ok: true, status: "already_member", family_id: "f1", family_name: "Familie X" }, error: null },
  });
  const i = await Inv.inspectInvitation(c, T);
  assert.deepEqual([i.ok, i.familyName, i.alreadyMember], [true, "Familie X", false]);
  const a = await Inv.acceptInvitation(c, T);
  assert.deepEqual([a.ok, a.status, a.familyId], [true, "already_member", "f1"]);
});

test("Verwaltungs-RPCs: deutsche Servermeldungen durchreichen, technische Fehler neutral", async () => {
  const c = rpcClient({
    leave_family: { data: null, error: { message: "Du bist das letzte Elternkonto dieser Familie. Lösche die Familie stattdessen über die Gefahrenzone." } },
    remove_family_parent: { data: null, error: { message: "permission denied for function x" } },
    create_family_invitation: { data: { id: "i1", token: T, expires_at: "2026-10-05T00:00:00Z" }, error: null },
    list_family_invitations: { data: [{ id: "i1", created_at: "x", expires_at: "y", created_by_email: "e", created_by_self: true }], error: null },
  });
  assert.match((await Inv.leaveFamily(c, "f")).error, /letzte Elternkonto/);
  assert.equal((await Inv.removeParent(c, "f", "u")).error, "Das Elternkonto konnte nicht entfernt werden.");
  const cr = await Inv.createInvitation(c, "f");
  assert.deepEqual([cr.ok, cr.token], [true, T]);
  const l = await Inv.listInvitations(c, "f");
  assert.equal(l.list[0].createdBySelf, true);
  assert.ok(!("token_hash" in l.list[0]) && !("tokenHash" in l.list[0]));
});

test("Teilen: Web Share API, sonst Zwischenablage; Abbruch ist kein Fehler", async () => {
  let shared = null, copied = null;
  assert.deepEqual(await Inv.shareInvite({ link: "L", familyName: "F" }, { share: async (d) => { shared = d; } }), { ok: true, via: "share" });
  assert.equal(shared.url, "L");
  assert.equal((await Inv.shareInvite({ link: "L" }, { share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } })).aborted, true);
  assert.deepEqual(await Inv.shareInvite({ link: "L" }, { clipboard: { writeText: async (t) => { copied = t; } } }), { ok: true, via: "clipboard" });
  assert.equal(copied, "L");
  assert.equal((await Inv.copyText("L", {})).ok, false);
});

function fakeRtClient() {
  const channels = [];
  return {
    channels,
    channel(name) {
      const ch = { name, handlers: [], on(_t, cfg, cb) { ch.cfg = cfg; ch.handlers.push(cb); return ch; }, subscribe(cb) { ch.statusCb = cb; return ch; } };
      channels.push(ch); return ch;
    },
    removeChannel() {},
  };
}

test("Membership-Realtime: Tabelle user_membership_sync, Filter auf eigene user_id", () => {
  const c = fakeRtClient(); const ev = [];
  const rt = createMembershipRealtime({ client: c, userId: "u-1", onChange: (e) => ev.push(e) });
  const ch = c.channels[0];
  assert.equal(ch.cfg.table, "user_membership_sync");
  assert.equal(ch.cfg.filter, "user_id=eq.u-1");
  assert.ok(ch.name.startsWith("user-membership-sync:u-1:"));
  ch.statusCb("SUBSCRIBED");
  ch.handlers[0]({ new: { user_id: "u-1" } });
  ch.handlers[0]({ new: { user_id: "u-2" } }); // fremde Zeile → ignoriert
  assert.deepEqual(ev, ["subscribed", "change"]);
  rt.stop();
  // Familien-Realtime unverändert
  const c2 = fakeRtClient();
  createFamilyRealtime({ client: c2, familyId: "f-1", onChange() {} }).stop();
  assert.equal(c2.channels[0].cfg.table, "family_sync");
  assert.equal(c2.channels[0].cfg.filter, "family_id=eq.f-1");
  assert.ok(c2.channels[0].name.startsWith("family-sync:f-1:"));
});

test("Statisch: sessionStorage statt localStorage, kein Token-Logging, Migration schützt Token", () => {
  const lib = fs.readFileSync(path.join(ROOT, "src/lib/familyInvitations.js"), "utf8");
  const code = lib.replace(/\/\/.*$/gm, "");
  assert.ok(!/localStorage/.test(code), "Einladungs-Token darf nicht in localStorage landen");
  assert.ok(/sessionStorage/.test(code));
  for (const f of ["src/lib/familyInvitations.js", "src/family/InviteScreen.jsx", "src/family/FamilyAdultsPanel.jsx", "src/family/FamilyApp.jsx"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/console\.(log|info|warn|error|debug)/.test(s), `${f}: kein console-Logging`);
  }
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260929300000_family_invitations.sql"), "utf8");
  assert.match(sql, /token_hash\s+text not null unique/);
  assert.ok(!/\btoken\s+text\b/.test(sql.replace(/p_token text|v_token text/g, "")), "kein Klartext-Token-Spalte");
  assert.match(sql, /gen_random_bytes\(16\)/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /drop policy if exists family_members_delete/);
  assert.match(sql, /drop function if exists public\.test_add_family_member/);
  assert.ok(!fs.existsSync(path.join(ROOT, "supabase/test-support/add_family_member.sql")), "Test-Hintertür-Datei entfernt");
});
