#!/usr/bin/env node
// Produktions-Bootstrap-Generator (Phase 6B1).
//
// Erzeugt aus den UNVERÄNDERTEN Repo-Migrationen (supabase/migrations/) einen einzigen,
// kontrollierten Produktions-Bootstrap. Nur exakt bekannte Test-Guard-Blöcke und die
// begin;/commit;-Zeilen der Einzelmigrationen werden entfernt – alles andere bleibt byte-gleich.
// Jede Abweichung vom freigegebenen Manifest (supabase/production/bootstrap-manifest.json) → Abbruch.
//
//   node scripts/generate-production-bootstrap.mjs            # schreibt nach local-release/
//   node scripts/generate-production-bootstrap.mjs --check    # nur prüfen (2× erzeugen, byte-identisch?)
//   node scripts/generate-production-bootstrap.mjs --out <verzeichnis>
//
// Ausgabe (local-release/, von Git ignoriert):
//   production-bootstrap.sql      – für psql (eine Transaktion: begin … commit)
//   production-bootstrap.mcp.sql  – identischer Inhalt ohne begin/commit (Supabase MCP apply_migration)
//   production-bootstrap.meta.json – SHA-256, Quellliste, Generator-Version, Zeit, Git-Commit, erwarteter Fingerabdruck
// Ausführung (NUR in Phase 6B2 nach Freigabe), vorher in derselben Sitzung/Transaktion:
//   set app.migration_target = 'production';
//   set app.confirm_project_ref = '<Produktions-Ref>';
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const GENERATOR_VERSION = "6B1.1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_FILE = path.join(ROOT, "supabase/production/bootstrap-manifest.json");
export const EXPECTED_FINGERPRINT_FILE = path.join(ROOT, "supabase/production/expected_schema_fingerprint.tsv");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");

// Exakt bekannter Test-Guard (in allen Migrationen byte-gleich). Wird zusätzlich per SHA-256 geprüft.
export const TEST_GUARD_BLOCK = [
  "do $$",
  "begin",
  "  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then",
  "    raise exception 'Abbruch: Entwurf nur für ein Testprojekt. Vorher \"set app.migration_target = ''test'';\" ausführen.';",
  "  end if;",
  "end",
  "$$;",
  "",
].join("\n");

