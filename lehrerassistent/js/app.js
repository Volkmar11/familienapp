/* Einstieg: Navigation, Tab-Leiste, erste Einrichtung */

import * as S from './state.js';
import { $, $$, esc, sheet, schliessen, toast, feld, werte } from './ui.js';
import * as V from './views.js';
import { werkzeug, WERKZEUGE } from './werkzeuge.js';
import { routerSetzen } from './router.js';

const TABS = [
  { id: 'start', icon: '🏠', label: 'Start' },
  { id: 'klassen', icon: '👥', label: 'Klassen' },
  { id: 'mic', icon: '🎤', label: '' },
  { id: 'sync', icon: '🔄', label: 'Sync' },
  { id: 'profil', icon: '👤', label: 'Profil' },
];

function routeAusHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'start';
  return h.replace(/\//g, ':');
}

export function gehe(route) {
  const ziel = '#/' + String(route).replace(/:/g, '/');
  if (location.hash === ziel) zeichnen();
  else location.hash = ziel;
}
routerSetzen(gehe);

function zeichnen() {
  const route = routeAusHash();
  const [art, wert] = route.split(':');
  window.scrollTo(0, 0);

  if (art === 'w') werkzeug(wert);
  else if (art === 'klasse') V.klasseDetail(wert);
  else if (art === 'schueler') V.schuelerDetail(wert);
  else if (art === 'klassen') V.klassen();
  else if (art === 'sprache') V.sprache();
  else if (art === 'sync') V.sync();
  else if (art === 'profil') V.profil();
  else V.start();

  tabsZeichnen(art);
  kopfZeichnen(art, wert);
  bindeGo();
}

function bindeGo() {
  $$('[data-go]').forEach((el) => {
    if (el.dataset.gebunden) return;
    el.dataset.gebunden = '1';
    el.addEventListener('click', (e) => { e.stopPropagation(); gehe(el.dataset.go); });
  });
}

function kopfZeichnen(art, wert) {
  const d = S.state();
  const anzahl = V.offeneHinweise().length;
  const zurueck = ['w', 'klasse', 'schueler'].includes(art);
  const titel = art === 'w' ? (WERKZEUGE.find((x) => x.id === wert)?.titel || 'LehrerAssistent') : 'LehrerAssistent';
  $('#appbar').innerHTML = `
    ${zurueck ? '<button class="icon-btn" id="zurueck" aria-label="Zurück">‹</button>'
      : '<div class="mark">L+</div>'}
    <div style="min-width:0"><h1>${esc(titel)}</h1><small>${esc(d.profil.kuerzel || d.profil.name || 'KI-Assistent für Lehrkräfte')}</small></div>
    <div class="spacer"></div>
    <button class="icon-btn" id="glocke" aria-label="Hinweise">🔔${anzahl ? `<span class="badge">${anzahl}</span>` : ''}</button>`;
  $('#zurueck')?.addEventListener('click', () => history.back());
  $('#glocke').onclick = () => gehe('w:hinweise');
}

function tabsZeichnen(art) {
  const aktiv = ['start', 'klassen', 'sprache', 'sync', 'profil'].includes(art) ? art : 'start';
  $('#tabbar').innerHTML = TABS.map((t) => t.id === 'mic'
    ? `<button class="mic" id="tabmic" aria-label="Diktat">🎤</button>`
    : `<button class="tab ${aktiv === t.id ? 'on' : ''}" data-tab="${t.id}"><span class="ti">${t.icon}</span>${t.label}</button>`).join('');
  $$('[data-tab]').forEach((b) => b.onclick = () => gehe(b.dataset.tab));
  $('#tabmic').onclick = () => {
    if (routeAusHash() === 'sprache') V.mikroUmschalten($('[name=text]'));
    else gehe('sprache');
  };
}

/* ---------- Erste Einrichtung ---------- */

