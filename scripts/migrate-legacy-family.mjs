#!/usr/bin/env node
// Phase 5A – Migrationstest: LEGACY family-main (lokales Backup) → FAMILY-Tabellen im TESTPROJEKT.
//
// Modi (genau einer):
//   --dry-run     Backup lesen, Mapping + Validierung, geplante Counts. KEIN Netzwerkzugriff.
//   --reference   wie --dry-run, schreibt zusätzlich local-backups/migration-reference.json (anonym).
//   --apply       Migration ins Testprojekt: markierte Familie „Migration Test“ des Wegwerf-owners
//                 löschen und neu anlegen (andere Familien werden nie angefasst).
//   --verify      FAMILY-Daten über loadFamilyData laden und mit der Referenz vergleichen (+ Counts).
//   --sync-test   sync_weekly_champion zweimal aufrufen und Historie/Marker prüfen.
// Optionen: --backup <datei> (Standard: neuestes local-backups/family-main-*.json)
//           --include-media  (Phase 5B, nur mit --apply/--dry-run) Legacy-Base64-Bilder dekodieren, prüfen,
//                            Metadaten entfernen und in den privaten Bucket family-media laden
//                            (profiles.photo_path / tasks.image_path). Ohne Option: Verhalten wie Phase 5A.
//
// Produktions-/Generalprobenmodus (Phase 6B1): --target=production|rehearsal, siehe scripts/lib/productionMigration.mjs
//   und docs/appstore/PRODUCTION_CUTOVER_RUNBOOK.md. Ohne --target gilt ausschließlich der Testmodus unten.
//
// Umgebung (Secrets nur hier, nie in Dateien des Repos):
//   MIGRATION_TARGET_URL, MIGRATION_TARGET_PUBLISHABLE_KEY, MIGRATION_TARGET_PROJECT_NAME (muss „test“ enthalten)
//   optional MIGRATION_OWNER_EMAIL / MIGRATION_OWNER_PASSWORD / MIGRATION_TEST_PIN
//   Ohne owner-Angaben wird ein Wegwerf-Konto wc-p5a-migration-…@example.com angelegt; Zugangsdaten
//   und Test-PIN landen in local-backups/migration-owner.json (ignoriert, nie committen).
// Ausgaben sind anonym: Profile nur als profile-N, keine Namen, Texte, Fotos oder PINs.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID, randomInt } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildMigrationPlan, analyzeLegacy, expectedCounts, computeReference, compareWithReference, MIGRATION_FAMILY_NAME, METRIC_KEYS,
} from "./lib/legacyMigration.mjs";
import { planMediaImports } from "./lib/legacyMedia.mjs";
import * as Media from "../src/lib/familyMedia.js";
import { deleteFamily, DELETE_FAMILY_PHRASE } from "../src/lib/accountLifecycle.js";
import { mainProduction, ProductionGuardError } from "./lib/productionMigration.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKUP_DIR = path.join(ROOT, "local-backups");
export const REFERENCE_FILE = path.join(BACKUP_DIR, "migration-reference.json");
export const OWNER_FILE = path.join(BACKUP_DIR, "migration-owner.json");
export const STATE_FILE = path.join(BACKUP_DIR, "migration-state.json");
// Produktives Supabase-Projekt – niemals Ziel einer Migration dieses Skripts
export const PRODUCTION_REFS = Object.freeze(["gkkzjmszcjivtaygbmfw"]);
const MODES = ["--dry-run", "--reference", "--apply", "--verify", "--sync-test"];

export class MigrationGuardError extends Error {}

// Ziel prüfen, bevor irgendein Client entsteht. Wirft MigrationGuardError.
export function assertSafeTarget({ url, projectName, key }, backupSourceRef) {
  if (!url || !key) throw new MigrationGuardError("MIGRATION_TARGET_URL und MIGRATION_TARGET_PUBLISHABLE_KEY fehlen.");
  let host;
  try { host = new URL(url).host.toLowerCase(); } catch { throw new MigrationGuardError("MIGRATION_TARGET_URL ist keine gültige URL."); }
  const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(host);
  if (!m) throw new MigrationGuardError("Ziel muss https://<ref>.supabase.co sein.");
  const ref = m[1];
  const forbidden = new Set([...PRODUCTION_REFS, backupSourceRef].filter(Boolean).map((r) => String(r).toLowerCase()));
  if (forbidden.has(ref) || [...forbidden].some((r) => url.toLowerCase().includes(r))) {
    throw new MigrationGuardError("Abbruch: Ziel ist das PRODUKTIONSPROJEKT (bzw. die Quelle des Backups).");
  }
  if (!/test/i.test(projectName || "")) throw new MigrationGuardError("MIGRATION_TARGET_PROJECT_NAME muss das Testprojekt benennen (enthält „test“).");
  if (/service_role|^sb_secret_/i.test(key)) throw new MigrationGuardError("Kein Secret-/service_role-Key – nur der Publishable Key des Testprojekts.");
  return ref;
}

