#!/usr/bin/env node
// Synthetisches LEGACY-Backup für Generalproben (Phase 6B1) – KEINE echten Daten.
// Erzeugt eine plausible family-main-Struktur (Profile, Kategorien, Aufgaben, ~10 Wochen Erledigungen,
// Belohnungen, Einlösungen mit Hinweisen, Champion-Historie, ein synthetisches Profilbild).
//
//   node scripts/create-synthetic-legacy-backup.mjs [--out local-release/synthetic-family-main.json] [--seed 1] [--exported-at <iso>]
// Herkunft: source_project = "synthetic-rehearsal" (vom Produktionsmodus nur mit --target=rehearsal akzeptiert).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JPEG = fs.readFileSync(path.join(ROOT, "tests/fixtures/synthetic-8x8.jpg"));

// deterministischer Zufall
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const mondayOf = (d) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
const ymd = (d) => d.toISOString().slice(0, 10);

export function syntheticLegacy({ now = new Date(), seed = 1, weeks = 10 } = {}) {
  const r = rng(seed);
  const members = [
    { id: "sm1", name: "Synth Eltern", emoji: "🦉", color: "#4338ca", photo: null, isAdmin: true },
    { id: "sm2", name: "Synth Kind A", emoji: "🦊", color: "#16a34a", photo: `data:image/jpeg;base64,${JPEG.toString("base64")}`, isAdmin: false },
    { id: "sm3", name: "Synth Kind B", emoji: "🐼", color: "#2563eb", photo: null, isAdmin: false },
  ];
  const customCategories = [
    { id: "sc1", name: "Haushalt", emoji: "🏠", assignedTo: [] },
    { id: "sc2", name: "Ordnung", emoji: "🧹", assignedTo: ["sm2"] },
  ];
  const tasks = [
    { id: "st1", name: "Synth Aufgabe 1", emoji: "🍴", points: 5, category: "Haushalt", recurring: "daily", assignedTo: [], photo: null },
    { id: "st2", name: "Synth Aufgabe 2", emoji: "🧸", points: 10, category: "Ordnung", recurring: "daily", assignedTo: ["sm2", "sm3"], photo: null },
    { id: "st3", name: "Synth Aufgabe 3", emoji: "🌱", points: 20, category: "Haushalt", recurring: "weekly", assignedTo: ["sm3"], photo: null },
  ];
  const kids = ["sm2", "sm3"];
  const start = mondayOf(new Date(now.getTime() - weeks * 7 * 864e5));
  const completions = [];
  let n = 0;
  for (let day = 0; day < weeks * 7; day++) {
    const d = new Date(start.getTime() + day * 864e5 + 15 * 3600e3);
    if (d > now) break;
    for (const k of kids) for (const t of tasks) {
      if (t.recurring === "weekly" && day % 7 !== 5) continue;
      if (r() < 0.45) continue;
      const confirmed = r() > 0.1;
      completions.push({ id: `sk${++n}`, date: d.toISOString(), points: t.points, taskId: t.id, memberId: k, taskName: t.name, category: t.category, confirmed, needsConfirm: !confirmed });
    }
  }
  const rewards = [
    { id: "sr1", name: "Synth Belohnung 1", emoji: "🍦", pointsCost: 30, assignedTo: [] },
    { id: "sr2", name: "Synth Belohnung 2", emoji: "🎬", pointsCost: 50, assignedTo: ["sm3"] },
  ];
  const redeemedRewards = [], notifications = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(start.getTime() + (7 + i * 8) * 864e5 + 18 * 3600e3);
    if (d > now) break;
    const rw = rewards[i % 2], m = kids[i % 2];
    redeemedRewards.push({ id: `sx${i + 1}`, date: d.toISOString(), memberId: m, rewardId: rw.id, pointsCost: rw.pointsCost, rewardName: rw.name });
    notifications.push({ id: `sn${i + 1}`, date: new Date(d.getTime() + 1).toISOString(), read: i < 4, type: "reward", memberId: m, message: `Synth hat "${rw.name}" eingelöst` });
  }
  // Champion-Historie: für jede abgeschlossene Woche den Punktbesten (bestätigte Erledigungen)
  const championHistory = [];
  const thisMonday = mondayOf(now);
  for (let w = mondayOf(start); w < thisMonday; w = new Date(w.getTime() + 7 * 864e5)) {
    const end = new Date(w.getTime() + 7 * 864e5);
    const pts = Object.fromEntries(kids.map((k) => [k, completions.filter((c) => c.memberId === k && c.confirmed && new Date(c.date) >= w && new Date(c.date) < end).reduce((s, c) => s + c.points, 0)]));
    const best = kids.reduce((a, b) => (pts[b] > pts[a] ? b : a));
    if (pts[best] > 0) { const m = members.find((x) => x.id === best); championHistory.push({ memberId: best, name: m.name, emoji: m.emoji, pts: pts[best], week: ymd(w) }); }
  }
  const lastChampionWeek = championHistory.at(-1)?.week ?? null;
  return { members, customCategories, tasks, completions, rewards, redeemedRewards, notifications, championHistory, lastChampionWeek, needsConfirmation: true, adminPin: "0000" };
}

export function syntheticBackup({ now = new Date(), exportedAt = now, seed = 1 } = {}) {
  return { source_project: "synthetic-rehearsal", exported_at: new Date(exportedAt).toISOString(), synthetic: true,
    record: { id: "family-main", data: syntheticLegacy({ now, seed }), updated_at: new Date(now).toISOString() } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const a = process.argv.slice(2);
  const val = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
  const out = path.resolve(val("--out", path.join(ROOT, "local-release/synthetic-family-main.json")));
  const b = syntheticBackup({ now: new Date(), exportedAt: val("--exported-at", new Date().toISOString()), seed: Number(val("--seed", 1)) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(b, null, 2) + "\n", { mode: 0o600 });
  const d = b.record.data;
  console.log(`Synthetisches Backup: ${path.relative(ROOT, out)} · ${d.members.length} Profile, ${d.completions.length} Erledigungen, ${d.redeemedRewards.length} Einlösungen, ${d.championHistory.length} Champion-Wochen`);
}
