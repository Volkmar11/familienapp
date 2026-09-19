/* Einstieg: Titelbild, Navigation, Tab-Leiste, Sprachaufnahme */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, toast, sheet, zu, logoQuelle } from './ui.js';
import * as Start from './screens-start.js';
import * as Kl from './screens-klassen.js';
import * as Mat from './screens-material.js';
import * as W from './screens-werkzeuge.js';
import * as Pr from './screens-profil.js';
import * as Sp from './sprache.js';
import { einrichten } from './screens-einrichten.js';

/* ---------- Navigation ---------- */
const TABS = [
  { id: 'start', label: 'Start', symbol: 'home' },
  { id: 'klassen', label: 'Klassen', symbol: 'cap' },
  { id: 'mikro' },
  { id: 'sync', label: 'Sync', symbol: 'sync' },
  { id: 'profil', label: 'Profil', symbol: 'user' },
];

const WERKZEUG_SEITEN = {
  organisation: W.organisation, notizen: W.notizen, material: Mat.material, individuell: Mat.individuell,
  email: W.email, datenschutz: W.datenschutz, tresor: W.tresor, kalender: W.kalender,
  gedaechtnis: W.gedaechtnis, hinweise: Start.hinweise, suche: Start.suche, hilfe: Start.hilfe,
  ki: Pr.kiSeite, prozesse: Start.prozesse, analysen: analysenWahl,
};

function analysenWahl() {
  const d = S.state();
  screenEl().innerHTML = `
    <div class="nav"><button class="zurueck" data-zurueck>${icon('left', 20)}</button>
      <div class="tile g-sky">${icon('chart', 19)}</div>
      <div class="txt"><h1 class="serif">Schüleranalysen</h1><p>Klasse wählen</p></div></div>
    <div class="pad">${d.klassen.map((k) => {
      const sus = S.schuelerDer(k.id);
      const m = S.klassenSchnitt(k.id);
      return `<button class="zeile" data-go="analyse/${k.id}">
        <span class="tile g-sky">${icon('chart', 19)}</span>
        <span class="txt"><b>${esc(k.code)}</b><small>${sus.length} Lernende${m !== null ? ' · Ø ' + S.note(m) : ''}</small></span>
        <span class="chev">${icon('right', 15)}</span></button>`;
    }).join('') || '<div class="leer">Noch keine Klasse angelegt.</div>'}</div>`;
}

