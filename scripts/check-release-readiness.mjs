#!/usr/bin/env node
// Release-Readiness-Check (Phase 6A) – rein lokal, kontaktiert KEIN Backend und benötigt KEINE Secrets.
//
//   node scripts/check-release-readiness.mjs                      # Profil "preview" (Testprojekt erwartet)
//   node scripts/check-release-readiness.mjs --profile pre-go     # PRE-GO vor Phase 6B2 (Code-/Paketstand, lokal)
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
//   6. Backend-Ziel: preview → Testprojekt; production → NICHT Testprojekt, VITE_BACKEND_MODE=family,
//      Legacy-Variablen (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) beim Cutover entfernt
//   7. Härtung (alle Profile): keine externen Fonts (LEGACY + FAMILY), Passwort-Minimum 8
//   8. nur pre-go: Commit/sauberer Baum, npm audit, Bootstrap deterministisch + Generalprobe (local-release/bootstrap-rehearsal.json)
//      zum aktuellen Commit, Migrations-Guards offline, Revokes, Env-Doku; SMTP/Rechtstexte als EXTERNE GO-Voraussetzung
//   9. nur production: menschlich bestätigte externe Voraussetzungen (WC_GO_SMTP_CONFIRMED, WC_GO_LEGAL_CONFIRMED)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PROJECT_REF = "otejitifgcrrwmudrnhs"; // öffentlich bekannter Ref des Testprojekts (kein Secret)
const args = process.argv.slice(2);
const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "preview";
if (!["preview", "pre-go", "production"].includes(profile)) { console.error("Profil muss preview, pre-go oder production sein."); process.exit(2); }

const results = [];
// level: fail | warn | extern (externe GO-Voraussetzung – blockiert PRE-GO nicht, wird aber ausgewiesen)
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
const viteBuild = (dir, e) => execFileSync(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "build", "--outDir", dir, "--emptyOutDir", "--logLevel", "error"],
  { cwd: ROOT, env: e, stdio: ["ignore", "ignore", "pipe"] });