export function findLatestBackup(dir = BACKUP_DIR) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /^family-main-.*\.json$/.test(f)).sort();
  return files.length ? path.join(dir, files.at(-1)) : null;
}

// Backup lesen und validieren (Wrapper mit record oder direkte Zeile)
export function readBackup(file) {
  const buf = fs.readFileSync(file);
  const json = JSON.parse(buf.toString("utf8"));
  const record = json.record ?? json;
  if (record?.id !== "family-main") throw new Error("Backup: id ist nicht family-main.");
  if (!record.data || typeof record.data !== "object") throw new Error("Backup: data fehlt.");
  if (!record.updated_at) throw new Error("Backup: updated_at fehlt.");
  return {
    data: record.data, updatedAt: record.updated_at, sourceRef: json.source_project ?? null,
    sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length, file: path.relative(ROOT, file),
  };
}

const writeLocal = (file, obj) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", { mode: 0o600 }); };
const table = (rows) => rows.map((r) => r.join(" | ")).join("\n");

// ---------------------------------------------------------------------------------------------
// Hauptablauf. deps.createClient ist injizierbar (Tests: Dry-Run erzeugt keinen Client).
// ---------------------------------------------------------------------------------------------
export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  // Phase 6B1: Produktions-/Generalprobenmodus ist ein eigener, strenger Codepfad (scripts/lib/productionMigration.mjs)
  if (argv.some((a) => a.startsWith("--target="))) return mainProduction(argv, env, deps);
  const log = deps.log || ((...a) => console.log(...a));
  const modes = argv.filter((a) => MODES.includes(a));
  if (modes.length !== 1) throw new Error(`Genau ein Modus angeben: ${MODES.join(" | ")}`);
  const mode = modes[0];
  const bi = argv.indexOf("--backup");
  const backupFile = bi >= 0 ? path.resolve(argv[bi + 1]) : findLatestBackup(deps.backupDir);
  if (!backupFile || !fs.existsSync(backupFile)) throw new Error("Kein family-main-Backup gefunden (local-backups/family-main-*.json).");
  const backup = readBackup(backupFile);
  const now = deps.now || new Date();
  const plan = buildMigrationPlan(backup.data, { now });
  const includeMedia = argv.includes("--include-media");
  const media = includeMedia ? planMediaImports(backup.data, plan) : null;

  log(`Quelle: ${backup.file} | updated_at ${backup.updatedAt} | ${backup.bytes} Bytes | SHA-256 ${backup.sha256}`);
  const stats = analyzeLegacy(backup.data);
  log("Legacy (anonym):", JSON.stringify(stats));
  log("Geplante Zielzeilen:", JSON.stringify(expectedCounts(plan)));
  log("Champion:", JSON.stringify({ lastChampionWeek: plan.settings.last_champion_week, source: plan.champion.source, normalizedMarker: plan.champion.normalizedMarker, maxHistoryWeek: plan.champion.maxHistoryWeek, kept: plan.champion.historyKept, dropped: plan.champion.historyDropped }));
  log("Benachrichtigungen:", JSON.stringify(plan.notifications));
  log("Fotos (nicht migriert):", JSON.stringify(plan.photos));
  if (media) {
    log("Medien (--include-media):", JSON.stringify({ ...media.stats, importierbar: media.items.length }));
    media.skipped.forEach((w) => log("Medien übersprungen:", w));
  }
  plan.warnings.forEach((w) => log("Hinweis:", w));
  if (plan.errors.length) { plan.errors.forEach((e) => log("FEHLER:", e)); throw new Error(`${plan.errors.length} Validierungsfehler – Abbruch.`); }

  if (mode === "--dry-run") { log("Dry-Run abgeschlossen – keine Verbindung, keine Schreibvorgänge."); return { mode, plan, stats }; }
  if (mode === "--reference") {
    const reference = { source: { file: backup.file, updatedAt: backup.updatedAt, sha256: backup.sha256 }, ...computeReference(backup.data, plan, now) };
    writeLocal(deps.referenceFile || REFERENCE_FILE, reference);
    log(`Referenz geschrieben (lokal, ignoriert): ${path.relative(ROOT, deps.referenceFile || REFERENCE_FILE)}`);
    log(table([["Profil", ...METRIC_KEYS], ...reference.profiles.map((p) => [p.ref, ...METRIC_KEYS.map((k) => p[k])])]));
    return { mode, plan, reference };
  }

  // ---- ab hier Netzwerk: nur nach Zielprüfung ----
  const target = { url: env.MIGRATION_TARGET_URL, key: env.MIGRATION_TARGET_PUBLISHABLE_KEY, projectName: env.MIGRATION_TARGET_PROJECT_NAME };
  const ref = assertSafeTarget(target, backup.sourceRef);
  log(`Ziel geprüft: Testprojekt ${ref} (≠ Produktion ${PRODUCTION_REFS.join(",")})`);
  const createClient = deps.createClient || (await import("@supabase/supabase-js")).createClient;
  const client = createClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signInOwner(client, env, log, mode === "--apply");

  if (mode === "--apply") return { mode, ...(await apply(client, owner, plan, log, media)) };
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  if (mode === "--verify") return { mode, ...(await verify(client, state, log)) };
  return { mode, ...(await syncTest(client, state, now, log)) };
}

