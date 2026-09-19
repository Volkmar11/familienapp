/* Datenhaltung – alles im localStorage dieses Geräts, nichts verlässt das Gerät von allein. */

export const KEY = 'lehrerassistent2';
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export const heute = () => new Date().toISOString().slice(0, 10);
export const jetzt = () => new Date().toISOString();
export const plusTage = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const fmtDatum = (iso) => iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
export const fmtKurz = (iso) => iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
export const tageBis = (iso) => iso ? Math.round((new Date(iso.slice(0, 10) + 'T00:00:00') - new Date(heute() + 'T00:00:00')) / 86400000) : null;
export const wochentag = () => new Date().getDay();

export const NOTEN_FELDER = ['LF4', 'LF5', 'LF9'];
export const KI_ANBIETER = [
  { id: 'anthropic', label: 'Claude (Anthropic)', modelle: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5-20251001'], url: 'https://api.anthropic.com/v1/messages' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', modelle: ['gpt-5.1', 'gpt-5-mini', 'gpt-4.1'], url: 'https://api.openai.com/v1/chat/completions' },
  { id: 'kompatibel', label: 'Eigenes / Schulmodell (OpenAI-kompatibel)', modelle: [], url: '' },
];
export const TOENE = ['freundlich', 'sachlich', 'kollegial', 'kurz und direkt', 'formal', 'motivierend', 'sensibel / deeskalierend'];
export const MATERIALTYPEN = ['Arbeitsblatt', 'Infoblatt', 'Fallstudie', 'Rechenübung', 'Gruppenarbeit', 'Partnerarbeit', 'Lernsituation', 'Stationenlernen', 'digitale Aufgabe'];
export const NIVEAUS = ['Einstieg', 'Wiederholung', 'Prüfungsvorbereitung', 'Differenzierung schwächere Schüler', 'Differenzierung stärkere Schüler', 'Klausurniveau', 'IHK-orientiert'];
export const NOTIZ_TYPEN = ['Unterrichtsverlauf', 'Mitarbeit', 'Verhalten', 'Leistungsstand', 'Hausaufgaben', 'Fehlzeiten', 'Förderbedarf', 'Gesprächsnotiz', 'Kollegennotiz', 'Sonstiges'];
export const AB_OPTIONEN = [
  'Operatoren einbauen', 'Musterlösung erstellen', 'Erwartungshorizont erstellen', 'Bewertungspunkte vorschlagen',
  'QR-Code-Feld für digitale Abgabe', 'Quellenfeld einfügen', 'DSGVO-Hinweis einfügen', 'barrierearme Sprache verwenden',
  'Differenzierungsstufen automatisch erzeugen', 'Layout aus Gedächtnis übernehmen',
];

/* ---------- Startbestand (aus dem Prototyp übernommen, jederzeit änderbar) ---------- */

const LF_KATALOG = {
  LF4: { name: 'Beschaffung und Kaufvertrag', themen: ['Bedarfsermittlung', 'Bezugsquellenermittlung', 'Anfrage', 'Angebot', 'Angebotsvergleich', 'Bestellung', 'Kaufvertrag', 'Vertragsstörungen', 'Lieferungsverzug', 'Sachmangel', 'Rechte des Käufers', 'Gewährleistung und Garantie', 'Deckungskauf', 'Prüfungsvorbereitung'] },
  LF5: { name: 'Leistungserstellung', themen: ['Produktionsplanung', 'Kostenrechnung', 'Qualitätssicherung', 'Lagerhaltung', 'Prozessoptimierung'] },
  LF9: { name: 'Marketing', themen: ['Marktforschung', 'Marketing-Mix', 'Produktpolitik', 'Preispolitik', 'Kommunikationspolitik', 'Vertriebspolitik'] },
  LF12: { name: 'Controlling', themen: ['Kennzahlen', 'Budgetierung', 'Abweichungsanalyse', 'Wirtschaftlichkeitsrechnung'] },
};

function seedKlassen() {
  const roh = [
    ['1BM1', 'BM', 'A', ['LF4', 'LF5'], '1'], ['1BM2', 'BM', 'B', ['LF4'], '1'],
    ['2BM1', 'BM', 'A', ['LF9', 'LF5'], '2'], ['2BM2', 'BM', 'B', ['LF5'], '2'],
    ['3BM1', 'BM', 'A', ['LF9', 'LF12'], '3'], ['3ÖD3', 'ÖD', 'A', ['LF12'], '3'], ['3ÖD5', 'ÖD', 'B', ['LF12'], '3'],
  ];
  return roh.map(([code, typ, block, lfs, jahr]) => ({
    id: uid(), code, typ, block, jahr,
    lernfelder: lfs.map((c, i) => ({
      code: c, name: LF_KATALOG[c].name,
      themen: LF_KATALOG[c].themen.map((t, j) => ({ name: t, status: i === 0 && j < 6 ? 'erledigt' : i === 0 && j === 6 ? 'aktuell' : 'offen' })),
    })),
  }));
}

const SEED_SUS = [
  ['001', 'Leon Weber', ['2,0', '1,7', '2,3'], 'sehr gut', 'engagiert, übernimmt Verantwortung', '0 Tage',
    ['Starke Argumentation beim Angebotsvergleich', 'Hilft schwächeren Mitschülern'], [['Deutsch', 'sehr sicherer Ausdruck'], ['Klassenleitung', 'pünktlich, zuverlässig']],
    'Kann als Tutor in Fördergruppen eingesetzt werden.'],
  ['002', 'Elif Yilmaz', ['1,7', '2,0', '1,3'], 'sehr gut', 'wissbegierig, gründlich', '1 Tag',
    ['Exzellente Fallanalyse Kaufvertrag'], [['Englisch', 'sehr stark']], 'Differenzierung nach oben (Klausurniveau, IHK-orientiert).'],
  ['003', 'Amira Haddad', ['1,3', '1,7', '1,7'], 'hervorragend', 'sehr selbstständig', '0 Tage',
    ['Übernimmt Moderation in Gruppenarbeit'], [['Mathematik', 'Spitzengruppe']], 'Zusatzaufgaben auf IHK-Niveau, Peer-Tutoring.'],
  ['004', 'Mara König', ['2,3', '2,0', '2,7'], 'gut', 'zuverlässig, beteiligt sich regelmäßig', '2 Tage (entschuldigt)',
    ['Gute Beiträge zum Angebotsvergleich', 'Unsicher bei rechtlichen Fachbegriffen', 'Benötigt Wiederholung zu Lieferungsverzug'],
    [['Deutsch', 'Ausdruck klar, aber Fachsprache ausbaufähig'], ['Englisch', 'beteiligt sich mündlich regelmäßig'], ['Klassenleitung', 'zuverlässig, selten verspätet']],
    'Wiederholung rechtlicher Fachbegriffe (Lieferungsverzug, Gewährleistung) empfohlen.'],
  ['005', 'Lina Hoffmann', ['2,0', '2,3', '2,0'], 'gut', 'zuverlässig', '1 Tag', [], [], 'Festigung Bestellprozess.'],
  ['006', 'Noah Fischer', ['3,0', '3,3', '2,7'], 'befriedigend', 'zurückhaltend', '3 Tage', [], [], 'Mehr mündliche Beteiligung anregen.'],
  ['007', 'Tim Schuster', ['3,3', '3,0', '3,7'], 'wechselhaft', 'freundlich, leicht ablenkbar', '4 Tage',
    ['Braucht klare Struktur bei Aufgaben'], [['Klassenleitung', 'gelegentlich unkonzentriert']], 'Strukturierte Arbeitsblätter mit kleinen Teilaufgaben.'],
  ['008', 'Emilia Roth', ['2,3', '2,7', '2,3'], 'gut', 'freundlich', '2 Tage', [], [], 'Stabil – Prüfungsvorbereitung beginnen.'],
  ['009', 'Jonas Keller', ['4,0', '3,7', '4,3'], 'zurückhaltend', 'ruhig, unsicher', '6 Tage',
    ['Grundlagen Bedarfsermittlung lückenhaft', 'Förderbedarf Rechtsbegriffe'], [['Klassenleitung', 'häufige Fehlzeiten, Gespräch geplant']],
    'Fördergruppe Grundlagen; Basisaufgaben mit Lösungsschritten.'],
  ['010', 'David Braun', ['3,0', '2,7', '3,3'], 'befriedigend', 'ruhig', '3 Tage', [], [], 'Wiederholung Vertragsstörungen.'],
  ['011', 'Sofia Berger', ['2,7', '2,3', '3,0'], 'gut', 'freundlich, teamfähig', '0 Tage', [], [], 'Solide Mitte – Festigung Angebotsvergleich.'],
  ['012', 'Ben Schneider', ['3,7', '4,0', '3,3'], 'schwankend', 'unruhig', '5 Tage',
    ['Hausaufgaben unvollständig'], [], 'Klare Wochenstruktur, kurze Aufgabenpakete.'],
  ['013', 'Paul Wagner', ['4,3', '4,0', '5,0'], 'gering', 'passiv, leicht ablenkbar', '8 Tage',
    ['Erhebliche Lücken Marketing-Mix', 'Dringender Förderbedarf'], [['Klassenleitung', 'Elterngespräch dringend empfohlen']],
    'Intensive Förderung, Lernplan, Elternsprechtag.'],
  ['014', 'Hannah Meier', ['1,7', '2,0', '1,7'], 'sehr gut', 'engagiert', '0 Tage', ['Sehr saubere Mitschriften'], [], 'Differenzierung nach oben.'],
  ['015', 'Elias Neumann', ['2,7', '3,0', '2,7'], 'gut', 'kooperativ', '1 Tag', [], [], 'Festigung Gewährleistung/Garantie.'],
];

export const LOGO_STANDARD = 'icons/schullogo.png';

function leer() {
  return {
    version: 2,
    profil: {
      name: '', kuerzel: '', rolle: 'Lehrkraft', schule: 'Engelbert-Bohn-Schule Karlsruhe',
      theme: 'dunkel', schullogo: null, appIcon: null,
      emailTon: 'sachlich & freundlich',
      layout: 'Schulkopfzeile, klare Nummerierung, Quellenfeld, Platz für Lösungen',
      anonymisieren: true, eingerichtet: false,
      ki: { anbieter: 'anthropic', modell: 'claude-sonnet-4-5', key: '', basisUrl: '' },
    },
    klassen: [], schueler: [], gruppen: [], stunden: [], termine: [], aufgaben: [],
    notizen: [], materialien: [], mails: [], protokoll: [], tresor: null, gedaechtnis: [],
  };
}

/* Lernfeld-Vorlagen: beim Anlegen einer Klasse werden bekannte Kürzel vorbelegt. */
export function lernfeldVorlage(code) {
  const k = LF_KATALOG[String(code).toUpperCase()];
  return k ? { code: String(code).toUpperCase(), name: k.name, themen: k.themen.map((t) => ({ name: t, status: 'offen' })) }
           : { code: String(code).toUpperCase(), name: '', themen: [] };
}
export const LF_VORLAGEN = Object.keys(LF_KATALOG);

/* Beispielklasse – nur auf ausdrücklichen Wunsch, zum Ausprobieren der Funktionen. */
export function beispieleLaden() {
  const k1 = { id: uid(), code: 'BSP1', typ: 'BM', block: 'A', jahr: '1',
    lernfelder: [lernfeldVorlage('LF4'), lernfeldVorlage('LF5')] };
  k1.lernfelder[0].themen.forEach((t, i) => { t.status = i < 6 ? 'erledigt' : i === 6 ? 'aktuell' : 'offen'; });
  const muster = [
    ['001', 'Beispiel A', ['2,0', '1,7'], 'sehr gut', 'engagiert, arbeitet selbstständig', '0 Tage', ['Starke Argumentation beim Angebotsvergleich'], 'Differenzierung nach oben.'],
    ['002', 'Beispiel B', ['2,3', '2,0'], 'gut', 'zuverlässig', '2 Tage', ['Unsicher bei rechtlichen Fachbegriffen'], 'Rechtliche Fachbegriffe wiederholen.'],
    ['003', 'Beispiel C', ['3,3', '3,0'], 'wechselhaft', 'freundlich, leicht ablenkbar', '4 Tage', ['Braucht klare Struktur bei Aufgaben'], 'Kleine Aufgabenpakete mit Struktur.'],
    ['004', 'Beispiel D', ['4,3', '4,0'], 'gering', 'zurückhaltend', '8 Tage', ['Grundlagen lückenhaft'], 'Intensive Förderung, Lernplan.'],
  ];
  aendern((d) => {
    d.klassen.push(k1);
    muster.forEach(([nr, name, noten, mitarbeit, verhalten, fehlzeiten, notizen, foerder]) => {
      d.schueler.push({ id: uid(), klasseId: k1.id, pseudonym: `BSP1-${nr}`, name,
        noten: { LF4: noten[0], LF5: noten[1] }, mitarbeit, verhalten, fehlzeiten,
        notizen: notizen.map((t, i) => ({ id: uid(), datum: plusTage(-(i + 2)), text: t })), kollegen: [], foerder });
    });
    d.aufgaben.unshift({ id: uid(), titel: 'Individuelle Arbeitsblätter für BSP1 ausprobieren', prio: 'mittel',
      faellig: '', desc: 'Start → Individuell → Klasse BSP1 wählen.', erledigt: false, klasseId: k1.id, lf: 'LF4', thema: 'Lieferungsverzug' });
  });
}

let db = null;
const horcher = new Set();

export function laden() {
  let neu = false;
  try {
    const roh = localStorage.getItem(KEY);
    if (roh) db = { ...leer(), ...JSON.parse(roh) };
    else { db = leer(); neu = true; }
  } catch { db = leer(); neu = true; }
  if (neu) speichern();
  return db;
}
export const state = () => db || laden();
export function speichern() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); }
  horcher.forEach((f) => f(db));
}
export function aendern(fn) { fn(db); speichern(); return db; }
export function onChange(f) { horcher.add(f); return () => horcher.delete(f); }
export function zuruecksetzen({ eingerichtetBehalten = false } = {}) {
  const alt = db?.profil || {};
  db = leer();
  if (eingerichtetBehalten) db.profil = { ...db.profil, ...alt, eingerichtet: true };
  speichern();
}

