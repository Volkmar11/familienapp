/* Start, Prozesse, Suche, Hinweise, Termin-/Aufgabendetails, Hilfe */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, nav, kopf, abschnitt, aktion, zeile, karte, kv, leer, box, kachel, btn, geist,
  feld, werte, sheet, zu, toast, frage, chips } from './ui.js';
import { ergebnis } from './generieren.js';
import * as KI from './ki.js';

export const WERKZEUGE = [
  { id: 'organisation', titel: 'Organisationsassistent', symbol: 'todo', grad: 'g-blue' },
  { id: 'notizen', titel: 'Unterrichtsnotizen', symbol: 'notebook', grad: 'g-teal' },
  { id: 'material', titel: 'Individuelle Materialien', symbol: 'fileEdit', grad: 'g-violet' },
  { id: 'analysen', titel: 'Schüleranalysen', symbol: 'chart', grad: 'g-sky' },
  { id: 'email', titel: 'Berufliche E-Mails', symbol: 'mail', grad: 'g-amber' },
  { id: 'datenschutz', titel: 'Datenschutz / DSGVO', symbol: 'shield', grad: 'g-emerald' },
  { id: 'tresor', titel: 'Tresor & Pseudonyme', symbol: 'key', grad: 'g-rose' },
  { id: 'kalender', titel: 'Kalender & Stundenplan', symbol: 'calendar', grad: 'g-green' },
  { id: 'hinweise', titel: 'Benachrichtigungen', symbol: 'bell', grad: 'g-indigo' },
  { id: 'gedaechtnis', titel: 'Gedächtnis', symbol: 'brain', grad: 'g-slate' },
];

const gruss = () => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : 'Guten Abend'; };

export function start() {
  const d = S.state();
  const hin = S.hinweise();
  const stunden = S.stundenHeute();
  const termine = S.termineHeute();
  const aufgaben = S.offeneAufgaben().slice(0, 5);

  screenEl().innerHTML = `
    ${kopf({
      ueber: new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
      titel: gruss() + ',', kursiv: (d.profil.name || 'willkommen'),
      rechts: `<button class="rund" data-go="w/hinweise" aria-label="Benachrichtigungen">${icon('bell', 21)}${hin.length ? `<span class="zahl">${hin.length}</span>` : ''}</button>`,
    })}
    <div class="pad">
      <button class="zeile" data-go="w/suche" style="margin-bottom:14px">
        <span class="dim">${icon('search', 17)}</span>
        <span class="txt"><b style="font-weight:500;color:var(--dim)">Klassen, Schüler, Themen, Material …</b></span>
      </button>

      <div class="raster-3" style="margin-bottom:18px">
        <button class="schnell" data-go="w/individuell"><span class="tile g-violet">${icon('wand', 17)}</span>Individuell</button>
        <button class="schnell" data-go="assistent"><span class="tile g-indigo">${icon('fileEdit', 17)}</span>Material</button>
        <button class="schnell" data-go="klassen"><span class="tile g-sky">${icon('cap', 17)}</span>Klassen</button>
      </div>

      ${abschnitt('Unterricht heute', stunden.length ? stunden.map(zeitZeile).join('') : leer('Heute ist kein Unterricht eingetragen.'), aktion('Stundenplan', 'w/kalender'))}
      ${abschnitt('Termine heute', termine.length ? termine.map((t) => zeitZeile(t, true)).join('') : leer('Keine Termine für heute.'), aktion('Kalender', 'w/kalender'))}
      ${abschnitt('Aufgaben heute', aufgaben.length ? aufgaben.map((a) => zeile({
        punkt: a.prio === 'hoch' ? 'b-bad' : a.prio === 'mittel' ? 'b-warn' : 'b-note',
        titel: a.titel, unter: a.faellig ? `fällig: ${S.tageBis(a.faellig) === 0 ? 'heute' : S.tageBis(a.faellig) === 1 ? 'morgen' : S.fmtKurz(a.faellig)}` : 'ohne Frist',
        route: 'aufgabe/' + a.id,
      })).join('') : leer('Keine offenen Aufgaben.'), aktion('Alle', 'w/organisation'))}

      ${abschnitt('Deine Werkzeuge', `<div class="raster-2">${WERKZEUGE.map((w) => kachel({ ...w, route: 'w/' + w.id })).join('')}</div>`)}

      <button class="zeile" data-go="sync" style="background:linear-gradient(135deg,rgba(16,185,129,.14),rgba(20,184,166,.1));border-color:rgba(52,211,153,.24)">
        <span class="tile g-emerald">${icon('sync', 19)}</span>
        <span class="txt"><b>Daten &amp; Austausch</b><small>${d.klassen.length} Klassen · ${d.schueler.length} Lernende · ${d.materialien.length} Materialien</small></span>
        <span class="chev">${icon('right', 15)}</span></button>

      <div style="display:flex;justify-content:space-between;padding:16px 6px 0;color:var(--faint);font-size:10px;font-weight:600">
        ${[['shield', 'DSGVO'], ['lock', 'Lokal'], ['checkCircle', 'Pseudonyme'], ['sparkles', KI.hatZugang() ? 'KI aktiv' : 'Prompt-Modus']]
          .map(([s, t]) => `<span style="display:flex;align-items:center;gap:4px">${icon(s, 11)} ${t}</span>`).join('')}
      </div>
    </div>`;
}

