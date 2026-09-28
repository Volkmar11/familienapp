// Phase 7A – Capacitor/iOS: nativer Lebenszyklus, Start-/Build-Schutz, Projektidentität.
// Rein lokal (kein Netzwerk, keine Secrets).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onAppForeground } from "../src/lib/appLifecycle.js";
import { subscribeNativeAppState } from "../src/lib/nativeAppState.js";
import { createReloadScheduler } from "../src/lib/reloadScheduler.js";
import { checkNativeRuntime, NATIVE_TEST_PROJECT_REF, NATIVE_APP_ID, NATIVE_APP_NAME } from "../src/config/nativeTarget.js";
import { validateIosTestEnv, scanNativeWebBundle, isValidNativeMarker, PRODUCTION_PROJECT_REF } from "../scripts/lib/iosTestGuard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEST_URL = `https://${NATIVE_TEST_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

// ---------------------------------------------------------------- Lebenszyklus (nativ + Web)
function fakeEnv() {
  const listeners = {};
  const mk = () => ({ addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); } });
  const doc = { ...mk(), visibilityState: "visible" };
  const win = mk();
  let nativeHandler = null;
  const native = { subscribed: 0, unsubscribed: 0 };
  const subscribeNative = (h) => { native.subscribed++; nativeHandler = h; return () => { native.unsubscribed++; nativeHandler = null; }; };
  return {
    doc, win, native, subscribeNative,
    fire: (t) => (listeners[t] || []).forEach((f) => f()),
    appState: (isActive) => nativeHandler?.({ isActive }),
    count: (t) => (listeners[t] || []).length,
  };
}

test("7A Lebenszyklus: appStateChange(active) + visibilitychange + focus → genau EIN Vordergrund-Zyklus", () => {
  const env = fakeEnv(); let t = 0; const calls = [];
  const off = onAppForeground((s) => calls.push(s), { doc: env.doc, win: env.win, now: () => t, subscribeNative: env.subscribeNative });
  env.appState(true); t = 5; env.fire("visibilitychange"); t = 12; env.fire("focus"); env.fire("online");
  assert.deepEqual(calls, ["native"]);
  off();
});

test("7A Lebenszyklus: umgekehrte Reihenfolge (WebView zuerst) → ebenfalls genau einer", () => {
  const env = fakeEnv(); let t = 0; const calls = [];
  onAppForeground((s) => calls.push(s), { doc: env.doc, win: env.win, now: () => t, subscribeNative: env.subscribeNative });
  env.fire("visibilitychange"); t = 3; env.appState(true); t = 9; env.fire("focus");
  assert.deepEqual(calls, ["visibility"]);
});

test("7A Lebenszyklus: natives Signal zählt auch, wenn die WebView noch „hidden“ meldet", () => {
  const env = fakeEnv(); const calls = [];
  env.doc.visibilityState = "hidden";
  onAppForeground((s) => calls.push(s), { doc: env.doc, win: env.win, now: () => 0, subscribeNative: env.subscribeNative });
  env.fire("visibilitychange"); // Web allein: ignoriert (unsichtbar)
  env.appState(true);
  assert.deepEqual(calls, ["native"]);
});

test("7A Lebenszyklus: isActive=false (Hintergrund) löst nichts aus; nächster Vordergrund nach Entprellung wieder", () => {
  const env = fakeEnv(); let t = 0; const calls = [];
  onAppForeground((s) => calls.push(s), { doc: env.doc, win: env.win, now: () => t, subscribeNative: env.subscribeNative });
  env.appState(true);
  t = 100; env.appState(false); env.doc.visibilityState = "hidden"; env.fire("visibilitychange");
  t = 60_000; env.doc.visibilityState = "visible"; env.appState(true); env.fire("visibilitychange"); env.fire("focus");
  assert.deepEqual(calls, ["native", "native"]);
});

test("7A Lebenszyklus: Abmelden entfernt Web- UND nativen Listener", () => {
  const env = fakeEnv(); const calls = [];
  const off = onAppForeground((s) => calls.push(s), { doc: env.doc, win: env.win, now: () => 0, subscribeNative: env.subscribeNative });
  assert.equal(env.native.subscribed, 1);
  off();
  assert.equal(env.native.unsubscribed, 1);
  assert.equal(env.count("visibilitychange") + env.count("focus") + env.count("online"), 0);
  env.appState(true); env.fire("focus");
  assert.deepEqual(calls, []);
});

