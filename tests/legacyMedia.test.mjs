// Unit-Tests Phase 5B: Legacy-Base64-Bilder für den Import vorbereiten (nur synthetische Testbilder).
// Ausführen:  node --test tests/legacyMedia.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decodeDataUrl, inspectJpeg, stripJpegMetadata, planMediaImports } from "../scripts/lib/legacyMedia.mjs";
import { buildMigrationPlan } from "../scripts/lib/legacyMigration.mjs";
import { main } from "../scripts/migrate-legacy-family.mjs";

const JPEG = fs.readFileSync(new URL("./fixtures/synthetic-8x8.jpg", import.meta.url)); // generiertes 8×8-Bild

// APP1 mit EXIF (IFD0: Orientierung + GPS-Zeiger) einfügen – wie bei einem Handyfoto
function withExif(jpeg, { orientation = 1, gps = true } = {}) {
  const t = Buffer.alloc(64); t.write("II", 0, "latin1"); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4);
  t.writeUInt16LE(gps ? 2 : 1, 8);
  t.writeUInt16LE(0x0112, 10); t.writeUInt16LE(3, 12); t.writeUInt32LE(1, 14); t.writeUInt16LE(orientation, 18);
  if (gps) { t.writeUInt16LE(0x8825, 22); t.writeUInt16LE(4, 24); t.writeUInt32LE(1, 26); t.writeUInt32LE(38, 30); }
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), t]);
  const seg = Buffer.alloc(4); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), seg, payload, jpeg.subarray(2)]);
}
const dataUrl = (buf, mime = "image/jpeg") => `data:${mime};base64,${buf.toString("base64")}`;

function legacy() {
  return {
    members: [
      { id: "m1", name: "Alex", emoji: "🦊", color: "#ff0000", photo: dataUrl(withExif(JPEG)), isAdmin: false },
      { id: "m2", name: "Sam", emoji: "🐼", color: "#00ff00", photo: null, isAdmin: false },
      { id: "m3", name: "Kim", emoji: "🐯", color: "#0000ff", photo: dataUrl(JPEG, "image/png"), isAdmin: false },
    ],
    customCategories: [{ id: "c1", name: "Haushalt", emoji: "🏠", assignedTo: [] }],
    tasks: [
      { id: "t1", name: "Aufgabe mit Bild", emoji: "🧸", points: 5, category: "Haushalt", recurring: "daily", assignedTo: [], photo: dataUrl(JPEG) },
      { id: "t2", name: "Gedrehtes Bild", emoji: "🧸", points: 5, category: "Haushalt", recurring: "daily", assignedTo: [], photo: dataUrl(withExif(JPEG, { orientation: 6, gps: false })) },
      { id: "t3", name: "Ohne Bild", emoji: "🧸", points: 5, category: "Haushalt", recurring: "daily", assignedTo: [], photo: null },
    ],
    completions: [], rewards: [], redeemedRewards: [], notifications: [], championHistory: [],
    lastChampionWeek: "2026-09-20", needsConfirmation: true, adminPin: "9999",
  };
}

test("Data-URL dekodieren und JPEG prüfen", () => {
  const d = decodeDataUrl(dataUrl(JPEG));
  assert.equal(d.ok, true); assert.equal(d.mime, "image/jpeg"); assert.ok(d.buffer.equals(JPEG));
  assert.equal(decodeDataUrl("https://example.com/x.jpg").ok, false);
  assert.equal(decodeDataUrl(null).ok, false);
  const i = inspectJpeg(JPEG);
  assert.equal(i.valid, true); assert.equal(i.width, 8); assert.equal(i.height, 8);
  assert.equal(inspectJpeg(Buffer.from("kein jpeg")).valid, false);
});

test("EXIF/GPS erkennen und entfernen – Bilddaten bleiben gültig", () => {
  const withGps = withExif(JPEG);
  const before = inspectJpeg(withGps);
  assert.equal(before.hasExif, true); assert.equal(before.hasGps, true);
  const clean = stripJpegMetadata(withGps);
  const after = inspectJpeg(clean);
  assert.equal(after.valid, true); assert.equal(after.hasExif, false); assert.equal(after.hasGps, false);
  assert.equal(after.metadataSegments, 0);
  assert.equal(after.width, 8);
  assert.ok(!clean.includes(Buffer.from("Exif\0\0", "latin1")));
  assert.equal(inspectJpeg(withExif(JPEG, { orientation: 6, gps: false })).orientation, 6);
});

test("Importplan: Profil- und (künstliche) Aufgabenbilder, Überspringen mit Grund", () => {
  const data = legacy();
  const plan = buildMigrationPlan(data, { now: new Date("2026-09-28T10:00:00Z") });
  const m = planMediaImports(data, plan);
  assert.equal(m.stats.profilePhotos, 2);
  assert.equal(m.stats.taskPhotos, 2);
  assert.deepEqual(m.items.map((i) => i.kind), ["profile", "task"]);
  assert.equal(m.items[0].profileRef, "profile-1");
  assert.equal(m.items[1].taskId, plan.tasks[0].id);
  assert.ok(m.items.every((i) => inspectJpeg(i.buffer).valid && !inspectJpeg(i.buffer).hasExif));
  assert.equal(m.stats.exifBefore, 1); assert.equal(m.stats.gpsBefore, 1); assert.equal(m.stats.exifAfter, 0);
  assert.equal(m.skipped.length, 2); // PNG-Profil + gedrehtes Aufgabenbild
  assert.ok(m.skipped.some((s) => /profile-3: Format image\/png/.test(s)));
  assert.ok(m.skipped.some((s) => /Orientierung 6/.test(s)));
  // keine Namen/Inhalte in Gründen
  assert.ok(!JSON.stringify(m.skipped).match(/Alex|Sam|Kim|Gedreht|Aufgabe mit Bild/));
});

test("--include-media im Dry-Run: kein Client, keine Base64-/Namensausgabe", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wc5b-"));
  const file = path.join(dir, "family-main-test.json");
  fs.writeFileSync(file, JSON.stringify({ source_project: "gkkzjmszcjivtaygbmfw", record: { id: "family-main", data: legacy(), updated_at: "2026-09-27T00:00:00Z" } }));
  const out = []; let clients = 0;
  await main(["--dry-run", "--include-media", "--backup", file], {}, { log: (...a) => out.push(a.join(" ")), createClient: () => { clients++; return {}; }, now: new Date("2026-09-28T10:00:00Z") });
  const text = out.join("\n");
  assert.equal(clients, 0);
  assert.match(text, /Medien \(--include-media\): .*"importierbar":2/);
  assert.ok(!/base64|\/9j\/|Alex|Sam|Kim/.test(text));
  // Ohne Option: keine Medienzeile (Verhalten wie Phase 5A)
  const out2 = [];
  await main(["--dry-run", "--backup", file], {}, { log: (...a) => out2.push(a.join(" ")), now: new Date("2026-09-28T10:00:00Z") });
  assert.ok(!out2.some((l) => /--include-media/.test(l)));
});
