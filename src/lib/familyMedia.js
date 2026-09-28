// Familienmedien (Phase 5B): Profil- und Aufgabenbilder in einem PRIVATEN Supabase-Storage-Bucket.
//
// Grundsätze:
// * Die DB speichert nur stabile Pfade (profiles.photo_path, tasks.image_path) – nie URLs,
//   signierte URLs oder Base64. Anzeige über kurzlebige signierte URLs mit Cache im Speicher.
// * Pfad: families/<family_id>/<profiles|tasks>/<entity_id>/<zufalls-uuid>.jpg – keine Namen
//   oder Titel im Pfad. Die Storage-RLS liest die family_id serverseitig aus dem Pfad.
// * Vor dem Upload wird jedes Bild im Browser dekodiert, verkleinert und als JPEG neu kodiert.
//   Dadurch entfallen EXIF-/GPS-Metadaten (Canvas schreibt keine Metadaten).
// * Ersetzen: erst neues Objekt hochladen, dann DB-Pfad setzen, erst danach altes Objekt löschen.
//   Scheitert das DB-Update, wird das neue Objekt wieder entfernt – das alte bleibt gültig.
// Eingabe ist File ODER Blob (Web-<input type="file">, später auch Capacitor-Kamera).

export const MEDIA_BUCKET = "family-media";
export const MEDIA_LIMITS = Object.freeze({
  MAX_INPUT_BYTES: 10 * 1024 * 1024,   // Original höchstens 10 MB
  MAX_OUTPUT_BYTES: 2 * 1024 * 1024,   // = Bucket-Limit
  PROFILE_SIZE: 600,                   // Profilbild: quadratisch, höchstens 600 × 600
  TASK_MAX_EDGE: 1200,                 // Aufgabenbild: längste Kante höchstens 1200
  JPEG_QUALITY: [0.82, 0.72, 0.6],     // bei Bedarf stufenweise kleiner
});
export const SIGNED_URL_TTL_SECONDS = 3600;       // 60 Minuten
export const SIGNED_URL_RENEW_BEFORE_SECONDS = 600; // 10 Minuten vor Ablauf erneuern

export const ACCEPTED_INPUT_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
export const MEDIA_MESSAGES = Object.freeze({
  tooLarge: "Das Bild ist zu groß (höchstens 10 MB).",
  wrongType: "Bitte ein Bild im Format JPEG, PNG, WebP oder HEIC auswählen.",
  heic: "Dieses HEIC-Foto kann der Browser nicht öffnen. Bitte auf dem iPhone „Einstellungen → Kamera → Formate → Maximale Kompatibilität“ wählen oder das Foto als JPEG teilen.",
  unreadable: "Das Bild konnte nicht gelesen werden. Bitte ein anderes Foto wählen.",
  empty: "Die Datei ist leer.",
  upload: "Das Bild konnte nicht hochgeladen werden. Bitte erneut versuchen.",
  save: "Das Bild konnte nicht gespeichert werden. Das bisherige Bild bleibt erhalten.",
  conflict: "Das Bild wurde inzwischen auf einem anderen Gerät geändert. Bitte erneut versuchen.",
});

const KINDS = { profile: { folder: "profiles", table: "profiles", column: "photo_path" }, task: { folder: "tasks", table: "tasks", column: "image_path" } };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Gleiches Muster wie private.is_media_path in der Datenbank
const PATH_RE = new RegExp(`^families/(${UUID})/(profiles|tasks)/(${UUID})/(${UUID})\\.(jpg|webp)$`);

// Technische Fehler ohne personenbezogene Daten protokollieren (nur Aktion + Fehlercode)
const logTech = (action, error) => {
  try { console.warn(`[media] ${action} fehlgeschlagen`, error?.statusCode || error?.code || error?.name || "error"); } catch { /* ignore */ }
};

const randomId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

