// Integrationstest Phase 5B (Familienmedien) gegen das Supabase-TESTPROJEKT über die echte Storage-API.
// Wegwerf-Konten „wc-p5b-…@example.com“, Familien mit neutralen Profilen, nur ein synthetisches 8×8-Testbild.
// Alle hochgeladenen Objekte werden am Ende über die Storage-API entfernt (removeFamilyMediaTree).
// Aufräumen der Konten danach per SQL im Testprojekt:
//   delete from public.families where created_by in (select id from auth.users where email like 'wc-p5b-%@example.com');
//   delete from auth.users where email like 'wc-p5b-%@example.com';
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-media.test.mjs
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { deleteTestAccounts } from "./_cleanup.mjs";
import { STARTER_TASKS, STARTER_REWARDS } from "../../src/config/starterContent.js";
import { initialOnboardingState, buildOnboardingPayload, createFamilyWithOnboarding } from "../../src/lib/onboarding.js";
import { loadFamilyData } from "../../src/lib/familyData.js";
import * as Media from "../../src/lib/familyMedia.js";
import * as M from "../../src/lib/familyMutations.js";

if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) { console.error("Abbruch: nur gegen das Testprojekt."); process.exit(2); }
const cfg = getFamilyConfig({ VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL, VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY });
const mk = () => createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
console.warn = () => {}; // erwartete technische Cleanup-Hinweise nicht ausgeben

const R = []; const check = (n, ok, d = "") => R.push({ n, ok: !!ok, d });
const stamp = Date.now();
const JPEG = fs.readFileSync(new URL("../fixtures/synthetic-8x8.jpg", import.meta.url));
const blob = () => new Blob([JPEG], { type: "image/jpeg" });
async function user(tag) {
  const email = `wc-p5b-${tag}-${stamp}@example.com`, password = randomUUID();
  const c = mk(); const r = await c.auth.signUp({ email, password });
  if (r.error || !r.data.session) throw new Error("signUp fehlgeschlagen: " + r.error?.message);
  return { c, id: r.data.user.id, email, password };
}
async function onboard(u, name, kids) {
  const s = initialOnboardingState(); s.familyName = name;
  s.children = kids.map((n, i) => ({ id: String(i), name: n, avatar: "🦊", color: "#16a34a" }));
  s.pin = s.pin2 = "4827";
  STARTER_TASKS.forEach((t, i) => { s.tasks[t.key] = { selected: i < 2, points: "10" }; });
  STARTER_REWARDS.forEach((r) => { s.rewards[r.key] = { selected: false, points: "20" }; });
  const r = await createFamilyWithOnboarding(u.c, randomUUID(), buildOnboardingPayload(s)); if (!r.ok) throw new Error(r.error); return r.familyId;
}
const load = async (c, f) => (await loadFamilyData(c, f)).model.data;
const bucket = (c) => c.storage.from(Media.MEDIA_BUCKET);
const listFiles = async (c, prefix) => ((await bucket(c).list(prefix)).data || []).filter((x) => x.id);
const download = async (c, p) => { const r = await bucket(c).download(p); return r.error ? null : Buffer.from(await r.data.arrayBuffer()); };
const syncVersion = async (c, f) => (await c.from("family_sync").select("version").eq("family_id", f).single()).data?.version;

const A = await user("a"), B = await user("b"), anon = mk();
const fA = await onboard(A, "Medien A", ["Alex", "Sam"]);
const fB = await onboard(B, "Medien B", ["Kim"]);
let d = await load(A.c, fA);
const pA = d.members[0].id, pA2 = d.members[1].id, tA = d.tasks[0].id;
const pB = (await load(B.c, fB)).members[0].id;
const profDir = `families/${fA}/profiles/${pA}`;