test("7A Lebenszyklus: Ende-zu-Ende wie FamilyChampion → 1 Reload, 1 Champion-Sync, 1 Realtime-Reconnect", async () => {
  const env = fakeEnv(); let t = 0;
  let reloads = 0, syncs = 0, reconnects = 0;
  const sched = createReloadScheduler(async () => { reloads++; return true; }, { debounceMs: 20 });
  // gleiche Reihenfolge wie FamilyChampion.jsx / FamilyApp.jsx (zwei Abonnenten, je eigene Entprellung)
  onAppForeground(() => { sched.request(); reconnects++; syncs++; }, { doc: env.doc, win: env.win, now: () => t, subscribeNative: env.subscribeNative });
  env.appState(true); t = 4; env.fire("visibilitychange"); t = 8; env.fire("focus");
  await sleep(60);
  assert.equal(reloads, 1); assert.equal(syncs, 1); assert.equal(reconnects, 1);
  sched.stop();
});

test("7A nativer Adapter: im Web keine Plugin-Registrierung", () => {
  let calls = 0;
  const off = subscribeNativeAppState(() => {}, { isNative: () => false, app: { addListener: () => { calls++; } } });
  off();
  assert.equal(calls, 0);
});

test("7A nativer Adapter: nativ registriert appStateChange; Abmelden vor Registrierung entfernt den Listener danach", async () => {
  const events = []; let removed = 0; let registered = null;
  const app = { addListener: async (name, fn) => { registered = { name, fn }; await sleep(5); return { remove: () => { removed++; } }; } };
  const off = subscribeNativeAppState((s) => events.push(s.isActive), { isNative: () => true, app });
  off(); // sofort – bevor addListener aufgelöst ist
  await sleep(20);
  assert.equal(registered.name, "appStateChange");
  assert.equal(removed, 1, "verwaister Listener wird entfernt");
  registered.fn({ isActive: true });
  assert.deepEqual(events, [], "nach Abmelden keine Weitergabe");

  const off2 = subscribeNativeAppState((s) => events.push(s.isActive), { isNative: () => true, app });
  await sleep(20);
  registered.fn({ isActive: true });
  assert.deepEqual(events, [true]);
  off2();
  assert.equal(removed, 2);
});

// ---------------------------------------------------------------- Laufzeit-Schutz (main.jsx → nativeBoot)
test("7A Laufzeit: Web-Builds unverändert; nativ nur als Test-Build gegen das Testprojekt", () => {
  assert.equal(checkNativeRuntime({ isNative: false, nativeTestRef: "", familyUrl: PROD_URL }), null, "normaler Web-Build: keine neue Regel");
  assert.match(checkNativeRuntime({ isNative: true, nativeTestRef: "", familyUrl: TEST_URL }), /kein nativer Test-Build/);
  assert.equal(checkNativeRuntime({ isNative: true, nativeTestRef: NATIVE_TEST_PROJECT_REF, familyUrl: TEST_URL }), null);
  assert.match(checkNativeRuntime({ isNative: true, nativeTestRef: NATIVE_TEST_PROJECT_REF, familyUrl: PROD_URL }), /ausschließlich das Testprojekt/);
  assert.match(checkNativeRuntime({ isNative: false, nativeTestRef: NATIVE_TEST_PROJECT_REF, familyUrl: PROD_URL }), /ausschließlich das Testprojekt/);
  assert.match(checkNativeRuntime({ isNative: true, nativeTestRef: NATIVE_TEST_PROJECT_REF, familyUrl: `http://${NATIVE_TEST_PROJECT_REF}.supabase.co` }), /ausschließlich/);
  assert.match(checkNativeRuntime({ isNative: true, nativeTestRef: "abcdefghijklmnopqrst", familyUrl: TEST_URL }), /unbekanntem Projekt/);
});

test("7A Laufzeit: Client-Code enthält die Produktions-Ref nicht", () => {
  for (const f of ["src/config/nativeTarget.js", "src/family/nativeBoot.js", "src/lib/nativePlatform.js", "src/lib/nativeAppState.js", "src/lib/appLifecycle.js", "src/main.jsx"]) {
    assert.doesNotMatch(read(f), new RegExp(PRODUCTION_PROJECT_REF), f);
  }
});