function zeitZeile(t, istTermin = false) {
  const k = S.klasse(t.klasseId);
  const titel = istTermin ? t.titel : `${k?.code || ''} – ${t.lf || ''}: ${t.thema || ''}`;
  const [von, , bis] = (t.zeit || '').split(' ');
  return `<button class="zeitzeile" data-go="${istTermin ? 'termin/' : 'stunde/'}${t.id}">
    <span class="zeit"><b>${esc(von || t.zeit || '')}</b><small>${esc(bis || '')}</small></span>
    <span class="strich"></span>
    <span class="txt" style="flex:1;min-width:0"><b style="font-size:13px;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(titel)}</b>
    <small style="color:var(--dim);font-size:11px">${esc(t.ort || '')}</small></span>
    <span class="chev">${icon('right', 15)}</span></button>`;
}

/* ---------- Stunde / Termin / Aufgabe ---------- */

export function stunde([id]) {
  const t = S.state().stunden.find((x) => x.id === id);
  if (!t) return start();
  const k = S.klasse(t.klasseId);
  screenEl().innerHTML = `
    ${nav({ titel: `${k?.code || ''} · ${t.lf || ''}`, unter: `${t.zeit} · ${t.ort || ''}`, symbol: 'calendar', grad: 'g-sky' })}
    <div class="pad">
      ${karte(`${kv('Uhrzeit', esc(t.zeit))}${kv('Raum', esc(t.ort || '–'))}${kv('Klasse', esc(k?.code || '–'))}${kv('Lernfeld', esc(t.lf || '–'))}
        <div style="padding-top:10px"><p class="mini dim" style="margin-bottom:4px">Thema</p><p class="klein">${esc(t.beschreibung || t.thema || '')}</p></div>`)}
      ${t.todos?.length ? abschnitt('Vorbereitung', t.todos.map((x) => zeile({ symbol: 'checkCircle', grad: 'g-green', titel: x, chev: false })).join('')) : ''}
      ${t.erinnerung ? box('warn', t.erinnerung, 'Erinnerung') : ''}
      <div class="knopfspalte">
        ${btn('Individuelle Arbeitsblätter', { ton: 'violet', symbol: 'wand', route: `w/individuell?klasse=${t.klasseId}&lf=${t.lf}&thema=${encodeURIComponent(t.thema || '')}` })}
        ${geist('Material für die ganze Klasse', { symbol: 'fileEdit', route: `assistent?klasse=${t.klasseId}&lf=${t.lf}&thema=${encodeURIComponent(t.thema || '')}` })}
        ${geist('Notiz zur Stunde', { symbol: 'notebook', route: `w/notizen?klasse=${t.klasseId}&lf=${t.lf}` })}
      </div>
    </div>`;
}