function willkommen() {
  sheet('Willkommen beim LehrerAssistenten', 'Alles bleibt auf diesem Gerät. Zwei Angaben genügen für den Start.', `
    ${feld('Ihr Name', 'name', { platzhalter: 'Vorname Nachname' })}
    <div class="feld-2">${feld('Kürzel', 'kuerzel', { platzhalter: 'z. B. Vr' })}${feld('Schule', 'schule', { platzhalter: 'Berufsschule' })}</div>
    <div class="btn-row">
      <button class="btn btn-amber" data-ok>Loslegen</button>
      <button class="btn btn-ghost" data-demo>Mit Beispieldaten starten</button>
    </div>
    <div class="tiny muted" style="margin-top:12px">Beispieldaten legen eine Musterklasse mit Pseudonymen, einen Stundenplan und einige Aufgaben an – jederzeit löschbar.</div>`, (el) => {
    const speichern = (demo) => {
      const w = werte(el);
      S.aendern((d) => Object.assign(d.profil, { name: w.name, kuerzel: w.kuerzel, schule: w.schule }));
      if (demo) beispieldaten();
      schliessen(); gehe('start');
    };
    el.querySelector('[data-ok]').onclick = () => speichern(false);
    el.querySelector('[data-demo]').onclick = () => speichern(true);
  });
}

function beispieldaten() {
  S.aendern((d) => {
    const k1 = { id: S.uid(), name: '1BM1', bildungsgang: 'BM', jahrgang: '1', raum: 'A 204', lernfelder: [], notiz: 'Erstes Ausbildungsjahr, Schwerpunkt LF4', angelegt: S.jetzt() };
    const k2 = { id: S.uid(), name: '2AMD', bildungsgang: 'AMD', jahrgang: '2', raum: 'B 110', lernfelder: [], notiz: '', angelegt: S.jetzt() };
    d.klassen.push(k1, k2);
    ['001', '002', '003', '004'].forEach((n, i) => {
      const s = { id: S.uid(), klasseId: k1.id, pseudonym: `1BM1-${n}`, name: '', angelegt: S.jetzt() };
      d.schueler.push(s);
      d.noten.push({ id: S.uid(), schuelerId: s.id, wert: String([2, 3, 4, 5][i]), gewicht: '1', art: 'Klassenarbeit', lernfeld: 'LF4', datum: S.heute() });
      if (i === 3) d.beobachtungen.push({ id: S.uid(), schuelerId: s.id, klasseId: k1.id, text: 'Häufig unvorbereitet, wirkt abgelenkt.', bewertung: 'negativ', datum: S.heute() });
    });
    const morgen = new Date(); morgen.setDate(morgen.getDate() + 1);
    d.termine.push({ id: S.uid(), titel: 'Notenkonferenz', datum: morgen.toISOString().slice(0, 10), zeit: '10:00', ort: 'Lehrerzimmer' });
    d.aufgaben.push(
      { id: S.uid(), titel: 'Klassenarbeit 1BM1 korrigieren', prio: 1, faellig: S.heute(), klasseId: k1.id, erledigt: false, angelegt: S.jetzt() },
      { id: S.uid(), titel: 'Material LF4 Lieferungsverzug vorbereiten', prio: 2, faellig: '', klasseId: k1.id, erledigt: false, angelegt: S.jetzt() });
    d.stundenplan.push(
      { id: S.uid(), tag: 1, stunde: 1, klasseId: k1.id, fach: 'LF4', raum: 'A 204' },
      { id: S.uid(), tag: 1, stunde: 2, klasseId: k1.id, fach: 'LF4', raum: 'A 204' },
      { id: S.uid(), tag: 2, stunde: 3, klasseId: k2.id, fach: 'LF5', raum: 'B 110' },
      { id: S.uid(), tag: 3, stunde: 1, klasseId: k2.id, fach: 'LF5', raum: 'B 110' },
      { id: S.uid(), tag: 4, stunde: 5, klasseId: k1.id, fach: 'LF4', raum: 'A 204' },
      { id: S.uid(), tag: 5, stunde: 1, klasseId: k1.id, fach: 'LF4', raum: 'A 204' },
      { id: S.uid(), tag: 5, stunde: 2, klasseId: k2.id, fach: 'LF5', raum: 'B 110' });
    d.notizen.push({ id: S.uid(), titel: 'Kaufvertragsstörungen wiederholen', text: 'Die Gruppe verwechselt Lieferungsverzug und Schlechtleistung – nächste Stunde mit Fallbeispiel einsteigen.', kategorie: 'Unterricht', klasseId: k1.id, lernfeld: 'LF4', datum: S.heute(), quelle: 'Text' });
  });
  toast('Beispieldaten angelegt');
}

/* ---------- Start ---------- */

function init() {
  const d = S.laden();
  document.documentElement.dataset.theme = d.profil.theme || 'dunkel';
  window.addEventListener('hashchange', zeichnen);
  zeichnen();
  if (!d.profil.name && !d.klassen.length) willkommen();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
