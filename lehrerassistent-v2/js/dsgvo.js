/* Datenschutz-Ampel: prüft Texte auf Personenbezug, bevor sie ein Modell erreichen. */
import { state } from './store.js';

const MUSTER = [
  [/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, 'rot', 'E-Mail-Adresse'],
  [/\b(?:\+49|0)[\d\s/-]{8,}\b/g, 'rot', 'Telefonnummer'],
  [/\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|weg|allee|platz)\s+\d+/g, 'rot', 'Anschrift'],
  [/\b(Diagnose|Attest|ADHS|Legasthenie|Dyskalkulie|Therapie|Medikament\w*|Schwerbehinder\w*)\b/gi, 'rot', 'Gesundheitsdaten (Art. 9 DSGVO)'],
  [/\b(Jugendamt|Sorgerecht|Bewährung|Strafanzeige|Asyl|Religion|Herkunftsland)\b/gi, 'rot', 'besonders schutzwürdige Angabe'],
  [/\b\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}\b/g, 'gelb', 'Datum (eventuell Geburtsdatum)'],
  [/\b(Förderbedarf|Nachteilsausgleich|Elterngespräch)\b/gi, 'gelb', 'sensible Förderangabe'],
  [/\bNote\s*[1-6]\b|\bNotenschnitt\b|\bZeugnisnote\b/gi, 'gelb', 'Leistungsdaten'],
];

const namen = () => state().schueler.filter((s) => s.name?.trim()).map((s) => ({ name: s.name.trim(), pseudonym: s.pseudonym }));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function pruefen(text) {
  const t = String(text || '');
  const funde = [];
  MUSTER.forEach(([re, stufe, was]) => {
    const m = t.match(new RegExp(re.source, re.flags));
    if (m?.length) funde.push({ stufe, was, beispiele: [...new Set(m)].slice(0, 3) });
  });
  const treffer = namen().filter((n) => new RegExp(`\\b${reEsc(n.name)}\\b`, 'i').test(t));
  if (treffer.length) funde.unshift({ stufe: 'rot', was: 'Klarname aus Ihrer Klassenliste', beispiele: treffer.map((x) => x.name).slice(0, 3) });
  return { stufe: funde.some((f) => f.stufe === 'rot') ? 'rot' : funde.length ? 'gelb' : 'gruen', funde, namen: treffer };
}

export function anonymisieren(text) {
  let t = String(text || '');
  namen().forEach(({ name, pseudonym }) => {
    t = t.replace(new RegExp(reEsc(name), 'gi'), pseudonym);
    name.split(/\s+/).filter((x) => x.length > 2).forEach((teil) => {
      t = t.replace(new RegExp(`\\b${reEsc(teil)}\\b`, 'gi'), pseudonym);
    });
  });
  return t
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[E-Mail entfernt]')
    .replace(/\b(?:\+49|0)[\d\s/-]{8,}\b/g, '[Telefon entfernt]')
    .replace(/\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|weg|allee|platz)\s+\d+/g, '[Anschrift entfernt]');
}

export const AMPEL = {
  gruen: ['ok', 'Grün: unbedenklich', 'Es wurden keine personenbezogenen Daten gefunden.'],
  gelb: ['warn', 'Gelb: bitte prüfen', 'Der Text enthält Angaben, die Rückschlüsse zulassen können.'],
  rot: ['bad', 'Rot: Personenbezug erkannt', 'Vor einer Cloud-Verarbeitung anonymisieren oder ein lokales Modell verwenden.'],
};