async function signInOwner(client, env, log, allowCreate) {
  let creds = env.MIGRATION_OWNER_EMAIL && env.MIGRATION_OWNER_PASSWORD
    ? { email: env.MIGRATION_OWNER_EMAIL, password: env.MIGRATION_OWNER_PASSWORD, pin: env.MIGRATION_TEST_PIN }
    : fs.existsSync(OWNER_FILE) ? JSON.parse(fs.readFileSync(OWNER_FILE, "utf8")) : null;
  if (!creds) {
    if (!allowCreate) throw new Error("Kein Migrations-owner vorhanden – zuerst --apply ausführen.");
    creds = { email: `wc-p5a-migration-${Date.now()}@example.com`, password: randomUUID(), pin: String(randomInt(0, 10000)).padStart(4, "0") };
    const r = await client.auth.signUp({ email: creds.email, password: creds.password });
    if (r.error || !r.data.session) throw new Error("Wegwerf-owner konnte nicht angelegt werden: " + (r.error?.message || "keine Sitzung"));
    writeLocal(OWNER_FILE, creds);
    log("Wegwerf-owner angelegt (Zugangsdaten nur lokal in local-backups/migration-owner.json).");
  } else {
    const r = await client.auth.signInWithPassword({ email: creds.email, password: creds.password });
    if (r.error) throw new Error("Anmeldung des Migrations-owners fehlgeschlagen: " + r.error.message);
  }
  if (!/@example\.com$/i.test(creds.email)) throw new Error("Migrations-owner muss eine @example.com-Wegwerfadresse sein.");
  if (!/^\d{4}$/.test(creds.pin || "")) throw new Error("MIGRATION_TEST_PIN (4 Ziffern) fehlt.");
  const { data } = await client.auth.getUser();
  // password nur im Speicher (für das Löschen der alten Testfamilie über delete-family), nie loggen
  return { id: data.user.id, pin: creds.pin, password: creds.password };
}

const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
async function insertChunks(client, tbl, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) must(await client.from(tbl).insert(rows.slice(i, i + size)), `Insert ${tbl}`);
}

