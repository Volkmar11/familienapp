#!/usr/bin/env node
// Lokale Generalprobe des Produktions-Bootstraps (Phase 6B1) – KEIN Supabase-Projekt, nur lokales PostgreSQL.
//
//   node scripts/rehearse-production-bootstrap.mjs [--keep]
// Voraussetzung: `psql`/`createdb`/`dropdb` erreichen einen lokalen PostgreSQL-Server als Superuser
// (Standard-PG*-Umgebungsvariablen). Es werden nur Wegwerf-Datenbanken wc_bsr_<zeit>_* angelegt und wieder gelöscht.
//
// Ablauf:
//   A. Referenz: Plattform-Stub + alle Migrationen im Testmodus → Fingerabdruck == supabase/production/expected_schema_fingerprint.tsv
//   B. Produktionssimulation: Stub + simuliertes Legacy-app_state (synthetisches family-main) + generierter Bootstrap
//      Fehlerfälle zuerst (jeweils Abbruch, 0 FAMILY-Tabellen): kein Ziel, Testmodus, Test-Ref, falscher Ref
//      dann korrekter Lauf → app_state-Hash unverändert, Fingerabdruck (ohne app_state) == Erwartung
//      dann zweiter Lauf → Abbruch, Schema/app_state unverändert
//   C. SQL-Sicherheitschecks (supabase/tests/*.sql) gegen das Bootstrap-Ziel
//   D. MCP-Variante (ohne begin/commit) mit vorangestelltem set_config(..., true) in EINER Transaktion → gleicher Fingerabdruck
// Ergebnis: local-release/bootstrap-rehearsal.json (vom PRE-GO-Check gelesen).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildBootstrap } from "./generate-production-bootstrap.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "supabase/production/bootstrap-manifest.json"), "utf8"));
const PROD_REF = manifest.productionProjectRef, TEST_REF = manifest.testProjectRef;
const STUB = path.join(ROOT, "supabase/tests/local/supabase_platform_stub.sql");
const PRODSIM = path.join(ROOT, "supabase/tests/local/production_app_state_sim.sql");
const FP_SQL = path.join(ROOT, "supabase/tests/schema_fingerprint.sql");
const EXPECTED = fs.readFileSync(path.join(ROOT, "supabase/production/expected_schema_fingerprint.tsv"), "utf8");
const SQL_CHECKS = ["account_lifecycle_check.sql", "admin_crud_check.sql", "family_invitations_check.sql", "media_storage_check.sql",
  "onboarding_security_check.sql", "release_hardening_check.sql", "rls_matrix_test.sql"];