/* ---------- Zugriffe ---------- */
export const klasse = (id) => state().klassen.find((k) => k.id === id) || null;
export const klasseCode = (code) => state().klassen.find((k) => k.code === code) || null;
export const schueler = (id) => state().schueler.find((s) => s.id === id) || null;
export const schuelerDer = (klasseId) => state().schueler.filter((s) => s.klasseId === klasseId);
export const gruppenDer = (klasseId) => state().gruppen.filter((g) => g.klasseId === klasseId);
export const anzeige = (s) => (state().profil.anonymisieren && s?.pseudonym ? s.pseudonym : (s?.name || s?.pseudonym || '–'));
export const klarname = (s) => s?.name || s?.pseudonym || '–';
export const kuerzel = (s) => {
  if (!s) return '–';
  if (state().profil.anonymisieren || !s.name) return (s.pseudonym || '').split('-').pop().slice(-3) || '–';
  return s.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
};

export function schnitt(s) {
  const w = Object.values(s?.noten || {}).map((n) => parseFloat(String(n).replace(',', '.'))).filter((n) => !isNaN(n));
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
}
export const note = (n) => (n === null || n === undefined ? '–' : n.toFixed(1).replace('.', ','));
export function notenFarbe(n) { return n === null ? 'dim' : n <= 2.0 ? 't-ok' : n <= 3.3 ? 't-warn' : 't-bad'; }