async function apply(client, owner, plan, log, media = null) {
  // 1. Nur die eigene, eindeutig markierte Migrationsfamilie entfernen (zuerst ihre Medien über die Storage-API)
  const old = must(await client.from("families").select("id").eq("name", MIGRATION_FAMILY_NAME).eq("created_by", owner.id), "Suche alte Testfamilie");
  // Seit Phase 6A kein direktes DELETE auf families: Löschen über die Edge Function delete-family
  // (owner + Test-PIN + frische Anmeldung; entfernt auch alle Medien der Familie).
  for (const f of old) {
    const r = await deleteFamily(client, { familyId: f.id, password: owner.password, pin: owner.pin, phrase: DELETE_FAMILY_PHRASE });
    if (!r.ok) throw new Error(`Löschen alte Testfamilie fehlgeschlagen: ${r.message || r.reason}`);
    if (r.mediaRemoved) log(`Medien der alten Testfamilie entfernt: ${r.mediaRemoved}`);
  }
  log(`Alte Migrationsfamilie(n) entfernt: ${old.length}`);

  // 2. Familie + owner + Einstellungen + neue TEST-PIN (Hash) + Profile über die Onboarding-RPC
  const ob = must(await client.rpc("create_family_with_onboarding", {
    p_request_id: randomUUID(), p_family_name: MIGRATION_FAMILY_NAME, p_pin: owner.pin,
    p_children: plan.profiles.map((p) => ({ name: p.name, avatar_emoji: p.avatar_emoji, color: p.color })),
    p_tasks: [], p_rewards: [],
    p_settings: { show_daily_crown: plan.settings.show_daily_crown, require_confirmation: plan.settings.require_confirmation },
  }), "Onboarding");
  const familyId = ob.family_id;
  const profs = must(await client.from("profiles").select("id, sort_order").eq("family_id", familyId).order("sort_order"), "Profile laden");
  if (profs.length !== plan.profiles.length) throw new Error("Profilanzahl nach Onboarding stimmt nicht.");
  const idByRef = new Map(plan.profiles.map((p) => [p.ref, profs.find((x) => x.sort_order === p.sort_order).id]));
  const parents = plan.profiles.filter((p) => p.is_parent).map((p) => idByRef.get(p.ref));
  if (parents.length) must(await client.from("profiles").update({ is_parent: true }).eq("family_id", familyId).in("id", parents), "is_parent");
  const pid = (r) => idByRef.get(r);
  const asg = (items, fk) => items.flatMap((x) => x.assignedRefs.map((r) => ({ family_id: familyId, [fk]: x.id, profile_id: pid(r) })));

  // 3. Inhalte (owner + RLS)
  await insertChunks(client, "categories", plan.categories.map((c) => ({ id: c.id, family_id: familyId, name: c.name, icon: c.icon, sort_order: c.sort_order })));
  await insertChunks(client, "category_assignments", asg(plan.categories, "category_id"));
  await insertChunks(client, "tasks", plan.tasks.map((t) => ({ id: t.id, family_id: familyId, category_id: t.category_id, title: t.title, icon: t.icon, points: t.points, recurrence: t.recurrence, sort_order: t.sort_order, active: true })));
  await insertChunks(client, "task_assignments", asg(plan.tasks, "task_id"));
  await insertChunks(client, "rewards", plan.rewards.map((r) => ({ id: r.id, family_id: familyId, title: r.title, icon: r.icon, points_required: r.points_required, sort_order: r.sort_order, active: true })));
  await insertChunks(client, "reward_assignments", asg(plan.rewards, "reward_id"));
  await insertChunks(client, "completions", plan.completions.map((c) => ({
    id: c.id, family_id: familyId, profile_id: pid(c.profileRef), task_id: c.task_id, task_title: c.task_title, category_name: c.category_name,
    points: c.points, completed_at: c.completed_at, completion_date: c.completion_date, status: c.status, confirmed_at: c.confirmed_at,
  })));
  // Einlösungen: Client-INSERT ist gesperrt → Test-Hilfsfunktion (nur Testprojekt, nur „Migration Test“, einmalig)
  const nRed = must(await client.rpc("legacy_import_redemptions", { p_family_id: familyId, p_rows: plan.redemptions.map((r) => ({
    id: r.id, profile_id: pid(r.profileRef), reward_id: r.reward_id, reward_title: r.reward_title, points_spent: r.points_spent, redeemed_at: r.redeemed_at, acknowledged: r.acknowledged,
  })) }), "Import Einlösungen");
  await insertChunks(client, "champion_history", plan.championHistory.map((h) => ({
    id: h.id, family_id: familyId, profile_id: h.profileRef ? pid(h.profileRef) : null, profile_name: h.profile_name, profile_avatar: h.profile_avatar, week_start: h.week_start, points: h.points,
  })));
  must(await client.from("family_settings").update({ last_champion_week: plan.settings.last_champion_week }).eq("family_id", familyId), "last_champion_week");

  // 4. Optional: Bilder (erst nach allen Daten; Pfad wird erst nach erfolgreichem Upload gesetzt)
  let mediaResult = null;
  if (media) {
    mediaResult = { profiles: 0, tasks: 0, failed: 0 };
    for (const it of media.items) {
      const blob = new Blob([it.buffer], { type: "image/jpeg" });
      const r = it.kind === "profile"
        ? await Media.uploadProfileImage(client, { familyId, profileId: pid(it.profileRef), blob })
        : await Media.uploadTaskImage(client, { familyId, taskId: it.taskId, blob });
      if (!r.ok) { mediaResult.failed++; continue; }
      mediaResult[it.kind === "profile" ? "profiles" : "tasks"]++;
    }
    log(`Medien importiert: Profilbilder ${mediaResult.profiles}, Aufgabenbilder ${mediaResult.tasks}, fehlgeschlagen ${mediaResult.failed}`);
  }

  writeLocal(STATE_FILE, { familyId, profileIdByRef: Object.fromEntries(idByRef), appliedAt: new Date().toISOString(),
    media: mediaResult ? { expectedProfiles: media.items.filter((i) => i.kind === "profile").length, expectedTasks: media.items.filter((i) => i.kind === "task").length } : null });
  log(`Apply abgeschlossen: Familie ${familyId.slice(0, 8)}…, Einlösungen importiert: ${nRed}`);
  const counts = await countRows(client, familyId);
  const exp = expectedCounts(plan);
  const diff = Object.keys(exp).filter((k) => counts[k] !== exp[k]);
  log(table([["Tabelle", "erwartet", "Ziel"], ...Object.keys(exp).map((k) => [k, exp[k], counts[k]])]));
  if (diff.length) throw new Error(`Count-Abweichung: ${diff.join(", ")}`);
  if (mediaResult?.failed) throw new Error(`${mediaResult.failed} Bild(er) konnten nicht importiert werden.`);
  return { familyId, counts, media: mediaResult };
}

