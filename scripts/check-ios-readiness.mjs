#!/usr/bin/env node
// iOS-Readiness-Check (Phase 7A) – rein lokal: kein Netzwerk, keine Secrets, keine Mutation.
//
//   npm run check:ios            (= node scripts/check-ios-readiness.mjs)
//
// Prüft Capacitor-Konfiguration, natives Projekt, Lifecycle-Plugin, Build-Schutz, den gebauten
// nativen Test-Build (dist/ und die Kopie im Xcode-Projekt) und – soweit vorhanden – die Xcode-Toolchain.
// Ausgabe: PASS / WARN / INFO / FAIL. Exit 1 nur bei FAIL.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_PROJECT_REF, NATIVE_TEST_PROJECT_REF, NATIVE_APP_ID, NATIVE_APP_NAME,
  readNativeMarker, isValidNativeMarker, scanNativeWebBundle, loadLegacyNames,
} from "./lib/iosTestGuard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "", level = "fail") => results.push({ name, ok: !!ok, detail, level });
const info = (name, detail) => results.push({ name, ok: true, detail, level: "info" });
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };
const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }).trim(); } catch { return null; } };

// ---------------------------------------------------------------- 1. Capacitor-Konfiguration
let cfg = null;
try { cfg = JSON.parse(read("capacitor.config.json")); } catch { /* unten */ }
check("capacitor.config.json vorhanden", !!cfg);
if (cfg) {
  check(`appId = ${NATIVE_APP_ID}`, cfg.appId === NATIVE_APP_ID, cfg.appId);
  check(`appName = ${NATIVE_APP_NAME}`, cfg.appName === NATIVE_APP_NAME, cfg.appName);
  check("webDir = dist", cfg.webDir === "dist", cfg.webDir);
  check("kein server.url (lokales Bundle, kein Remote-Wrapper)", !cfg.server?.url);
  check("keine Cleartext-/HTTP-Ausnahme", !cfg.server?.cleartext && !/http:\/\//i.test(JSON.stringify(cfg)));
}
for (const f of ["capacitor.config.ts", "capacitor.config.js"]) check(`keine konkurrierende ${f}`, !exists(f));

// ---------------------------------------------------------------- 2. Pakete
const pkg = JSON.parse(read("package.json") || "{}");
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const capPkgs = ["@capacitor/core", "@capacitor/cli", "@capacitor/ios", "@capacitor/app"];
const installed = Object.fromEntries(capPkgs.map((n) => { try { return [n, JSON.parse(read(`node_modules/${n}/package.json`)).version]; } catch { return [n, null]; } }));
check("Capacitor-Pakete installiert", capPkgs.every((n) => deps[n] && installed[n]), capPkgs.map((n) => `${n}@${installed[n]}`).join(", "));
const majors = new Set(capPkgs.map((n) => (installed[n] || "").split(".")[0]));
check("gleiche Major-Version (stabil, kein beta/rc)", majors.size === 1 && capPkgs.every((n) => /^\d+\.\d+\.\d+$/.test(installed[n] || "")), [...majors].join("/"));
check("Lifecycle-Plugin @capacitor/app eingebunden", !!deps["@capacitor/app"] && /subscribeNativeAppState/.test(read("src/lib/appLifecycle.js")) && /appStateChange/.test(read("src/lib/nativeAppState.js")));
check("Sync-/Copy-Schutz aktiv (capacitor:sync:before / capacitor:copy:before)",
  pkg.scripts?.["capacitor:sync:before"]?.includes("check-native-web-bundle") && pkg.scripts?.["capacitor:copy:before"]?.includes("check-native-web-bundle"));
check("keine unerwünschten Plugins (Kamera, Push, StoreKit, Analytics, Ads)", !Object.keys(deps).some((n) => /camera|push|purchase|storekit|revenuecat|analytics|admob|firebase/i.test(n)));

// ---------------------------------------------------------------- 3. Natives iOS-Projekt
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const plist = read("ios/App/App/Info.plist");
check("ios/-Plattform vorhanden (Xcode-Projekt)", !!pbx && !!plist);
check("Swift Package Manager (CapApp-SPM/Package.swift, keine Podfile)", exists("ios/App/CapApp-SPM/Package.swift") && !exists("ios/App/Podfile"));
check("SPM enthält CapacitorApp", /CapacitorApp/.test(read("ios/App/CapApp-SPM/Package.swift")));
if (pbx) {
  const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
  check("Bundle Identifier (alle Konfigurationen)", ids.length > 0 && ids.every((i) => i === NATIVE_APP_ID), [...new Set(ids)].join(", "));
  const mv = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]))];
  const bv = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]))];
  const dt = [...new Set([...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].map((m) => m[1]))];
  check("Version / Build", mv.length === 1 && bv.length === 1, `${mv.join("/")} (${bv.join("/")})`);
  check("iOS Deployment Target einheitlich", dt.length === 1, dt.join("/"));
  info("Gerätefamilie", /TARGETED_DEVICE_FAMILY = 1;/.test(pbx) ? "nur iPhone" : "iPhone + iPad");
}
if (plist) {
  check("CFBundleDisplayName = Wochen Champion", /<key>CFBundleDisplayName<\/key>\s*<string>Wochen Champion<\/string>/.test(plist));
  check("keine ATS-Ausnahme (NSAppTransportSecurity)", !/NSAppTransportSecurity|NSAllowsArbitraryLoads/.test(plist));
  const usage = [...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1]);
  check("nur notwendige Privacy-Texte", usage.every((u) => u === "NSCameraUsageDescription"), usage.join(", ") || "keine");
}
const nativeCfgText = [read("ios/App/App/capacitor.config.json"), plist, pbx, read("capacitor.config.json")].join("\n");
check("Produktions-Ref nicht in nativer Konfiguration", !nativeCfgText.includes(PRODUCTION_PROJECT_REF));
check("kein family-main in nativer Konfiguration", !/family-main/.test(nativeCfgText));

