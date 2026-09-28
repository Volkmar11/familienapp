#!/usr/bin/env node
// Finales LEGACY-Backup von family-main (Phase 6B1 vorbereitet, Einsatz erst Phase 6B2 / Runbook STOP 2) – NUR LESEND.
//
//   LEGACY_SUPABASE_URL=https://<produktions-ref>.supabase.co LEGACY_SUPABASE_KEY=<publishable/anon-key> \
//   node scripts/export-legacy-backup.mjs --confirm-production=<produktions-ref> [--out local-backups/family-main-<zeit>.json]
//
// * genau ein GET auf public.app_state?id=eq.family-main (Policy „Jeder darf lesen“), keine Schreibzugriffe
// * schreibt { source_project, exported_at, record } mit Dateimodus 0600 nach local-backups/ (von Git ignoriert)
// * gibt nur SHA-256, Bytes, updated_at und Anzahlen aus – keine Namen, keine Inhalte
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRODUCTION_REF } from "./lib/productionMigration.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export class ExportError extends Error {}

export async function exportLegacyBackup({ url, key, confirmRef, now = new Date(), fetchImpl = fetch }) {
  let ref = null;
  try { ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(new URL(url).host)?.[1] ?? null; } catch { /* */ }
  if (!ref) throw new ExportError("LEGACY_SUPABASE_URL muss https://<ref>.supabase.co sein.");
  if (confirmRef !== ref || ref !== PRODUCTION_REF) throw new ExportError("--confirm-production=<Produktions-Ref> muss exakt zum Ziel passen.");
  if (!key || /service_role|^sb_secret_/i.test(key)) throw new ExportError("Nur Publishable/anon Key (lesend) erlaubt.");
  const res = await fetchImpl(`${url.replace(/\/+$/, "")}/rest/v1/app_state?id=eq.family-main&select=id,data,updated_at`, {
    method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new ExportError(`Lesen fehlgeschlagen (HTTP ${res.status}).`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== "family-main" || !rows[0].data) throw new ExportError("family-main nicht eindeutig gefunden.");
  const backup = { source_project: ref, exported_at: now.toISOString(), record: rows[0] };
  const text = JSON.stringify(backup, null, 2) + "\n";
  const d = rows[0].data;
  const summary = { sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text), updated_at: rows[0].updated_at,
    counts: { members: d.members?.length ?? 0, tasks: d.tasks?.length ?? 0, completions: d.completions?.length ?? 0,
      rewards: d.rewards?.length ?? 0, redeemedRewards: d.redeemedRewards?.length ?? 0, championHistory: d.championHistory?.length ?? 0 } };
  return { text, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const a = process.argv.slice(2);
  const val = (n) => a.find((x) => x.startsWith(n + "="))?.slice(n.length + 1) ?? (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  try {
    const now = new Date();
    const { text, summary } = await exportLegacyBackup({ url: process.env.LEGACY_SUPABASE_URL || "", key: process.env.LEGACY_SUPABASE_KEY || "", confirmRef: val("--confirm-production"), now });
    const out = path.resolve(val("--out") || path.join(ROOT, "local-backups", `family-main-${now.toISOString().replace(/[:.]/g, "-")}.json`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (fs.existsSync(out)) throw new ExportError("Zieldatei existiert bereits – nichts überschrieben.");
    fs.writeFileSync(out, text, { mode: 0o600 });
    console.log(`Backup geschrieben: ${path.relative(ROOT, out)}`);
    console.log(`SHA-256 ${summary.sha256} · ${summary.bytes} Bytes · updated_at ${summary.updated_at}`);
    console.log(`Anzahlen: ${Object.entries(summary.counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  } catch (e) { console.error("Abbruch:", e.message); process.exit(e instanceof ExportError ? 2 : 1); }
}
