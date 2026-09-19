/* Lokaler Tresor: AES-256-GCM, Schlüssel aus Passphrase (PBKDF2-SHA256, 250.000 Runden).
   Klarnamen und Zuordnungstabelle bleiben verschlüsselt auf diesem Gerät. */
import { state, aendern, uid, jetzt, protokoll } from './store.js';

const enc = new TextEncoder(), dec = new TextDecoder();
let schluessel = null, offen = null;
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function ableiten(pass, salt) {
  const basis = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, basis,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const vorhanden = () => !!state().tresor;
export const istOffen = () => !!schluessel;
export const daten = () => offen;

export async function anlegen(pass) {
  if ((pass || '').length < 8) throw new Error('Die Passphrase braucht mindestens 8 Zeichen.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  schluessel = await ableiten(pass, salt);
  offen = { zuordnung: [] };
  aendern((d) => { d.tresor = { salt: b64(salt), iv: '', daten: '', angelegt: jetzt() }; });
  await sichern();
  protokoll('Tresor angelegt');
}

export async function oeffnen(pass) {
  const t = state().tresor;
  if (!t) throw new Error('Es ist noch kein Tresor angelegt.');
  const k = await ableiten(pass, unb64(t.salt));
  if (!t.daten) { schluessel = k; offen = { zuordnung: [] }; return; }
  try {
    const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(t.iv) }, k, unb64(t.daten));
    offen = JSON.parse(dec.decode(klar)); schluessel = k;
    protokoll('Tresor geöffnet');
  } catch { throw new Error('Falsche Passphrase – der Tresor bleibt verschlossen.'); }
}

export async function sichern() {
  if (!schluessel) throw new Error('Tresor ist verschlossen.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, schluessel, enc.encode(JSON.stringify(offen)));
  aendern((d) => { d.tresor = { ...d.tresor, iv: b64(iv), daten: b64(chiffre), geaendert: jetzt() }; });
}

export function schliessen() { schluessel = null; offen = null; protokoll('Tresor verschlossen'); }

export async function eintragen(pseudonym, name, klasseId) {
  if (!istOffen()) throw new Error('Tresor ist verschlossen.');
  const vorh = offen.zuordnung.find((z) => z.pseudonym === pseudonym);
  if (vorh) Object.assign(vorh, { name, klasseId });
  else offen.zuordnung.push({ id: uid(), pseudonym, name, klasseId });
  await sichern();
}
export async function entfernen(pseudonym) {
  if (!istOffen()) return;
  offen.zuordnung = offen.zuordnung.filter((z) => z.pseudonym !== pseudonym);
  await sichern();
}

export function csvLesen(text) {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  if (!zeilen.length) return [];
  const tr = (zeilen[0].match(/;/g) || []).length >= (zeilen[0].match(/,/g) || []).length ? ';' : ',';
  const kopf = zeilen[0].toLowerCase();
  const hatKopf = /name|klasse|vorname|nachname/.test(kopf);
  const sp = hatKopf ? zeilen[0].split(tr).map((s) => s.trim().toLowerCase()) : [];
  const idx = (...n) => n.map((x) => sp.indexOf(x)).find((i) => i >= 0);
  const iName = hatKopf ? idx('name', 'schüler', 'schueler') : -1;
  const iVor = hatKopf ? idx('vorname') : -1, iNach = hatKopf ? idx('nachname', 'familienname') : -1;
  const iKl = hatKopf ? idx('klasse') : -1;
  return zeilen.slice(hatKopf ? 1 : 0).map((z) => {
    const t = z.split(tr).map((s) => s.trim().replace(/^"|"$/g, ''));
    let name = '';
    if (iVor >= 0 || iNach >= 0) name = [t[iVor] || '', t[iNach] || ''].join(' ').trim();
    else if (iName >= 0) name = t[iName] || '';
    else name = t[0] || '';
    return { name, klasse: iKl >= 0 ? t[iKl] || '' : (t[1] || '') };
  }).filter((e) => e.name);
}
