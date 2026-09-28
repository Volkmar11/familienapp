// Unit-Tests Phase 5C: Auth-Redirects, Re-Authentifizierung, Passwort ändern, Account/Familie löschen (Client).
// Ausführen:  node --test tests/accountLifecycle.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectAuthEnvironment, getAuthRedirectUrl, readAuthRedirectError, isRecoveryRedirect } from "../src/lib/authRedirects.js";
import { changePassword, deleteAccount, deleteFamily, reauthenticate, validateNewPassword, phraseMatches,
  DELETE_ACCOUNT_PHRASE, DELETE_FAMILY_PHRASE, LIFECYCLE_MESSAGES } from "../src/lib/accountLifecycle.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loc = (href) => { const u = new URL(href); return { href, origin: u.origin, hostname: u.hostname, hash: u.hash, search: u.search }; };

test("Umgebung erkennen: localhost, Vercel-Preview, Produktion, native", () => {
  assert.equal(detectAuthEnvironment({ location: loc("http://localhost:5173/"), isNative: false }), "localhost");
  assert.equal(detectAuthEnvironment({ location: loc("http://127.0.0.1:4650/"), isNative: false }), "localhost");
  assert.equal(detectAuthEnvironment({ location: loc("https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app/"), isNative: false }), "vercel-preview");
  assert.equal(detectAuthEnvironment({ location: loc("https://example-family.app/"), isNative: false }), "production-web");
  assert.equal(detectAuthEnvironment({ location: loc("http://localhost/"), isNative: true }), "native");
  assert.equal(detectAuthEnvironment({ location: loc("https://evil-volkmar11s-projects.vercel.app.attacker.com/"), isNative: false }), "production-web");
});

test("Redirect-URL: Web = eigene Origin, Produktion per Konfiguration, native nur wenn konfiguriert", () => {
  assert.equal(getAuthRedirectUrl("recovery", { location: loc("http://localhost:5173/app?x=1"), isNative: false }), "http://localhost:5173/");
  assert.equal(getAuthRedirectUrl("recovery", { location: loc("https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app/x"), isNative: false }),
    "https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app/");
  assert.equal(getAuthRedirectUrl("recovery", { env: { VITE_AUTH_REDIRECT_URL: "https://app.example.de/" }, location: loc("https://www.example.de/"), isNative: false }), "https://app.example.de/");
  assert.equal(getAuthRedirectUrl("recovery", { location: loc("capacitor://localhost/"), isNative: true }), null); // noch nicht festgelegt
  assert.equal(getAuthRedirectUrl("recovery", { env: { VITE_NATIVE_AUTH_REDIRECT_URL: "wochenchampion://auth" }, location: loc("capacitor://localhost/"), isNative: true }), "wochenchampion://auth");
});

test("Redirect-Fehler und Recovery-Erkennung", () => {
  assert.match(readAuthRedirectError(loc("http://localhost/#error=access_denied&error_code=otp_expired&error_description=x")), /abgelaufen/);
  assert.match(readAuthRedirectError(loc("http://localhost/?error=invalid_request")), /ungültig/);
  assert.equal(readAuthRedirectError(loc("http://localhost/")), "");
  assert.equal(isRecoveryRedirect(loc("http://localhost/#access_token=x&type=recovery")), true);
  assert.equal(isRecoveryRedirect(loc("http://localhost/#access_token=x&type=signup")), false);
});

// Simulierter Supabase-Client
function fakeClient({ email = "eltern@example.com", uid = "u1", signInError = null, signInUid = "u1", invoke = { data: { ok: true }, error: null }, updateError = null } = {}) {
  const log = [];
  return {
    log,
    auth: {
      getSession: async () => ({ data: { session: email ? { user: { id: uid, email } } : null } }),
      signInWithPassword: async (a) => { log.push(["signIn", a.email, a.password ? "***" : ""]); return signInError ? { error: signInError } : { data: { user: { id: signInUid } } }; },
      updateUser: async (a) => { log.push(["updateUser", Object.keys(a)]); return { error: updateError }; },
      signOut: async (o) => { log.push(["signOut", o?.scope]); return { error: null }; },
    },
    functions: { invoke: async (name, opts) => { log.push(["invoke", name, JSON.stringify(opts.body)]); return typeof invoke === "function" ? invoke(name, opts) : invoke; } },
  };
}