function parse() {
  const roh = decodeURI(location.hash.replace(/^#\/?/, '')) || 'start';
  const [pfad, suchteil] = roh.split('?');
  const teile = pfad.split('/').filter(Boolean);
  const q = {};
  (suchteil || '').split('&').filter(Boolean).forEach((p) => { const [k, v] = p.split('='); q[k] = v ?? ''; });
  return { teile, q };
}

const SEITEN = {
  start: Start.start, klassen: Kl.klassen, klasse: Kl.klasse, liste: Kl.liste, schueler: Kl.schueler,
  blatt: Kl.blatt, analyse: Kl.analyse, gruppe: Kl.gruppe, lernfeld: Kl.lernfeld, thema: Kl.thema,
  assistent: Mat.assistent, material: Mat.materialDetail, termin: Start.termin, stunde: Start.stunde,
  aufgabe: Start.aufgabe, sync: Pr.sync, profil: Pr.profil, einrichten,
};

let letzterPfad = '';
function zeichne() {
  const { teile, q } = parse();
  let name = teile[0] || 'start';
  if (!S.state().profil.eingerichtet && name !== 'einrichten') { location.hash = '#/einrichten'; return; }
  const el = screenEl();
  const tief = teile.length > 1 || name === 'w';
  el.className = tief && letzterPfad !== location.hash ? 'anim-in' : 'anim-up';
  letzterPfad = location.hash;
  window.scrollTo(0, 0);

  try {
    if (name === 'w') (WERKZEUG_SEITEN[teile[1]] || Start.start)(teile.slice(2), q);
    else (SEITEN[name] || Start.start)(teile.slice(1), q);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="pad" style="padding-top:40px"><div class="box bad">${icon('warn', 17)}<div><b>Unerwarteter Fehler</b><p>${esc(e.message)}</p></div></div>
      <button class="btn g-amber" data-go="start">Zur Startseite</button></div>`;
  }
  tabs(name);
  $('#tabs').style.display = name === 'einrichten' ? 'none' : '';
}

export function gehe(route) {
  const ziel = '#/' + String(route).replace(/^#?\/?/, '');
  if (location.hash === ziel) zeichne(); else location.hash = ziel;
}

function tabs(aktiv) {
  const t = $('#tabs');
  t.innerHTML = TABS.map((x) => x.id === 'mikro'
    ? `<div class="mitte"><button class="mikro" id="mikro" aria-label="Sprachsteuerung">
        <span class="ring"></span><span class="kreis">${icon('mic', 24)}</span></button></div>`
    : `<button class="tab ${aktiv === x.id ? 'an' : ''}" data-go="${x.id}">${icon(x.symbol, 21)}<span>${x.label}</span></button>`).join('');
  $('#mikro').onclick = () => aufnahmeStarten();
}

/* ---------- Sprachaufnahme ---------- */
let erkennung = null;
let treffer = [];

function aufnahmeStarten() {
  const el = $('#aufnahme');
  treffer = [];
  el.classList.add('auf');
  el.innerHTML = `
    <div class="mitte">
      <div style="position:relative;margin-bottom:6px">
        <span class="mikro-ring"></span>
        <button class="mikro-gross" id="mikroGross">${icon('mic', 42)}</button>
      </div>
      <div class="welle an" id="welle">${'<i></i>'.repeat(14)}</div>
      <p class="mini" style="color:var(--accent-text);font-weight:700;margin-bottom:14px" id="status">Höre zu …</p>
      <div style="width:100%;max-width:330px">
        <textarea id="text" rows="4" placeholder="Diktat erscheint hier – oder tippen Sie den Satz ein."
          style="width:100%;background:rgba(255,255,255,.07);border:1px solid var(--border-hi);border-radius:16px;padding:14px;color:var(--text);font-size:15px;outline:none;resize:vertical"></textarea>
        <div id="erkannt" style="display:flex;flex-direction:column;gap:8px;margin-top:12px"></div>
      </div>
    </div>
    <div style="padding:16px 20px calc(30px + var(--safe-bot));display:flex;align-items:center;justify-content:center;gap:14px">
      <button class="zurueck" id="abbruch" style="width:54px;height:54px">${icon('x', 22)}</button>
      <button class="btn g-emerald" id="auswerten" style="max-width:220px">${icon('sparkles', 17)}Auswerten</button>
    </div>`;

  const ta = $('#text', el);
  const welle = $('#welle', el);
  $$('#welle i', el).forEach((i, n) => { i.style.animationDelay = (n * 60) + 'ms'; });

  const stoppen = () => { try { erkennung?.stop(); } catch {} erkennung = null; welle.classList.remove('an'); };
  $('#abbruch', el).onclick = () => { stoppen(); el.classList.remove('auf'); };
  $('#mikroGross', el).onclick = () => {
    if (erkennung) { stoppen(); $('#status', el).textContent = 'Aufnahme beendet.'; return; }
    hoeren(ta, el);
  };
  $('#auswerten', el).onclick = () => {
    stoppen();
    treffer = Sp.analysieren(ta.value);
    const ziel = $('#erkannt', el);
    if (!treffer.length) { ziel.innerHTML = `<div class="box warn" style="margin:0">${icon('warn', 16)}<div><p>Kein Auftrag erkannt. Beispiel: „Arbeitsblatt zum Lieferungsverzug für die 1BM1".</p></div></div>`; return; }
    ziel.innerHTML = treffer.map((t) => `<div class="erkannt">
      <span class="label" style="color:var(--accent-text)">${esc(t.label.split(' ')[0])}</span>
      <span class="klein" style="flex:1;min-width:0">${esc(t.text)}</span>
      <span class="t-ok">${icon('checkCircle', 15)}</span></div>`).join('')
      + `<button class="btn g-emerald" id="uebernehmen" style="margin-top:6px">${icon('check', 17)}${treffer.length} Eintrag${treffer.length > 1 ? 'e' : ''} übernehmen</button>`;
    $('#uebernehmen', el).onclick = () => uebernehmen(el);
  };
  if (Sp.erkennungVerfuegbar()) hoeren(ta, el);
  else { $('#status', el).textContent = 'Spracherkennung nicht verfügbar – bitte tippen oder das Tastatur-Mikrofon nutzen.'; welle.classList.remove('an'); ta.focus(); }
}

function hoeren(ta, el) {
  erkennung = Sp.starten({
    onText: (alles) => { ta.value = alles; },
    onEnde: () => { erkennung = null; $('#welle', el)?.classList.remove('an'); const s = $('#status', el); if (s) s.textContent = 'Aufnahme beendet – jetzt auswerten.'; },
    onFehler: (m) => { erkennung = null; $('#welle', el)?.classList.remove('an'); const s = $('#status', el); if (s) s.textContent = m; },
  });
}

function uebernehmen(el) {
  let ziel = '';
  treffer.forEach((t) => {
    const d = t.daten;
    S.aendern((db) => {
      if (t.typ === 'termin') db.termine.push({ id: S.uid(), titel: d.titel, datum: d.datum, zeit: d.zeit || '', ort: '', klasseId: '', beschreibung: '', todos: [], erinnerung: '' });
      else if (t.typ === 'aufgabe') db.aufgaben.unshift({ id: S.uid(), titel: d.titel, prio: d.prio === 1 ? 'hoch' : d.prio === 3 ? 'niedrig' : 'mittel', faellig: d.faellig || '', desc: 'Aus Diktat übernommen.', erledigt: false, klasseId: d.klasseId || '' });
      else if (t.typ === 'beobachtung') {
        db.notizen.unshift({ id: S.uid(), text: d.text, typ: 'Mitarbeit', klasseId: d.klasseId || '', schuelerId: d.schuelerId || '', lf: '', datum: d.datum, sicht: 'nur ich' });
        const s = db.schueler.find((x) => x.id === d.schuelerId);
        if (s) s.notizen = [{ id: S.uid(), datum: d.datum, text: d.text }, ...(s.notizen || [])];
      } else if (t.typ === 'notiz') db.notizen.unshift({ id: S.uid(), text: d.text, typ: 'Unterrichtsverlauf', klasseId: d.klasseId || '', schuelerId: d.schuelerId || '', lf: d.lernfeld || '', datum: S.heute(), sicht: 'nur ich' });
      else if (t.typ === 'material') {
        const k = db.klassen.find((x) => x.id === d.klasseId) || db.klassen.find((x) => x.code === d.klasseName);
        ziel = `assistent?klasse=${k?.id || ''}&lf=${d.lernfeld || ''}&thema=${encodeURIComponent(d.thema)}`;
      }
    });
  });
  S.protokoll('Diktat übernommen', `${treffer.length} Einträge`);
  el.classList.remove('auf');
  toast(`${treffer.length} Eintrag${treffer.length > 1 ? 'e' : ''} übernommen`);
  gehe(ziel || 'start');
}

document.addEventListener('aufnahme-starten', aufnahmeStarten);

/* ---------- Titelbild ---------- */
function splash() {
  const p = S.state().profil;
  const el = document.createElement('div');
  el.id = 'splash';
  el.innerHTML = `
    <img class="schullogo" src="${logoQuelle()}" alt="Schullogo">
    <div class="marke"><h1 class="serif">LehrerAssistent</h1></div>
    ${p.schule ? `<p style="margin-top:-6px;font-weight:600;color:var(--dim)">${esc(p.schule)}</p>` : ''}
    <p>Weniger Verwaltung. Mehr Unterricht.<br>Alle Daten bleiben auf diesem Gerät.</p>
    <div class="lade"><i></i></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('weg'), 1250);
  setTimeout(() => el.remove(), 1800);
}

/* ---------- Symbol für den Homebildschirm ---------- */
function symbolSetzen() {
  const p = S.state().profil;
  if (!p.appIcon) return;
  $$('link[rel="apple-touch-icon"], link[rel="icon"]').forEach((l) => { l.href = p.appIcon; });
  try {
    const m = { name: 'LehrerAssistent', short_name: 'LehrerAssistent', start_url: './', scope: './', display: 'standalone',
      background_color: '#08142c', theme_color: '#08142c', lang: 'de',
      icons: [{ src: p.appIcon, sizes: '512x512', type: 'image/png' }, { src: p.appIcon, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    $('link[rel="manifest"]').href = url;
  } catch { /* Manifest bleibt wie es ist */ }
}

/* ---------- Start ---------- */
function init() {
  const d = S.laden();
  document.documentElement.dataset.theme = d.profil.theme || 'dunkel';
  symbolSetzen();
  if (d.profil.eingerichtet) splash();
  if (!d.profil.eingerichtet && !location.hash.includes('einrichten')) location.hash = '#/einrichten';

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); e.stopPropagation(); gehe(go.dataset.go); return; }
    if (e.target.closest('[data-zurueck]')) { e.preventDefault(); history.length > 1 ? history.back() : gehe('start'); }
  });
  S.onChange(() => { symbolSetzen(); });

  window.addEventListener('hashchange', zeichne);
  zeichne();

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