export function termin([id]) {
  const t = S.state().termine.find((x) => x.id === id);
  if (!t) return start();
  screenEl().innerHTML = `
    ${nav({ titel: t.titel, unter: `${S.fmtDatum(t.datum)}${t.zeit ? ', ' + t.zeit + ' Uhr' : ''}`, symbol: 'calendar', grad: 'g-sky' })}
    <div class="pad">
      ${karte(`${kv('Datum', S.fmtDatum(t.datum))}${kv('Uhrzeit', esc(t.zeit || '–'))}${kv('Ort', esc(t.ort || '–'))}
        ${t.beschreibung ? `<div style="padding-top:10px"><p class="klein">${esc(t.beschreibung)}</p></div>` : ''}`)}
      ${t.todos?.length ? abschnitt('To-dos', t.todos.map((x) => zeile({ symbol: 'checkCircle', grad: 'g-green', titel: x, chev: false })).join('')) : ''}
      ${t.erinnerung ? box('warn', t.erinnerung, 'Erinnerung') : ''}
      <div class="knopfspalte">
        ${geist('Termin bearbeiten', { symbol: 'pencil', id: 'bearb' })}
        ${geist('Termin löschen', { symbol: 'trash', id: 'weg' })}
      </div>
    </div>`;
  $('#bearb').onclick = () => terminSheet(t.id);
  $('#weg').onclick = async () => {
    if (!await frage('Termin löschen?', t.titel, 'Löschen')) return;
    S.aendern((d) => { d.termine = d.termine.filter((x) => x.id !== t.id); });
    history.back();
  };
}

export function terminSheet(id = null) {
  const t = id ? S.state().termine.find((x) => x.id === id) : null;
  sheet(t ? 'Termin bearbeiten' : 'Neuer Termin', '', `
    ${feld('Titel', 'titel', { wert: t?.titel || '', platz: 'z. B. Notenkonferenz' })}
    <div class="feld-2">${feld('Datum', 'datum', { typ: 'date', wert: t?.datum || S.heute() })}${feld('Uhrzeit', 'zeit', { typ: 'time', wert: t?.zeit || '' })}</div>
    ${feld('Ort', 'ort', { wert: t?.ort || '' })}
    ${feld('Notiz', 'beschreibung', { wert: t?.beschreibung || '', zeilen: 2 })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      if (!w.titel.trim()) return toast('Bitte einen Titel angeben');
      if (t) S.aendern(() => Object.assign(t, w));
      else S.aendern((d) => d.termine.push({ id: S.uid(), todos: [], erinnerung: '', klasseId: '', ...w }));
      zu(); toast('Gespeichert'); location.hash = '#/w/kalender';
    };
  });
}

export function aufgabe([id]) {
  const a = S.state().aufgaben.find((x) => x.id === id);
  if (!a) return start();
  const ton = { hoch: 'bad', mittel: 'warn', niedrig: 'info' }[a.prio];
  screenEl().innerHTML = `
    ${nav({ titel: a.titel, unter: a.faellig ? 'fällig: ' + S.fmtDatum(a.faellig) : 'ohne Frist', symbol: 'clipboard', grad: 'g-blue' })}
    <div class="pad">
      ${box(ton, a.desc || 'Keine weitere Beschreibung.', 'Priorität: ' + a.prio)}
      ${karte(`${kv('Status', a.erledigt ? 'erledigt' : 'offen', a.erledigt ? 't-ok' : 't-warn')}${kv('Fällig', a.faellig ? S.fmtDatum(a.faellig) : '–')}${kv('Priorität', esc(a.prio))}`)}
      <div class="knopfspalte" style="margin-top:14px">
        ${btn(a.erledigt ? 'Wieder öffnen' : 'Als erledigt markieren', { ton: 'emerald', symbol: 'checkCircle', id: 'fertig' })}
        ${a.klasseId ? btn('Arbeitsblatt dazu erstellen', { ton: 'violet', symbol: 'fileEdit', route: `assistent?klasse=${a.klasseId}&lf=${a.lf || ''}&thema=${encodeURIComponent(a.thema || '')}` }) : ''}
        ${geist('Bearbeiten', { symbol: 'pencil', id: 'bearb' })}
        ${geist('Löschen', { symbol: 'trash', id: 'weg' })}
      </div>
    </div>`;
  $('#fertig').onclick = () => {
    S.aendern(() => { a.erledigt = !a.erledigt; a.erledigtAm = a.erledigt ? S.jetzt() : null; });
    toast(a.erledigt ? 'Erledigt' : 'Wieder offen'); history.back();
  };
  $('#bearb').onclick = () => aufgabeSheet(a.id);
  $('#weg').onclick = async () => {
    if (!await frage('Aufgabe löschen?', a.titel, 'Löschen')) return;
    S.aendern((d) => { d.aufgaben = d.aufgaben.filter((x) => x.id !== a.id); });
    history.back();
  };
}

export function aufgabeSheet(id = null) {
  const a = id ? S.state().aufgaben.find((x) => x.id === id) : null;
  sheet(a ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', '', `
    ${feld('Aufgabe', 'titel', { wert: a?.titel || '', platz: 'z. B. Klassenarbeit 1BM2 korrigieren' })}
    <div class="feld-2">
      ${feld('Priorität', 'prio', { wert: a?.prio || 'mittel', optionen: ['hoch', 'mittel', 'niedrig'] })}
      ${feld('Fällig am', 'faellig', { typ: 'date', wert: a?.faellig || '' })}
    </div>
    ${feld('Beschreibung', 'desc', { wert: a?.desc || '', zeilen: 2 })}
    ${feld('Klasse', 'klasseId', { wert: a?.klasseId || '', optionen: [['', '– keine –'], ...S.state().klassen.map((k) => [k.id, k.code])] })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      if (!w.titel.trim()) return toast('Bitte einen Text eingeben');
      if (a) S.aendern(() => Object.assign(a, w));
      else S.aendern((d) => d.aufgaben.unshift({ id: S.uid(), erledigt: false, ...w }));
      zu(); toast('Gespeichert'); location.hash = '#/w/organisation';
    };
  });
}

