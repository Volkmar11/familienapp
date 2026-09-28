// Produktionsmodus der Legacy-Migration (Phase 6B1) – getrennter Codepfad, der Testmodus bleibt unverändert.
//
// Aufruf über scripts/migrate-legacy-family.mjs mit --target=production (echtes Ziel, erst Phase 6B2 nach Freigabe)
// oder --target=rehearsal (identischer Code gegen das TESTPROJEKT mit synthetischem Backup, Generalprobe).
//
// Schritte (je ein Modus, strikt in dieser Reihenfolge):
//   --dry-run            offline: Backup prüfen, Plan, Counts → local-release/dry-run.json (Nachweis)
//   --reference          offline: Punkte-Referenz → local-release/reference.json
//   --apply              Phasen A–F, H, I, J mit Checkpoints; Einlösungen (G) folgen separat
//   --import-redemptions Phase G über die temporäre, an diese Familie gebundene Funktion
//   --verify             Punkte-/Count-/Medien-Gates + Nachweis „Importfunktion entfernt“ → local-release/go-gates.json
//   --sync-test          Champion-Gate → local-release/go-gates.json
//   --go-check           alle Gates grün, gleicher Backup-Hash, gleicher Commit? (Exit 0 = technisch GO)
// NIE: bestehende Familie löschen/neu anlegen, Wiederholung ohne Recovery-Prozedur, Ziel ≠ bestätigte Ref.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildMigrationPlan, expectedCounts, computeReference, compareWithReference, METRIC_KEYS } from "./legacyMigration.mjs";
import { planMediaImports } from "./legacyMedia.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PRODUCTION_REF = "gkkzjmszcjivtaygbmfw";
export const REHEARSAL_REF = "otejitifgcrrwmudrnhs"; // Testprojekt – nur Generalprobe
export const REHEARSAL_SOURCE = "synthetic-rehearsal";
export const DEFAULT_MAX_BACKUP_AGE_MIN = 15;
export const DRY_RUN_MAX_AGE_MIN = 120;
export const IMPORT_RPC = "legacy_import_redemptions_once";
const PROD_MODES = ["--dry-run", "--reference", "--apply", "--import-redemptions", "--verify", "--sync-test", "--go-check"];