test("Bestätigungstexte und Passwortregeln", () => {
  assert.equal(phraseMatches(" löschen ", DELETE_ACCOUNT_PHRASE), true);
  assert.equal(phraseMatches("LOESCHEN", DELETE_ACCOUNT_PHRASE), false);
  assert.equal(phraseMatches("familie löschen", DELETE_FAMILY_PHRASE), true);
  assert.match(validateNewPassword("123", "123"), /mindestens/);
  assert.match(validateNewPassword("abcdefg", "abcdefg"), /mindestens 8/); // Phase 6B1: 7 Zeichen reichen nicht
  assert.match(validateNewPassword("abcdefgh", "abcdefgx"), /stimmen nicht/);
  assert.equal(validateNewPassword("abcdefgh", "abcdefgh"), "");
});

test("Re-Auth nutzt ausschließlich die E-Mail der aktuellen Sitzung", async () => {
  const c = fakeClient();
  assert.equal((await reauthenticate(c, "geheim")).ok, true);
  assert.deepEqual(c.log[0], ["signIn", "eltern@example.com", "***"]);
  assert.equal((await reauthenticate(fakeClient({ signInError: { message: "Invalid login credentials" } }), "x")).message, LIFECYCLE_MESSAGES.wrongPassword);
  assert.equal((await reauthenticate(fakeClient({ signInUid: "anderer" }), "x")).ok, false);
  assert.equal((await reauthenticate(fakeClient({ email: null }), "x")).ok, false);
});

test("Passwort ändern: aktuelles Passwort prüfen, dann updateUser", async () => {
  const c = fakeClient();
  assert.equal((await changePassword(c, { currentPassword: "alt123", newPassword: "neu45678", newPassword2: "neu45678" })).ok, true);
  assert.deepEqual(c.log.map((l) => l[0]), ["signIn", "updateUser"]);
  const w = fakeClient({ signInError: { message: "Invalid login credentials" } });
  assert.equal((await changePassword(w, { currentPassword: "falsch", newPassword: "neu45678", newPassword2: "neu45678" })).ok, false);
  assert.ok(!w.log.some((l) => l[0] === "updateUser"));
  assert.equal((await changePassword(fakeClient(), { currentPassword: "gleich12", newPassword: "gleich12", newPassword2: "gleich12" })).message, LIFECYCLE_MESSAGES.samePassword);
});

test("Account löschen: Bestätigung → Re-Auth → Edge Function ohne Passwort/user_id → lokale Abmeldung", async () => {
  const c = fakeClient();
  const r = await deleteAccount(c, { password: "geheim", phrase: "LÖSCHEN" });
  assert.equal(r.ok, true);
  assert.deepEqual(c.log.map((l) => l[0]), ["signIn", "invoke", "signOut"]);
  assert.deepEqual(c.log[1], ["invoke", "delete-account", "{}"]);
  assert.ok(!c.log[1][2].includes("geheim") && !c.log[1][2].includes("user"));
  assert.deepEqual(c.log[2], ["signOut", "local"]);
  // ohne Bestätigungstext / falsches Passwort → keine Edge Function
  const p = fakeClient(); assert.equal((await deleteAccount(p, { password: "geheim", phrase: "ja" })).reason, "phrase"); assert.equal(p.log.length, 0);
  const w = fakeClient({ signInError: { message: "Invalid login credentials" } });
  assert.equal((await deleteAccount(w, { password: "x", phrase: "LÖSCHEN" })).reason, "password");
  assert.ok(!w.log.some((l) => l[0] === "invoke"));
});