// 1. Upload + DB-Pfad
const v0 = await syncVersion(A.c, fA);
let r = await Media.uploadProfileImage(A.c, { familyId: fA, profileId: pA, blob: blob() });
d = await load(A.c, fA);
check("1 owner lädt Profilbild hoch (photo_path gesetzt)", r.ok && d.members[0].photoPath === r.path && Media.isMediaPath(r.path));
const p1 = r.path;
check("Realtime-Signal: photo_path-Änderung erhöht family_sync", (await syncVersion(A.c, fA)) > v0);
// 2. Lesen (Download + signierte URL)
check("2 owner liest Profilbild (Download identisch)", (await download(A.c, p1))?.equals(JPEG));
const cache = Media.createSignedUrlCache({ client: A.c });
const url = (await cache.resolve([p1])).get(p1);
const fetched = url ? await fetch(url) : null;
check("2b signierte URL (60 min) liefert das Bild", fetched?.status === 200 && /\/object\/sign\//.test(url) && /token=/.test(url));
// 3./11. Ersetzen → altes Objekt entfernt
r = await Media.uploadProfileImage(A.c, { familyId: fA, profileId: pA, blob: blob(), previousPath: p1 });
const p2 = r.path;
let files = await listFiles(A.c, profDir);
check("3 owner ersetzt Profilbild", r.ok && p2 !== p1 && (await load(A.c, fA)).members[0].photoPath === p2);
// Hinweis: download() kann bis ~60 s aus dem Supabase-CDN-Cache antworten (nur für Berechtigte);
// maßgeblich sind Objektliste und signierte URL (prüft die Existenz in storage.objects).
const oldSign = await bucket(A.c).createSignedUrl(p1, 60);
const oldGone = !!oldSign.error || !oldSign.data?.signedUrl;
check("11 altes Objekt nach Replace entfernt", files.length === 1 && `${profDir}/${files[0]?.name}` === p2 && oldGone, `files=${files.length} match=${`${profDir}/${files[0]?.name}` === p2} oldGone=${oldGone}`);
// 12. DB-Update scheitert (veralteter Pfad) → altes Bild bleibt, neues entfernt
r = await Media.uploadProfileImage(A.c, { familyId: fA, profileId: pA, blob: blob(), previousPath: p1 /* veraltet */ });
files = await listFiles(A.c, profDir);
check("12 DB-Fehler beim Update behält altes Bild (und entfernt das neue)", !r.ok && r.reason === "conflict" && (await load(A.c, fA)).members[0].photoPath === p2 && files.length === 1 && (await download(A.c, p2))?.equals(JPEG));
// 5./6./7. Fremde Familie + manipulierte Pfade
check("5 fremder Nutzer kann Pfad nicht lesen (Download)", (await download(B.c, p2)) === null);
const signB = await bucket(B.c).createSignedUrl(p2, 60);
check("5b fremder Nutzer erhält keine signierte URL", !!signB.error || !signB.data?.signedUrl);
check("5c fremder Nutzer sieht keine Objekte der Familie", (await listFiles(B.c, profDir)).length === 0);
let up = await bucket(B.c).upload(`${profDir}/${randomUUID()}.jpg`, blob(), { contentType: "image/jpeg" });
check("6 fremder Nutzer kann nicht in fremden Pfad schreiben", !!up.error);
up = await bucket(B.c).upload(`families/${fB}/profiles/${pA}/${randomUUID()}.jpg`, blob(), { contentType: "image/jpeg" });
check("7 manipulierter Pfad (eigene family_id + fremdes Profil) blockiert", !!up.error);
up = await bucket(A.c).upload(`families/${fB}/profiles/${pB}/${randomUUID()}.jpg`, blob(), { contentType: "image/jpeg" });
check("7b manipulierte family_id (fremde Familie) blockiert", !!up.error);
up = await bucket(A.c).upload(`families/${fA}/profiles/${pA}/Alex.jpg`, blob(), { contentType: "image/jpeg" });
check("7c Dateiname mit Klartext abgelehnt", !!up.error);
const rm = await bucket(B.c).remove([p2]);
check("7d fremder Nutzer kann nicht löschen", (rm.data || []).length === 0 && (await download(A.c, p2)) !== null);
const upd = await B.c.from("profiles").update({ photo_path: null }).eq("id", pA).select("id");
check("7e fremder Nutzer kann photo_path nicht ändern", (upd.data || []).length === 0);
// 8. anon
check("8 anon kann nicht lesen", (await download(anon, p2)) === null && (await listFiles(anon, profDir)).length === 0);
up = await bucket(anon).upload(`${profDir}/${randomUUID()}.jpg`, blob(), { contentType: "image/jpeg" });
check("8b anon kann nicht schreiben", !!up.error);
// 9. keine öffentliche URL
const pub = bucket(A.c).getPublicUrl(p2).data.publicUrl;
const pubRes = await fetch(pub);
check("9 privater Bucket: öffentliche URL liefert kein Bild", pubRes.status !== 200, String(pubRes.status));
// 13./14. Typ und Größe
up = await bucket(A.c).upload(`${profDir}/${randomUUID()}.jpg`, new Blob(["kein Bild"], { type: "text/plain" }), { contentType: "text/plain" });
check("13 ungültiger Dateityp (text/plain) blockiert", !!up.error);
up = await bucket(A.c).upload(`${profDir}/${randomUUID()}.png`, blob(), { contentType: "image/png" });
check("13b PNG-Pfad/Typ blockiert (nur verarbeitetes JPEG/WebP)", !!up.error);
up = await bucket(A.c).upload(`${profDir}/${randomUUID()}.jpg`, new Blob([Buffer.alloc(Media.MEDIA_LIMITS.MAX_OUTPUT_BYTES + 1024)], { type: "image/jpeg" }), { contentType: "image/jpeg" });
check("14 zu große Datei (> 2 MB) blockiert", !!up.error);
check("14b Client lehnt > 10 MB ab", Media.validateImageFile({ type: "image/jpeg", size: 11 * 1024 * 1024 }) === Media.MEDIA_MESSAGES.tooLarge);
// 15. kein Base64/keine URL in der DB
const b64 = await A.c.from("profiles").update({ photo_path: "data:image/jpeg;base64,/9j/AAAA" }).eq("id", pA2).select("id");
const urlUpd = await A.c.from("profiles").update({ photo_path: url }).eq("id", pA2).select("id");
const oldCol = await A.c.from("profiles").update({ avatar_url: "data:image/jpeg;base64,/9j/AAAA" }).eq("id", pA2).select("id");
check("15 kein Base64 / keine (signierte) URL in der Datenbank speicherbar", !!b64.error && !!urlUpd.error && !!oldCol.error);
// 10. Aufgabenbild analog
r = await Media.uploadTaskImage(A.c, { familyId: fA, taskId: tA, blob: blob() });
const t1 = r.path;
r = await Media.uploadTaskImage(A.c, { familyId: fA, taskId: tA, blob: blob(), previousPath: t1 });
const t2 = r.path;
const taskFiles = await listFiles(A.c, `families/${fA}/tasks/${tA}`);
d = await load(A.c, fA);
check("10 Aufgabenbild: Upload + Ersetzen (altes entfernt)", r.ok && d.tasks.find((x) => x.id === tA).imagePath === t2 && taskFiles.length === 1);
check("10b fremder Nutzer kann Aufgabenbild nicht lesen", (await download(B.c, t2)) === null);
r = await Media.removeTaskImage(A.c, { familyId: fA, taskId: tA, previousPath: t2 });
check("10c Aufgabenbild entfernen", r.ok && (await load(A.c, fA)).tasks.find((x) => x.id === tA).imagePath === null && (await listFiles(A.c, `families/${fA}/tasks/${tA}`)).length === 0);
// 4. Profilbild löschen
r = await Media.removeProfileImage(A.c, { familyId: fA, profileId: pA, previousPath: p2 });
check("4 owner entfernt Profilbild (DB null, Objekt gelöscht)", r.ok && (await load(A.c, fA)).members[0].photoPath === null && (await listFiles(A.c, profDir)).length === 0);
// Archivieren behält Bild; physisches Löschen erlaubt Cleanup
r = await Media.uploadProfileImage(A.c, { familyId: fA, profileId: pA2, blob: blob() });
const p3 = r.path;
await M.completeTask(A.c, { familyId: fA, profileId: pA2, taskId: tA });
const arch = await M.removeProfile(A.c, { familyId: fA, profileId: pA2 });
d = await load(A.c, fA);
check("Archiviertes Profil behält Bild", arch.ok && arch.mode === "archived" && d.archived.members.find((m) => m.id === pA2)?.photoPath === p3 && (await download(A.c, p3)) !== null);
// Familie löschen vorbereitet: alle Objekte unter families/<id>/
await Media.uploadProfileImage(A.c, { familyId: fA, profileId: pA, blob: blob() });
const tree = await Media.removeFamilyMediaTree(A.c, fA);
check("Familien-Cleanup entfernt alle Objekte unter families/<id>/", tree.ok && tree.removed === 2 && (await listFiles(A.c, `families/${fA}/profiles/${pA}`)).length === 0 && (await listFiles(A.c, `families/${fA}/profiles/${pA2}`)).length === 0, `${tree.removed}`);

// Aufräumen über delete-account (seit Phase 6A kein direktes DELETE auf families)
const cl = await deleteTestAccounts(cfg, [A, B]);
check("Aufräumen: Konten + Familien über delete-account gelöscht", cl.ok && cl.deletedFamilies === 2, JSON.stringify(cl));

const failed = R.filter((x) => !x.ok);
for (const x of R) console.log(`${x.ok ? "✅" : "❌"} ${x.n}${x.ok || !x.d ? "" : " – " + x.d}`);
console.log(`\n${R.length - failed.length}/${R.length} bestanden`);
process.exit(failed.length ? 1 : 0);