export async function countRows(client, familyId) {
  const c = async (tbl, f = (q) => q) => {
    const r = await f(client.from(tbl).select("*", { count: "exact", head: true }).eq("family_id", familyId));
    if (r.error) throw new Error(`Zählen ${tbl}: ${r.error.message}`);
    return r.count;
  };
  return {
    profiles: await c("profiles"), parentProfiles: await c("profiles", (q) => q.eq("is_parent", true)),
    categories: await c("categories"), categoryAssignments: await c("category_assignments"),
    tasks: await c("tasks"), taskAssignments: await c("task_assignments"),
    rewards: await c("rewards"), rewardAssignments: await c("reward_assignments"),
    completions: await c("completions"), completionsConfirmed: await c("completions", (q) => q.eq("status", "confirmed")),
    completionsPending: await c("completions", (q) => q.eq("status", "pending")),
    redemptions: await c("redemptions"), redemptionsAcknowledged: await c("redemptions", (q) => q.not("acknowledged_at", "is", null)),
    championHistory: await c("champion_history"),
  };
}

async function verify(client, state, log) {
  const reference = JSON.parse(fs.readFileSync(REFERENCE_FILE, "utf8"));
  const { loadFamilyData } = await import("../src/lib/familyData.js");
  const res = await loadFamilyData(client, state.familyId);
  if (!res.ok) throw new Error(`loadFamilyData: ${res.kind}`);
  const cmp = compareWithReference(reference, res.model.data, new Map(Object.entries(state.profileIdByRef)));
  log(`Stichtag ${reference.asOf}`);
  log(table([["Profil", ...METRIC_KEYS.map((k) => `${k} Δ`)], ...cmp.rows.map((r) => [r.ref, ...METRIC_KEYS.map((k) => r.diff[k])])]));
  log(`Zeitreihe: ${cmp.timelineChecks} Prüfungen, Abweichungen: ${cmp.timelineDiffs.length}`);
  const counts = await countRows(client, state.familyId);
  const diffs = Object.keys(reference.counts).filter((k) => counts[k] !== reference.counts[k]);
  log(table([["Tabelle", "Referenz", "Ziel"], ...Object.keys(reference.counts).map((k) => [k, reference.counts[k], counts[k]])]));
  const openHints = res.model.data.notifications.length;
  // Medien: Pfade in der DB, Objekte im Familienpfad, Lesbarkeit (signierte URL) – nur Zahlen
  const data = res.model.data;
  const photoPaths = [...data.members, ...data.archived.members].map((m) => m.photoPath).filter(Boolean);
  const imagePaths = [...data.tasks, ...data.archived.tasks].map((t) => t.imagePath).filter(Boolean);
  const all = [...photoPaths, ...imagePaths];
  const inFamily = all.filter((p) => Media.parseMediaPath(p)?.familyId === state.familyId).length;
  const signed = all.length ? [...(await Media.createSignedUrlCache({ client }).resolve(all)).values()].filter(Boolean).length : 0;
  const mediaOk = !state.media || (photoPaths.length === state.media.expectedProfiles && imagePaths.length === state.media.expectedTasks && inFamily === all.length && signed === all.length);
  log(`Medien: Profile mit photo_path ${photoPaths.length}, Aufgaben mit image_path ${imagePaths.length}, im Familienpfad ${inFamily}, signierbar ${signed}${state.media ? ` (erwartet ${state.media.expectedProfiles}/${state.media.expectedTasks})` : " (ohne --include-media)"}`);
  log(`Offene Eltern-Hinweise (unquittierte Einlösungen): ${openHints}`);
  const ok = cmp.ok && !diffs.length && mediaOk;
  log(ok ? "VERIFY OK – alle Diffs 0" : `VERIFY FEHLER – Profile: ${cmp.rows.filter((r) => !r.ok).map((r) => r.ref).join(",")} Counts: ${diffs.join(",")} Medien: ${mediaOk ? "ok" : "abweichend"}`);
  return { ok, comparison: cmp, counts, openHints, media: { photoPaths: photoPaths.length, imagePaths: imagePaths.length, inFamily, signed } };
}

