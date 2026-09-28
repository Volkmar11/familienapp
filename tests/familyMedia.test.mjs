// Unit-Tests Phase 5B: Medien-Schicht (Pfade, Validierung, Zuschnitt, Ersetzen/Entfernen, URL-Cache).
// Ausführen:  node --test tests/familyMedia.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildMediaPath, isMediaPath, parseMediaPath, validateImageFile, computeDrawPlan, MEDIA_LIMITS, MEDIA_MESSAGES,
  replaceEntityMedia, clearEntityMedia, removeMedia, createSignedUrlCache, withDisplayUrls, collectMediaPaths,
  removeFamilyMediaTree, SIGNED_URL_TTL_SECONDS, MEDIA_BUCKET,
} from "../src/lib/familyMedia.js";
import { mapFamilyToChampionData } from "../src/lib/familyMapping.js";
import { FAMILY_SELECT } from "../src/lib/familyData.js";

const F = "11111111-1111-4111-8111-111111111111", P = "22222222-2222-4222-8222-222222222222", T = "33333333-3333-4333-8333-333333333333";
const X = "44444444-4444-4444-8444-444444444444", Y = "55555555-5555-4555-8555-555555555555";

test("Pfade: stabiles Schema, Zufallsname, keine personenbezogenen Teile", () => {
  const p = buildMediaPath(F, "profile", P, X);
  assert.equal(p, `families/${F}/profiles/${P}/${X}.jpg`);
  assert.equal(buildMediaPath(F, "task", T, X), `families/${F}/tasks/${T}/${X}.jpg`);
  const r = buildMediaPath(F, "profile", P); // zufällige UUID
  assert.ok(isMediaPath(r) && r !== p);
  assert.deepEqual(parseMediaPath(p), { familyId: F, kind: "profile", entityId: P, fileId: X, ext: "jpg" });
  assert.throws(() => buildMediaPath(F, "profile", "Max Mustermann", X));
  assert.throws(() => buildMediaPath(F, "reward", P, X));
  for (const bad of [`families/${F}/profiles/${P}/../x.jpg`, `families/${F}/profiles/${P}/${X}.png`, `/families/${F}/profiles/${P}/${X}.jpg`,
    `families/${F}/profiles/${P}/${X}/${Y}.jpg`, `https://x.supabase.co/storage/v1/object/sign/family-media/families/${F}/profiles/${P}/${X}.jpg`,
    "data:image/jpeg;base64,AAAA", `families/ABCDEF01-1111-4111-8111-111111111111/profiles/${P}/${X}.jpg`, null]) assert.equal(isMediaPath(bad), false, String(bad));
});

test("Dateiprüfung: Typ, Größe, leere Datei, HEIC", () => {
  const f = (type, size, name = "x") => ({ type, size, name });
  assert.equal(validateImageFile(f("image/jpeg", 1000)), "");
  assert.equal(validateImageFile(f("image/png", 1000)), "");
  assert.equal(validateImageFile(f("image/webp", 1000)), "");
  assert.equal(validateImageFile(f("image/heic", 1000)), ""); // Dekodierbarkeit entscheidet der Browser
  assert.equal(validateImageFile(f("", 1000)), "");            // manche Browser liefern keinen Typ
  assert.equal(validateImageFile(f("image/gif", 1000)), MEDIA_MESSAGES.wrongType);
  assert.equal(validateImageFile(f("application/pdf", 1000)), MEDIA_MESSAGES.wrongType);
  assert.equal(validateImageFile(f("image/jpeg", 0)), MEDIA_MESSAGES.empty);
  assert.equal(validateImageFile(f("image/jpeg", MEDIA_LIMITS.MAX_INPUT_BYTES + 1)), MEDIA_MESSAGES.tooLarge);
  assert.equal(validateImageFile(null), MEDIA_MESSAGES.unreadable);
});

test("Zuschnitt: Profil quadratisch mittig ≤ 600, Aufgabe ≤ 1200, nie vergrößern", () => {
  assert.deepEqual(computeDrawPlan(4000, 3000, "profile"), { sx: 500, sy: 0, sw: 3000, sh: 3000, dw: 600, dh: 600 });
  assert.deepEqual(computeDrawPlan(3000, 4000, "profile"), { sx: 0, sy: 500, sw: 3000, sh: 3000, dw: 600, dh: 600 });
  assert.deepEqual(computeDrawPlan(100, 50, "profile"), { sx: 25, sy: 0, sw: 50, sh: 50, dw: 50, dh: 50 });
  assert.deepEqual(computeDrawPlan(4000, 3000, "task"), { sx: 0, sy: 0, sw: 4000, sh: 3000, dw: 1200, dh: 900 });
  assert.deepEqual(computeDrawPlan(800, 600, "task"), { sx: 0, sy: 0, sw: 800, sh: 600, dw: 800, dh: 600 });
  assert.throws(() => computeDrawPlan(0, 10, "task"));
});

