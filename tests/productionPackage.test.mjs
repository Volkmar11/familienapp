// Phase 6B1: Produktions-Bootstrap-Generator, Produktionsmodus-Guards des Migrationsskripts, Einlösungs-Import-SQL
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildBootstrap, transformMigration, BootstrapError } from "../scripts/generate-production-bootstrap.mjs";
import { buildImportSql, ImportSqlError, MAX_EXPIRY_MINUTES } from "../scripts/generate-redemption-import.mjs";
import { resolveTarget, assertBackup, assertTargetEnv, readProductionBackup, deterministicUuid, goCheck, mainProduction,
  ProductionGuardError, PRODUCTION_REF, REHEARSAL_REF } from "../scripts/lib/productionMigration.mjs";
import { syntheticBackup } from "../scripts/create-synthetic-legacy-backup.mjs";

const manifest = JSON.parse(fs.readFileSync(new URL("../supabase/production/bootstrap-manifest.json", import.meta.url), "utf8"));
const guardErr = (f) => assert.throws(f, ProductionGuardError);

// ---------------------------------------------------------------- Bootstrap
test("Bootstrap: deterministisch, ohne Test-Guard, mit Produktions-Prolog/-Epilog", () => {
  const a = buildBootstrap(), b = buildBootstrap();
  assert.equal(a.psql, b.psql);
  assert.equal(a.mcp, b.mcp);
  assert.doesNotMatch(a.psql, /app\.migration_target', true\), ''\) <> 'test'/);
  assert.match(a.psql, /app\.migration_target', true\), ''\) <> 'production'/);
  assert.match(a.psql, /confirm_project_ref/);
  assert.equal((a.psql.match(/^begin;$/gm) || []).length, 1);
  assert.equal((a.psql.match(/^commit;$/gm) || []).length, 1);
  assert.equal((a.mcp.match(/^(begin|commit);$/gm) || []).length, 0);
  for (const m of manifest.migrations) assert.ok(a.psql.includes(`-- >>> ${m.file} (sha256 ${m.sha256})`), m.file);
  assert.doesNotMatch(a.psql, /create (or replace )?function public\.(test_add_family_member|legacy_import_redemptions)/i);
});

test("Bootstrap: veränderte Migration (Hash) oder fehlende Datei → Abbruch", () => {
  const dir = path.join(new URL("..", import.meta.url).pathname, "supabase/migrations");
  const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
  assert.throws(() => buildBootstrap({ read: (f) => (f === manifest.migrations[2].file ? read(f) + "\n-- geändert\n" : read(f)) }), BootstrapError);
  assert.throws(() => buildBootstrap({ manifest: { ...manifest, migrations: manifest.migrations.slice(1) } }), BootstrapError);
});

test("transformMigration: Guard muss genau einmal vorkommen, kein Text nach commit", () => {
  const dir = path.join(new URL("..", import.meta.url).pathname, "supabase/migrations");
  const f = manifest.migrations[0].file, t = fs.readFileSync(path.join(dir, f), "utf8");
  assert.throws(() => transformMigration(f, t.replace(/do \$\$[\s\S]*?\$\$;\n/, ""), manifest), BootstrapError);
  assert.throws(() => transformMigration(f, t + "select 1;\n", manifest), BootstrapError);
  const out = transformMigration(f, t, manifest);
  assert.doesNotMatch(out, /^\s*(begin|commit);\s*$/m);
});

// ---------------------------------------------------------------- Import-SQL
test("Import-SQL: fest an Familie/owner gebunden, Ablaufzeit, keine anon-Rechte, Drop prüft exakten Namen", () => {
  const fam = "11111111-1111-4111-8111-111111111111", own = "22222222-2222-4222-8222-222222222222";
  const r = buildImportSql({ familyId: fam, ownerId: own, expiresAt: "2026-10-01T10:00:00Z" });
  assert.match(r.create, new RegExp(`c_family\\s+constant uuid\\s+:= '${fam}'`));
  assert.match(r.create, new RegExp(`c_owner\\s+constant uuid\\s+:= '${own}'`));
  assert.match(r.create, /security definer\s+set search_path = ''/);
  assert.match(r.create, /revoke all on function public\.legacy_import_redemptions_once\(jsonb\) from public, anon;/);
  assert.match(r.create, /Einlösungen wurden bereits importiert/);
  assert.doesNotMatch(r.create, /p_family|family_id\s+uuid\s*[,)]/, "family_id darf kein Parameter sein");
  assert.match(r.drop, /drop function if exists public\.legacy_import_redemptions_once\(jsonb\)/);
  assert.match(r.drop, /proname = 'legacy_import_redemptions_once'/);
  assert.equal(r.expiresAt, "2026-10-01T10:00:00.000Z");
  assert.throws(() => buildImportSql({ familyId: "x", ownerId: own, expiresAt: new Date() }), ImportSqlError);
  assert.throws(() => buildImportSql({ familyId: fam, ownerId: "'; drop table x; --", expiresAt: new Date() }), ImportSqlError);
  assert.throws(() => buildImportSql({ familyId: fam, ownerId: own, expiresAt: "kein Datum" }), ImportSqlError);
  assert.ok(MAX_EXPIRY_MINUTES <= 180);
});

// ---------------------------------------------------------------- Produktionsmodus-Guards
test("resolveTarget: Produktion nur mit exakter Ref-Bestätigung, Generalprobe nur auf dem Testprojekt", () => {
  guardErr(() => resolveTarget(["--target=production"]));
  guardErr(() => resolveTarget(["--target=production", "--confirm-production=" + REHEARSAL_REF]));
  guardErr(() => resolveTarget(["--target=production", "--confirm-production=" + PRODUCTION_REF.toUpperCase()]));
  assert.equal(resolveTarget(["--target=production", "--confirm-production=" + PRODUCTION_REF]).expectedRef, PRODUCTION_REF);
  guardErr(() => resolveTarget(["--target=rehearsal", "--confirm-rehearsal=" + PRODUCTION_REF]));
  assert.equal(resolveTarget(["--target=rehearsal", "--confirm-rehearsal=" + REHEARSAL_REF]).expectedRef, REHEARSAL_REF);
  guardErr(() => resolveTarget(["--target=staging"]));
});

test("assertTargetEnv: Testprojekt als Produktion, fremder Host, Secret-Key → Abbruch", () => {
  const prod = resolveTarget(["--target=production", "--confirm-production=" + PRODUCTION_REF]);
  guardErr(() => assertTargetEnv({ MIGRATION_TARGET_URL: `https://${REHEARSAL_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_publishable_x" }, prod));
  guardErr(() => assertTargetEnv({ MIGRATION_TARGET_URL: "https://example.org", MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_publishable_x" }, prod));
  guardErr(() => assertTargetEnv({ MIGRATION_TARGET_URL: `https://${PRODUCTION_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_secret_abc" }, prod));
  guardErr(() => assertTargetEnv({ MIGRATION_TARGET_URL: `https://${PRODUCTION_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "" }, prod));
  assert.equal(assertTargetEnv({ MIGRATION_TARGET_URL: `https://${PRODUCTION_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_publishable_x" }, prod), PRODUCTION_REF);
});

test("assertBackup: Herkunft, Frische (Standard 15 min), bewusster Override, Zukunftsdatum", () => {
  const prod = resolveTarget(["--target=production", "--confirm-production=" + PRODUCTION_REF]);
  const now = new Date("2026-09-28T12:00:00Z");
  const b = (min, src = PRODUCTION_REF) => ({ sourceRef: src, exportedAt: new Date(now - min * 60000).toISOString() });
  assert.ok(assertBackup(b(5), prod, { now, maxAgeMin: 15, requireFresh: true }) >= 0);
  guardErr(() => assertBackup(b(30), prod, { now, maxAgeMin: 15, requireFresh: true }));
  assert.ok(assertBackup(b(30), prod, { now, maxAgeMin: 60, requireFresh: true }) > 15);
  guardErr(() => assertBackup(b(5, "synthetic-rehearsal"), prod, { now, maxAgeMin: 15, requireFresh: true }));
  guardErr(() => assertBackup(b(-10), prod, { now, maxAgeMin: 15, requireFresh: true }));
  guardErr(() => assertBackup({ sourceRef: PRODUCTION_REF, exportedAt: null }, prod, { now, maxAgeMin: 15, requireFresh: true }));
});

test("deterministicUuid: gleiche Saat → gleiche UUID-Folge, gültiges v4-Format", () => {
  const a = deterministicUuid("abc"), b = deterministicUuid("abc"), c = deterministicUuid("abd");
  const xa = [a(), a(), a()], xb = [b(), b(), b()];
  assert.deepEqual(xa, xb);
  assert.notEqual(c(), xa[0]);
  for (const u of xa) assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("mainProduction: Dry-Run offline, Apply ohne passenden Dry-Run / aus unsauberem Baum blockiert", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-pm-"));
  const now = new Date();
  const bk = syntheticBackup({ now, exportedAt: now });
  bk.source_project = PRODUCTION_REF; // Produktions-Herkunft simulieren
  const file = path.join(dir, "backup.json");
  fs.writeFileSync(file, JSON.stringify(bk));
  const P = ["--target=production", "--confirm-production=" + PRODUCTION_REF, "--backup", file];
  const clean = { commit: "c0ffee", dirty: false, id: "c0ffee" }, log = () => {};
  const r = await mainProduction([...P, "--dry-run"], {}, { releaseDir: dir, git: clean, log, now });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "dry-run.json"), "utf8")).backupSha256, readProductionBackup(file).sha256);
  await assert.rejects(mainProduction([...P, "--dry-run"], {}, { releaseDir: dir, git: { ...clean, dirty: true }, log, now }), ProductionGuardError);
  // Apply gegen das Testprojekt als „Produktion“ → Abbruch vor jeder Verbindung
  await assert.rejects(mainProduction([...P, "--apply"], { MIGRATION_TARGET_URL: `https://${REHEARSAL_REF}.supabase.co`, MIGRATION_TARGET_PUBLISHABLE_KEY: "sb_publishable_x" },
    { releaseDir: dir, git: clean, log, now, createClient: () => { throw new Error("darf nicht verbinden"); } }), ProductionGuardError);
  // GO-Check ohne Gates → blockiert
  const g = goCheck({ gates: path.join(dir, "go-gates.json"), state: path.join(dir, "state.json") }, readProductionBackup(file), clean, { kind: "production" }, log);
  assert.equal(g.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- Backup-Export (nur lesend, gemockt)
test("Backup-Export: nur bestätigte Produktions-Ref, nur GET, Herkunft/Zeitstempel im Backup", async () => {
  const { exportLegacyBackup, ExportError } = await import("../scripts/export-legacy-backup.mjs");
  const calls = [];
  const fetchImpl = async (u, o) => { calls.push([u, o.method]); return { ok: true, status: 200, json: async () => [{ id: "family-main", data: { members: [{}, {}], completions: [{}] }, updated_at: "2026-09-28T10:00:00Z" }] }; };
  const url = `https://${PRODUCTION_REF}.supabase.co`, now = new Date("2026-09-28T12:00:00Z");
  const r = await exportLegacyBackup({ url, key: "sb_publishable_x", confirmRef: PRODUCTION_REF, now, fetchImpl });
  assert.deepEqual(calls.map((c) => c[1]), ["GET"]);
  const b = JSON.parse(r.text);
  assert.equal(b.source_project, PRODUCTION_REF);
  assert.equal(b.exported_at, now.toISOString());
  assert.equal(r.summary.counts.members, 2);
  await assert.rejects(exportLegacyBackup({ url, key: "sb_publishable_x", confirmRef: "falsch", now, fetchImpl }), ExportError);
  await assert.rejects(exportLegacyBackup({ url: `https://${REHEARSAL_REF}.supabase.co`, key: "k", confirmRef: REHEARSAL_REF, now, fetchImpl }), ExportError);
  await assert.rejects(exportLegacyBackup({ url, key: "sb_secret_x", confirmRef: PRODUCTION_REF, now, fetchImpl }), ExportError);
  // exportiertes Backup ist im Produktionsmodus lesbar und frisch
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-exp-")), f = path.join(dir, "b.json");
  fs.writeFileSync(f, r.text);
  const rb = readProductionBackup(f);
  assert.equal(rb.sourceRef, PRODUCTION_REF);
  fs.rmSync(dir, { recursive: true, force: true });
});