test("Fehler der Edge Function: verständlich, keine Abmeldung, keine falsche Erfolgsmeldung", async () => {
  const ctx = (reason, status) => ({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: { status, json: async () => ({ ok: false, reason }) } } });
  for (const [reason, msg] of [["reauth_required", LIFECYCLE_MESSAGES.reauth], ["server", LIFECYCLE_MESSAGES.server], ["forbidden", LIFECYCLE_MESSAGES.forbidden]]) {
    const c = fakeClient({ invoke: ctx(reason, reason === "server" ? 500 : 401) });
    const r = await deleteAccount(c, { password: "geheim", phrase: "LÖSCHEN" });
    assert.equal(r.ok, false); assert.equal(r.message, msg);
    assert.ok(!c.log.some((l) => l[0] === "signOut"));
  }
  const n = fakeClient({ invoke: () => { throw new TypeError("Failed to fetch"); } });
  assert.equal((await deleteAccount(n, { password: "geheim", phrase: "LÖSCHEN" })).reason, "network");
});

test("Familie löschen: Bestätigung, PIN-Format, Re-Auth, Body nur familyId + PIN", async () => {
  const c = fakeClient();
  const r = await deleteFamily(c, { familyId: "f-1", password: "geheim", pin: "4827", phrase: "FAMILIE LÖSCHEN" });
  assert.equal(r.ok, true);
  assert.deepEqual(c.log[1], ["invoke", "delete-family", JSON.stringify({ familyId: "f-1", pin: "4827" })]);
  assert.ok(!c.log.some((l) => l[0] === "signOut")); // Konto bleibt angemeldet
  assert.equal((await deleteFamily(fakeClient(), { familyId: "f-1", password: "x", pin: "12", phrase: "FAMILIE LÖSCHEN" })).reason, "pin");
  assert.equal((await deleteFamily(fakeClient(), { familyId: "f-1", password: "x", pin: "1234", phrase: "LÖSCHEN" })).reason, "phrase");
});

test("Statisch: kein privilegierter Schlüssel im Client, Redirects zentral, Account-Bereich erreichbar", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const src = walk(path.join(ROOT, "src")).filter((f) => /\.(js|jsx)$/.test(f));
  for (const f of src) {
    const t = fs.readFileSync(f, "utf8");
    // backend.js enthält nur die Schutzregel, die solche Schlüssel ABLEHNT
    if (!f.endsWith(`config${path.sep}backend.js`)) assert.doesNotMatch(t, /service_role|SERVICE_ROLE|sb_secret_|SUPABASE_SECRET/i, f);
    if (!f.endsWith("authRedirects.js") && !f.includes(`${path.sep}legacy${path.sep}`)) assert.doesNotMatch(t, /location\.origin/, f);
  }
  assert.match(fs.readFileSync(path.join(ROOT, "src/config/backend.js"), "utf8"), /darf niemals ein Secret- oder service_role-Key sein/);
  const fam = fs.readFileSync(path.join(ROOT, "src/family/FamilyChampion.jsx"), "utf8");
  assert.match(fam, /Konto & Sicherheit/);
  assert.match(fam, /role === "owner"/);
  // .env.example: nur Kommentare dürfen Secrets erwähnen, keine Zuweisung
  const envLines = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8").split("\n").filter((l) => !l.trim().startsWith("#"));
  assert.ok(!envLines.some((l) => /service_role|SERVICE_ROLE|sb_secret_|SECRET_KEY/i.test(l)));
  const fn = fs.readFileSync(path.join(ROOT, "supabase/functions/_shared/lifecycle.ts"), "utf8");
  assert.match(fn, /auth\.getUser\(token\)/);          // serverseitige Verifikation
  assert.match(fn, /REAUTH_MAX_AGE_SECONDS = 300/);     // Frische-Prüfung
  const del = fs.readFileSync(path.join(ROOT, "supabase/functions/delete-account/index.ts"), "utf8");
  assert.match(del, /const userId = auth\.user\.id;/);  // Ziel nur aus verifiziertem JWT
  assert.doesNotMatch(del, /req\.json\(\)/);            // Body wird nicht gelesen
});