export class BootstrapError extends Error {}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Eine Migration transformieren: Guard + begin/commit entfernen; strikte Strukturprüfung.
export function transformMigration(file, text, manifest) {
  if (sha256(TEST_GUARD_BLOCK) !== manifest.testGuardSha256) throw new BootstrapError("Guard-Konstante passt nicht zum Manifest.");
  const count = (s, sub) => s.split(sub).length - 1;
  if (count(text, TEST_GUARD_BLOCK) !== 1) throw new BootstrapError(`${file}: Test-Guard nicht genau einmal exakt vorhanden.`);
  const lines = text.split("\n");
  const beginIdx = lines.map((l, i) => (l === "begin;" ? i : -1)).filter((i) => i >= 0);
  const commitIdx = lines.map((l, i) => (l === "commit;" ? i : -1)).filter((i) => i >= 0);
  if (beginIdx.length !== 1 || commitIdx.length !== 1) throw new BootstrapError(`${file}: genau eine Zeile "begin;" und "commit;" erwartet.`);
  const guardLine = text.slice(0, text.indexOf(TEST_GUARD_BLOCK)).split("\n").length - 1; // Zeilennummer des Guard-Starts
  if (!(beginIdx[0] < guardLine)) throw new BootstrapError(`${file}: "begin;" muss vor dem Guard stehen.`);
  if (lines.slice(commitIdx[0] + 1).some((l) => l.trim() !== "")) throw new BootstrapError(`${file}: nach "commit;" darf nichts mehr folgen.`);
  // Zwischen begin; und Guard nur Leerzeilen
  if (lines.slice(beginIdx[0] + 1, guardLine).some((l) => l.trim() !== "")) throw new BootstrapError(`${file}: zwischen "begin;" und Guard nur Leerzeilen erlaubt.`);
  let body = text.replace(TEST_GUARD_BLOCK, "");
  const bl = body.split("\n");
  const b = bl.indexOf("begin;"), c = bl.lastIndexOf("commit;");
  bl.splice(c, 1); bl.splice(b, 1);
  body = bl.join("\n");
  // Nach der Entfernung darf "migration_target" nur noch in Kommentarzeilen vorkommen
  const leftover = body.split("\n").filter((l) => /migration_target/.test(l) && !/^\s*--/.test(l));
  if (leftover.length) throw new BootstrapError(`${file}: unerwarteter Guard-Rest außerhalb von Kommentaren.`);
  if (body.split("\n").some((l) => /^\s*(begin|commit|rollback);\s*$/i.test(l))) {
    throw new BootstrapError(`${file}: weitere Transaktionssteuerung gefunden.`);
  }
  return body.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function productionPrologue(manifest) {
  const prod = manifest.productionProjectRef, test = manifest.testProjectRef;
  return `-- ===== Produktions-Guard (vom Generator erzeugt) =====
do $$
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'production' then
    raise exception 'Abbruch: Produktions-Bootstrap nur mit "set app.migration_target = ''production'';".';
  end if;
  if coalesce(current_setting('app.confirm_project_ref', true), '') = '${test}' then
    raise exception 'Abbruch: Das Testprojekt ist kein Produktionsziel.';
  end if;
  if coalesce(current_setting('app.confirm_project_ref', true), '') <> '${prod}' then
    raise exception 'Abbruch: Zielprojekt nicht bestätigt ("set app.confirm_project_ref = ''<Produktions-Ref>'';").';
  end if;
  if to_regclass('public.app_state') is null then
    raise exception 'Abbruch: public.app_state fehlt – das ist nicht das Legacy-Produktionsprojekt.';
  end if;
  if not exists (select 1 from public.app_state where id = 'family-main') then
    raise exception 'Abbruch: family-main fehlt in public.app_state.';
  end if;
  if to_regclass('public.families') is not null or to_regclass('public.family_members') is not null
     or to_regclass('private.family_security') is not null or to_regclass('public.family_sync') is not null then
    raise exception 'Abbruch: FAMILY-Schema existiert bereits – der Bootstrap darf nur einmal laufen.';
  end if;
  -- Legacy-Fingerabdruck (Inhalt + Struktur + Policies + Realtime) für den Nachher-Vergleich merken
  perform set_config('wc.app_state_fp', (
    select md5(coalesce((select string_agg(md5(t::text), ',' order by md5(t::text)) from public.app_state t), '')
      || '|' || coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by ordinal_position)
                          from information_schema.columns where table_schema = 'public' and table_name = 'app_state'), '')
      || '|' || coalesce((select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' order by policyname)
                          from pg_policies where schemaname = 'public' and tablename = 'app_state'), '')
      || '|' || (select count(*)::text from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'))
  ), true);
end
$$;
`;
}

export function productionEpilogue() {
  return `-- ===== Nachher-Prüfung (vom Generator erzeugt) =====
do $$
declare v_now text;
begin
  select md5(coalesce((select string_agg(md5(t::text), ',' order by md5(t::text)) from public.app_state t), '')
      || '|' || coalesce((select string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, ''), ',' order by ordinal_position)
                          from information_schema.columns where table_schema = 'public' and table_name = 'app_state'), '')
      || '|' || coalesce((select string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), ',' order by policyname)
                          from pg_policies where schemaname = 'public' and tablename = 'app_state'), '')
      || '|' || (select count(*)::text from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'))
    into v_now;
  if v_now is distinct from current_setting('wc.app_state_fp', true) then
    raise exception 'Abbruch: public.app_state (family-main) wurde verändert – Rollback.';
  end if;
  if to_regclass('public.families') is null or to_regclass('public.user_membership_sync') is null then
    raise exception 'Abbruch: FAMILY-Schema unvollständig.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and (p.proname like 'legacy_import_redemptions%' or p.proname = 'test_add_family_member')) then
    raise exception 'Abbruch: Test-/Importfunktion im Zielschema.';
  end if;
  if has_function_privilege('authenticated', 'public.create_family(text)', 'EXECUTE') then
    raise exception 'Abbruch: create_family ist für Clients ausführbar.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and cmd in ('DELETE', 'ALL'))
     or has_table_privilege('authenticated', 'public.families', 'DELETE') then
    raise exception 'Abbruch: direktes DELETE auf families möglich.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'family-media' and public = false) then
    raise exception 'Abbruch: privater Bucket family-media fehlt.';
  end if;
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('family_sync', 'user_membership_sync')) <> 2 then
    raise exception 'Abbruch: Realtime-Publikation unvollständig.';
  end if;
end
$$;
`;
}

// Kompletten Bootstrap (deterministisch, ohne Zeitstempel) erzeugen.
export function buildBootstrap({ manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")), dir = MIGRATIONS_DIR, read = (f) => fs.readFileSync(path.join(dir, f), "utf8") } = {}) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const expected = manifest.migrations.map((m) => m.file);
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new BootstrapError(`Migrationsliste weicht vom Manifest ab (Repo: ${files.length}, Manifest: ${expected.length}).`);
  const sections = manifest.migrations.map(({ file, sha256: h }) => {
    const text = read(file);
    if (sha256(text) !== h) throw new BootstrapError(`${file}: SHA-256 weicht vom Manifest ab – Migration verändert? Abbruch.`);
    return `-- >>> ${file} (sha256 ${h})\n${transformMigration(file, text, manifest)}-- <<< ${file}\n`;
  });
  const header = `-- =====================================================================
-- Wochen Champion – PRODUKTIONS-BOOTSTRAP (generiert, nicht von Hand bearbeiten)
-- Generator ${GENERATOR_VERSION} · Manifest v${manifest.manifestVersion} · ${manifest.migrations.length} Quellmigrationen
-- Ausführung nur nach ausdrücklicher Freigabe (Runbook STOP 3/4). Vorher in derselben Sitzung:
--   set app.migration_target = 'production';
--   set app.confirm_project_ref = '<Produktions-Ref>';
-- =====================================================================
`;
  const inner = [productionPrologue(manifest), ...sections, productionEpilogue()].join("\n");
  const mcp = header + "\n" + inner;
  const psql = header + "\nbegin;\n\n" + inner + "\ncommit;\n";
  return { psql, mcp, sources: manifest.migrations };
}

function gitInfo() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString().trim().length > 0;
    return { commit, dirty };
  } catch { return { commit: null, dirty: null }; }
}

