#!/usr/bin/env node
// Nativer iOS-Test-Build (Phase 7A): FAMILY-Web-Bundle für den Capacitor-Container.
//
//   npm run build:ios:test          # nur Web-Bundle nach dist/
//   npm run ios:test                # Build + npx cap sync ios
//
// Werte kommen aus .env.ios-test.local (von Git ignoriert, Vorlage: .env.ios-test.example)
// bzw. aus der Shell. Nur Testprojekt „wochen-champion-test“, nur Publishable Key.
// Ablauf: Env prüfen → vite build --mode ios-test → Marker dist/wc-native-build.json →
// statischer Bundle-Scan. Bei jedem Fehler wird dist/ gelöscht (nichts Unsicheres zum Syncen).
// Es werden nie Werte ausgegeben, nur Namen und Prüfergebnisse.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import {
  validateIosTestEnv, scanNativeWebBundle, loadLegacyNames,
  NATIVE_TEST_BUILD_MODE, NATIVE_TEST_PROJECT_REF, NATIVE_APP_ID, NATIVE_APP_NAME, NATIVE_MARKER_FILE, NATIVE_MARKER_TARGET,
} from "./lib/iosTestGuard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const fail = (msg) => { fs.rmSync(DIST, { recursive: true, force: true }); console.error(`\n✗ iOS-Test-Build abgebrochen: ${msg}\n  dist/ wurde entfernt.`); process.exit(1); };

const env = loadEnv(NATIVE_TEST_BUILD_MODE, ROOT, "VITE_");
const check = validateIosTestEnv(env);
if (!check.ok) fail(`\n  - ${check.errors.join("\n  - ")}\n  Vorlage: .env.ios-test.example → .env.ios-test.local`);
console.log(`✓ Env geprüft: FAMILY, Testprojekt ${NATIVE_TEST_PROJECT_REF}, Publishable Key, keine LEGACY-/Produktionswerte`);

try {
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--mode", NATIVE_TEST_BUILD_MODE, "--outDir", DIST, "--emptyOutDir"],
    { cwd: ROOT, stdio: "inherit" });
} catch { fail("vite build fehlgeschlagen (siehe Ausgabe oben)."); }

const git = (args) => { try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } };
const marker = {
  target: NATIVE_MARKER_TARGET,
  appId: NATIVE_APP_ID,
  appName: NATIVE_APP_NAME,
  backendMode: "family",
  projectRef: NATIVE_TEST_PROJECT_REF,
  gitCommit: git(["rev-parse", "--short", "HEAD"]),
  gitDirty: (git(["status", "--porcelain"]) ?? "") !== "",
};
fs.writeFileSync(path.join(DIST, NATIVE_MARKER_FILE), JSON.stringify(marker, null, 2) + "\n");

const scan = scanNativeWebBundle(DIST, { legacyNames: await loadLegacyNames(ROOT) });
if (scan.findings.length) fail(`Bundle-Scan: ${scan.findings.join(", ")}`);
console.log(`✓ Bundle-Scan sauber (${scan.files} Dateien): keine Produktions-Ref, kein family-main/app_state, keine Secrets, keine LEGACY-Personendaten`);
console.log(`✓ dist/ bereit für „npx cap sync ios“ (Commit ${marker.gitCommit}${marker.gitDirty ? ", Arbeitsbaum mit Änderungen" : ""})`);