// ---------------------------------------------------------------- 4. Env-Vorlage / Git
check(".env.ios-test.example vorhanden (nur Platzhalter)", exists(".env.ios-test.example") && !/sb_publishable_[A-Za-z0-9]{10,}|sb_secret_|[a-z0-9]{20}\.supabase\.co/.test(read(".env.ios-test.example")));
const ignored = run("git", ["-C", ROOT, "check-ignore", "-q", ".env.ios-test.local"]) !== null;
check(".env.ios-test.local von Git ignoriert", ignored);
const tracked = run("git", ["-C", ROOT, "ls-files", "ios/App/App/public", ".env.ios-test.local", "dist"]);
check("keine generierten Web-Kopien / lokalen Env-Dateien versioniert", tracked === "", tracked || "");

// ---------------------------------------------------------------- 5. Gebauter nativer Test-Build
const legacyNames = await loadLegacyNames(ROOT);
for (const [label, dir] of [["dist/ (FAMILY-Test-Build)", "dist"], ["Xcode-Kopie ios/App/App/public", "ios/App/App/public"]]) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(path.join(abs, "index.html"))) { check(`${label} vorhanden`, false, "noch nicht gebaut/synchronisiert → npm run ios:test", "warn"); continue; }
  const marker = readNativeMarker(abs);
  check(`${label}: nativer Test-Build (Marker, Testprojekt ${NATIVE_TEST_PROJECT_REF})`, isValidNativeMarker(marker), marker ? `Commit ${marker.gitCommit}` : "kein Marker");
  const scan = scanNativeWebBundle(abs, { legacyNames });
  check(`${label}: Bundle-Scan sauber`, scan.findings.length === 0, scan.findings.join(", ") || `${scan.files} Dateien`);
}

// ---------------------------------------------------------------- 6. Toolchain (nur Information/Warnung)
const nodeMajor = Number(process.versions.node.split(".")[0]);
check("Node ≥ 22 (Capacitor 8)", nodeMajor >= 22, process.versions.node);
if (process.platform !== "darwin") {
  check("macOS mit Xcode", false, `Plattform ${process.platform} – Xcode-Build/Simulator nur auf dem Mac möglich`, "warn");
} else {
  const xb = run("xcodebuild", ["-version"]);
  check("xcodebuild verfügbar", !!xb, xb ? xb.replace(/\n/g, " · ") : "Xcode nicht (vollständig) installiert", "warn");
  const sel = run("xcode-select", ["-p"]);
  check("xcode-select zeigt auf Xcode.app (nicht CommandLineTools)", !!sel && /Xcode.*\.app/.test(sel), sel || "", "warn");
  const rt = run("xcrun", ["simctl", "list", "runtimes"]);
  const ios = (rt || "").split("\n").filter((l) => /^iOS /.test(l));
  check("iOS-Simulator-Runtime installiert", ios.length > 0, ios.map((l) => l.split(" (")[0]).join(", ") || "keine", "warn");
}

// ---------------------------------------------------------------- Ausgabe
for (const r of results) {
  const tag = r.level === "info" ? "INFO" : r.ok ? "PASS" : r.level === "warn" ? "WARN" : "FAIL";
  console.log(`${tag} | ${r.name}${r.detail ? ` – ${r.detail}` : ""}`);
}
const fails = results.filter((r) => !r.ok && r.level === "fail").length;
const warns = results.filter((r) => !r.ok && r.level === "warn").length;
const passes = results.filter((r) => r.ok && r.level !== "info").length;
console.log(`\niOS-Readiness: ${passes} PASS, ${warns} WARN, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
