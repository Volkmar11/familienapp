/* Sprachsteuerung: Diktat + Auswertung gesprochener Saetze.
   Die Erkennung nutzt die Spracheingabe des Geraets (Web Speech API).
   Auf iPhone/iPad funktioniert zusaetzlich das Mikrofon der Systemtastatur im Textfeld. */

import { state, heute, anzeige } from './store.js';

export function erkennungVerfuegbar() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function starten({ onText, onEnde, onFehler }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onFehler?.('Die Spracherkennung wird von diesem Browser nicht unterstützt.'); return null; }
  const r = new SR();
  r.lang = 'de-DE';
  r.continuous = true;
  r.interimResults = true;
  let fertig = '';
  r.onresult = (e) => {
    let vorlaeufig = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) fertig += t + ' '; else vorlaeufig += t;
    }
    onText?.((fertig + vorlaeufig).trim(), fertig.trim());
  };
  r.onerror = (e) => onFehler?.(e.error === 'not-allowed'
    ? 'Zugriff auf das Mikrofon wurde abgelehnt. Bitte in den Einstellungen erlauben.'
    : `Spracherkennung: ${e.error}`);
  r.onend = () => onEnde?.(fertig.trim());
  try { r.start(); } catch { /* laeuft bereits */ }
  return r;
}

/* ---------- Auswertung ---------- */

const WOCHENTAGE = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

