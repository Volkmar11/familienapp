#!/usr/bin/env node
// Release-Readiness-Check (Phase 6A) – rein lokal, kontaktiert KEIN Backend und benötigt KEINE Secrets.
//
//   node scripts/check-release-readiness.mjs                      # Profil "preview" (Testprojekt erwartet)
//   node scripts/check-release-readiness.mjs --profile production # strengere Regeln für den späteren Cutover
//
// Umgebungswerte (optional, sonst Platzhalter): VITE_FAMILY_SUPABASE_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY,
// VITE_AUTH_REDIRECT_URL, VITE_INVITE_BASE_URL, VITE_PRIVACY_URL, VITE_IMPRINT_URL, VITE_SUPPORT_URL,
// VITE_SUPABASE_URL (Legacy). Es werden nur Namen/Formate geprüft, nie Werte ausgegeben.
//
// Prüft:
//   1. FAMILY-Build (Vite) in ein temporäres Verzeichnis
//   2. Bundle: kein service_role/Secret-Key, keine Test-Hintertüren, keine Testkonten, keine Legacy-Personendaten
//   3. Repo: Test-Hilfen nicht in supabase/migrations, alle Migrationen mit Test-Guard (Produktion braucht Bootstrap)
//   4. Env-Namen: alle im Code verwendeten VITE_-Variablen sind in .env.example dokumentiert
//   5. Rechtliche Links konfigurierbar (production: Pflicht)
//   6. Backend-Ziel: preview → Testprojekt; production → NICHT Testprojekt, Legacy-URL darf nicht gleichzeitig gesetzt sein
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PROJECT_REF = "otejitifgcrrwmudrnhs"; // öffentlich bekannter Ref des Testprojekts (kein Secret)
const args = process.argv.slice(2);
const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "preview";
if (!["preview", "production"].includes(profile)) { console.error("Profil muss preview oder production sein."); process.exit(2); }

const results = [];
const check = (name, ok, detail = "", level = "fail") => results.push({ name, ok: !!ok, detail, level });
const env = process.env;
const refOf = (u) => { try { return /^([a-z0-9]{20})\.supabase\.co$/i.exec(new URL(u).host)?.[1]?.toLowerCase() ?? null; } catch { return null; } };

// ---------------------------------------------------------------- 1. FAMILY-Build
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-release-"));
const buildEnv = {
  ...env,
  VITE_BACKEND_MODE: "family",
  VITE_FAMILY_SUPABASE_URL: env.VITE_FAMILY_SUPABASE_URL || "https://placeholderplaceholder1.supabase.co",
  VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: env.VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_placeholder",
};
let built = false;
try {
  execFileSync(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "error"],
    { cwd: ROOT, env: buildEnv, stdio: ["ignore", "ignore", "pipe"] });
  built = true;
} catch (e) { check("FAMILY-Build", false, String(e.stderr || e.message).split("\n")[0]); }
if (built) check("FAMILY-Build", true);

// ---------------------------------------------------------------- 2. Bundle-Inhalt
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
if (built) {
  const bundle = walk(outDir).filter((f) => /\.(js|html|css)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  // Die Schutzregel in backend.js enthält die Wörter selbst (als Ablehnungs-RegExp) – echte Schlüssel haben Inhalt.
  check("Bundle: kein Secret-/service_role-Key", !/sb_secret_[A-Za-z0-9_-]{8,}|eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(bundle));
  check("Bundle: keine Test-Hintertüren", !/test_add_family_member|legacy_import_redemptions/.test(bundle));
  check("Bundle: keine Testkonten", !/@example\.com|wc-(test|p[0-9])/.test(bundle));
  check("Bundle: kein Service-/Lifecycle-Server-RPC direkt", !/execute_account_deletion|delete_family_as_service|account_deletion_plan/.test(bundle));
  // Legacy-Standarddaten (Namen) dürfen im FAMILY-Bundle nicht vorkommen – Namen werden zur Laufzeit gelesen, nicht hier notiert
  let legacyNames = [];
  try {
    const d = await import(pathToFileURL(path.join(ROOT, "src/legacy/legacyDefaults.js")).href);
    legacyNames = (d.DEFAULT_MEMBERS || []).map((m) => m?.name).filter((n) => typeof n === "string" && n.length >= 3);
  } catch { /* keine Legacy-Defaults vorhanden */ }
  const hits = legacyNames.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(bundle));
  check("Bundle: keine persönlichen Legacy-Standarddaten", hits.length === 0, hits.length ? `${hits.length} Treffer` : "");
  if (profile === "preview") check("Bundle: FAMILY-Code enthalten", /accept_family_invitation/.test(bundle));
}
fs.rmSync(outDir, { recursive: true, force: true });

