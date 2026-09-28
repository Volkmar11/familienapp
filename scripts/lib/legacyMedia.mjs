// Phase 5B – Legacy-Bilder (Base64 in app_state) für den Import vorbereiten. Reine Funktionen, keine Ausgaben.
// Node besitzt keinen Canvas: Bilder werden deshalb nicht neu kodiert, sondern
//   1. dekodiert (nur data:image/jpeg;base64),
//   2. als JPEG validiert (SOI/SOF/EOI, Abmessungen),
//   3. von Metadaten bereinigt (APP1–APP15 = EXIF/XMP/ICC…, COM) – Bilddaten bleiben unverändert,
//   4. nur übernommen, wenn Größe/Abmessungen innerhalb der Limits liegen (Legacy speichert ≤ 200 px).
// Ungeeignete Bilder werden übersprungen und nur gezählt (Emoji bleibt Fallback).
export const LEGACY_MEDIA_LIMITS = Object.freeze({ MAX_BYTES: 2 * 1024 * 1024, MAX_EDGE: 1200 });

export function decodeDataUrl(value) {
  if (typeof value !== "string") return { ok: false, reason: "kein Bild" };
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!m) return { ok: false, reason: "kein Base64-Data-URL" };
  return { ok: true, mime: m[1].toLowerCase(), buffer: Buffer.from(m[2].replace(/\s+/g, ""), "base64") };
}

// JPEG-Marker durchlaufen (bis Start of Scan). Liefert Abmessungen und Metadaten-Hinweise.
export function inspectJpeg(buf) {
  const out = { valid: false, width: 0, height: 0, hasExif: false, hasGps: false, orientation: 1, metadataSegments: 0 };
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return out;
  let o = 2;
  while (o + 4 <= buf.length) {
    if (buf[o] !== 0xff) return out;
    const marker = buf[o + 1];
    if (marker === 0xd9) break;
    const len = buf.readUInt16BE(o + 2);
    if (len < 2 || o + 2 + len > buf.length) return out;
    const seg = buf.subarray(o + 4, o + 2 + len);
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) out.metadataSegments++;
    if (marker === 0xe1 && seg.subarray(0, 6).toString("latin1") === "Exif\0\0") {
      out.hasExif = true;
      const ifd0 = readIfd0(seg.subarray(6));
      out.hasGps = ifd0.has(0x8825);
      if (ifd0.has(0x0112)) out.orientation = ifd0.get(0x0112);
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      out.height = seg.readUInt16BE(1); out.width = seg.readUInt16BE(3);
    }
    if (marker === 0xda) { out.valid = out.width > 0 && out.height > 0 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9; return out; }
    o += 2 + len;
  }
  return out;
}

// IFD0-Tags → Map tag → SHORT-Wert (für GPS-Zeiger 0x8825 und Orientierung 0x0112)
function readIfd0(tiff) {
  const tags = new Map();
  if (tiff.length < 8) return tags;
  const le = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (p) => (le ? tiff.readUInt16LE(p) : tiff.readUInt16BE(p));
  const u32 = (p) => (le ? tiff.readUInt32LE(p) : tiff.readUInt32BE(p));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return tags;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) { const p = ifd + 2 + i * 12; if (p + 12 > tiff.length) break; tags.set(u16(p), u16(p + 8)); }
  return tags;
}

// Entfernt APP1–APP15 und Kommentar-Segmente (EXIF, GPS, XMP, Kamera-/Geräteinfos).
// APP0 (JFIF) und alle Bilddaten-Segmente bleiben; ab SOS wird unverändert kopiert.
export function stripJpegMetadata(buf) {
  if (!inspectJpeg(buf).valid) throw new Error("Kein gültiges JPEG");
  const parts = [buf.subarray(0, 2)];
  let o = 2;
  while (o < buf.length) {
    const marker = buf[o + 1];
    const len = buf.readUInt16BE(o + 2);
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(buf.subarray(o, o + 2 + len));
    if (marker === 0xda) { parts.push(buf.subarray(o + 2 + len)); break; }
    o += 2 + len;
  }
  return Buffer.concat(parts);
}

// Plan der zu importierenden Bilder. profileRef/taskId verweisen auf den Migrationsplan.
export function planMediaImports(data, plan) {
  const items = [], skipped = [];
  const stats = { profilePhotos: 0, taskPhotos: 0, exifBefore: 0, gpsBefore: 0, exifAfter: 0, skipped: 0 };
  const consider = (value, target, label) => {
    const dec = decodeDataUrl(value);
    if (!dec.ok || dec.mime !== "image/jpeg") { skipped.push(`${label}: ${dec.ok ? "Format " + dec.mime + " nicht unterstützt" : dec.reason}`); return; }
    const info = inspectJpeg(dec.buffer);
    if (!info.valid) { skipped.push(`${label}: kein gültiges JPEG`); return; }
    if (Math.max(info.width, info.height) > LEGACY_MEDIA_LIMITS.MAX_EDGE) { skipped.push(`${label}: zu groß (${info.width}×${info.height})`); return; }
    // Ohne Neukodierung würde das Entfernen einer EXIF-Drehung das Bild kippen → überspringen
    if (info.orientation !== 1) { skipped.push(`${label}: EXIF-Orientierung ${info.orientation} (Neukodierung im Browser nötig)`); return; }
    const clean = stripJpegMetadata(dec.buffer);
    if (clean.length > LEGACY_MEDIA_LIMITS.MAX_BYTES) { skipped.push(`${label}: Datei zu groß`); return; }
    const after = inspectJpeg(clean);
    if (info.hasExif) stats.exifBefore++;
    if (info.hasGps) stats.gpsBefore++;
    if (after.hasExif) stats.exifAfter++;
    items.push({ ...target, buffer: clean, width: info.width, height: info.height, bytesBefore: dec.buffer.length, bytesAfter: clean.length });
  };
  (data.members || []).forEach((m, i) => {
    if (!m.photo) return;
    stats.profilePhotos++;
    const ref = plan.profiles.find((p) => p.legacyId === m.id)?.ref;
    if (ref) consider(m.photo, { kind: "profile", profileRef: ref }, `profile-${i + 1}`);
  });
  (data.tasks || []).forEach((t, i) => {
    if (!t.photo) return;
    stats.taskPhotos++;
    const taskId = plan.tasks.find((x) => x.legacyId === t.id)?.id;
    if (taskId) consider(t.photo, { kind: "task", taskId }, `Aufgabe ${i + 1}`);
  });
  stats.skipped = skipped.length;
  return { items, skipped, stats };
}
