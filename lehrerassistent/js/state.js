/* LehrerAssistent – Zustand, Speicherung, Kataloge
   Alle Daten bleiben im localStorage des Geraets. Kein Server, keine Cloud. */

export const KEY = 'lehrerassistent:v1';
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const heute = () => new Date().toISOString().slice(0, 10);
export const jetzt = () => new Date().toISOString();

export const fmtDatum = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};
export const fmtKurz = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};
export const fmtZeit = (iso) => {
  if (!iso || iso.length <= 10) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};
export const tageBis = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const t = new Date(heute() + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};

/* ---------- Kataloge ---------- */

// Rahmenlehrplan Kaufleute fuer Bueromanagement (KMK)
export const LF_BM = [
  [1, 'Die eigene Rolle im Betrieb mitgestalten und den Betrieb präsentieren'],
  [2, 'Büroprozesse gestalten und Arbeitsvorgänge organisieren'],
  [3, 'Kundenaufträge bearbeiten'],
  [4, 'Sachgüter und Dienstleistungen beschaffen und Verträge schließen'],
  [5, 'Kunden akquirieren und binden'],
  [6, 'Wertströme erfassen und analysieren'],
  [7, 'Gesprächssituationen gestalten'],
  [8, 'Personalwirtschaftliche Aufgaben wahrnehmen'],
  [9, 'Liquidität sichern und Finanzierung vorbereiten'],
  [10, 'Wertschöpfungsprozesse erfolgsorientiert steuern'],
  [11, 'Geschäftsprozesse darstellen und optimieren'],
  [12, 'Veranstaltungen und Geschäftsreisen organisieren'],
  [13, 'Ein Projekt planen und durchführen'],
];

// Rahmenlehrplan Fachangestellte fuer Arbeitsmarktdienstleistungen (KMK, 22.03.2012)
export const LF_AMD = [
  [1, 'Die Ausbildung verantwortlich mitgestalten'],
  [2, 'Das Gesamtsystem der sozialen Sicherung erfassen'],
  [3, 'Kunden zu Leistungen des Betriebes beraten'],
  [4, 'Den Betrieb präsentieren'],
  [5, 'Leistungsansprüche unter Beachtung privatrechtlicher Tatbestände prüfen'],
  [6, 'Personalwirtschaftliche Prozesse mitgestalten'],
  [7, 'Kunden soziale Leistungen erläutern'],
  [8, 'Bei der Haushaltsführung mitwirken'],
  [9, 'Die Stellung des Betriebes im System der sozialen Marktwirtschaft beurteilen'],
  [10, 'Beim Erlassen von Bescheiden mitwirken'],
  [11, 'Wirtschaftspolitische Einflüsse auf den Arbeitsmarkt beurteilen'],
  [12, 'Wirtschaftlichkeitsprüfungen durchführen'],
  [13, 'Kunden zu sozialen Hilfen beraten'],
  [14, 'Ein berufsbezogenes Projekt planen, durchführen und auswerten'],
];

export const BILDUNGSGAENGE = {
  BM: { label: 'Büromanagement (KBM)', lf: LF_BM, quelle: 'KMK-Rahmenlehrplan Kaufleute für Büromanagement' },
  AMD: { label: 'Arbeitsmarktdienstleistungen (FAMD)', lf: LF_AMD, quelle: 'KMK-Rahmenlehrplan FAMD vom 22.03.2012' },
  SONST: { label: 'Anderer Bildungsgang', lf: [], quelle: 'frei definierbar' },
};

export const MODELLE = [
  { id: 'claude-opus', label: 'Claude Opus (stark)', api: 'claude-opus-4-5' },
  { id: 'claude-sonnet', label: 'Claude Sonnet (schnell)', api: 'claude-sonnet-4-5' },
  { id: 'chatgpt', label: 'ChatGPT', api: null },
  { id: 'lokal', label: 'Lokales Schulmodell', api: null },
];

export const MATERIALTYPEN = [
  'Arbeitsblatt', 'Handlungsorientierte Lernsituation', 'Klassenarbeit mit Erwartungshorizont',
  'Übungsaufgaben', 'Fallstudie', 'Musterlösung', 'Präsentation / Tafelbild', 'Quiz / Wiederholung',
];
export const NIVEAUS = ['Grundlagen (AFB I)', 'Anwendung (AFB II)', 'Transfer (AFB III)', 'Differenziert (3 Niveaustufen)'];
export const TOENE = ['sachlich', 'freundlich-verbindlich', 'formell', 'wertschätzend', 'deutlich-klar'];
export const PRIOS = { 1: 'hoch', 2: 'mittel', 3: 'niedrig' };
export const NOTIZ_KATEGORIEN = ['Unterricht', 'Schüler', 'Konferenz', 'Organisation', 'Kollegium', 'Idee'];

/* ---------- Standardzustand ---------- */