// ---------------------------------------------------------------- Build-Schutz (vite --mode ios-test)
const okEnv = () => ({
  VITE_BACKEND_MODE: "family", VITE_FAMILY_SUPABASE_URL: TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcDEF123",
  VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_INVITE_BASE_URL: "https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app",
});
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2lnbmF0dXJlc2lnbmF0dXJl`;

test("7A Build-Schutz: gültige Test-Konfiguration wird akzeptiert", () => {
  assert.deepEqual(validateIosTestEnv(okEnv()), { ok: true, errors: [] });
  assert.equal(validateIosTestEnv({ ...okEnv(), VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon", ref: NATIVE_TEST_PROJECT_REF }) }).ok, true);
});

test("7A Build-Schutz: Produktions-Ref, LEGACY, Secrets, HTTP und Produktions-Domain brechen ab", () => {
  const bad = {
    "Produktions-URL": { VITE_FAMILY_SUPABASE_URL: PROD_URL },
    "anderes Projekt": { VITE_FAMILY_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" },
    "LEGACY-Modus": { VITE_BACKEND_MODE: "legacy" },
    "Modus fehlt": { VITE_BACKEND_MODE: "" },
    "LEGACY-URL gesetzt": { VITE_SUPABASE_URL: PROD_URL },
    "LEGACY-Key gesetzt": { VITE_SUPABASE_ANON_KEY: "irgendwas" },
    "Secret-Key": { VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abcdefghijk" },
    "service_role-JWT": { VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "service_role", ref: NATIVE_TEST_PROJECT_REF }) },
    "anon-JWT Produktion": { VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon", ref: PRODUCTION_PROJECT_REF }) },
    "Key fehlt": { VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: "" },
    "HTTP-Backend": { VITE_FAMILY_SUPABASE_URL: `http://${NATIVE_TEST_PROJECT_REF}.supabase.co` },
    "HTTP-Link": { VITE_INVITE_BASE_URL: "http://example.org" },
    "Produktions-Web-Domain": { VITE_INVITE_BASE_URL: "https://familienapp.vercel.app" },
    "Prod-Ref in beliebiger Variable": { VITE_PRIVACY_URL: `https://x.example/${PRODUCTION_PROJECT_REF}` },
    "family-main": { VITE_SUPPORT_URL: "https://x.example/family-main" },
  };
  for (const [name, patch] of Object.entries(bad)) {
    const r = validateIosTestEnv({ ...okEnv(), ...patch });
    assert.equal(r.ok, false, name);
    assert.ok(r.errors.length > 0, name);
    for (const e of r.errors) assert.doesNotMatch(e, /sb_secret_abc|irgendwas/, "Meldungen enthalten keine Werte");
  }
});