export function lernstand(s) {
  const d = schnitt(s);
  const fehl = parseInt(String(s.fehlzeiten || '0'), 10) || 0;
  const gruende = [];
  if (d !== null && d >= 3.7) gruende.push(`Notenschnitt ${note(d)}`);
  if (fehl >= 5) gruende.push(`${fehl} Fehltage`);
  if (/gering|schwankend|wechselhaft|zurückhaltend/i.test(s.mitarbeit || '')) gruende.push(`Mitarbeit: ${s.mitarbeit}`);
  const stufe = d === null ? 'offen' : d >= 4.0 ? 'dringend' : gruende.length ? 'erhoeht' : d <= 2.0 ? 'stark' : 'stabil';
  return { stufe, gruende, schnitt: d };
}

export function klassenSchnitt(klasseId) {
  const w = schuelerDer(klasseId).map(schnitt).filter((n) => n !== null);
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
}

export function lernfelderDer(klasseId) { return klasse(klasseId)?.lernfelder || []; }
export function themenDer(klasseId, lfCode) { return lernfelderDer(klasseId).find((l) => l.code === lfCode)?.themen || []; }

export function stundenHeute() {
  const t = wochentag();
  return state().stunden.filter((s) => s.tag === t).sort((a, b) => a.zeit.localeCompare(b.zeit));
}
export function termineHeute() {
  return state().termine.filter((t) => t.datum === heute()).sort((a, b) => (a.zeit || '').localeCompare(b.zeit || ''));
}
export function offeneAufgaben() {
  const rang = { hoch: 0, mittel: 1, niedrig: 2 };
  return state().aufgaben.filter((a) => !a.erledigt)
    .sort((a, b) => (rang[a.prio] - rang[b.prio]) || (a.faellig || 'z').localeCompare(b.faellig || 'z'));
}

