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

function leer() {
  const klassen = seedKlassen();
  const k1 = klassen[0];
  const schueler = SEED_SUS.map(([nr, name, noten, mitarbeit, verhalten, fehlzeiten, notizen, kollegen, foerder]) => ({
    id: uid(), klasseId: k1.id, pseudonym: `1BM1-${nr}`, name,
    noten: { LF4: noten[0], LF5: noten[1], LF9: noten[2] },
    mitarbeit, verhalten, fehlzeiten,
    notizen: notizen.map((t, i) => ({ id: uid(), datum: plusTage(-(i + 3)), text: t })),
    kollegen: kollegen.map(([fach, text]) => ({ id: uid(), fach, text })),
    foerder,
  }));
  const finde = (n) => schueler.find((s) => s.name === n)?.id;
  const gruppen = [
    { id: uid(), klasseId: k1.id, name: 'Fördergruppe Grundlagen', niveau: 'Einstieg', ziel: 'Basiskompetenzen Kaufvertrag festigen', schuelerIds: ['Jonas Keller', 'Paul Wagner', 'Ben Schneider'].map(finde), material: ['Basisaufgaben mit Lösungsschritten'] },
    { id: uid(), klasseId: k1.id, name: 'Starke Schüler', niveau: 'Klausurniveau', ziel: 'Vertiefung & IHK-Vorbereitung', schuelerIds: ['Amira Haddad', 'Elif Yilmaz', 'Hannah Meier', 'Leon Weber'].map(finde), material: ['Zusatzfälle IHK-Niveau'] },
    { id: uid(), klasseId: k1.id, name: 'Prüfungsvorbereitung', niveau: 'Prüfungsvorbereitung', ziel: 'Altklausuren wiederholen', schuelerIds: ['Emilia Roth', 'Lina Hoffmann'].map(finde), material: ['Altklausuren-Set'] },
    { id: uid(), klasseId: k1.id, name: 'Wiederholung Kaufvertrag', niveau: 'Wiederholung', ziel: 'Rechtsbegriffe sichern', schuelerIds: ['Mara König', 'Tim Schuster', 'David Braun'].map(finde), material: ['Begriffskarten Recht'] },
  ];
  const tag = Math.min(Math.max(wochentag(), 1), 5);
  return {
    version: 2,
    profil: {
      name: 'Marcus', kuerzel: 'Vr', rolle: 'Lehrkraft BWL / Recht', schule: 'Engelbert-Bohn-Schule Karlsruhe',
      theme: 'dunkel', schullogo: null, appIcon: null,
      emailTon: 'sachlich & freundlich',
      layout: 'Schulkopfzeile, klare Nummerierung, Quellenfeld, Platz für Lösungen',
      anonymisieren: true,
      ki: { anbieter: 'anthropic', modell: 'claude-sonnet-4-5', key: '', basisUrl: '' },
      splashGesehen: false,
    },
    klassen, schueler, gruppen,
    stunden: [
      { id: uid(), tag, zeit: '07:45 – 09:15', klasseId: k1.id, lf: 'LF4', thema: 'Beschaffung und Kaufvertrag', ort: 'Raum 204',
        beschreibung: 'Einstieg in den Angebotsvergleich anhand eines Praxisfalls. Erarbeitung der Vergleichskriterien.',
        todos: ['Fallbeispiel austeilen', 'Tabelle Angebotsvergleich vorbereiten'], material: ['AB Angebotsvergleich', 'Fallstudie Bürobedarf GmbH'], erinnerung: 'Beamer-Kabel mitnehmen' },
      { id: uid(), tag, zeit: '09:35 – 11:05', klasseId: klassen[2].id, lf: 'LF9', thema: 'Marketing-Mix', ort: 'Raum 112',
        beschreibung: 'Vertiefung der vier P. Gruppenarbeit zur Produktpolitik.',
        todos: ['Gruppen einteilen', 'Plakate bereitlegen'], material: ['AB 4P'], erinnerung: 'Moderationskoffer holen' },
      { id: uid(), tag: tag === 5 ? 4 : tag + 1, zeit: '11:20 – 12:50', klasseId: klassen[4].id, lf: 'LF9', thema: 'Investitionsrechnung', ort: 'Raum 308',
        beschreibung: 'Kostenvergleichs- und Amortisationsrechnung am Praxisfall.', todos: ['Übungsblatt austeilen'], material: [], erinnerung: 'Formelsammlung bereitlegen' },
    ],
    termine: [
      { id: uid(), datum: heute(), zeit: '11:20', titel: 'Notenlisten unterschreiben', ort: 'Lehrerzimmer', klasseId: '',
        beschreibung: 'Notenlisten prüfen und digital bestätigen.', todos: ['Notenlisten 1BM1 prüfen'], erinnerung: 'Frist heute 14:00 Uhr' },
      { id: uid(), datum: heute(), zeit: '13:00', titel: 'Team-Besprechung Berufsschule', ort: 'Raum 301', klasseId: '',
        beschreibung: 'Abstimmung zum Einsatz von KI-Werkzeugen und Datenschutzfragen im Kollegium.',
        todos: ['Erfahrungsbericht vorbereiten', 'DSGVO-Checkliste mitbringen'], erinnerung: 'Notebook mitnehmen' },
      { id: uid(), datum: plusTage(4), zeit: '10:00', titel: 'Notenkonferenz', ort: 'Lehrerzimmer', klasseId: '', beschreibung: '', todos: [], erinnerung: '' },
    ],
    aufgaben: [
      { id: uid(), titel: 'Notenlisten im Schulportal unterschreiben', prio: 'hoch', faellig: heute(), desc: 'Notenlisten der Klasse 1BM1 prüfen und digital bestätigen.', erledigt: false },
      { id: uid(), titel: 'Arbeitsblatt LF4 für 1BM1 vorbereiten', prio: 'mittel', faellig: plusTage(1), desc: 'Thema Lieferungsverzug, differenziert nach Niveau.', erledigt: false, klasseId: k1.id, lf: 'LF4', thema: 'Lieferungsverzug' },
      { id: uid(), titel: 'Rückmeldung an „Fördergruppe Grundlagen"', prio: 'mittel', faellig: plusTage(2), desc: 'Kurzes Feedback zu den Übungsaufgaben geben.', erledigt: false },
      { id: uid(), titel: 'Datenschutz-Hinweis für KI-Nutzung prüfen', prio: 'hoch', faellig: plusTage(3), desc: 'Prüfen, ob personenbezogene Daten enthalten sind.', erledigt: false },
      { id: uid(), titel: 'Klassenliste 1BM1 im Tresor sichern', prio: 'niedrig', faellig: '', desc: 'Klarnamen verschlüsselt ablegen und Pseudonyme vergeben.', erledigt: false },
    ],
    notizen: [
      { id: uid(), klasseId: k1.id, schuelerId: '', lf: 'LF4', typ: 'Unterrichtsverlauf', sicht: 'nur ich', datum: heute(),
        text: 'Die Gruppe verwechselt Lieferungsverzug und Schlechtleistung – nächste Stunde mit Fallbeispiel einsteigen.' },
    ],
    materialien: [], mails: [], protokoll: [], tresor: null,
    gedaechtnis: [
      { id: uid(), kat: 'Arbeitsblatt-Präferenz', symbol: 'fileEdit', grad: 'g-violet', aktiv: true,
        info: 'Arbeitsblätter mit klarer Struktur, Schulkopfzeile, Musterlösung und Erwartungshorizont.',
        quelle: 'Aus bisherigen Materialerstellungen abgeleitet.', verwendet: jetzt(),
        nutzen: 'Neue Arbeitsblätter werden automatisch passend vorbereitet.',
        punkte: ['Format: Word-Datei', 'Layout: Schulkopfzeile', 'Stil: klar, berufsschulnah', 'Aufgaben: praxisnahe Fälle mit Operatoren', 'Quellenfeld aktiv', 'Differenzierung häufig gewünscht'] },
      { id: uid(), kat: 'E-Mail-Präferenz', symbol: 'mail', grad: 'g-amber', aktiv: true,
        info: 'Dienstliche E-Mails sachlich und freundlich, eher kurz bis mittel.',
        quelle: 'Aus bisherigen Entwürfen abgeleitet.', verwendet: jetzt(),
        nutzen: 'Tonfall und Länge neuer E-Mails werden vorgeschlagen.',
        punkte: ['Standardton: sachlich und freundlich', 'Länge: kurz bis mittel', 'Signatur: Schulmail', 'Sensible Themen deeskalierend'] },
      { id: uid(), kat: 'Unterrichtspräferenz', symbol: 'cap', grad: 'g-sky', aktiv: true,
        info: 'Häufig unterrichtete Klassen und Lernfelder werden für die schnellere Auswahl gemerkt.',
        quelle: 'Aus Nutzungsverlauf abgeleitet.', verwendet: jetzt(),
        nutzen: 'Beschleunigt Klassen- und Themenauswahl in den Assistenten.',
        punkte: ['Häufige Klassen: 1BM1, 1BM2, 2BM1', 'Häufige Lernfelder: LF4, LF5, LF9', 'Häufige Themen: Kaufvertrag, Lieferungsverzug, Marketing-Mix'] },
      { id: uid(), kat: 'Datenschutz-Präferenz', symbol: 'shield', grad: 'g-emerald', aktiv: true,
        info: 'Personenbezogene Daten werden vor KI-Verarbeitung standardmäßig pseudonymisiert.',
        quelle: 'Aus den Datenschutzeinstellungen abgeleitet.', verwendet: jetzt(),
        nutzen: 'Schützt Schülerdaten und warnt vor Cloud-Verarbeitung.',
        punkte: ['Standardmäßig anonymisieren', 'Namen vor KI-Nutzung prüfen', 'Cloud nur nach Warnhinweis', 'Tresor für sensible Daten'] },
    ],
  };
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
export function zuruecksetzen(mitBeispielen = true) {
  db = mitBeispielen ? leer() : { ...leer(), klassen: [], schueler: [], gruppen: [], stunden: [], termine: [], aufgaben: [], notizen: [], materialien: [] };
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
