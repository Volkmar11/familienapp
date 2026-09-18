/* Datenschutz-Ampel: prueft Texte auf personenbezogene Daten, bevor sie an eine KI gehen. */

import { state, anzeigeName } from './state.js';

const MUSTER = [
  { re: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, stufe: 'rot', was: 'E-Mail-Adresse' },
  { re: /\b(?:\+49|0)[\d\s/-]{7,}\b/g, stufe: 'rot', was: 'Telefonnummer' },
  { re: /\b\d{1,2}\.\d{1,2}\.(?:19|20)\d{2}\b/g, stufe: 'gelb', was: 'Datum (evtl. Geburtsdatum)' },
  { re: /\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|weg|allee|platz)\s+\d+/g, stufe: 'rot', was: 'Anschrift' },
  { re: /\b(?:DE)?\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{0,2}\b/g, stufe: 'rot', was: 'IBAN-artige Nummer' },
  { re: /\b(Diagnose|Attest|ADHS|Legasthenie|Dyskalkulie|Therapie|Krankheit|Schwerbehinder\w*|Medikament\w*)\b/gi, stufe: 'rot', was: 'Gesundheitsdaten (Art. 9 DSGVO)' },
  { re: /\b(Jugendamt|Bewährung|Strafanzeige|Sorgerecht|Schulden|Asyl|Herkunftsland|Religion)\b/gi, stufe: 'rot', was: 'besonders schutzwürdige Angabe' },
  { re: /\b(Förderbedarf|Nachteilsausgleich|Sozialpädagog\w*)\b/gi, stufe: 'gelb', was: 'sensible Förderangabe' },
  { re: /\bNote\s*[1-6]\b|\bNotenschnitt\b|\bZeugnisnote\b/gi, stufe: 'gelb', was: 'Leistungsdaten' },
];

/* Namen aus dem Datenbestand (Anzeigenamen) finden */
function bekannteNamen() {
  const n = [];
  state().schueler.forEach((s) => { if (s.name?.trim()) n.push({ name: s.name.trim(), pseudonym: s.pseudonym }); });
  return n;
}

export function pruefen(text) {
  const t = String(text || '');
  const funde = [];
  MUSTER.forEach(({ re, stufe, was }) => {
    const m = t.match(new RegExp(re.source, re.flags));
    if (m?.length) funde.push({ stufe, was, beispiele: [...new Set(m)].slice(0, 3) });
  });
  const namen = bekannteNamen().filter((x) => new RegExp(`\\b${x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t));
  if (namen.length) funde.push({ stufe: 'rot', was: 'Klarname aus Ihrer Klassenliste', beispiele: namen.map((x) => x.name).slice(0, 3) });

  const stufe = funde.some((f) => f.stufe === 'rot') ? 'rot' : funde.length ? 'gelb' : 'gruen';
  return { stufe, funde, namen };
}

export function anonymisieren(text) {
  let t = String(text || '');
  bekannteNamen().forEach(({ name, pseudonym }) => {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, pseudonym);
    // auch nur Vorname bzw. Nachname ersetzen
    name.split(/\s+/).filter((teil) => teil.length > 2).forEach((teil) => {
      t = t.replace(new RegExp(`\\b${teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), pseudonym);
    });
  });
  t = t.replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[E-Mail entfernt]');
  t = t.replace(/\b(?:\+49|0)[\d\s/-]{7,}\b/g, '[Telefon entfernt]');
  t = t.replace(/\b[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|weg|allee|platz)\s+\d+/g, '[Anschrift entfernt]');
  return t;
}

export const AMPEL_TEXT = {
  gruen: { pt: '🟢', titel: 'Unbedenklich', text: 'Es wurden keine personenbezogenen Daten gefunden. Die Anfrage kann an ein KI-Modell gehen.' },
  gelb: { pt: '🟡', titel: 'Bitte prüfen', text: 'Es sind Angaben enthalten, die Rückschlüsse zulassen können. Prüfen Sie den Text, bevor Sie ihn weitergeben.' },
  rot: { pt: '🔴', titel: 'Stopp – anonymisieren', text: 'Der Text enthält personenbezogene Daten. Anonymisieren Sie ihn, bevor er ein Cloud-Modell erreicht.' },
};

export function ampelHtml(pruefung) {
  const a = AMPEL_TEXT[pruefung.stufe];
  const liste = pruefung.funde.map((f) => `<li>${f.was}${f.beispiele?.length ? ` <span class="muted">(${f.beispiele.map((b) => String(b).slice(0, 28)).join(', ')})</span>` : ''}</li>`).join('');
  return `<div class="ampel ${pruefung.stufe}">
    <div class="pt">${a.pt}</div>
    <div><b>${a.titel}</b><small>${a.text}</small></div>
  </div>
  ${liste ? `<ul class="tiny muted" style="margin:10px 0 0 18px;line-height:1.7">${liste}</ul>` : ''}`;
}