// ---------------------------------------------------------------- 3. Repo: Migrationen / Test-Hilfen
const migDir = path.join(ROOT, "supabase/migrations");
const migs = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const migText = migs.map((f) => fs.readFileSync(path.join(migDir, f), "utf8")).join("\n");
check("Migrationen: keine Test-Hilfsfunktion angelegt", !/create (or replace )?function public\.(test_add_family_member|legacy_import_redemptions)/i.test(migText));
check("Migrationen: Test-Hintertür wird entfernt", /drop function if exists public\.test_add_family_member/i.test(migText));
const unguarded = migs.filter((f) => !/app\.migration_target/.test(fs.readFileSync(path.join(migDir, f), "utf8")));
check(`Migrationen: ${migs.length} Dateien, alle mit Test-Guard (Produktion nur über geprüftes Bootstrap)`, unguarded.length === 0, unguarded.join(", "));
const ts = path.join(ROOT, "supabase/test-support");
const tsFiles = fs.existsSync(ts) ? fs.readdirSync(ts) : [];
check("Test-Support-SQL nur mit Test-Guard", tsFiles.every((f) => /app\.migration_target/.test(fs.readFileSync(path.join(ts, f), "utf8"))), tsFiles.join(", "));

// ---------------------------------------------------------------- 4. Env-Namen dokumentiert
const srcFiles = walk(path.join(ROOT, "src")).filter((f) => /\.(js|jsx)$/.test(f));
const used = new Set(srcFiles.flatMap((f) => fs.readFileSync(f, "utf8").match(/\bVITE_[A-Z][A-Z_]*\b/g) || []));
const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
const undocumented = [...used].filter((n) => !new RegExp(`^${n}=`, "m").test(example));
check("Env: alle VITE_-Variablen in .env.example dokumentiert", undocumented.length === 0, undocumented.join(", "));
check(".env.example: keine Werte für Secrets", !/^[^#]*(service_role|sb_secret_|SECRET_KEY)/im.test(example));

// ---------------------------------------------------------------- 5. Rechtliche Links
const { missingLegalEnv } = await import(pathToFileURL(path.join(ROOT, "src/config/legal.js")).href);
const missingLegal = missingLegalEnv(env);
check("Rechtliche Links konfigurierbar (VITE_PRIVACY_URL, VITE_IMPRINT_URL, VITE_SUPPORT_URL)", LEGAL_OK(), "");
function LEGAL_OK() { return ["VITE_PRIVACY_URL", "VITE_IMPRINT_URL", "VITE_SUPPORT_URL"].every((n) => new RegExp(`^${n}=`, "m").test(example)); }
check("Rechtliche Links gesetzt", missingLegal.length === 0, missingLegal.join(", "), profile === "production" ? "fail" : "warn");

// ---------------------------------------------------------------- 6. Backend-Ziel
const famRef = refOf(env.VITE_FAMILY_SUPABASE_URL || "");
if (profile === "preview") {
  check("Preview: FAMILY-Backend ist das Testprojekt", !env.VITE_FAMILY_SUPABASE_URL || famRef === TEST_PROJECT_REF, famRef ? "anderes Projekt" : "", env.VITE_FAMILY_SUPABASE_URL ? "fail" : "warn");
} else {
  check("Production: VITE_FAMILY_SUPABASE_URL gesetzt", !!famRef);
  check("Production: FAMILY-Backend ist NICHT das Testprojekt", famRef && famRef !== TEST_PROJECT_REF);
  check("Production: Legacy-VITE_SUPABASE_URL nicht zugleich auf dasselbe Projekt (Guard in backend.js)", !env.VITE_SUPABASE_URL || refOf(env.VITE_SUPABASE_URL) !== famRef);
  for (const n of ["VITE_AUTH_REDIRECT_URL", "VITE_INVITE_BASE_URL"]) {
    let ok = false; try { ok = new URL(env[n] || "").protocol === "https:"; } catch { /* */ }
    check(`Production: ${n} gesetzt (https)`, ok);
  }
}

// ---------------------------------------------------------------- Ausgabe
let fails = 0, warns = 0;
for (const r of results) {
  const tag = r.ok ? "PASS" : r.level === "warn" ? "WARN" : "FAIL";
  if (!r.ok && r.level === "warn") warns++; else if (!r.ok) fails++;
  console.log(`${tag} | ${r.name}${r.detail ? " – " + r.detail : ""}`);
}
console.log(`\nProfil ${profile}: ${results.length - fails - warns} PASS, ${warns} WARN, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
