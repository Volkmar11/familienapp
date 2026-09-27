// Unit-Tests für Backend-Modus, FAMILY-Konfiguration und Auth-Hilfsfunktionen.
// Ausführen:  node --test tests/backendConfig.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBackendMode, getFamilyConfig, getLegacyConfig, BACKEND_MODES, BackendConfigError } from "../src/config/backend.js";
import { toGermanAuthError, MIN_PASSWORD_LENGTH } from "../src/lib/auth.js";
import { classifyMemberships } from "../src/lib/familyMembership.js";

const FAM = { VITE_FAMILY_SUPABASE_URL: "https://testref.supabase.co", VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" };

test("Modus fehlt → legacy", () => {
  assert.equal(resolveBackendMode({}), BACKEND_MODES.LEGACY);
  assert.equal(resolveBackendMode({ VITE_BACKEND_MODE: "" }), "legacy");
  assert.equal(resolveBackendMode({ VITE_BACKEND_MODE: "   " }), "legacy");
  assert.equal(resolveBackendMode(), "legacy");
});

test("legacy / family werden erkannt (Groß-/Kleinschreibung egal)", () => {
  assert.equal(resolveBackendMode({ VITE_BACKEND_MODE: "legacy" }), "legacy");
  assert.equal(resolveBackendMode({ VITE_BACKEND_MODE: "family" }), "family");
  assert.equal(resolveBackendMode({ VITE_BACKEND_MODE: " Family " }), "family");
});

test("ungültiger Modus → Fehler, kein stilles Umschalten", () => {
  assert.throws(() => resolveBackendMode({ VITE_BACKEND_MODE: "prod" }), BackendConfigError);
  assert.throws(() => resolveBackendMode({ VITE_BACKEND_MODE: "families" }), /Ungültiger Wert/);
});

test("FAMILY ohne Env → verständlicher Konfigurationsfehler", () => {
  assert.throws(() => getFamilyConfig({}), /es fehlen: VITE_FAMILY_SUPABASE_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY/);
  assert.throws(() => getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: "https://x.supabase.co" }), /VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY/);
});

test("FAMILY gültig", () => {
  assert.deepEqual(getFamilyConfig(FAM), { url: "https://testref.supabase.co", key: "sb_publishable_x" });
});

test("FAMILY darf nicht auf das Legacy-/Produktionsprojekt zeigen", () => {
  assert.throws(() => getFamilyConfig({ ...FAM, VITE_SUPABASE_URL: "https://TESTREF.supabase.co/" }), /dasselbe Projekt/);
  assert.doesNotThrow(() => getFamilyConfig({ ...FAM, VITE_SUPABASE_URL: "https://prodref.supabase.co" }));
});

test("FAMILY lehnt Secret-/service_role-Keys und ungültige URLs ab", () => {
  assert.throws(() => getFamilyConfig({ ...FAM, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" }), /Secret/);
  assert.throws(() => getFamilyConfig({ ...FAM, VITE_FAMILY_SUPABASE_URL: "testref.supabase.co" }), /keine gültige Projekt-URL/);
});

test("Legacy-Konfiguration liest die bisherigen Variablen", () => {
  assert.deepEqual(getLegacyConfig({ VITE_SUPABASE_URL: "https://p.supabase.co", VITE_SUPABASE_ANON_KEY: "k" }), { url: "https://p.supabase.co", key: "k" });
});

test("Deutsche Auth-Fehlertexte", () => {
  assert.equal(toGermanAuthError({ message: "Invalid login credentials", code: "invalid_credentials" }), "E-Mail-Adresse oder Passwort ist falsch.");
  assert.match(toGermanAuthError({ message: "User already registered", code: "user_already_exists" }), /bereits ein Konto/);
  assert.match(toGermanAuthError({ message: "Password should be at least 6 characters.", code: "weak_password" }), /mindestens 6/);
  assert.match(toGermanAuthError({ message: "Email rate limit exceeded", code: "over_email_send_rate_limit" }), /Zu viele Versuche/);
  assert.match(toGermanAuthError({ message: "Failed to fetch" }), /Keine Verbindung/);
  assert.match(toGermanAuthError({ message: "irgendwas" }), /nicht geklappt/);
  assert.equal(MIN_PASSWORD_LENGTH, 6);
});

test("Mitgliedschaften klassifizieren", () => {
  assert.equal(classifyMemberships([]), "none");
  assert.equal(classifyMemberships(null), "none");
  assert.equal(classifyMemberships([{ familyId: "a" }]), "single");
  assert.equal(classifyMemberships([{ familyId: "a" }, { familyId: "b" }]), "multiple");
});