export function datumAus(text) {
  const t = text.toLowerCase();
  const d = new Date();
  let treffer = null;

  if (/\bheute\b/.test(t)) treffer = new Date();
  else if (/\bmorgen\b/.test(t) && !/übermorgen/.test(t)) { treffer = new Date(); treffer.setDate(d.getDate() + 1); }
  else if (/übermorgen/.test(t)) { treffer = new Date(); treffer.setDate(d.getDate() + 2); }
  else {
    const wt = WOCHENTAGE.findIndex((w) => new RegExp(`\\b(am |nächsten |naechsten |kommenden )?${w}\\b`).test(t));
    if (wt >= 0) {
      treffer = new Date();
      let diff = (wt - d.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      treffer.setDate(d.getDate() + diff);
    }
  }
  const dm = t.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(\d{2,4})?/);
  if (dm) {
    const jahr = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : d.getFullYear();
    treffer = new Date(jahr, Number(dm[2]) - 1, Number(dm[1]));
  }
  if (!treffer) return null;

  // Uhrzeit: Doppelpunkt gilt immer, ein Punkt nur zusammen mit "Uhr" (sonst waere es ein Datum)
  let zeit = t.match(/\b(\d{1,2}):(\d{2})\s*(?:uhr)?/) || t.match(/\b(\d{1,2})\.(\d{2})\s*uhr\b/);
  if (!zeit) {
    const m = t.match(/\bum\s+(\d{1,2})\s*(?:uhr)?\b/);
    if (m) zeit = [m[0], m[1], '0'];
  }
  let std = null, min = 0;
  if (zeit) {
    std = Number(zeit[1]);
    min = Number(zeit[2] || 0);
    if (std < 7 && /nachmittag|abend/.test(t)) std += 12;
    if (std > 23) std = null;
  }
  const iso = `${treffer.getFullYear()}-${String(treffer.getMonth() + 1).padStart(2, '0')}-${String(treffer.getDate()).padStart(2, '0')}`;
  return std === null ? { datum: iso, zeit: null } : { datum: iso, zeit: `${String(std).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
}

export function findeKlasse(text) {
  const t = text.toLowerCase().replace(/\s+/g, '');
  const treffer = state().klassen.find((k) => t.includes(k.code.toLowerCase().replace(/\s+/g, '')));
  if (treffer) return { id: treffer.id, name: treffer.code };
  const m = text.match(/\b(\d?[A-ZÄÖÜ]{2,3}\s?\d{1,2})\b/);
  return m ? { id: null, name: m[1].replace(/\s+/g, '') } : null;
}

export function findeLernfeld(text) {
  const m = text.match(/\bl\.?\s?f\.?\s?(\d{1,2})\b/i) || text.match(/lernfeld\s+(\d{1,2})/i);
  return m ? `LF${m[1]}` : null;
}

export function findeSchueler(text) {
  const t = text.toLowerCase();
  return state().schueler.find((s) => {
    const n = (s.name || s.pseudonym || '').toLowerCase();
    if (n.length < 3) return false;
    if (t.includes(n)) return true;
    const teile = n.split(/\s+/).filter((x) => x.length > 3);
    return teile.some((x) => new RegExp(`\\b${x}\\b`).test(t));
  }) || null;
}

function thema(text) {
  const m = text.match(/(?:zum thema|über das thema|zum|über|zur|zu)\s+(.+?)(?:\s+für\s|\s+in\s+der\s|\s+in\s+lf|\s+klasse\s|$)/i);
  if (m) return m[1].replace(/[.,;]$/, '').trim();
  const m2 = text.match(/(?:arbeitsblatt|klassenarbeit|lernsituation|test|übungsblatt|material)\s+(?:zum|zur|zu|über)?\s*(.+?)(?:\s+für\s|\s+in\s+der\s|\s+in\s+lf|$)/i);
  return m2 ? m2[1].replace(/[.,;]$/, '').trim() : '';
}

/* Ein gesprochener Satz kann mehrere Auftraege enthalten. */
export function analysieren(text) {
  const roh = String(text || '').trim();
  if (!roh) return [];
  // Punkte in Datumsangaben schuetzen, damit "12.11." den Satz nicht zerteilt
  const geschuetzt = roh.replace(/(\d)\./g, '$1\u241F');
  const teile = geschuetzt.split(/(?:\s+und\s+außerdem\s+|\s+und\s+dann\s+|\s+und\s+|[.;]\s+)/i)
    .map((s) => s.replace(/\u241F/g, '.').trim()).filter((s) => s.length > 3);
  const stuecke = teile.length ? teile : [roh];
  const ergebnis = [];

  stuecke.forEach((s) => {
    const t = s.toLowerCase();
    const dat = datumAus(s);
    const kl = findeKlasse(s);
    const lf = findeLernfeld(s);
    const sch = findeSchueler(s);

    if (/(termin|konferenz|besprechung|sitzung|elternsprechtag|elternabend|prüfung|klausur am|trage.*ein|kalender)/.test(t) && dat) {
      const titel = titelBereinigen(s);
      ergebnis.push({ typ: 'termin', label: 'Termin eingetragen', icon: '📅', grad: 'grad-sky',
        daten: { titel: kurz(titel) || 'Termin', datum: dat.datum, zeit: dat.zeit, ort: '' },
        text: `${kurz(titel)} · ${dat.datum}${dat.zeit ? ', ' + dat.zeit + ' Uhr' : ''}` });
      return;
    }
    const erinnerung = /(erinnere mich|denk dran|denke daran|nicht vergessen|vergiss nicht|ich muss|muss noch|to-?do|auf die liste)/.test(t);
    if (erinnerung) {
      const prio = /(dringend|wichtig|sofort|bis morgen)/.test(t) ? 1 : /(irgendwann|gelegentlich)/.test(t) ? 3 : 2;
      ergebnis.push({ typ: 'aufgabe', label: 'Aufgabe angelegt', icon: '✅', grad: 'grad-amber',
        daten: { titel: titelBereinigen(s, true), prio, faellig: dat?.datum || '', klasseId: kl?.id || null },
        text: `${titelBereinigen(s, true)}${dat ? ' · bis ' + dat.datum : ''}` });
      return;
    }
    if (/(arbeitsblatt|klassenarbeit|lernsituation|übungsblatt|uebungsblatt|material|aufgabenblatt|test für|quiz)/.test(t)) {
      const th = thema(s) || 'Thema aus Diktat';
      ergebnis.push({ typ: 'material', label: 'Materialauftrag angelegt', icon: '📄', grad: 'grad-violet',
        daten: { thema: th, klasseId: kl?.id || null, klasseName: kl?.name || '', lernfeld: lf || '',
          typ: /klassenarbeit|klausur/.test(t) ? 'Klassenarbeit mit Erwartungshorizont' : /lernsituation/.test(t) ? 'Handlungsorientierte Lernsituation' : 'Arbeitsblatt' },
        text: `${th}${kl ? ' · ' + kl.name : ''}${lf ? ' · ' + lf : ''}` });
      return;
    }
    if (sch || /(mitarbeit|beobachtung|verhalten|fehlt|fehlte|unpünktlich|stört|engagiert|beteiligt|hausaufgabe)/.test(t)) {
      const bewertung = /(sehr gut|gut|engagiert|aufmerksam|vorbildlich|stark)/.test(t) ? 'positiv'
        : /(stört|unpünktlich|fehlt|fehlte|nicht dabei|abgelenkt|keine hausaufgabe|schwach)/.test(t) ? 'negativ' : 'neutral';
      ergebnis.push({ typ: 'beobachtung', label: 'Beobachtung gespeichert', icon: '📊', grad: 'grad-teal',
        daten: { schuelerId: sch?.id || null, klasseId: sch?.klasseId || kl?.id || null, text: kurz(s), bewertung, datum: dat?.datum || heute() },
        text: `${sch ? anzeige(sch) : (kl?.name || 'ohne Zuordnung')} · ${kurz(s, 60)}` });
      return;
    }
    if (/(erinnere mich|nicht vergessen|to-?do|aufgabe|muss noch|korrigieren|vorbereiten|erledigen|denk dran|denke daran)/.test(t)) {
      const prio = /(dringend|wichtig|sofort|bis morgen)/.test(t) ? 1 : /(irgendwann|gelegentlich)/.test(t) ? 3 : 2;
      ergebnis.push({ typ: 'aufgabe', label: 'Aufgabe angelegt', icon: '✅', grad: 'grad-amber',
        daten: { titel: titelBereinigen(s, true), prio, faellig: dat?.datum || '', klasseId: kl?.id || null },
        text: kurz(s, 70) });
      return;
    }
    ergebnis.push({ typ: 'notiz', label: 'Notiz gespeichert', icon: '📝', grad: 'grad-slate',
      daten: { titel: kurz(s, 48), text: s, kategorie: 'Unterricht', klasseId: kl?.id || null, schuelerId: sch?.id || null, lernfeld: lf || '' },
      text: kurz(s, 70) });
  });

  return ergebnis;
}

/* Entfernt Fuellwoerter und Zeitangaben aus einem diktierten Titel */
function titelBereinigen(s, aufgabe = false) {
  let t = String(s || '');
  t = t.replace(/^(und\s+)?(bitte\s+)?(trage|trag|setz|setze|mach|mache|leg|lege|notiere|erinnere mich( daran)?|denk dran|denke daran|ich muss( noch)?|vergiss nicht)[,\s]+/i, '');
  t = t.replace(/^(den|die|das)\s+(termin|eintrag)\s+/i, '');
  t = t.replace(/^(termin|eintrag)\s*:?\s*/i, '');
  t = t.replace(/\b(bis|am|an|ab|nächsten|naechsten|kommenden|jeden)\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi, '');
  t = t.replace(/\bum\s+\d{1,2}([:.]\d{2})?\s*uhr\b/gi, '');
  t = t.replace(/\b\d{1,2}[:.]\d{2}\s*uhr\b/gi, '');
  t = t.replace(/\b(bis|am|ab)\s+(heute|morgen|übermorgen|uebermorgen)\b/gi, '');
  t = t.replace(/\b(heute|morgen|übermorgen|uebermorgen)\b/gi, '');
  t = t.replace(/\b(bis|am|ab)\s+\d{1,2}\.\s?\d{1,2}\.(\d{2,4})?/gi, '');
  t = t.replace(/\b\d{1,2}\.\s?\d{1,2}\.(\d{2,4})?/g, '');
  t = t.replace(/\b(in den kalender|im kalender|in meinen kalender)\b/gi, '');
  if (!aufgabe) t = t.replace(/\s+(ein|eintragen|einfügen|eintrage|notieren|anlegen)\b\s*$/i, '');
  t = t.replace(/\s{2,}/g, ' ').replace(/^[,;\s-]+|[,;\s]+$/g, '');
  return kurz(t) || (aufgabe ? 'Aufgabe' : 'Termin');
}

function kurz(s, n = 90) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  const gross = t.charAt(0).toUpperCase() + t.slice(1);
  return gross.length > n ? gross.slice(0, n - 1) + '…' : gross;
}

export const BEISPIELE = [
  'Mach ein Arbeitsblatt zum Lieferungsverzug für die 1BM1 in LF4 und trage den Termin Notenkonferenz am Dienstag um 10 Uhr ein',
  'Erinnere mich daran, die Klassenarbeit der 2BM2 bis Freitag zu korrigieren',
  'Notiz: In LF9 hat die Gruppe Schwierigkeiten mit dem Kontokorrentkredit',
];
