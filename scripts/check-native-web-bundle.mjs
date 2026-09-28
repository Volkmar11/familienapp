#!/usr/bin/env node
// Capacitor-Hook (Phase 7A): läuft automatisch vor „cap sync“ und „cap copy“
// (package.json → capacitor:sync:before / capacitor:copy:before).
// Nur ein mit „npm run build:ios:test“ erzeugtes und sauber gescanntes Bundle darf in den
// nativen Container. Ein normaler Web- oder LEGACY-Build (npm run build) wird abgelehnt.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readNativeMarker, isValidNativeMarker, scanNativeWebBundle, loadLegacyNames } from "./lib/iosTestGuard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = process.env.CAPACITOR_WEB_DIR || path.join(ROOT, "dist");
const platform = process.env.CAPACITOR_PLATFORM_NAME || "?";
const stop = (msg) => {
  console.error(`\n✗ Capacitor-Schutz (${platform}): ${msg}\n  Bitte zuerst „npm run build:ios:test“ ausführen (nur Testprojekt).\n`);
  process.exit(1);
};

if (!isValidNativeMarker(readNativeMarker(webDir))) {
  stop(`${path.relative(ROOT, webDir) || webDir}/ ist kein nativer Test-Build (Marker fehlt oder passt nicht). LEGACY- und normale Web-Builds sind im nativen Container nicht erlaubt.`);
}
const scan = scanNativeWebBundle(webDir, { legacyNames: await loadLegacyNames(ROOT) });
if (scan.findings.length) stop(`Bundle-Scan: ${scan.findings.join(", ")}`);
console.log(`✓ Capacitor-Schutz (${platform}): nativer Test-Build, Testprojekt, Bundle-Scan sauber`);