test("7A Bundle-Scan: Produktions-Ref, family-main, app_state, Secrets und fehlendes Testprojekt werden gefunden", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-7a-scan-"));
  fs.mkdirSync(path.join(dir, "assets"));
  const write = (s) => fs.writeFileSync(path.join(dir, "assets", "index.js"), s);
  write(`const u="${TEST_URL}";`);
  assert.deepEqual(scanNativeWebBundle(dir).findings, []);
  write(`const u="${TEST_URL}";const p="${PRODUCTION_PROJECT_REF}";`);
  assert.ok(scanNativeWebBundle(dir).findings.includes("Produktions-Ref"));
  write(`const u="${TEST_URL}";const r="family-main";from("app_state")`);
  assert.deepEqual(scanNativeWebBundle(dir).findings.sort(), ["app_state (LEGACY-Tabelle)", "family-main"].sort());
  write(`const u="${TEST_URL}";const k="${jwt({ role: "service_role" })}${"x".repeat(20)}";`);
  assert.ok(scanNativeWebBundle(dir).findings.includes("Secret-/service_role-Key"));
  write(`const u="${TEST_URL}";const k="${jwt({ role: "anon" })}${"x".repeat(20)}";`);
  assert.deepEqual(scanNativeWebBundle(dir).findings, [], "anon/publishable ist erlaubt");
  write(`const u="${TEST_URL}";const n="Beispielname";`);
  assert.ok(scanNativeWebBundle(dir, { legacyNames: ["Beispielname"] }).findings.includes("persönliche LEGACY-Standarddaten"));
  write(`const x=1;`);
  assert.ok(scanNativeWebBundle(dir).findings.includes("Testprojekt fehlt"));
  write(`const u="${TEST_URL}";const i="data:image/jpeg;base64,${"A".repeat(3000)}";`);
  assert.ok(scanNativeWebBundle(dir).findings.includes("eingebettete Bilddaten (Base64 > 2 kB)"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("7A Marker: nur ios-test / Testprojekt / FAMILY / richtige App-ID gilt", () => {
  const m = { target: "ios-test", projectRef: NATIVE_TEST_PROJECT_REF, backendMode: "family", appId: NATIVE_APP_ID };
  assert.equal(isValidNativeMarker(m), true);
  assert.equal(isValidNativeMarker(null), false);
  assert.equal(isValidNativeMarker({ ...m, projectRef: PRODUCTION_PROJECT_REF }), false);
  assert.equal(isValidNativeMarker({ ...m, backendMode: "legacy" }), false);
  assert.equal(isValidNativeMarker({ ...m, target: "web" }), false);
});

// ---------------------------------------------------------------- Projektidentität / Konfiguration
test("7A Capacitor-Konfiguration: App-ID, Name, webDir, kein server.url, kein Cleartext", () => {
  const cfg = JSON.parse(read("capacitor.config.json"));
  assert.equal(cfg.appId, "de.volkmarsolutions.wochenchampion");
  assert.equal(cfg.appId, NATIVE_APP_ID);
  assert.equal(cfg.appName, "Wochen Champion");
  assert.equal(cfg.appName, NATIVE_APP_NAME);
  assert.equal(cfg.webDir, "dist");
  assert.equal(cfg.server, undefined, "kein server-Block (kein Remote-Wrapper, keine cleartext-/url-Ausnahme)");
  assert.doesNotMatch(JSON.stringify(cfg), /cleartext|allowNavigation|http:\/\//i);
});

test("7A Pakete: alle Capacitor-Kernpakete gleiche Major-Version (8), keine Vorabversion, nur erlaubte Plugins", () => {
  const pkg = JSON.parse(read("package.json"));
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const cap = Object.entries(all).filter(([n]) => n.startsWith("@capacitor/"));
  assert.deepEqual(cap.map(([n]) => n).sort(), ["@capacitor/app", "@capacitor/cli", "@capacitor/core", "@capacitor/ios"]);
  for (const [n, v] of cap) {
    assert.match(v, /^\^?8\.\d+\.\d+$/, n);
    const installed = JSON.parse(read(`node_modules/${n}/package.json`)).version;
    assert.match(installed, /^8\.\d+\.\d+$/, `${n} installiert ${installed}`);
  }
  assert.equal(pkg.scripts["capacitor:sync:before"], "node scripts/check-native-web-bundle.mjs");
  assert.equal(pkg.scripts["capacitor:copy:before"], "node scripts/check-native-web-bundle.mjs");
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /sb_publishable_|sb_secret_|supabase\.co/, "keine Werte in package.json");
});

test("7A Xcode-Projekt: Bundle-ID, Anzeigename, Version 0.1.0 (1), iOS 15.0, keine ATS-Ausnahme, nur nötige Berechtigung", () => {
  const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
  const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
  assert.ok(ids.length >= 2);
  assert.ok(ids.every((id) => id === NATIVE_APP_ID), ids.join(","));
  assert.ok([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].every((m) => m[1] === "0.1.0"));
  assert.ok([...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].every((m) => m[1] === "1"));
  assert.ok([...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].every((m) => m[1] === "15.0"));
  const plist = read("ios/App/App/Info.plist");
  assert.match(plist, /<key>CFBundleDisplayName<\/key>\s*<string>Wochen Champion<\/string>/);
  assert.match(plist, /<key>CFBundleIdentifier<\/key>\s*<string>\$\(PRODUCT_BUNDLE_IDENTIFIER\)<\/string>/);
  assert.doesNotMatch(plist, /NSAppTransportSecurity|NSAllowsArbitraryLoads/);
  const usage = [...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1]);
  assert.deepEqual(usage, ["NSCameraUsageDescription"], "nur Kamera (Datei-Auswahl bietet „Foto aufnehmen“)");
  assert.doesNotMatch(plist + pbx, /familienapp/i, "kein Repository-Name im nativen Projekt");
  assert.match(read("ios/App/CapApp-SPM/Package.swift"), /\.iOS\(\.v15\)/);
  assert.match(read("ios/.gitignore"), /App\/App\/public/, "Web-Kopie wird nicht versioniert");
});

test("7A LEGACY-Trennung: kein Capacitor im LEGACY-Pfad; nativer Start-Schutz nur im FAMILY-Zweig", () => {
  for (const f of ["src/App.jsx", "src/lib/supabaseLegacy.js", "src/legacy/legacyDefaults.js"]) {
    assert.doesNotMatch(read(f), /@capacitor|nativePlatform|nativeAppState|nativeBoot/, f);
  }
  const main = read("src/main.jsx");
  const familyBranch = main.slice(main.indexOf("if (__WC_FAMILY_BUILD__)"), main.indexOf("} else {"));
  assert.match(familyBranch, /nativeBoot\.js/);
  assert.doesNotMatch(main.slice(main.indexOf("} else {")), /nativeBoot|capacitor/i);
  assert.doesNotMatch(main.split("try {")[0], /@capacitor/, "kein statischer Capacitor-Import in main.jsx");
});