// ------------------------------------------------------------------ Pfade
export function buildMediaPath(familyId, kind, entityId, fileId = randomId(), ext = "jpg") {
  const k = KINDS[kind];
  const path = k && `families/${String(familyId).toLowerCase()}/${k.folder}/${String(entityId).toLowerCase()}/${String(fileId).toLowerCase()}.${ext}`;
  if (!path || !PATH_RE.test(path)) throw new Error("Ungültiger Medienpfad");
  return path;
}
export const isMediaPath = (path) => typeof path === "string" && PATH_RE.test(path);
export function parseMediaPath(path) {
  const m = typeof path === "string" && PATH_RE.exec(path);
  return m ? { familyId: m[1], kind: m[2] === "profiles" ? "profile" : "task", entityId: m[3], fileId: m[4], ext: m[5] } : null;
}

// ------------------------------------------------------------------ Validierung / Größe
const isHeic = (file) => /heic|heif/i.test(file?.type || "") || /\.(heic|heif)$/i.test(file?.name || "");

// "" = ok, sonst deutsche Meldung. Leerer MIME-Typ ist erlaubt (manche Browser) – dann entscheidet das Dekodieren.
export function validateImageFile(file) {
  if (!file || typeof file.size !== "number") return MEDIA_MESSAGES.unreadable;
  if (file.size === 0) return MEDIA_MESSAGES.empty;
  if (file.size > MEDIA_LIMITS.MAX_INPUT_BYTES) return MEDIA_MESSAGES.tooLarge;
  const type = String(file.type || "").toLowerCase();
  if (type && !ACCEPTED_INPUT_TYPES.includes(type)) return MEDIA_MESSAGES.wrongType;
  return "";
}

// Zuschnitt/Skalierung: Profil = mittiger Quadrat-Ausschnitt, Aufgabe = proportional. Nie vergrößern.
export function computeDrawPlan(srcW, srcH, kind) {
  if (!(srcW > 0 && srcH > 0)) throw new Error("Ungültige Bildgröße");
  if (kind === "profile") {
    const side = Math.min(srcW, srcH);
    const out = Math.min(side, MEDIA_LIMITS.PROFILE_SIZE);
    return { sx: Math.round((srcW - side) / 2), sy: Math.round((srcH - side) / 2), sw: side, sh: side, dw: out, dh: out };
  }
  const scale = Math.min(1, MEDIA_LIMITS.TASK_MAX_EDGE / Math.max(srcW, srcH));
  return { sx: 0, sy: 0, sw: srcW, sh: srcH, dw: Math.max(1, Math.round(srcW * scale)), dh: Math.max(1, Math.round(srcH * scale)) };
}

// ------------------------------------------------------------------ Browser: Dekodieren + Neukodieren
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* Fallback unten */ }
  }
  if (typeof Image === "undefined" || typeof URL === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}

const canvasToBlob = (canvas, quality) => new Promise((resolve) => {
  if (typeof canvas.convertToBlob === "function") canvas.convertToBlob({ type: "image/jpeg", quality }).then(resolve, () => resolve(null));
  else canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
});

// Datei/Blob → { ok, blob (image/jpeg, ohne Metadaten), width, height, bytes } | { ok:false, message }
export async function prepareImage(file, kind) {
  const invalid = validateImageFile(file);
  if (invalid) return { ok: false, message: invalid };
  const img = await decodeImage(file);
  if (!img) return { ok: false, message: isHeic(file) ? MEDIA_MESSAGES.heic : MEDIA_MESSAGES.unreadable };
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  let plan;
  try { plan = computeDrawPlan(w, h, kind); } catch { return { ok: false, message: MEDIA_MESSAGES.unreadable }; }
  const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(plan.dw, plan.dh) : Object.assign(document.createElement("canvas"), { width: plan.dw, height: plan.dh });
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";                 // Transparenz (PNG) → weiß statt schwarz
  ctx.fillRect(0, 0, plan.dw, plan.dh);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.dw, plan.dh);
  if (typeof img.close === "function") img.close();
  for (const q of MEDIA_LIMITS.JPEG_QUALITY) {
    const blob = await canvasToBlob(canvas, q);
    if (blob && blob.size <= MEDIA_LIMITS.MAX_OUTPUT_BYTES) return { ok: true, blob, width: plan.dw, height: plan.dh, bytes: blob.size };
  }
  return { ok: false, message: MEDIA_MESSAGES.tooLarge };
}
export const prepareProfileImage = (file) => prepareImage(file, "profile");
export const prepareTaskImage = (file) => prepareImage(file, "task");