async function syncTest(client, state, now, log) {
  const { syncWeeklyChampion } = await import("../src/lib/familyMutations.js");
  const read = async () => ({
    weeks: must(await client.from("champion_history").select("week_start, profile_id, points").eq("family_id", state.familyId).order("week_start"), "Historie"),
    lcw: must(await client.from("family_settings").select("last_champion_week").eq("family_id", state.familyId).single(), "Einstellungen").last_champion_week,
  });
  const before = await read();
  const r1 = await syncWeeklyChampion(client, { familyId: state.familyId });
  const mid = await read();
  const r2 = await syncWeeklyChampion(client, { familyId: state.familyId });
  const after = await read();
  if (!r1.ok || !r2.ok) throw new Error("sync_weekly_champion fehlgeschlagen");
  const oldWeeks = new Set(before.weeks.map((w) => w.week_start));
  const checks = {
    firstCallCreatedOnlyNewerWeeks: r1.created.every((c) => c.weekStart > before.lcw),
    historicalWeeksUnchanged: before.weeks.every((w) => mid.weeks.some((m) => m.week_start === w.week_start && m.profile_id === w.profile_id && m.points === w.points)),
    noDuplicateWeeks: new Set(after.weeks.map((w) => w.week_start)).size === after.weeks.length,
    secondCallNoop: r2.processedWeeks === 0 && r2.created.length === 0 && !r2.newChampion,
    historyStableAfterSecondCall: after.weeks.length === mid.weeks.length,
    noOldWeekRecreated: r1.created.every((c) => !oldWeeks.has(c.weekStart)),
  };
  log(JSON.stringify({ lcwBefore: before.lcw, lcwAfter: after.lcw, processedWeeks: r1.processedWeeks, created: r1.created.map((c) => c.weekStart), newChampion: r1.newChampion, historyBefore: before.weeks.length, historyAfter: after.weeks.length, checks }));
  const ok = Object.values(checks).every(Boolean);
  log(ok ? "SYNC-TEST OK" : "SYNC-TEST FEHLER");
  return { ok, before: before.lcw, after: after.lcw, r1, r2, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((r) => process.exit(r && r.ok === false ? 1 : 0)).catch((e) => { console.error("Abbruch:", e.message); process.exit(e instanceof MigrationGuardError || e instanceof ProductionGuardError ? 2 : 1); });
}