export class ProductionGuardError extends Error {}
const fail = (m) => { throw new ProductionGuardError(m); };
const arg = (argv, name) => { const a = argv.find((x) => x.startsWith(name + "=")); return a ? a.slice(name.length + 1) : undefined; };
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// Deterministische UUIDs je Backup: Apply und der spätere Einlösungs-Import (eigener Lauf) müssen dieselben IDs
// für Belohnungen/Aufgaben erzeugen. buildMigrationPlan vergibt IDs in fester Reihenfolge → Zähler + Backup-Hash.
export function deterministicUuid(seed) {
  let n = 0;
  return () => {
    const h = createHash("sha256").update(`${seed}:${++n}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${(8 + (parseInt(h[16], 16) & 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
}
const rowsHash = (rows) => sha256(JSON.stringify(rows));
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n", { mode: 0o600 }); };

export function gitState(cwd = ROOT) {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd }).toString().trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd }).toString().trim().length > 0;
    return { commit, dirty, id: commit + (dirty ? "-dirty" : "") };
  } catch { return { commit: null, dirty: true, id: "unknown" }; }
}

// Ziel-/Bestätigungsregeln je Target. Wirft ProductionGuardError.
export function resolveTarget(argv) {
  const target = arg(argv, "--target");
  if (target === "production") {
    if (arg(argv, "--confirm-production") !== PRODUCTION_REF) fail(`Produktionsmodus verlangt --confirm-production=${"<Produktions-Ref>"} (exakt).`);
    return { kind: "production", expectedRef: PRODUCTION_REF, source: PRODUCTION_REF };
  }
  if (target === "rehearsal") {
    if (arg(argv, "--confirm-rehearsal") !== REHEARSAL_REF) fail("Generalprobe verlangt --confirm-rehearsal=<Testprojekt-Ref>.");
    return { kind: "rehearsal", expectedRef: REHEARSAL_REF, source: REHEARSAL_SOURCE };
  }
  return fail("--target=production|rehearsal fehlt.");
}

export function readProductionBackup(file) {
  const buf = fs.readFileSync(file);
  const json = JSON.parse(buf.toString("utf8"));
  const record = json.record ?? json;
  if (record?.id !== "family-main" || !record.data || typeof record.data !== "object") fail("Backup ist kein family-main-Datensatz.");
  return { data: record.data, updatedAt: record.updated_at, sourceRef: json.source_project ?? null, exportedAt: json.exported_at ?? null, sha256: sha256(buf), bytes: buf.length, file };
}

export function assertBackup(backup, target, { now, maxAgeMin, requireFresh }) {
  if (backup.sourceRef !== target.source) fail(`Backup-Herkunft passt nicht zum Ziel (erwartet ${target.kind === "production" ? "Produktionsprojekt" : "synthetisch"}).`);
  if (!backup.exportedAt) fail("Backup ohne exported_at – Frische nicht prüfbar.");
  const ageMin = (now - new Date(backup.exportedAt)) / 60000;
  if (!(ageMin >= -1)) fail("exported_at liegt in der Zukunft.");
  if (requireFresh && ageMin > maxAgeMin) fail(`Backup ist ${Math.round(ageMin)} min alt (Grenze ${maxAgeMin} min). Neues Backup ziehen oder bewusst --allow-stale-backup-minutes=<n> setzen.`);
  return ageMin;
}

export function assertTargetEnv(env, target) {
  let host; try { host = new URL(env.MIGRATION_TARGET_URL || "").host.toLowerCase(); } catch { fail("MIGRATION_TARGET_URL fehlt/ungültig."); }
  const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1];
  if (!ref) fail("Ziel muss https://<ref>.supabase.co sein.");
  if (target.kind === "production" && ref === REHEARSAL_REF) fail("Testprojekt als Produktionsziel – Abbruch.");
  if (ref !== target.expectedRef) fail("MIGRATION_TARGET_URL zeigt nicht auf das bestätigte Projekt.");
  const key = env.MIGRATION_TARGET_PUBLISHABLE_KEY || "";
  if (!key || /service_role|^sb_secret_/i.test(key)) fail("Nur der Publishable Key ist erlaubt (kein Secret-/service_role-Key).");
  return ref;
}

const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };
async function insertChunks(client, tbl, rows, size = 200) {
  for (let i = 0; i < rows.length; i += size) must(await client.from(tbl).insert(rows.slice(i, i + size)), `Insert ${tbl}`);
}
async function count(client, tbl, familyId, f = (q) => q) {
  const r = await f(client.from(tbl).select("*", { count: "exact", head: true }).eq("family_id", familyId));
  if (r.error) throw new Error(`Zählen ${tbl}: ${r.error.message}`);
  return r.count;
}
async function listFamilyObjects(client, familyId) {
  const bucket = client.storage.from("family-media");
  const out = [];
  for (const kind of ["profiles", "tasks"]) {
    const top = await bucket.list(`families/${familyId}/${kind}`, { limit: 1000 });
    if (top.error) throw new Error("Storage-Liste: " + top.error.message);
    for (const d of top.data || []) {
      const inner = await bucket.list(`families/${familyId}/${kind}/${d.name}`, { limit: 1000 });
      if (inner.error) throw new Error("Storage-Liste: " + inner.error.message);
      for (const f of inner.data || []) if (f.id) out.push(`families/${familyId}/${kind}/${d.name}/${f.name}`);
    }
  }
  return out;
}

export async function mainProduction(argv, env, deps = {}) {
  const log = deps.log || ((...a) => console.log(...a));
  const now = deps.now || new Date();
  const releaseDir = deps.releaseDir || path.join(ROOT, "local-release");
  const files = {
    dryRun: path.join(releaseDir, "dry-run.json"), reference: path.join(releaseDir, "reference.json"),
    state: path.join(releaseDir, "migration-state.json"), gates: path.join(releaseDir, "go-gates.json"),
  };
  const modes = argv.filter((a) => PROD_MODES.includes(a));
  if (modes.length !== 1) fail(`Genau ein Modus: ${PROD_MODES.join(" | ")}`);
  const mode = modes[0];
  const target = resolveTarget(argv);
  const git = deps.git || gitState();
  if (target.kind === "production" && git.dirty && ["--dry-run", "--apply", "--import-redemptions"].includes(mode)) fail("Arbeitsbaum nicht sauber – Produktion nur aus eingefrorenem Commit.");
  const bi = argv.indexOf("--backup");
  if (bi < 0 || !argv[bi + 1]) fail("--backup <datei> ist im Produktionsmodus Pflicht.");
  const backup = readProductionBackup(path.resolve(argv[bi + 1]));
  const override = arg(argv, "--allow-stale-backup-minutes");
  const maxAgeMin = override ? Number(override) : DEFAULT_MAX_BACKUP_AGE_MIN;
  if (!(maxAgeMin > 0)) fail("--allow-stale-backup-minutes ungültig.");
  const ageMin = assertBackup(backup, target, { now, maxAgeMin, requireFresh: ["--dry-run", "--apply"].includes(mode) });
  const plan = buildMigrationPlan(backup.data, { now: deps.planNow || new Date(backup.exportedAt), uuid: deterministicUuid(backup.sha256) });
  if (plan.errors.length) fail(`${plan.errors.length} Validierungsfehler im Backup.`);
  const media = planMediaImports(backup.data, plan);
  const exp = expectedCounts(plan);
  log(`[${target.kind}] ${mode} · Backup SHA-256 ${backup.sha256.slice(0, 16)}… · Alter ${Math.round(ageMin)} min · Commit ${git.id.slice(0, 12)}`);

  if (mode === "--dry-run") {
    const rec = { backupSha256: backup.sha256, targetRef: target.expectedRef, target: target.kind, gitCommit: git.id, createdAt: now.toISOString(),
      expectedCounts: exp, media: { planned: media.items.length, skipped: media.skipped.length, found: media.stats.profilePhotos + media.stats.taskPhotos },
      redemptions: { count: plan.redemptions.length, pointsSum: plan.redemptions.reduce((s, r) => s + r.points_spent, 0) } };
    writeJson(files.dryRun, rec);
    log("Dry-Run OK – Nachweis geschrieben (local-release/dry-run.json). Keine Verbindung, keine Schreibvorgänge.");
    return { ok: true, mode, record: rec };
  }
  if (mode === "--reference") {
    const reference = { source: { sha256: backup.sha256 }, ...computeReference(backup.data, plan, new Date(backup.exportedAt)) };
    writeJson(files.reference, reference);
    log(`Referenz geschrieben: ${reference.profiles.length} Profile (anonym).`);
    return { ok: true, mode };
  }
  if (mode === "--go-check") return goCheck(files, backup, git, target, log);

  // ---- ab hier Netzwerk ----
  const ref = assertTargetEnv(env, target);
  const createClient = deps.createClient || (await import("@supabase/supabase-js")).createClient;
  const client = createClient(env.MIGRATION_TARGET_URL, env.MIGRATION_TARGET_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = env.MIGRATION_OWNER_EMAIL, password = env.MIGRATION_OWNER_PASSWORD;
  if (!email || !password) fail("MIGRATION_OWNER_EMAIL / MIGRATION_OWNER_PASSWORD fehlen (bestätigtes owner-Konto).");
  if (target.kind === "rehearsal" && !/@example\.com$/i.test(email)) fail("Generalprobe nur mit @example.com-Wegwerfkonto.");
  if (target.kind === "production" && /@example\.com$/i.test(email)) fail("Produktion verlangt das echte owner-Konto.");
  const si = await client.auth.signInWithPassword({ email, password });
  if (si.error) fail("Anmeldung des owner-Kontos fehlgeschlagen (Konto bestätigt?).");
  const ownerId = si.data.user.id;

  if (mode === "--apply") {
    const dr = fs.existsSync(files.dryRun) ? readJson(files.dryRun) : null;
    if (!dr) fail("Kein Dry-Run-Nachweis – zuerst --dry-run.");
    if (dr.backupSha256 !== backup.sha256) fail("Dry-Run gehört zu einem anderen Backup (Hash) – neuer Dry-Run nötig.");
    if (dr.targetRef !== ref) fail("Dry-Run gehört zu einem anderen Zielprojekt.");
    if (dr.gitCommit !== git.id) fail("Dry-Run gehört zu einem anderen Git-Stand.");
    if ((now - new Date(dr.createdAt)) / 60000 > DRY_RUN_MAX_AGE_MIN) fail("Dry-Run-Nachweis ist zu alt.");
    if (!fs.existsSync(files.reference) || readJson(files.reference).source?.sha256 !== backup.sha256) fail("Punkte-Referenz fehlt oder gehört zu anderem Backup – zuerst --reference.");
    if (fs.existsSync(files.state)) fail("Es existiert bereits ein Migrationsstand (local-release/migration-state.json). Keine Wiederholung ohne Recovery-Prozedur (Runbook).");
    const pin = env.MIGRATION_FAMILY_PIN, name = (env.MIGRATION_FAMILY_NAME || "").trim();
    if (!/^\d{4}$/.test(pin || "")) fail("MIGRATION_FAMILY_PIN (4 Ziffern, neue Familien-PIN) fehlt.");
    if (!name || name.length > 80) fail("MIGRATION_FAMILY_NAME fehlt/ungültig.");
    const schema = await client.from("families").select("id", { count: "exact", head: true });
    if (schema.error) fail("FAMILY-Schema im Ziel nicht vorhanden (Bootstrap ausgeführt?).");
    const mem = must(await client.from("family_members").select("family_id").eq("user_id", ownerId), "Mitgliedschaften");
    if (mem.length) fail("Das owner-Konto gehört bereits zu einer Familie – kein Löschen/Neuanlegen im Produktionsmodus. Recovery-Prozedur siehe Runbook.");
    return applyProduction({ client, ownerId, plan, media, exp, pin, name, files, backup, git, target, log, argv });
  }
  const state = fs.existsSync(files.state) ? readJson(files.state) : fail("Kein Migrationsstand – zuerst --apply.");
  if (state.backupSha256 !== backup.sha256) fail("Migrationsstand gehört zu einem anderen Backup.");
  if (state.ownerId !== ownerId) fail("Angemeldetes Konto ist nicht der owner dieses Migrationsstands.");
  if (mode === "--import-redemptions") return importRedemptions({ client, state, plan, files, log });
  if (mode === "--verify") return verifyProduction({ client, state, files, exp, media, log });
  return syncProduction({ client, state, files, log });
}

async function applyProduction({ client, ownerId, plan, media, exp, pin, name, files, backup, git, target, log, argv }) {
  const state = { target: target.kind, backupSha256: backup.sha256, gitCommit: git.id, ownerId, familyId: null, phases: [], status: "running", startedAt: new Date().toISOString() };
  const save = () => writeJson(files.state, state);
  const checkpoint = async (phase, checks) => {
    const bad = checks.filter(([, got, want]) => got !== want);
    if (bad.length) { state.status = `failed:${phase}`; save(); fail(`Checkpoint ${phase} fehlgeschlagen: ${bad.map(([n, g, w]) => `${n} ${g}≠${w}`).join(", ")}`); }
    state.phases.push(phase); save(); log(`Checkpoint ${phase} OK (${checks.map(([n, g]) => `${n}=${g}`).join(", ")})`);
  };
  // A. Profile (Onboarding legt Familie, owner, Einstellungen, PIN-Hash, Profile an)
  const ob = must(await client.rpc("create_family_with_onboarding", {
    p_request_id: randomUUID(), p_family_name: name, p_pin: pin,
    p_children: plan.profiles.map((p) => ({ name: p.name, avatar_emoji: p.avatar_emoji, color: p.color })), p_tasks: [], p_rewards: [],
    p_settings: { show_daily_crown: plan.settings.show_daily_crown, require_confirmation: plan.settings.require_confirmation },
  }), "Onboarding");
  const familyId = state.familyId = ob.family_id; save();
  const profs = must(await client.from("profiles").select("id, sort_order").eq("family_id", familyId).order("sort_order"), "Profile laden");
  const idByRef = new Map(plan.profiles.map((p) => [p.ref, profs.find((x) => x.sort_order === p.sort_order)?.id]));
  state.profileIdByRef = Object.fromEntries(idByRef);
  const parents = plan.profiles.filter((p) => p.is_parent).map((p) => idByRef.get(p.ref));
  if (parents.length) must(await client.from("profiles").update({ is_parent: true }).eq("family_id", familyId).in("id", parents), "is_parent");
  await checkpoint("A-profiles", [["profiles", await count(client, "profiles", familyId), exp.profiles], ["parentProfiles", await count(client, "profiles", familyId, (q) => q.eq("is_parent", true)), exp.parentProfiles]]);
  const pid = (r) => idByRef.get(r);
  const asg = (items, fk) => items.flatMap((x) => x.assignedRefs.map((r) => ({ family_id: familyId, [fk]: x.id, profile_id: pid(r) })));
  // B. Kategorien
  await insertChunks(client, "categories", plan.categories.map((c) => ({ id: c.id, family_id: familyId, name: c.name, icon: c.icon, sort_order: c.sort_order })));
  await checkpoint("B-categories", [["categories", await count(client, "categories", familyId), exp.categories]]);
  // C. Aufgaben
  await insertChunks(client, "tasks", plan.tasks.map((t) => ({ id: t.id, family_id: familyId, category_id: t.category_id, title: t.title, icon: t.icon, points: t.points, recurrence: t.recurrence, sort_order: t.sort_order, active: true })));
  await checkpoint("C-tasks", [["tasks", await count(client, "tasks", familyId), exp.tasks]]);
  // D. Zuordnungen (Kategorien, Aufgaben; Belohnungs-Zuordnungen in F, weil sie Belohnungen voraussetzen)
  await insertChunks(client, "category_assignments", asg(plan.categories, "category_id"));
  await insertChunks(client, "task_assignments", asg(plan.tasks, "task_id"));
  await checkpoint("D-assignments", [["categoryAssignments", await count(client, "category_assignments", familyId), exp.categoryAssignments], ["taskAssignments", await count(client, "task_assignments", familyId), exp.taskAssignments]]);
  // E. Erledigungen
  await insertChunks(client, "completions", plan.completions.map((c) => ({
    id: c.id, family_id: familyId, profile_id: pid(c.profileRef), task_id: c.task_id, task_title: c.task_title, category_name: c.category_name,
    points: c.points, completed_at: c.completed_at, completion_date: c.completion_date, status: c.status, confirmed_at: c.confirmed_at,
  })));
  await checkpoint("E-completions", [["completions", await count(client, "completions", familyId), exp.completions],
    ["completionsConfirmed", await count(client, "completions", familyId, (q) => q.eq("status", "confirmed")), exp.completionsConfirmed],
    ["completionsPending", await count(client, "completions", familyId, (q) => q.eq("status", "pending")), exp.completionsPending]]);
  // F. Belohnungen (+ Zuordnungen)
  await insertChunks(client, "rewards", plan.rewards.map((r) => ({ id: r.id, family_id: familyId, title: r.title, icon: r.icon, points_required: r.points_required, sort_order: r.sort_order, active: true })));
  await insertChunks(client, "reward_assignments", asg(plan.rewards, "reward_id"));
  await checkpoint("F-rewards", [["rewards", await count(client, "rewards", familyId), exp.rewards], ["rewardAssignments", await count(client, "reward_assignments", familyId), exp.rewardAssignments]]);
  // G. Einlösungen → separater Schritt --import-redemptions (temporäre, an diese Familie gebundene Funktion)
  // H. Champions
  await insertChunks(client, "champion_history", plan.championHistory.map((h) => ({
    id: h.id, family_id: familyId, profile_id: h.profileRef ? pid(h.profileRef) : null, profile_name: h.profile_name, profile_avatar: h.profile_avatar, week_start: h.week_start, points: h.points,
  })));
  await checkpoint("H-champions", [["championHistory", await count(client, "champion_history", familyId), exp.championHistory]]);
  // I. Einstellungen
  must(await client.from("family_settings").update({ last_champion_week: plan.settings.last_champion_week }).eq("family_id", familyId), "last_champion_week");
  const st = must(await client.from("family_settings").select("last_champion_week, show_daily_crown, require_confirmation").eq("family_id", familyId).single(), "Einstellungen");
  await checkpoint("I-settings", [["last_champion_week", st.last_champion_week, plan.settings.last_champion_week], ["require_confirmation", st.require_confirmation, plan.settings.require_confirmation]]);
  // J. Medien (alle Bilder des Backups; Fehler → Abbruch, außer ausdrücklich akzeptiert)
  const Media = await import("../../src/lib/familyMedia.js");
  let uploaded = 0, failed = 0;
  for (const it of media.items) {
    const blob = new Blob([it.buffer], { type: "image/jpeg" });
    const r = it.kind === "profile" ? await Media.uploadProfileImage(client, { familyId, profileId: pid(it.profileRef), blob }) : await Media.uploadTaskImage(client, { familyId, taskId: it.taskId, blob });
    if (r.ok) uploaded++; else failed++;
  }
  const found = media.stats.profilePhotos + media.stats.taskPhotos;
  state.media = { found, planned: media.items.length, skipped: media.skipped.length, uploaded, failed };
  const acceptMissing = argv.includes("--accept-media-warnings");
  if ((failed || media.skipped.length) && !acceptMissing) { state.status = "failed:J-media"; save(); fail(`Medien unvollständig (gefunden ${found}, geplant ${media.items.length}, übersprungen ${media.skipped.length}, fehlgeschlagen ${failed}). Nur mit --accept-media-warnings fortsetzbar.`); }
  await checkpoint("J-media", [["uploaded", uploaded, media.items.length]]);
  state.redemptionRowsSha256 = rowsHash(redemptionRows(plan, state.profileIdByRef));
  state.status = "applied-awaiting-redemptions"; state.appliedAt = new Date().toISOString(); save();
  log(`Apply OK. Familie ${familyId.slice(0, 8)}… Nächster Schritt: temporäre Importfunktion erzeugen:`);
  log(`  node scripts/generate-redemption-import.mjs --family-id ${familyId} --owner-id ${ownerId} --expires-in-minutes 60`);
  return { ok: true, mode: "--apply", familyId, ownerId, phases: state.phases, media: state.media };
}

export function redemptionRows(plan, profileIdByRef) {
  return plan.redemptions.map((r) => ({ id: r.id, profile_id: profileIdByRef[r.profileRef], reward_id: r.reward_id, reward_title: r.reward_title, points_spent: r.points_spent, redeemed_at: r.redeemed_at, acknowledged: r.acknowledged }));
}

async function importRedemptions({ client, state, plan, files, log }) {
  if (state.status !== "applied-awaiting-redemptions") fail(`Falscher Stand für den Import: ${state.status}.`);
  const rows = redemptionRows(plan, state.profileIdByRef);
  if (rowsHash(rows) !== state.redemptionRowsSha256) fail("Import-Zeilen weichen vom Apply-Stand ab (Plan nicht reproduzierbar) – Abbruch.");
  const n = must(await client.rpc(IMPORT_RPC, { p_rows: rows }), "Import Einlösungen (temporäre Funktion vorhanden?)");
  const got = must(await client.from("redemptions").select("points_spent, acknowledged_at").eq("family_id", state.familyId), "Einlösungen lesen");
  const sum = got.reduce((s, r) => s + r.points_spent, 0), want = rows.reduce((s, r) => s + r.points_spent, 0);
  const ackWant = rows.filter((r) => r.acknowledged).length, ackGot = got.filter((r) => r.acknowledged_at).length;
  const ok = n === rows.length && got.length === rows.length && sum === want && ackGot === ackWant;
  state.redemptions = { imported: n, count: got.length, expected: rows.length, pointsSum: sum, expectedSum: want, acknowledged: ackGot, expectedAcknowledged: ackWant, ok };
  state.status = ok ? "redemptions-imported" : "failed:G-redemptions";
  writeJson(files.state, state);
  if (!ok) fail(`Checkpoint G-redemptions fehlgeschlagen: ${JSON.stringify(state.redemptions)}`);
  log(`Checkpoint G-redemptions OK (${n} Einlösungen, Summe ${sum}). JETZT die Importfunktion entfernen (redemption-import-drop.sql).`);
  return { ok: true, mode: "--import-redemptions", ...state.redemptions };
}

function writeGates(files, patch, state) {
  const g = fs.existsSync(files.gates) ? readJson(files.gates) : {};
  const next = { ...g, backupSha256: state.backupSha256, gitCommit: state.gitCommit, familyRef: state.familyId?.slice(0, 8), ...patch, updatedAt: new Date().toISOString() };
  writeJson(files.gates, next);
  return next;
}

async function verifyProduction({ client, state, files, exp, media, log }) {
  if (!["redemptions-imported", "verified"].includes(state.status)) fail(`Verify erst nach dem Einlösungs-Import (Stand: ${state.status}).`);
  const reference = readJson(files.reference);
  const { loadFamilyData } = await import("../../src/lib/familyData.js");
  const res = await loadFamilyData(client, state.familyId);
  if (!res.ok) fail(`Familie nicht ladbar: ${res.kind}`);
  const cmp = compareWithReference(reference, res.model.data, new Map(Object.entries(state.profileIdByRef)));
  const maxDiff = Math.max(0, ...cmp.rows.flatMap((r) => METRIC_KEYS.map((k) => Math.abs(Number(r.diff[k]) || 0))));
  log(["Profil | " + METRIC_KEYS.map((k) => `${k} Δ`).join(" | "), ...cmp.rows.map((r) => `${r.ref} | ${METRIC_KEYS.map((k) => r.diff[k]).join(" | ")}`)].join("\n"));
  // Counts gegen Plan
  const tables = { profiles: "profiles", categories: "categories", tasks: "tasks", rewards: "rewards", completions: "completions", redemptions: "redemptions", championHistory: "champion_history",
    categoryAssignments: "category_assignments", taskAssignments: "task_assignments", rewardAssignments: "reward_assignments" };
  const countDiffs = [];
  for (const [k, t] of Object.entries(tables)) { const c = await count(client, t, state.familyId); if (c !== exp[k]) countDiffs.push(`${k} ${c}≠${exp[k]}`); }
  // Medien: DB-Pfade, Objekte, Fremdpfade, Waisen
  const d = res.model.data;
  const paths = [...d.members, ...d.archived.members].map((m) => m.photoPath).concat([...d.tasks, ...d.archived.tasks].map((t) => t.imagePath)).filter(Boolean);
  const objects = await listFamilyObjects(client, state.familyId);
  const foreign = paths.filter((p) => !p.startsWith(`families/${state.familyId}/`)).length;
  const orphans = objects.filter((o) => !paths.includes(o)).length;
  const missing = paths.filter((p) => !objects.includes(p)).length;
  const mediaGate = { found: state.media.found, uploaded: state.media.uploaded, referenced: paths.length, objects: objects.length, foreign, orphans, missing,
    ok: paths.length === state.media.uploaded && objects.length === paths.length && foreign === 0 && orphans === 0 && missing === 0 && (state.media.failed === 0) };
  // Importfunktion muss entfernt sein (PostgREST: Funktion unbekannt)
  const probe = await client.rpc(IMPORT_RPC, { p_rows: [] });
  const importAbsent = !!probe.error && (probe.error.code === "PGRST202" || /could not find the function|does not exist/i.test(probe.error.message || ""));
  const gates = writeGates(files, {
    points: { ok: cmp.ok && maxDiff === 0, maxDiff, timelineDiffs: cmp.timelineDiffs.length },
    counts: { ok: countDiffs.length === 0, diffs: countDiffs },
    redemptions: { ok: !!state.redemptions?.ok, count: state.redemptions?.count, pointsSum: state.redemptions?.pointsSum },
    media: mediaGate, importFunctionRemoved: { ok: importAbsent },
  }, state);
  state.status = "verified"; writeJson(files.state, state);
  const ok = gates.points.ok && gates.counts.ok && gates.redemptions.ok && gates.media.ok && gates.importFunctionRemoved.ok;
  log(`VERIFY ${ok ? "OK" : "FEHLER"} – Punkte maxΔ ${maxDiff}, Zeitreihe ${cmp.timelineDiffs.length}, Counts ${countDiffs.length ? countDiffs.join(",") : "ok"}, Medien ${mediaGate.ok ? "ok" : JSON.stringify(mediaGate)}, Importfunktion entfernt ${importAbsent}`);
  return { ok, mode: "--verify", gates };
}

async function syncProduction({ client, state, files, log }) {
  const { syncWeeklyChampion } = await import("../../src/lib/familyMutations.js");
  const read = async () => ({
    weeks: must(await client.from("champion_history").select("week_start, profile_id, points").eq("family_id", state.familyId).order("week_start"), "Historie"),
    lcw: must(await client.from("family_settings").select("last_champion_week").eq("family_id", state.familyId).single(), "Einstellungen").last_champion_week,
  });
  const before = await read();
  const r1 = await syncWeeklyChampion(client, { familyId: state.familyId });
  const mid = await read();
  const r2 = await syncWeeklyChampion(client, { familyId: state.familyId });
  const after = await read();
  if (!r1.ok || !r2.ok) fail("sync_weekly_champion fehlgeschlagen");
  const oldWeeks = new Set(before.weeks.map((w) => w.week_start));
  const checks = {
    firstCallCreatedOnlyNewerWeeks: r1.created.every((c) => c.weekStart > before.lcw),
    historicalWeeksUnchanged: before.weeks.every((w) => mid.weeks.some((m) => m.week_start === w.week_start && m.profile_id === w.profile_id && m.points === w.points)),
    noDuplicateWeeks: new Set(after.weeks.map((w) => w.week_start)).size === after.weeks.length,
    secondCallNoop: r2.processedWeeks === 0 && r2.created.length === 0 && !r2.newChampion,
    noOldWeekRecreated: r1.created.every((c) => !oldWeeks.has(c.weekStart)),
    lastChampionWeekNotBackwards: !before.lcw || after.lcw >= before.lcw,
  };
  const ok = Object.values(checks).every(Boolean);
  writeGates(files, { champion: { ok, checks, historyBefore: before.weeks.length, historyAfter: after.weeks.length, created: r1.created.length, newChampion: !!r1.newChampion } }, state);
  log(`SYNC ${ok ? "OK" : "FEHLER"} ${JSON.stringify(checks)}`);
  return { ok, mode: "--sync-test", checks };
}

export function goCheck(files, backup, git, target, log = console.log) {
  const reasons = [];
  const g = fs.existsSync(files.gates) ? readJson(files.gates) : null;
  if (!g) reasons.push("keine GO-Gates (verify/sync-test fehlen)");
  else {
    if (g.backupSha256 !== backup.sha256) reasons.push("Gates gehören zu anderem Backup");
    if (g.gitCommit !== git.id) reasons.push("Gates gehören zu anderem Git-Stand");
    for (const k of ["points", "counts", "redemptions", "media", "importFunctionRemoved", "champion"]) if (!g[k]?.ok) reasons.push(`Gate ${k} nicht grün`);
  }
  const ok = reasons.length === 0;
  log(ok ? `GO-CHECK OK (${target.kind}) – technisch bereit. Vercel-Cutover NUR nach ausdrücklicher menschlicher Freigabe (STOP 8).` : `GO-CHECK BLOCKIERT: ${reasons.join("; ")}`);
  return { ok, mode: "--go-check", reasons };
}