// ------------------------------------------------------------------ Storage + DB
const bucket = (client) => client.storage.from(MEDIA_BUCKET);

export async function uploadMedia(client, { familyId, kind, entityId, blob, fileId }) {
  let path;
  try { path = buildMediaPath(familyId, kind, entityId, fileId || randomId()); } catch { return { ok: false, message: MEDIA_MESSAGES.upload }; }
  try {
    const r = await bucket(client).upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
    if (r.error) { logTech("upload", r.error); return { ok: false, message: MEDIA_MESSAGES.upload }; }
  } catch (e) { logTech("upload", e); return { ok: false, message: MEDIA_MESSAGES.upload }; }
  return { ok: true, path };
}

// Löschen ist „best effort“: App-Daten bleiben korrekt, auch wenn ein Objekt liegen bleibt.
export async function removeMedia(client, paths) {
  const list = [].concat(paths || []).filter(isMediaPath);
  if (!list.length) return { ok: true, removed: 0 };
  try {
    const r = await bucket(client).remove(list);
    if (r.error) { logTech("remove", r.error); return { ok: false, removed: 0 }; }
    return { ok: true, removed: (r.data || []).length };
  } catch (e) { logTech("remove", e); return { ok: false, removed: 0 }; }
}
export const cleanupReplacedMedia = (client, previousPath) => removeMedia(client, previousPath ? [previousPath] : []);

// DB-Pfad setzen – nur wenn der bisherige Pfad noch dem erwarteten entspricht (kein stilles Überschreiben)
async function setEntityPath(client, { familyId, kind, entityId, path, previousPath }) {
  const k = KINDS[kind];
  let q = client.from(k.table).update({ [k.column]: path }).eq("family_id", familyId).eq("id", entityId);
  q = previousPath ? q.eq(k.column, previousPath) : q.is(k.column, null);
  const r = await q.select("id");
  if (r.error) { logTech("db-update", r.error); return { ok: false, message: MEDIA_MESSAGES.save }; }
  if (!r.data || r.data.length !== 1) return { ok: false, reason: "conflict", message: MEDIA_MESSAGES.conflict };
  return { ok: true };
}

// Neues Bild: hochladen → DB-Pfad setzen → altes Objekt entfernen. Bei DB-Fehler neues Objekt entfernen.
export async function replaceEntityMedia(client, { familyId, kind, entityId, blob, previousPath = null }) {
  const up = await uploadMedia(client, { familyId, kind, entityId, blob });
  if (!up.ok) return up;
  let set;
  try { set = await setEntityPath(client, { familyId, kind, entityId, path: up.path, previousPath }); }
  catch (e) { logTech("db-update", e); set = { ok: false, message: MEDIA_MESSAGES.save }; }
  if (!set.ok) { await removeMedia(client, [up.path]); return set; }
  const cleanup = previousPath && previousPath !== up.path ? await cleanupReplacedMedia(client, previousPath) : { ok: true, removed: 0 };
  return { ok: true, path: up.path, cleanupOk: cleanup.ok };
}

// Bild entfernen: DB-Pfad leeren → altes Objekt löschen (Fehler beim Löschen ändert die App-Daten nicht)
export async function clearEntityMedia(client, { familyId, kind, entityId, previousPath }) {
  if (!previousPath) return { ok: true };
  let set;
  try { set = await setEntityPath(client, { familyId, kind, entityId, path: null, previousPath }); }
  catch (e) { logTech("db-update", e); set = { ok: false, message: MEDIA_MESSAGES.save }; }
  if (!set.ok) return set;
  const cleanup = await cleanupReplacedMedia(client, previousPath);
  return { ok: true, cleanupOk: cleanup.ok };
}

export const uploadProfileImage = (client, { familyId, profileId, blob, previousPath }) => replaceEntityMedia(client, { familyId, kind: "profile", entityId: profileId, blob, previousPath });
export const uploadTaskImage = (client, { familyId, taskId, blob, previousPath }) => replaceEntityMedia(client, { familyId, kind: "task", entityId: taskId, blob, previousPath });
export const removeProfileImage = (client, { familyId, profileId, previousPath }) => clearEntityMedia(client, { familyId, kind: "profile", entityId: profileId, previousPath });
export const removeTaskImage = (client, { familyId, taskId, previousPath }) => clearEntityMedia(client, { familyId, kind: "task", entityId: taskId, previousPath });

