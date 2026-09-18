/* Lokaler Tresor: AES-256-GCM, Schluessel aus Passphrase (PBKDF2-SHA256).
   Klarnamen der Schuelerinnen und Schueler liegen ausschliesslich hier –
   verschluesselt im localStorage, entschluesselt nur im Arbeitsspeicher. */

import { state, aendern, uid, protokollieren } from './state.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 250000;

let sitzungsSchluessel = null;   // CryptoKey, nur im Speicher
let offeneDaten = null;          // { zuordnung: [{pseudonym, name, klasseId, notiz}] }

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function schluessel(passphrase, salt) {
  const basis = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export function tresorVorhanden() { return !!state().tresor; }
export function istOffen() { return !!sitzungsSchluessel; }
export function daten() { return offeneDaten; }

export async function anlegen(passphrase) {
  if (passphrase.length < 8) throw new Error('Die Passphrase muss mindestens 8 Zeichen haben.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  sitzungsSchluessel = await schluessel(passphrase, salt);
  offeneDaten = { zuordnung: [] };
  aendern((d) => { d.tresor = { salt: b64(salt), iv: '', daten: '', angelegt: new Date().toISOString() }; });
  await sichern();
  protokollieren('Tresor angelegt');
}

export async function oeffnen(passphrase) {
  const t = state().tresor;
  if (!t) throw new Error('Es ist noch kein Tresor angelegt.');
  const key = await schluessel(passphrase, unb64(t.salt));
  if (!t.daten) { sitzungsSchluessel = key; offeneDaten = { zuordnung: [] }; return; }
  try {
    const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(t.iv) }, key, unb64(t.daten));
    offeneDaten = JSON.parse(dec.decode(klar));
    sitzungsSchluessel = key;
    protokollieren('Tresor geöffnet');
  } catch {
    throw new Error('Falsche Passphrase – der Tresor bleibt verschlossen.');
  }
}

export async function sichern() {
  if (!sitzungsSchluessel) throw new Error('Tresor ist verschlossen.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const roh = enc.encode(JSON.stringify(offeneDaten));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sitzungsSchluessel, roh);
  aendern((d) => { d.tresor = { ...d.tresor, iv: b64(iv), daten: b64(chiffre), geaendert: new Date().toISOString() }; });
}

export function schliessen() {
  sitzungsSchluessel = null;
  offeneDaten = null;
  protokollieren('Tresor verschlossen');
}

export async function eintragen(pseudonym, name, klasseId, notiz = '') {
  if (!istOffen()) throw new Error('Tresor ist verschlossen.');
  const vorhanden = offeneDaten.zuordnung.find((z) => z.pseudonym === pseudonym);
  if (vorhanden) Object.assign(vorhanden, { name, klasseId, notiz });
  else offeneDaten.zuordnung.push({ id: uid(), pseudonym, name, klasseId, notiz });
  await sichern();
}

export async function entfernen(pseudonym) {
  if (!istOffen()) return;
  offeneDaten.zuordnung = offeneDaten.zuordnung.filter((z) => z.pseudonym !== pseudonym);
  await sichern();
}

export function nameZu(pseudonym) {
  if (!istOffen()) return null;
  return offeneDaten.zuordnung.find((z) => z.pseudonym === pseudonym)?.name || null;
}
export function pseudonymZu(name) {
  if (!istOffen() || !name) return null;
  const n = name.trim().toLowerCase();
  return offeneDaten.zuordnung.find((z) => z.name?.trim().toLowerCase() === n)?.pseudonym || null;
}

/* CSV/Semikolon-Listen einlesen: erkennt Spalten Name / Vorname+Nachname / Klasse */
export function csvLesen(text) {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  if (!zeilen.length) return [];
  const trenner = (zeilen[0].match(/;/g) || []).length >= (zeilen[0].match(/,/g) || []).length ? ';' : ',';
  const kopf = zeilen[0].toLowerCase();
  const hatKopf = /name|klasse|vorname|nachname/.test(kopf);
  const spalten = hatKopf ? zeilen[0].split(trenner).map((s) => s.trim().toLowerCase()) : [];
  const idx = (...n) => n.map((x) => spalten.indexOf(x)).find((i) => i >= 0);
  const iName = hatKopf ? idx('name', 'schüler', 'schueler') : -1;
  const iVor = hatKopf ? idx('vorname') : -1;
  const iNach = hatKopf ? idx('nachname', 'familienname') : -1;
  const iKlasse = hatKopf ? idx('klasse') : -1;
  return zeilen.slice(hatKopf ? 1 : 0).map((z) => {
    const t = z.split(trenner).map((s) => s.trim().replace(/^"|"$/g, ''));
    let name = '';
    if (iVor >= 0 || iNach >= 0) name = [t[iVor] || '', t[iNach] || ''].join(' ').trim();
    else if (iName >= 0) name = t[iName] || '';
    else name = t[0] || '';
    return { name, klasse: iKlasse >= 0 ? t[iKlasse] || '' : (t[1] || '') };
  }).filter((e) => e.name);
}