export function generate({ outDir = path.join(ROOT, "local-release"), now = new Date() } = {}) {
  const a = buildBootstrap(), b = buildBootstrap();
  if (a.psql !== b.psql || a.mcp !== b.mcp) throw new BootstrapError("Nicht deterministisch: zwei Läufe liefern unterschiedliche Ausgaben.");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "production-bootstrap.sql"), a.psql, { mode: 0o600 });
  fs.writeFileSync(path.join(outDir, "production-bootstrap.mcp.sql"), a.mcp, { mode: 0o600 });
  const fp = fs.existsSync(EXPECTED_FINGERPRINT_FILE) ? sha256(fs.readFileSync(EXPECTED_FINGERPRINT_FILE)) : null;
  const meta = {
    generatorVersion: GENERATOR_VERSION, createdAt: now.toISOString(), git: gitInfo(),
    sha256: { psql: sha256(a.psql), mcp: sha256(a.mcp) }, bytes: { psql: Buffer.byteLength(a.psql), mcp: Buffer.byteLength(a.mcp) },
    sources: a.sources, expectedFingerprint: fp ? { file: path.relative(ROOT, EXPECTED_FINGERPRINT_FILE), sha256: fp } : null,
  };
  fs.writeFileSync(path.join(outDir, "production-bootstrap.meta.json"), JSON.stringify(meta, null, 2) + "\n", { mode: 0o600 });
  return meta;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.includes("--check")) {
      const a = buildBootstrap(), b = buildBootstrap();
      if (a.psql !== b.psql) throw new BootstrapError("Nicht deterministisch.");
      console.log(`OK – deterministisch, SHA-256 psql ${sha256(a.psql)}, mcp ${sha256(a.mcp)}, ${a.sources.length} Quellmigrationen`);
    } else {
      const oi = args.indexOf("--out");
      const meta = generate(oi >= 0 ? { outDir: path.resolve(args[oi + 1]) } : {});
      console.log(`Bootstrap erzeugt: ${meta.sources.length} Quellmigrationen, SHA-256 psql ${meta.sha256.psql}, mcp ${meta.sha256.mcp}`);
      if (meta.git.dirty) console.log("Hinweis: Arbeitsbaum nicht sauber – für Produktion nur aus sauberem, getaggtem Commit erzeugen.");
    }
  } catch (e) { console.error("Abbruch:", e.message); process.exit(e instanceof BootstrapError ? 2 : 1); }
}