/* ---------- Hinweise / Suche / Hilfe ---------- */

export function hinweise() {
  const h = S.hinweise();
  screenEl().innerHTML = `
    ${nav({ titel: 'Benachrichtigungen', unter: `${h.length} offen`, symbol: 'bell', grad: 'g-indigo' })}
    <div class="pad">
      ${h.length ? h.map((x) => zeile({ symbol: x.symbol, grad: x.grad, titel: x.titel, unter: x.desc, route: x.route })).join('') : leer('Alles erledigt – nichts Offenes.')}
      ${box('info', 'Die Hinweise entstehen aus Ihren eigenen Einträgen: fällige Aufgaben, Termine des Tages, auffällige Lernstände und der Zustand von Tresor und KI-Zugang. Es werden keine Push-Nachrichten versendet.')}
    </div>`;
}

export function suche() {
  screenEl().innerHTML = `
    ${nav({ titel: 'Suche', symbol: 'search', grad: 'g-sky' })}
    <div class="pad">
      ${feld('Suchbegriff', 'q', { platz: 'Klasse, Name, Thema, Material …' })}
      ${chips('bereich', ['Alle', 'Klassen', 'Lernende', 'Themen', 'Material', 'Notizen'], 'Alle')}
      <div id="treffer">${box('info', 'Tippen Sie einen Begriff ein – die Suche läuft über Klassen, Lernende, Themen, Materialien und Notizen.')}</div>
    </div>`;
  let bereich = 'Alle';
  const eingabe = $('[name=q]');
  eingabe.focus();
  const lauf = () => {
    const q = eingabe.value.trim().toLowerCase();
    const ziel = $('#treffer');
    if (q.length < 2) { ziel.innerHTML = box('info', 'Mindestens zwei Zeichen eingeben.'); return; }
    const d = S.state();
    const tr = [];
    const nimm = (b) => bereich === 'Alle' || bereich === b;
    if (nimm('Klassen')) d.klassen.filter((k) => k.code.toLowerCase().includes(q))
      .forEach((k) => tr.push({ symbol: 'cap', grad: 'g-blue', titel: k.code, unter: k.typ === 'BM' ? 'Büromanagement' : 'Öffentlicher Dienst', route: 'klasse/' + k.id }));
    if (nimm('Lernende')) d.schueler.filter((s) => (s.name + s.pseudonym).toLowerCase().includes(q))
      .forEach((s) => tr.push({ symbol: 'user', grad: 'g-slate', titel: S.anzeige(s), unter: S.klasse(s.klasseId)?.code || '', route: 'schueler/' + s.id }));
    if (nimm('Themen')) d.klassen.forEach((k) => k.lernfelder.forEach((l) => l.themen.forEach((t, i) => {
      if (t.name.toLowerCase().includes(q)) tr.push({ symbol: 'book', grad: 'g-violet', titel: t.name, unter: `${k.code} · ${l.code}`, route: `thema/${k.id}/${l.code}/${i}` });
    })));
    if (nimm('Material')) d.materialien.filter((m) => (m.titel || '').toLowerCase().includes(q))
      .forEach((m) => tr.push({ symbol: 'fileText', grad: 'g-violet', titel: m.titel, unter: `${m.art || 'Material'} · ${S.fmtKurz(m.datum)}`, route: 'material/' + m.id }));
    if (nimm('Notizen')) d.notizen.filter((n) => n.text.toLowerCase().includes(q))
      .forEach((n) => tr.push({ symbol: 'notebook', grad: 'g-teal', titel: n.text.slice(0, 48), unter: `${n.typ || ''} · ${S.fmtKurz(n.datum)}`, route: 'w/notizen' }));
    ziel.innerHTML = tr.length ? tr.slice(0, 25).map(zeile).join('') : leer(`Keine Treffer für „${q}".`);
  };
  eingabe.oninput = lauf;
  $$('[data-chips=bereich] .chip').forEach((c) => c.onclick = () => {
    $$('[data-chips=bereich] .chip').forEach((x) => x.classList.remove('an'));
    c.classList.add('an'); bereich = c.dataset.wert; lauf();
  });
}