const leer = () => ({
  version: 1,
  profil: {
    name: '', kuerzel: '', schule: '', rolle: 'Lehrkraft',
    theme: 'dunkel', emailTon: 'freundlich-verbindlich', modell: 'claude-opus',
    layout: 'Schulkopfzeile, Fußzeile mit Klasse/Datum, 1 Spalte',
    anonymisieren: true, warnAbStufe: 'gelb', apiKey: '',
    untisUrl: '', ersteNutzung: jetzt(),
  },
  klassen: [], schueler: [], noten: [], beobachtungen: [], aufgaben: [], termine: [],
  notizen: [], materialien: [], mails: [], stundenplan: [], vorlagen: [],
  gedaechtnis: { klassen: {}, lernfelder: {}, materialtypen: {}, ton: {}, layout: {}, notizen: 0 },
  tresor: null,
  protokoll: [],
});

let db = leer();
const abonnenten = new Set();

export function laden() {
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) db = Object.assign(leer(), JSON.parse(roh));
    if (!db.profil) db.profil = leer().profil;
  } catch (e) {
    console.warn('Daten konnten nicht gelesen werden:', e);
  }
  return db;
}
export function state() { return db; }
export function speichern() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.warn('Speichern fehlgeschlagen:', e); }
  abonnenten.forEach((f) => f(db));
}
export function onChange(f) { abonnenten.add(f); return () => abonnenten.delete(f); }

/* aendern(fn) – veraendert den Zustand und speichert */
export function aendern(fn) { fn(db); speichern(); return db; }

export function alleZuruecksetzen() {
  db = leer();
  localStorage.removeItem(KEY);
  speichern();
}

/* ---------- Hilfen ---------- */

export function klasse(id) { return db.klassen.find((k) => k.id === id) || null; }
export function schuelerDerKlasse(id) { return db.schueler.filter((s) => s.klasseId === id); }
export function anzeigeName(s) { return s ? (s.name?.trim() || s.pseudonym) : '–'; }

export function lernfelderFuer(k) {
  if (!k) return [];
  if (k.lernfelder?.length) return k.lernfelder;
  return (BILDUNGSGAENGE[k.bildungsgang]?.lf || []).map(([nr, titel]) => ({ nr, titel }));
}

export function naechstesPseudonym(klasseId) {
  const k = klasse(klasseId);
  const praefix = (k?.name || 'KL').replace(/\s+/g, '').toUpperCase();
  const n = schuelerDerKlasse(klasseId).length + 1;
  return `${praefix}-${String(n).padStart(3, '0')}`;
}

/* Gedaechtnis: merkt sich Arbeitsvorlieben, niemals Schuelerdaten */
export function merken(bereich, wert) {
  if (!wert) return;
  aendern((d) => {
    d.gedaechtnis[bereich] = d.gedaechtnis[bereich] || {};
    d.gedaechtnis[bereich][wert] = (d.gedaechtnis[bereich][wert] || 0) + 1;
  });
}
export function topWert(bereich) {
  const m = db.gedaechtnis?.[bereich] || {};
  const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  return e ? e[0] : null;
}

export function protokollieren(aktion, detail = '') {
  aendern((d) => {
    d.protokoll.unshift({ id: uid(), zeit: jetzt(), aktion, detail });
    d.protokoll = d.protokoll.slice(0, 200);
  });
}

/* Notenschnitt (deutsche Noten 1–6, gewichtet) */
export function schnitt(noten) {
  const g = noten.filter((n) => Number(n.wert) > 0);
  if (!g.length) return null;
  const summe = g.reduce((a, n) => a + Number(n.wert) * (Number(n.gewicht) || 1), 0);
  const gew = g.reduce((a, n) => a + (Number(n.gewicht) || 1), 0);
  return Math.round((summe / gew) * 100) / 100;
}

export function notenVon(schuelerId, lernfeld = null) {
  return db.noten.filter((n) => n.schuelerId === schuelerId && (!lernfeld || n.lernfeld === lernfeld));
}

/* Foerderbedarf-Heuristik: Schnitt schlechter 4,0 ODER zwei Noten 5/6 ODER negative Beobachtungen */
export function foerderbedarf(schuelerId) {
  const n = notenVon(schuelerId);
  const s = schnitt(n);
  const schlecht = n.filter((x) => Number(x.wert) >= 5).length;
  const negativ = db.beobachtungen.filter((b) => b.schuelerId === schuelerId && b.bewertung === 'negativ').length;
  const gruende = [];
  if (s !== null && s > 4.0) gruende.push(`Notenschnitt ${s.toFixed(2).replace('.', ',')}`);
  if (schlecht >= 2) gruende.push(`${schlecht} Noten im Bereich 5–6`);
  if (negativ >= 2) gruende.push(`${negativ} kritische Beobachtungen`);
  return { bedarf: gruende.length > 0, gruende, schnitt: s };
}