// Simulierter Supabase-Client: protokolliert Storage- und DB-Aufrufe in Reihenfolge
function fakeClient({ uploadError = null, updateRows = 1, updateError = null, removeError = null, signError = null } = {}) {
  const log = [];
  const storage = {
    from(b) {
      assert.equal(b, MEDIA_BUCKET);
      return {
        upload: async (path, blob, opts) => { log.push(["upload", path, opts.contentType, opts.upsert]); return { error: uploadError, data: uploadError ? null : { path } }; },
        remove: async (paths) => { log.push(["remove", ...paths]); return removeError ? { error: removeError } : { data: paths.map((name) => ({ name })) }; },
        createSignedUrls: async (paths, ttl) => { log.push(["sign", paths.length, ttl]); return signError ? { error: signError } : { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}?t=${log.length}` })) }; },
        list: async (prefix) => { log.push(["list", prefix]);
          if (prefix.endsWith("/profiles")) return { data: [{ name: P }] };
          if (prefix.endsWith("/tasks")) return { data: [{ name: T }] };
          return { data: [{ name: `${X}.jpg` }] }; },
        getPublicUrl: () => { throw new Error("darf nicht verwendet werden"); },
      };
    },
  };
  const from = (table) => {
    const q = { table, filters: [] };
    const chain = {
      update(row) { q.row = row; return chain; },
      eq(c, v) { q.filters.push(["eq", c, v]); return chain; },
      is(c, v) { q.filters.push(["is", c, v]); return chain; },
      async select() { log.push(["update", table, q.row, q.filters]); return updateError ? { error: updateError } : { data: Array.from({ length: updateRows }, () => ({ id: "x" })) }; },
    };
    return chain;
  };
  return { storage, from, log };
}

test("Ersetzen: Upload → DB-Pfad (geschützt über alten Pfad) → altes Objekt löschen", async () => {
  const c = fakeClient();
  const old = buildMediaPath(F, "profile", P, Y);
  const r = await replaceEntityMedia(c, { familyId: F, kind: "profile", entityId: P, blob: {}, previousPath: old });
  assert.equal(r.ok, true);
  assert.deepEqual(c.log.map((l) => l[0]), ["upload", "update", "remove"]);
  assert.equal(c.log[0][2], "image/jpeg"); assert.equal(c.log[0][3], false);
  assert.deepEqual(c.log[1][2], { photo_path: r.path });
  assert.deepEqual(c.log[1][3].at(-1), ["eq", "photo_path", old]);
  assert.deepEqual(c.log[2], ["remove", old]);
  assert.ok(isMediaPath(r.path) && r.path !== old);
});

test("Ersetzen: DB-Fehler → neues Objekt entfernt, altes Bild bleibt", async () => {
  const old = buildMediaPath(F, "task", T, Y);
  for (const opts of [{ updateError: { code: "42501" } }, { updateRows: 0 }]) {
    const c = fakeClient(opts);
    const r = await replaceEntityMedia(c, { familyId: F, kind: "task", entityId: T, blob: {}, previousPath: old });
    assert.equal(r.ok, false);
    const uploaded = c.log[0][1];
    assert.deepEqual(c.log.map((l) => l[0]), ["upload", "update", "remove"]);
    assert.deepEqual(c.log[2], ["remove", uploaded]); // nur das NEUE Objekt
    assert.ok(!c.log.some((l) => l[0] === "remove" && l.includes(old)));
    assert.deepEqual(c.log[1][2], { image_path: uploaded });
  }
  assert.equal((await replaceEntityMedia(fakeClient({ updateRows: 0 }), { familyId: F, kind: "task", entityId: T, blob: {}, previousPath: old })).reason, "conflict");
});

test("Erstes Bild: Guard „Pfad ist leer“; Upload-Fehler → keine DB-Änderung", async () => {
  const c = fakeClient();
  await replaceEntityMedia(c, { familyId: F, kind: "profile", entityId: P, blob: {} });
  assert.deepEqual(c.log[1][3].at(-1), ["is", "photo_path", null]);
  assert.equal(c.log.filter((l) => l[0] === "remove").length, 0);
  const e = fakeClient({ uploadError: { statusCode: "400" } });
  const r = await replaceEntityMedia(e, { familyId: F, kind: "profile", entityId: P, blob: {} });
  assert.equal(r.ok, false);
  assert.deepEqual(e.log.map((l) => l[0]), ["upload"]);
});

test("Entfernen: DB-Pfad leeren → Objekt löschen; Löschfehler ändert App-Daten nicht", async () => {
  const old = buildMediaPath(F, "profile", P, Y);
  const c = fakeClient();
  assert.equal((await clearEntityMedia(c, { familyId: F, kind: "profile", entityId: P, previousPath: old })).ok, true);
  assert.deepEqual(c.log.map((l) => l[0]), ["update", "remove"]);
  assert.deepEqual(c.log[0][2], { photo_path: null });
  const d = fakeClient({ removeError: { statusCode: "500" } });
  const r = await clearEntityMedia(d, { familyId: F, kind: "profile", entityId: P, previousPath: old });
  assert.equal(r.ok, true); assert.equal(r.cleanupOk, false);
  assert.equal((await removeMedia(fakeClient(), ["keinpfad", null])).removed, 0);
});

test("Familie löschen vorbereitet: alle Objekte unter families/<id>/ werden entfernt", async () => {
  const c = fakeClient();
  const r = await removeFamilyMediaTree(c, F);
  assert.equal(r.ok, true); assert.equal(r.removed, 2);
  const removed = c.log.filter((l) => l[0] === "remove").flatMap((l) => l.slice(1));
  assert.ok(removed.every((p) => p.startsWith(`families/${F}/`)));
});

test("Signierte URLs: ein Sammelaufruf, Cache, Erneuerung vor Ablauf, Fehler → null, clear()", async () => {
  let t = 0;
  const c = fakeClient();
  const cache = createSignedUrlCache({ client: c, now: () => t });
  const a = buildMediaPath(F, "profile", P, X), b = buildMediaPath(F, "task", T, Y);
  const m1 = await cache.resolve([a, b, a, "https://evil"]);
  assert.equal(c.log.filter((l) => l[0] === "sign").length, 1);
  assert.deepEqual(c.log[0], ["sign", 2, SIGNED_URL_TTL_SECONDS]);
  assert.equal(m1.size, 2); assert.match(m1.get(a), /^https:\/\/signed\//);
  await cache.resolve([a, b]);
  assert.equal(c.log.filter((l) => l[0] === "sign").length, 1); // aus dem Cache
  t = (SIGNED_URL_TTL_SECONDS - 300) * 1000;                       // < 10 min Restlaufzeit
  const m2 = await cache.resolve([a]);
  assert.equal(c.log.filter((l) => l[0] === "sign").length, 2);
  assert.notEqual(m2.get(a), m1.get(a));
  cache.clear(); assert.equal(cache.size, 0); assert.equal(cache.peek(a), null);
  const bad = createSignedUrlCache({ client: fakeClient({ signError: { statusCode: "403" } }) });
  assert.equal((await bad.resolve([a])).get(a), null);
});

test("Mapping: nur Pfade aus der DB; Anzeige-URL wird eingesetzt, sonst Emoji-Fallback", () => {
  assert.match(FAMILY_SELECT, /photo_path/); assert.match(FAMILY_SELECT, /image_path/);
  assert.doesNotMatch(FAMILY_SELECT, /avatar_url|image_url/);
  const a = buildMediaPath(F, "profile", P, X), b = buildMediaPath(F, "task", T, Y);
  const raw = { id: F, name: "Test", family_settings: { show_daily_crown: true, require_confirmation: true, timezone: "Europe/Berlin" },
    profiles: [{ id: P, name: "Kind", avatar_emoji: "🦊", photo_path: a, sort_order: 0, active: true }, { id: Y, name: "Kind 2", avatar_emoji: "🐼", photo_path: null, sort_order: 1, active: true }],
    categories: [], tasks: [{ id: T, title: "Aufgabe", icon: "🧸", image_path: b, points: 5, recurrence: "daily", active: true, sort_order: 0, task_assignments: [] }],
    rewards: [], completions: [], redemptions: [], champion_history: [] };
  const d = mapFamilyToChampionData(raw).data;
  assert.equal(d.members[0].photoPath, a); assert.equal(d.members[0].photo, null);
  assert.equal(d.tasks[0].imagePath, b);
  assert.deepEqual(collectMediaPaths(d).sort(), [a, b].sort());
  const shown = withDisplayUrls(d, new Map([[a, "https://signed/a"]]));
  assert.equal(shown.members[0].photo, "https://signed/a");
  assert.equal(shown.members[1].photo, null);   // kein Bild → Emoji
  assert.equal(shown.tasks[0].photo, null);     // URL fehlgeschlagen → Emoji
  assert.equal(shown.members[0].emoji, "🦊");
});

test("Statisch: keine öffentlichen URLs, kein Base64-Speichern, Upload nur als JPEG", () => {
  const src = fs.readFileSync(new URL("../src/lib/familyMedia.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /getPublicUrl\(|toDataURL|readAsDataURL/);
  assert.match(src, /contentType: "image\/jpeg", upsert: false/);
  const fam = fs.readFileSync(new URL("../src/family/FamilyChampion.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(fam, /storage\.from|createSignedUrls?\(/); // Storage-Details nur in familyMedia.js
});