const keep = process.argv.includes("--keep");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " – " + detail : ""}`); };

function psql(db, { file, sql, gucs = {} } = {}) {
  const opts = Object.entries(gucs).map(([k, v]) => `-c ${k}=${v}`).join(" ");
  const args = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-d", db, ...(file ? ["-f", file] : ["-c", sql])];
  const r = spawnSync("psql", args, { env: { ...process.env, PGOPTIONS: opts }, encoding: "utf8" });
  return { ok: r.status === 0, out: r.stdout || "", err: (r.stderr || "").split("\n").find((l) => /ERROR|FEHLER/.test(l)) || "" };
}
const createdb = (db) => execFileSync("createdb", [db]);
const dropdb = (db) => spawnSync("dropdb", ["--if-exists", db]);
const familyTables = (db) => Number(psql(db, { sql: "select count(*) from pg_tables where schemaname in ('public','private') and tablename <> 'app_state'" }).out.trim());
const appHash = (db) => psql(db, { sql: "select md5(string_agg(md5(t::text), ',' order by md5(t::text))) from public.app_state t" }).out.trim();
const fingerprint = (db) => psql(db, { file: FP_SQL }).out.split("\n").filter(Boolean).filter((l) => !/(^|\.)app_state(_pkey)?(\.|\t|$)/.test(l)).join("\n") + "\n";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wc-bsr-"));
const boot = buildBootstrap();
const bootFile = path.join(tmp, "production-bootstrap.sql");
fs.writeFileSync(bootFile, boot.psql);
const dbRef = `wc_bsr_${stamp}_ref`, dbProd = `wc_bsr_${stamp}_prod`, dbMcp = `wc_bsr_${stamp}_mcp`;
// So wird die MCP-Variante ausgeführt (Runbook STOP 4, Alternative B): Präfix + Datei als eine Abfrage/Transaktion
export const mcpPrefix = (ref) => `select set_config('app.migration_target', 'production', true), set_config('app.confirm_project_ref', '${ref}', true);\n`;
const mcpFile = path.join(tmp, "production-bootstrap.mcp-run.sql");
fs.writeFileSync(mcpFile, mcpPrefix(PROD_REF) + boot.mcp);

try {
  // ---------------- A. Referenz aus den Migrationen (Testmodus)
  createdb(dbRef);
  psql(dbRef, { file: STUB });
  const migDir = path.join(ROOT, "supabase/migrations");
  let migOk = true;
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    const r = psql(dbRef, { file: path.join(migDir, f), gucs: { "app.migration_target": "test" } });
    if (!r.ok) { migOk = false; check(`Referenz: ${f}`, false, r.err); }
  }
  check(`A Referenz: ${manifest.migrations.length} Migrationen im Testmodus angewendet`, migOk);
  const fpRef = fingerprint(dbRef);
  check("A Referenz-Fingerabdruck == expected_schema_fingerprint.tsv", fpRef === EXPECTED, `${fpRef.split("\n").filter(Boolean).length} Objekte`);

  // ---------------- B. Produktionssimulation
  createdb(dbProd);
  psql(dbProd, { file: STUB });
  psql(dbProd, { file: PRODSIM });
  const h0 = appHash(dbProd);
  const cases = [
    ["ohne app.migration_target", {}],
    ["Testmodus (migration_target=test)", { "app.migration_target": "test", "app.confirm_project_ref": PROD_REF }],
    ["Testprojekt als Ziel", { "app.migration_target": "production", "app.confirm_project_ref": TEST_REF }],
    ["falscher Projekt-Ref", { "app.migration_target": "production", "app.confirm_project_ref": "aaaaaaaaaaaaaaaaaaaa" }],
    ["ohne Ref-Bestätigung", { "app.migration_target": "production" }],
  ];
  for (const [name, gucs] of cases) {
    const r = psql(dbProd, { file: bootFile, gucs });
    check(`B Fehlerfall ${name}: Abbruch, 0 FAMILY-Tabellen, app_state unverändert`, !r.ok && familyTables(dbProd) === 0 && appHash(dbProd) === h0, r.err.replace(/^.*?(ERROR|FEHLER):\s*/, "").slice(0, 90));
  }
  const good = psql(dbProd, { file: bootFile, gucs: { "app.migration_target": "production", "app.confirm_project_ref": PROD_REF } });
  check("B Bootstrap korrekt bestätigt: erfolgreich", good.ok, good.err);
  check("B app_state (family-main) unverändert", appHash(dbProd) === h0, h0);
  const fpProd = fingerprint(dbProd);
  check("B Fingerabdruck Bootstrap-Ziel == Erwartung", fpProd === EXPECTED);
  const second = psql(dbProd, { file: bootFile, gucs: { "app.migration_target": "production", "app.confirm_project_ref": PROD_REF } });
  check("B zweiter Bootstrap: Abbruch, Schema unverändert", !second.ok && fingerprint(dbProd) === EXPECTED && appHash(dbProd) === h0, second.err.replace(/^.*?(ERROR|FEHLER):\s*/, "").slice(0, 90));
  const noImport = psql(dbProd, { sql: "select count(*) from pg_proc where proname in ('legacy_import_redemptions_once','legacy_import_redemptions','test_add_family_member')" }).out.trim();
  check("B keine Import-/Test-Hintertür im Zielschema", noImport === "0");
  const grants = psql(dbProd, { sql: "select has_function_privilege('authenticated','public.create_family(text)','EXECUTE')::text || has_function_privilege('anon','public.create_family(text)','EXECUTE')::text || has_table_privilege('authenticated','public.families','DELETE')::text" }).out.trim();
  check("B create_family für Clients gesperrt, families ohne DELETE", grants === "falsefalsefalse", grants);

  // ---------------- C. SQL-Sicherheitschecks gegen das Bootstrap-Ziel
  for (const f of SQL_CHECKS) {
    const r = psql(dbProd, { file: path.join(ROOT, "supabase/tests", f), gucs: { "app.migration_target": "test" } });
    // Ausgabeformate der Checks: „n|PASS|…“, „Beschreibung|t/f“ oder Summenzeile „bestanden|gesamt|“
    let passes = 0, fails = 0;
    for (const line of r.out.replace(/\t/g, "|").split("\n")) {
      const sum = /^(\d+)\|(\d+)\|$/.exec(line);
      if (sum) { passes += Number(sum[1]); fails += Number(sum[2]) - Number(sum[1]); }
      else if (/\|PASS\|/.test(line) || /\|t$/.test(line)) passes++;
      else if (/\|FAIL\|/.test(line) || /\|f$/.test(line)) fails++;
    }
    check(`C ${f}`, r.ok && fails === 0 && passes > 0, `${passes} ok, ${fails} fail${r.ok ? "" : " – " + r.err.slice(0, 80)}`);
  }

  // ---------------- D. MCP-Variante
  createdb(dbMcp);
  psql(dbMcp, { file: STUB });
  psql(dbMcp, { file: PRODSIM });
  const hm = appHash(dbMcp);
  const r1 = spawnSync("psql", ["-X", "-q", "-1", "-v", "ON_ERROR_STOP=1", "-d", dbMcp, "-f", mcpFile], { encoding: "utf8" });
  check("D MCP-Variante (set_config-Präfix, eine Transaktion): erfolgreich, app_state unverändert", r1.status === 0 && appHash(dbMcp) === hm, (r1.stderr || "").split("\n").find((l) => /ERROR|FEHLER/.test(l)) || "");
  check("D MCP-Variante: Fingerabdruck == Erwartung", fingerprint(dbMcp) === EXPECTED);
} finally {
  if (!keep) { dropdb(dbRef); dropdb(dbProd); dropdb(dbMcp); }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const ok = results.every((r) => r.ok);
let commit = null, dirty = null;
try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim(); dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0; } catch { /* */ }
const report = { ok, at: new Date().toISOString(), git: { commit, dirty }, bootstrapSha256: { psql: sha256(boot.psql), mcp: sha256(boot.mcp) },
  expectedFingerprintSha256: sha256(EXPECTED), checks: results.length, failed: results.filter((r) => !r.ok).map((r) => r.name), keptDatabases: keep ? [dbRef, dbProd, dbMcp] : [] };
fs.mkdirSync(path.join(ROOT, "local-release"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "local-release/bootstrap-rehearsal.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`\nGeneralprobe Bootstrap: ${ok ? "OK" : "FEHLER"} (${results.filter((r) => r.ok).length}/${results.length}) → local-release/bootstrap-rehearsal.json`);
process.exit(ok ? 0 : 1);