// Vorbereitung Kontolöschung (Phase 5C): alle Objekte unter families/<family_id>/ entfernen.
// Muss VOR dem Löschen der Familie laufen (danach fehlt die Berechtigung). Liefert Anzahl entfernter Objekte.
export async function removeFamilyMediaTree(client, familyId) {
  const root = `families/${String(familyId).toLowerCase()}`;
  const all = [];
  for (const folder of ["profiles", "tasks"]) {
    const entities = await bucket(client).list(`${root}/${folder}`, { limit: 1000 });
    if (entities.error) return { ok: false, removed: 0 };
    for (const e of entities.data || []) {
      const files = await bucket(client).list(`${root}/${folder}/${e.name}`, { limit: 1000 });
      if (files.error) return { ok: false, removed: 0 };
      for (const f of files.data || []) all.push(`${root}/${folder}/${e.name}/${f.name}`);
    }
  }
  let removed = 0;
  for (let i = 0; i < all.length; i += 100) {
    const r = await removeMedia(client, all.slice(i, i + 100));
    if (!r.ok) return { ok: false, removed };
    removed += r.removed;
  }
  return { ok: true, removed };
}

// ------------------------------------------------------------------ Anzeige: signierte URLs + Cache
// Cache nur im Speicher: path → { url, expiresAt }. Pro Familie eine Instanz; bei Logout/
// Familienwechsel verwerfen (clear). Fehler → null (Oberfläche zeigt dann das Emoji).
export function createSignedUrlCache({ client, ttlSeconds = SIGNED_URL_TTL_SECONDS, renewBeforeSeconds = SIGNED_URL_RENEW_BEFORE_SECONDS, now = () => Date.now() } = {}) {
  const cache = new Map();
  let generation = 0;
  const fresh = (e) => e && e.expiresAt - renewBeforeSeconds * 1000 > now();
  const api = {
    peek(path) { const e = cache.get(path); return fresh(e) ? e.url : null; },
    // Liefert Map path → url|null; fordert nur fehlende/bald ablaufende Pfade in EINEM Aufruf an.
    async resolve(paths) {
      const wanted = [...new Set([].concat(paths || []).filter(isMediaPath))];
      const missing = wanted.filter((p) => !fresh(cache.get(p)));
      const gen = generation;
      if (missing.length) {
        try {
          const r = await bucket(client).createSignedUrls(missing, ttlSeconds);
          if (gen === generation) {
            if (r.error) logTech("sign", r.error);
            const expiresAt = now() + ttlSeconds * 1000;
            for (const row of r.data || []) if (row?.path && row.signedUrl && !row.error) cache.set(row.path, { url: row.signedUrl, expiresAt });
          }
        } catch (e) { logTech("sign", e); }
      }
      return new Map(wanted.map((p) => [p, api.peek(p)]));
    },
    invalidate(path) { cache.delete(path); },
    clear() { generation++; cache.clear(); },
    get size() { return cache.size; },
  };
  return api;
}

// Modell für die Oberfläche: photo/photo-URL aus dem Cache einsetzen (Emoji bleibt Fallback).
export function withDisplayUrls(data, urlByPath) {
  if (!data) return data;
  const url = (p) => (p && urlByPath.get(p)) || null;
  const mapM = (list) => (list || []).map((m) => ({ ...m, photo: url(m.photoPath) }));
  const mapT = (list) => (list || []).map((t) => ({ ...t, photo: url(t.imagePath) }));
  return { ...data, members: mapM(data.members), tasks: mapT(data.tasks),
    archived: data.archived ? { ...data.archived, members: mapM(data.archived.members), tasks: mapT(data.archived.tasks) } : data.archived };
}
export function collectMediaPaths(data) {
  if (!data) return [];
  const a = data.archived || {};
  return [...(data.members || []), ...(a.members || [])].map((m) => m.photoPath)
    .concat([...(data.tasks || []), ...(a.tasks || [])].map((t) => t.imagePath)).filter(isMediaPath);
}