let built = false;
try { viteBuild(outDir, buildEnv); built = true; } catch (e) { check("FAMILY-Build", false, String(e.stderr || e.message).split("\n")[0]); }
if (built) check("FAMILY-Build", true);
// LEGACY-Build (unverändertes Verhalten; nur für Font-/Härtungsprüfung, Werte sind Platzhalter)
const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-release-legacy-"));
let legacyBundle = "";
try {
  viteBuild(legacyDir, { ...env, VITE_BACKEND_MODE: "legacy", VITE_SUPABASE_URL: "https://placeholderplaceholder2.supabase.co", VITE_SUPABASE_ANON_KEY: "placeholder-anon" });
  check("LEGACY-Build", true);
} catch (e) { check("LEGACY-Build", false, String(e.stderr || e.message).split("\n")[0]); }

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
  check("FAMILY-Bundle: keine externen Fonts (fonts.googleapis.com / fonts.gstatic.com)", !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(bundle));
  check("FAMILY-Bundle: Fredoka lokal eingebunden (woff2)", walk(outDir).some((f) => /fredoka.*\.woff2$/i.test(f)));
}
try {
  legacyBundle = walk(legacyDir).filter((f) => /\.(js|html|css)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  if (legacyBundle) check("LEGACY-Bundle: keine externen Fonts", !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(legacyBundle));
} catch { /* Build fehlgeschlagen – bereits gemeldet */ }
fs.rmSync(outDir, { recursive: true, force: true });
fs.rmSync(legacyDir, { recursive: true, force: true });
const srcAll = walk(path.join(ROOT, "src")).filter((f) => /\.(js|jsx|css|html)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n") + fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
check("Quellcode: keine externen Font-URLs", !/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(srcAll));
const minPw = Number(/export const MIN_PASSWORD_LENGTH = (\d+)/.exec(fs.readFileSync(path.join(ROOT, "src/lib/auth.js"), "utf8"))?.[1]);
check("Passwort-Minimum im Code = 8 (Registrierung, Passwort ändern, Recovery)", minPw === 8, `MIN_PASSWORD_LENGTH=${minPw}`);

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
check("Rechtliche Links gesetzt", missingLegal.length === 0, missingLegal.join(", "), profile === "production" ? "fail" : profile === "pre-go" ? "extern" : "warn");

// ---------------------------------------------------------------- 6. Backend-Ziel
const famRef = refOf(env.VITE_FAMILY_SUPABASE_URL || "");
if (profile === "preview") {
  check("Preview: FAMILY-Backend ist das Testprojekt", !env.VITE_FAMILY_SUPABASE_URL || famRef === TEST_PROJECT_REF, famRef ? "anderes Projekt" : "", env.VITE_FAMILY_SUPABASE_URL ? "fail" : "warn");
} else if (profile === "production") {
  check("Production: VITE_BACKEND_MODE=family", String(env.VITE_BACKEND_MODE || "").trim().toLowerCase() === "family", env.VITE_BACKEND_MODE ? "anderer Modus" : "nicht gesetzt");
  check("Production: VITE_FAMILY_SUPABASE_URL gesetzt", !!famRef);
  check("Production: FAMILY-Backend ist NICHT das Testprojekt", famRef && famRef !== TEST_PROJECT_REF);
  // Legacy-Env-Cutover: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY werden beim Cutover aus Vercel Production entfernt
  // (Rollback: Werte aus dem Passwortmanager wieder eintragen + VITE_BACKEND_MODE=legacy, siehe Runbook Rollback C).
  check("Production: Legacy-Variablen entfernt (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)", !env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_ANON_KEY,
    [env.VITE_SUPABASE_URL && "VITE_SUPABASE_URL", env.VITE_SUPABASE_ANON_KEY && "VITE_SUPABASE_ANON_KEY"].filter(Boolean).join(", "));
  for (const n of ["VITE_AUTH_REDIRECT_URL", "VITE_INVITE_BASE_URL"]) {
    let ok = false; try { ok = new URL(env[n] || "").protocol === "https:"; } catch { /* */ }
    check(`Production: ${n} gesetzt (https)`, ok);
  }
  // Externe Voraussetzungen: nur ein Mensch kann sie bestätigen (Runbook STOP 7)
  check("Production: SMTP eingerichtet und getestet (WC_GO_SMTP_CONFIRMED=yes)", env.WC_GO_SMTP_CONFIRMED === "yes");
  check("Production: Rechtstexte veröffentlicht und geprüft (WC_GO_LEGAL_CONFIRMED=yes)", env.WC_GO_LEGAL_CONFIRMED === "yes");
}

// ---------------------------------------------------------------- 8. PRE-GO (Paketstand für Phase 6B2)
if (profile === "pre-go") {
  const git = (...a) => execFileSync("git", a, { cwd: ROOT }).toString().trim();
  let head = null, dirty = true;
  try { head = git("rev-parse", "HEAD"); dirty = git("status", "--porcelain").length > 0; } catch { /* */ }
  check("PRE-GO: Commit bekannt", !!head, head ? head.slice(0, 12) : "");
  check("PRE-GO: Arbeitsbaum sauber", !dirty, dirty ? "uncommittete Änderungen" : "");
  // npm audit (braucht Netz zur Registry)
  let audit = null;
  try { audit = JSON.parse(execFileSync("npm", ["audit", "--json"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString()); }
  catch (e) { try { audit = JSON.parse(String(e.stdout || "")); } catch { audit = null; } }
  const vulns = audit?.metadata?.vulnerabilities;
  check("PRE-GO: npm audit 0 Schwachstellen", vulns && vulns.total === 0, vulns ? `total ${vulns.total}` : "npm audit nicht auswertbar");
  // Bootstrap: generierbar, deterministisch, Generalprobe zum aktuellen Stand
  let boot = null;
  try {
    const { buildBootstrap } = await import(pathToFileURL(path.join(ROOT, "scripts/generate-production-bootstrap.mjs")).href);
    const a = buildBootstrap(), b = buildBootstrap();
    boot = a.psql === b.psql ? a : null;
    check("PRE-GO: Produktions-Bootstrap generierbar und deterministisch", !!boot, boot ? `sha256 ${createHash("sha256").update(a.psql).digest("hex").slice(0, 16)}…` : "nicht deterministisch");
  } catch (e) { check("PRE-GO: Produktions-Bootstrap generierbar und deterministisch", false, e.message); }
  if (boot) {
    const bootSha = createHash("sha256").update(boot.psql).digest("hex");
    check("PRE-GO: Bootstrap ohne Import-/Test-Hintertür", !/create (or replace )?function public\.(legacy_import_redemptions|test_add_family_member)/i.test(boot.psql));
    check("PRE-GO: create_family für Clients entzogen (Bootstrap)", /revoke all on function public\.create_family\(text\) from public, anon, authenticated/i.test(boot.psql));
    check("PRE-GO: families-DELETE für Clients entzogen (Bootstrap)", /revoke delete on (table )?public\.families from/i.test(boot.psql));
    let reh = null; try { reh = JSON.parse(fs.readFileSync(path.join(ROOT, "local-release/bootstrap-rehearsal.json"), "utf8")); } catch { /* */ }
    const fpSha = createHash("sha256").update(fs.readFileSync(path.join(ROOT, "supabase/production/expected_schema_fingerprint.tsv"))).digest("hex");
    check("PRE-GO: frische Bootstrap-Generalprobe OK (Fingerabdruck, Fehlerfälle, SQL-Checks)", reh?.ok === true, reh ? `${reh.checks} Prüfungen` : "node scripts/rehearse-production-bootstrap.mjs ausführen");
    check("PRE-GO: Generalprobe passt zum aktuellen Bootstrap und Fingerabdruck", reh && reh.bootstrapSha256?.psql === bootSha && reh.expectedFingerprintSha256 === fpSha);
  }
  // Migrationsskript: Guards offline prüfbar (kein Netz, kein Ziel)
  try {
    const pm = await import(pathToFileURL(path.join(ROOT, "scripts/lib/productionMigration.mjs")).href);
    const throws = (f) => { try { f(); return false; } catch (e) { return e instanceof pm.ProductionGuardError; } };
    const guards = [
      throws(() => pm.resolveTarget(["--target=production", "--confirm-production=falsch"])),
      throws(() => pm.resolveTarget(["--target=production"])),
      !throws(() => pm.resolveTarget(["--target=production", `--confirm-production=${pm.PRODUCTION_REF}`])),
      throws(() => pm.assertTargetEnv({ MIGRATION_TARGET_URL: `https://${TEST_PROJECT_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_publishable_x" }, { kind: "production", expectedRef: pm.PRODUCTION_REF })),
      throws(() => pm.assertTargetEnv({ MIGRATION_TARGET_URL: `https://${pm.PRODUCTION_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_secret_x" }, { kind: "production", expectedRef: pm.PRODUCTION_REF })),
      throws(() => pm.assertBackup({ sourceRef: pm.PRODUCTION_REF, exportedAt: new Date(Date.now() - 3 * 3600e3).toISOString() }, { kind: "production", source: pm.PRODUCTION_REF }, { now: new Date(), maxAgeMin: 15, requireFresh: true })),
      throws(() => pm.assertBackup({ sourceRef: "synthetic-rehearsal", exportedAt: new Date().toISOString() }, { kind: "production", source: pm.PRODUCTION_REF }, { now: new Date(), maxAgeMin: 15, requireFresh: true })),
    ];
    check("PRE-GO: Migrationsskript Produktionsmodus – Guards greifen (Ref, Testprojekt, Secret-Key, altes/fremdes Backup)", guards.every(Boolean), `${guards.filter(Boolean).length}/${guards.length}`);
    const { syntheticLegacy } = await import(pathToFileURL(path.join(ROOT, "scripts/create-synthetic-legacy-backup.mjs")).href);
    const lm = await import(pathToFileURL(path.join(ROOT, "scripts/lib/legacyMigration.mjs")).href);
    const plan = lm.buildMigrationPlan(syntheticLegacy({ now: new Date("2026-09-28T12:00:00Z") }), { now: new Date("2026-09-28T12:00:00Z") });
    check("PRE-GO: Dry-Run-Plan offline berechenbar (synthetisches Backup)", plan && Object.keys(lm.expectedCounts(plan)).length > 0);
  } catch (e) { check("PRE-GO: Migrationsskript Produktionsmodus", false, e.message); }
  // Env-Namen dokumentiert
  const envDoc = fs.existsSync(path.join(ROOT, "docs/appstore/PRODUCTION_ENVIRONMENT.md")) ? fs.readFileSync(path.join(ROOT, "docs/appstore/PRODUCTION_ENVIRONMENT.md"), "utf8") : "";
  const envNames = [...new Set([...used, "VITE_NATIVE_AUTH_REDIRECT_URL", "WC_APP_ORIGIN", "WC_ALLOWED_ORIGINS", "WC_ALLOW_DEV_ORIGINS", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"])];
  const missingDoc = envNames.filter((n) => !envDoc.includes("`" + n + "`"));
  check("PRE-GO: alle Env-Namen in PRODUCTION_ENVIRONMENT.md dokumentiert", envDoc && missingDoc.length === 0, missingDoc.join(", "));
  // Externe GO-Voraussetzungen (nicht durch Code erfüllbar)
  check("EXTERN: SMTP-Anbieter eingerichtet und getestet (SMTP_SETUP_CHECKLIST.md)", env.WC_GO_SMTP_CONFIRMED === "yes", "offen – menschliche Entscheidung", "extern");
  check("EXTERN: Datenschutz/Impressum/Support veröffentlicht (Betreiberdaten)", env.WC_GO_LEGAL_CONFIRMED === "yes", "offen – menschliche Entscheidung", "extern");
}

// ---------------------------------------------------------------- Ausgabe
let fails = 0, warns = 0, extern = 0;
for (const r of results) {
  const tag = r.ok ? "PASS" : r.level === "warn" ? "WARN" : r.level === "extern" ? "EXTERN" : "FAIL";
  if (!r.ok && r.level === "warn") warns++; else if (!r.ok && r.level === "extern") extern++; else if (!r.ok) fails++;
  console.log(`${tag} | ${r.name}${r.detail ? " – " + r.detail : ""}`);
}
console.log(`\nProfil ${profile}: ${results.length - fails - warns - extern} PASS, ${warns} WARN, ${extern} EXTERN offen, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