export function hilfe() {
  const faq = [
    ['Wie erstelle ich individuelle Arbeitsblätter?', 'Start → Individuell. Klasse und Thema wählen, Lernende auswählen – die App leitet aus Noten, Mitarbeit und Ihren Notizen für jede Person eine eigene Anpassung ab und erzeugt ein passendes Blatt.'],
    ['Was passiert mit den Schülerdaten?', 'Alle Daten bleiben im Speicher dieses Geräts. Vor jeder KI-Anfrage prüft die Ampel auf Personenbezug; standardmäßig werden Klarnamen durch Pseudonyme ersetzt.'],
    ['Wie binde ich ein KI-Modell an?', 'Profil → KI-Anbindung. Ohne Schlüssel erzeugt die App fertige Prompts zum Kopieren; mit eigenem Schlüssel (Claude, ChatGPT oder ein schuleigenes Modell) läuft alles direkt in der App.'],
    ['Wie kommt die App auf den Homebildschirm?', 'In Safari öffnen → Teilen → „Zum Home-Bildschirm". Danach startet sie wie eine App und funktioniert auch ohne Internet.'],
    ['Kann ich meine Daten sichern?', 'Ja: Sync → Sicherung erstellen. Die JSON-Datei enthält den gesamten Bestand und lässt sich jederzeit wieder einspielen.'],
  ];
  screenEl().innerHTML = `
    ${nav({ titel: 'Hilfe & Support', symbol: 'help', grad: 'g-slate' })}
    <div class="pad">
      ${faq.map(([f, a]) => karte(`<p class="klein" style="font-weight:700;margin-bottom:6px">${esc(f)}</p><p class="mini dim" style="line-height:1.5">${esc(a)}</p>`)).join('')}
      <div style="margin-top:14px">${geist('Rückmeldung per E-Mail', { symbol: 'mail', attr: 'onclick="location.href=\'mailto:marcusv21@gmx.de?subject=LehrerAssistent\'"' })}</div>
    </div>`;
}

export function prozesse() {
  const d = S.state();
  const offen = d.materialien.slice(0, 8);
  screenEl().innerHTML = `
    ${nav({ titel: 'Aktuelle Prozesse', unter: 'Zuletzt erstellt und bearbeitet', symbol: 'history', grad: 'g-teal' })}
    <div class="pad">
      ${offen.length ? offen.map((m) => zeile({ symbol: m.art === 'Individuell' ? 'wand' : 'fileText', grad: m.art === 'Individuell' ? 'g-violet' : 'g-teal',
        titel: m.titel, unter: `${m.art || 'Material'} · ${S.fmtKurz(m.datum)}${m.ergebnis ? '' : ' · nur Prompt'}`, route: 'material/' + m.id })).join('')
        : leer('Noch nichts erstellt. Starten Sie mit einem individuellen Arbeitsblatt.')}
      <div class="knopfspalte" style="margin-top:12px">
        ${btn('Individuelle Arbeitsblätter', { ton: 'violet', symbol: 'wand', route: 'w/individuell' })}
        ${geist('Material für die Klasse', { symbol: 'fileEdit', route: 'assistent' })}
      </div>
    </div>`;
}