export function protokoll(aktion, detail = '') {
  aendern((d) => { d.protokoll.unshift({ id: uid(), zeit: jetzt(), aktion, detail }); d.protokoll = d.protokoll.slice(0, 150); });
}

export function merken(kat, info, punkte = []) {
  aendern((d) => {
    const e = d.gedaechtnis.find((x) => x.kat === kat);
    if (e) { e.info = info; e.verwendet = jetzt(); if (punkte.length) e.punkte = punkte; }
    else d.gedaechtnis.push({ id: uid(), kat, symbol: 'brain', grad: 'g-slate', aktiv: true, info, quelle: 'Aus Ihrer Nutzung abgeleitet.', verwendet: jetzt(), nutzen: 'Wird für Vorschläge verwendet.', punkte });
  });
}

/* Benachrichtigungen entstehen aus dem echten Bestand */
export function hinweise() {
  const d = state();
  const l = [];
  d.aufgaben.filter((a) => !a.erledigt && a.faellig).forEach((a) => {
    const t = tageBis(a.faellig);
    if (t !== null && t <= 1) l.push({ id: 'a' + a.id, symbol: 'clipboard', grad: 'g-amber', titel: a.titel,
      desc: t < 0 ? `überfällig seit ${Math.abs(t)} Tag(en)` : t === 0 ? 'heute fällig' : 'morgen fällig', route: `aufgabe/${a.id}` });
  });
  termineHeute().forEach((t) => l.push({ id: 't' + t.id, symbol: 'calendar', grad: 'g-sky', titel: t.titel, desc: `heute${t.zeit ? ', ' + t.zeit + ' Uhr' : ''} · ${t.ort || ''}`, route: `termin/${t.id}` }));
  d.schueler.filter((s) => lernstand(s).stufe === 'dringend').forEach((s) => l.push({ id: 's' + s.id, symbol: 'chart', grad: 'g-rose',
    titel: `${anzeige(s)}: dringender Förderbedarf`, desc: lernstand(s).gruende.join(' · '), route: `schueler/${s.id}` }));
  if (!d.tresor && d.schueler.some((s) => s.name)) l.push({ id: 'tresor', symbol: 'key', grad: 'g-rose', titel: 'Klarnamen ohne Tresor', desc: 'Klassenliste verschlüsselt ablegen', route: 'w/tresor' });
  if (!d.profil.ki.key) l.push({ id: 'ki', symbol: 'sparkles', grad: 'g-violet', titel: 'Kein KI-Zugang hinterlegt', desc: 'Prompt-Modus aktiv – API-Schlüssel im Profil ergänzen', route: 'w/ki' });
  return l;
}
