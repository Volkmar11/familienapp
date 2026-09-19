/* Materialien: Menü, 9-Schritt-Assistent, individuelle Arbeitsblätter, Archiv */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, nav, abschnitt, zeile, karte, kv, leer, box, btn, geist, feld, werte,
  sheet, zu, toast, frage, chips, kopieren, alsWord, textHtml, dateiName } from './ui.js';
import { ergebnis, zeigeErgebnis, archivieren, ampelBlock } from './generieren.js';
import * as KI from './ki.js';

function ohneKlasse(art) {
  const d = S.state();
  const fehlt = !d.klassen.length ? 'Klasse' : 'Lernende';
  screenEl().innerHTML = `
    ${nav({ titel: art === 'individuell' ? 'Individuelle Arbeitsblätter' : 'Material erstellen', unter: 'Noch nichts angelegt',
      symbol: art === 'individuell' ? 'wand' : 'fileEdit', grad: 'g-violet' })}
    <div class="pad">
      ${box('info', fehlt === 'Klasse'
        ? 'Legen Sie zuerst eine Klasse an – danach entstehen hier passende Materialien.'
        : 'In dieser Klasse ist noch niemand eingetragen. Individuelle Blätter brauchen mindestens eine lernende Person.',
        `Es fehlt noch eine ${fehlt}`)}
      <div class="knopfspalte">
        ${btn(fehlt === 'Klasse' ? 'Klasse anlegen' : 'Lernende eintragen', { ton: 'blue', symbol: 'plus', route: 'klassen' })}
        ${art === 'individuell' ? geist('Material ohne Personenbezug erstellen', { symbol: 'fileEdit', route: 'assistent' }) : ''}
        ${geist('Beispielklasse zum Ausprobieren', { symbol: 'sync', route: 'sync' })}
      </div>
    </div>`;
}

/* ---------- Menü ---------- */
export function material() {
  const d = S.state();
  const punkte = [
    ['Individuelle Arbeitsblätter', 'für jede Person passend zum Lernstand', 'wand', 'g-violet', 'w/individuell'],
    ['Arbeitsblatt für die Klasse', '9-Schritt-Assistent', 'fileEdit', 'g-indigo', 'assistent'],
    ['Klassenarbeit', 'mit Erwartungshorizont', 'clipboard', 'g-amber', 'assistent?typ=Klassenarbeit'],
    ['Lernsituation', 'handlungsorientiert', 'target', 'g-teal', 'assistent?typ=Lernsituation'],
    ['Übungsaufgaben', 'zur Festigung', 'todo', 'g-sky', 'assistent?typ=Übungsaufgaben'],
    ['Fallstudie', 'Praxisfall aus dem Betrieb', 'book', 'g-green', 'assistent?typ=Fallstudie'],
  ];
  screenEl().innerHTML = `
    ${nav({ titel: 'Individuelle Materialien', unter: 'Passend zu Lernstand und Vorlieben', symbol: 'fileEdit', grad: 'g-violet' })}
    <div class="pad">
      ${punkte.map(([t, u, s, g, r]) => zeile({ titel: t, unter: u, symbol: s, grad: g, route: r })).join('')}
      ${abschnitt(`Materialarchiv (${d.materialien.length})`, d.materialien.length
        ? d.materialien.slice(0, 15).map((m) => zeile({ symbol: m.art === 'Individuell' ? 'wand' : 'fileText',
          grad: m.art === 'Individuell' ? 'g-violet' : 'g-slate', titel: m.titel,
          unter: `${m.art || 'Material'}${m.klasseId ? ' · ' + (S.klasse(m.klasseId)?.code || '') : ''} · ${S.fmtKurz(m.datum)}`,
          route: 'material/' + m.id })).join('')
        : leer('Noch kein Material erstellt.'))}
    </div>`;
}

export function materialDetail([id]) {
  const m = S.state().materialien.find((x) => x.id === id);
  if (!m) return material();
  screenEl().innerHTML = `
    ${nav({ titel: m.titel, unter: `${m.art || 'Material'} · ${S.fmtDatum(m.datum)}`, symbol: 'fileText', grad: 'g-violet' })}
    <div class="pad">
      ${m.ergebnis ? `<pre class="prompt" style="max-height:520px;color:var(--text)">${esc(m.ergebnis)}</pre>`
        : box('info', 'Für dieses Material ist nur der Auftrag gespeichert. Prompt kopieren und im KI-Fenster ausführen.')}
      <div class="knopfspalte" style="margin-top:12px">
        ${m.ergebnis ? btn('Als Word-Datei', { ton: 'violet', symbol: 'download', id: 'word' }) : ''}
        ${geist('Prompt kopieren', { symbol: 'copy', id: 'prompt' })}
        ${m.ergebnis ? geist('Ergebnis kopieren', { symbol: 'copy', id: 'kopie' }) : ''}
        ${geist('Löschen', { symbol: 'trash', id: 'weg' })}
      </div>
    </div>`;
  $('#word')?.addEventListener('click', () => alsWord(`${dateiName(m.titel)}.doc`, m.titel, `<h1>${esc(m.titel)}</h1>${textHtml(m.ergebnis)}`));
  $('#prompt').onclick = () => kopieren(m.prompt || '');
  $('#kopie')?.addEventListener('click', () => kopieren(m.ergebnis));
  $('#weg').onclick = async () => {
    if (!await frage('Material löschen?', m.titel, 'Löschen')) return;
    S.aendern((d) => { d.materialien = d.materialien.filter((x) => x.id !== m.id); });
    history.back();
  };
}

/* ============================================================
 * Individuelle Arbeitsblätter – der Kern der App
 * ============================================================ */

let iv = null;

export function individuell(_args, q = {}) {
  const d = S.state();
  if (!d.klassen.length || !d.schueler.length) return ohneKlasse('individuell');
  if (!iv || q.klasse) {
    const kId = q.klasse || d.klassen[0]?.id || '';
    const k = S.klasse(kId);
    iv = {
      schritt: 1, klasseId: kId, lf: q.lf || k?.lernfelder[0]?.code || '',
      thema: q.thema ? decodeURIComponent(q.thema)
        : (k?.lernfelder[0]?.themen.find((t) => t.status === 'aktuell')?.name || k?.lernfelder[0]?.themen[0]?.name || ''),
      ziel: '', auswahl: [], musterloesung: true, hinweisLehrkraft: true, anonym: d.profil.anonymisieren, zusatz: '',
      ergebnisse: {}, laeuft: false,
    };
    const sus = S.schuelerDer(iv.klasseId);
    if (q.nur) iv.auswahl = [q.nur];
    else if (q.gruppe) iv.auswahl = (d.gruppen.find((g) => g.id === q.gruppe)?.schuelerIds || []).slice();
    else if (q.auswahl === 'foerder') iv.auswahl = sus.filter((s) => ['erhoeht', 'dringend'].includes(S.lernstand(s).stufe)).map((s) => s.id);
    else iv.auswahl = sus.map((s) => s.id);
    if (q.nur && iv.thema) iv.schritt = 3;
  }
  zeichneIV();
}

function zeichneIV() {
  const d = S.state();
  const k = S.klasse(iv.klasseId);
  const sus = S.schuelerDer(iv.klasseId);
  const schritte = ['Klasse & Thema', 'Auswahl', 'Einstellungen', 'Erzeugen'];
  let inhalt = '';

  if (iv.schritt === 1) {
    const lfs = k?.lernfelder || [];
    const themen = lfs.find((l) => l.code === iv.lf)?.themen || [];
    inhalt = `
      ${feld('Klasse', 'klasseId', { wert: iv.klasseId, optionen: d.klassen.map((x) => [x.id, `${x.code} · ${x.typ}`]) })}
      ${feld('Lernfeld', 'lf', { wert: iv.lf, optionen: lfs.length ? lfs.map((l) => [l.code, `${l.code}${l.name ? ' – ' + l.name : ''}`]) : [['', 'kein Lernfeld hinterlegt']] })}
      ${feld('Thema', 'thema', { wert: iv.thema, platz: 'z. B. Lieferungsverzug' })}
      ${themen.length ? `<div class="chips" id="themenChips">${themen.map((t) => `<button class="chip ${t.name === iv.thema ? 'an' : ''}" data-wert="${esc(t.name)}">${esc(t.name)}</button>`).join('')}</div>` : ''}
      ${feld('Lernziel der Stunde (optional)', 'ziel', { wert: iv.ziel, zeilen: 2, platz: 'Was sollen die Lernenden danach können?' })}`;
  }

  if (iv.schritt === 2) {
    const gruppen = S.gruppenDer(iv.klasseId);
    inhalt = `
      <div class="chips" id="schnellwahl">
        <button class="chip" data-wahl="alle">Alle (${sus.length})</button>
        <button class="chip" data-wahl="foerder">Förderbedarf</button>
        <button class="chip" data-wahl="stark">Leistungsstark</button>
        ${gruppen.map((g) => `<button class="chip" data-wahl="g:${g.id}">${esc(g.name)}</button>`).join('')}
        <button class="chip" data-wahl="keine">Keine</button>
      </div>
      <p class="mini dim" style="margin:0 0 10px 4px"><b id="anzahl">${iv.auswahl.length}</b> ausgewählt – für jede Person entsteht ein eigenes Blatt.</p>
      <div id="susListe">${sus.map((s) => {
        const an = iv.auswahl.includes(s.id);
        const l = S.lernstand(s);
        return `<button class="wahl ${an ? 'an' : ''}" data-sus="${s.id}">
          <span class="txt"><b>${esc(S.anzeige(s))}</b><small>Ø ${S.note(l.schnitt)} · ${esc(s.mitarbeit || '')}${s.notizen?.length ? ` · ${s.notizen.length} Beobachtung${s.notizen.length > 1 ? 'en' : ''}` : ' · keine Beobachtung'}</small></span>
          ${l.stufe === 'dringend' ? '<span class="pille bad">dringend</span>' : l.stufe === 'erhoeht' ? '<span class="pille warn">Förderung</span>' : l.stufe === 'stark' ? '<span class="pille ok">stark</span>' : ''}
          <span class="${an ? 't-note' : 'faint'}">${icon(an ? 'checkCircle' : 'circle', 19)}</span></button>`;
      }).join('') || leer('In dieser Klasse ist noch niemand eingetragen.')}</div>`;
  }

  if (iv.schritt === 3) {
    inhalt = `
      <div class="karte" style="margin-bottom:14px">
        ${[['musterloesung', 'Musterlösung anhängen', 'Lösungen am Ende jedes Blattes'],
           ['hinweisLehrkraft', 'Hinweis für die Lehrkraft', 'kurze Begründung der Anpassung'],
           ['anonym', 'Nur Pseudonyme an die KI', 'Klarnamen bleiben auf dem Gerät']]
          .map(([n, t, u]) => `<div class="schalter"><div class="txt"><b>${t}</b><small>${u}</small></div>
            <input type="checkbox" class="kipp" name="${n}" ${iv[n] ? 'checked' : ''}></div>`).join('')}
      </div>
      ${feld('Zusätzliche Vorgabe für alle Blätter', 'zusatz', { wert: iv.zusatz, zeilen: 2, platz: 'z. B. Bezug zur Bürobedarf GmbH, Bearbeitungszeit 30 Minuten' })}
      ${box('info', 'Die App wertet Noten, Mitarbeit, Fehlzeiten und Ihre Beobachtungen aus und leitet daraus für jede Person Niveau, Umfang und Hilfen ab. Im nächsten Schritt sehen Sie die Ableitung, bevor etwas erzeugt wird.')}`;
  }

  if (iv.schritt === 4) {
    const gewaehlt = iv.auswahl.map(S.schueler).filter(Boolean);
    inhalt = `
      ${karte(`${kv('Klasse', esc(k?.code || '–'))}${kv('Lernfeld', esc(iv.lf || '–'))}${kv('Thema', esc(iv.thema || '–'))}${kv('Blätter', gewaehlt.length + '')}`)}
      <div style="margin:14px 0">${ampelBlock(gewaehlt.length ? KI.promptIndividuell(iv, gewaehlt[0]) : '')}</div>
      <div class="knopfspalte" style="margin-bottom:16px">
        ${KI.hatZugang() ? btn(`${gewaehlt.length} Blätter jetzt erzeugen`, { ton: 'violet', symbol: 'sparkles', id: 'los' }) : ''}
        ${geist('Alle Prompts kopieren', { symbol: 'copy', id: 'allePrompts' })}
        ${Object.keys(iv.ergebnisse).length ? geist('Alle Blätter als Word-Datei', { symbol: 'download', id: 'alleWord' }) : ''}
      </div>
      ${!KI.hatZugang() ? `<p class="mini faint" style="text-align:center;margin-bottom:14px;line-height:1.5">
        Ohne eigenen KI-Zugang erhalten Sie fertige Prompts.<br><b data-go="w/ki" style="color:var(--accent-text);cursor:pointer">KI-Zugang hinterlegen</b>, um direkt hier zu erzeugen.</p>` : ''}
      <div id="ivListe">${gewaehlt.map((s) => ivKarte(s)).join('') || leer('Niemand ausgewählt.')}</div>`;
  }

  screenEl().innerHTML = `
    ${nav({ titel: 'Individuelle Arbeitsblätter', unter: `Schritt ${iv.schritt} von 4 · ${schritte[iv.schritt - 1]}`, symbol: 'wand', grad: 'g-violet' })}
    <div class="schritte">${schritte.map((_, i) => `<i class="${i < iv.schritt ? 'an' : ''}"></i>`).join('')}</div>
    <div class="pad">
      ${inhalt}
      ${iv.schritt < 4 ? `<div class="knopfreihe" style="margin-top:16px">
        ${iv.schritt > 1 ? geist('Zurück', { symbol: 'left', id: 'zurueckS' }) : ''}
        ${btn('Weiter', { ton: 'violet', symbol: 'arrowRight', id: 'weiter' })}</div>`
        : `<div style="margin-top:16px">${geist('Zurück zur Auswahl', { symbol: 'left', id: 'zurueckS' })}</div>`}
    </div>`;

  bindeIV();
}

function ivKarte(s) {
  const a = KI.ableitung(s);
  const l = S.lernstand(s);
  const fertig = iv.ergebnisse[s.id];
  return `<div class="karte" data-karte="${s.id}" style="margin-bottom:10px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <span class="tile g-slate" style="width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">
        ${esc(S.kuerzel(s))}</span>
      <div style="flex:1;min-width:0"><b class="klein">${esc(S.anzeige(s))}</b>
        <small class="mini dim" style="display:block">Ø ${S.note(l.schnitt)} · ${esc(s.mitarbeit || '')}</small></div>
      <span class="pille ${fertig ? 'ok' : ''}" data-status="${s.id}">${fertig ? 'fertig' : 'bereit'}</span>
    </div>
    <p class="mini dim" style="line-height:1.55"><b class="t-note">Anpassung:</b> ${esc(a.niveau)} · ${esc(a.umfang)}
      ${a.schwerpunkt.length ? '<br><b class="t-note">Schwerpunkt:</b> ' + esc(a.schwerpunkt.join('; ')) : ''}
      ${a.hilfen.length ? '<br><b class="t-note">Hilfen:</b> ' + esc(a.hilfen.join('; ')) : ''}
      ${a.zusatz.length ? '<br><b class="t-note">Zusatz:</b> ' + esc(a.zusatz.join('; ')) : ''}</p>
    <div class="knopfreihe" style="margin-top:10px">
      ${geist('Prompt', { symbol: 'copy', attr: `data-prompt="${s.id}"` })}
      ${KI.hatZugang() ? geist('Erzeugen', { symbol: 'sparkles', attr: `data-einzeln="${s.id}"` }) : `<a class="btn geist" href="${KI.claudeLink(KI.promptIndividuell(iv, s))}" target="_blank" rel="noopener">${icon('external', 15)} Claude</a>`}
      ${fertig ? geist('Ansehen', { symbol: 'fileText', attr: `data-ansehen="${s.id}"` }) : ''}
    </div>
    <div data-ausgabe="${s.id}"></div>
  </div>`;
}

function bindeIV() {
  const el = screenEl();
  $('#weiter', el)?.addEventListener('click', () => {
    if (iv.schritt === 1) {
      const w = werte(el);
      Object.assign(iv, { klasseId: w.klasseId, lf: w.lf, thema: w.thema, ziel: w.ziel });
      if (!iv.thema.trim()) return toast('Bitte ein Thema angeben');
      if (!S.schuelerDer(iv.klasseId).some((s) => iv.auswahl.includes(s.id))) iv.auswahl = S.schuelerDer(iv.klasseId).map((s) => s.id);
    }
    if (iv.schritt === 2 && !iv.auswahl.length) return toast('Bitte mindestens eine Person auswählen');
    if (iv.schritt === 3) {
      const w = werte(el);
      Object.assign(iv, { musterloesung: !!w.musterloesung, hinweisLehrkraft: !!w.hinweisLehrkraft, anonym: !!w.anonym, zusatz: w.zusatz });
    }
    iv.schritt++; zeichneIV(); window.scrollTo(0, 0);
  });
  $('#zurueckS', el)?.addEventListener('click', () => { iv.schritt = Math.max(1, iv.schritt - 1); zeichneIV(); });

  $('[name=klasseId]', el)?.addEventListener('change', (e) => {
    iv.klasseId = e.target.value;
    const k = S.klasse(iv.klasseId);
    iv.lf = k?.lernfelder[0]?.code || '';
    iv.thema = k?.lernfelder[0]?.themen.find((t) => t.status === 'aktuell')?.name || k?.lernfelder[0]?.themen[0]?.name || '';
    iv.auswahl = S.schuelerDer(iv.klasseId).map((s) => s.id);
    zeichneIV();
  });
  $('[name=lf]', el)?.addEventListener('change', (e) => {
    iv.lf = e.target.value;
    const themen = S.klasse(iv.klasseId)?.lernfelder.find((l) => l.code === iv.lf)?.themen || [];
    iv.thema = themen.find((t) => t.status === 'aktuell')?.name || themen[0]?.name || '';
    zeichneIV();
  });
  $$('#themenChips .chip', el).forEach((c) => c.onclick = () => { $('[name=thema]', el).value = c.dataset.wert; iv.thema = c.dataset.wert; zeichneIV(); });

  $$('[data-sus]', el).forEach((b) => b.onclick = () => {
    const id = b.dataset.sus;
    iv.auswahl = iv.auswahl.includes(id) ? iv.auswahl.filter((x) => x !== id) : [...iv.auswahl, id];
    zeichneIV();
  });
  $$('#schnellwahl .chip', el).forEach((c) => c.onclick = () => {
    const sus = S.schuelerDer(iv.klasseId);
    const w = c.dataset.wahl;
    if (w === 'alle') iv.auswahl = sus.map((s) => s.id);
    else if (w === 'keine') iv.auswahl = [];
    else if (w === 'foerder') iv.auswahl = sus.filter((s) => ['erhoeht', 'dringend'].includes(S.lernstand(s).stufe)).map((s) => s.id);
    else if (w === 'stark') iv.auswahl = sus.filter((s) => S.lernstand(s).stufe === 'stark').map((s) => s.id);
    else if (w.startsWith('g:')) iv.auswahl = (S.state().gruppen.find((g) => g.id === w.slice(2))?.schuelerIds || []).slice();
    zeichneIV();
  });

  $$('[data-prompt]', el).forEach((b) => b.onclick = () => {
    const s = S.schueler(b.dataset.prompt);
    kopieren(KI.promptIndividuell(iv, s));
  });
  $$('[data-einzeln]', el).forEach((b) => b.onclick = () => erzeuge([b.dataset.einzeln]));
  $$('[data-ansehen]', el).forEach((b) => b.onclick = () => zeigeBlatt(b.dataset.ansehen));
  $('#los', el)?.addEventListener('click', () => erzeuge(iv.auswahl));
  $('#allePrompts', el)?.addEventListener('click', () => {
    const text = iv.auswahl.map(S.schueler).filter(Boolean)
      .map((s) => `----- ${S.anzeige(s)} -----\n${KI.promptIndividuell(iv, s)}`).join('\n\n\n');
    kopieren(text);
  });
  $('#alleWord', el)?.addEventListener('click', alleAlsWord);
}

async function erzeuge(ids) {
  if (iv.laeuft) return;
  iv.laeuft = true;
  const knopf = $('#los');
  for (let i = 0; i < ids.length; i++) {
    const s = S.schueler(ids[i]);
    if (!s) continue;
    const status = $(`[data-status="${s.id}"]`);
    const ausgabe = $(`[data-ausgabe="${s.id}"]`);
    if (status) { status.textContent = 'läuft …'; status.className = 'pille warn'; }
    if (knopf) { knopf.disabled = true; knopf.innerHTML = `${icon('sync', 17, 'class="dreh"')}Blatt ${i + 1} von ${ids.length} …`; }
    try {
      const prompt = KI.promptIndividuell(iv, s);
      const text = await KI.anfragen(prompt, { system: KI.system(), maxTokens: 4000 });
      iv.ergebnisse[s.id] = text;
      archivieren({ art: 'Individuell', titel: `${iv.thema} – ${s.pseudonym}`, klasseId: iv.klasseId, lf: iv.lf, thema: iv.thema, schuelerId: s.id, prompt, ergebnis: text });
      if (status) { status.textContent = 'fertig'; status.className = 'pille ok'; }
      if (ausgabe) ausgabe.innerHTML = `<pre class="prompt" style="margin-top:10px;max-height:260px;color:var(--text)">${esc(text.slice(0, 1600))}${text.length > 1600 ? '\n…' : ''}</pre>`;
    } catch (e) {
      if (status) { status.textContent = 'Fehler'; status.className = 'pille bad'; }
      if (ausgabe) ausgabe.innerHTML = `<div class="box bad" style="margin-top:10px">${icon('warn', 16)}<div><p>${esc(e.message)}</p></div></div>`;
      break;
    }
  }
  iv.laeuft = false;
  S.protokoll('Individuelle Arbeitsblätter erzeugt', `${ids.length} Blätter · ${iv.thema}`);
  S.merken('Arbeitsblatt-Präferenz', `Individuelle Blätter zu „${iv.thema}" (${iv.lf}) für ${S.klasse(iv.klasseId)?.code}.`);
  zeichneIV();
  toast('Fertig – Blätter im Archiv gespeichert');
}

function zeigeBlatt(id) {
  const s = S.schueler(id);
  const text = iv.ergebnisse[id] || '';
  sheet(`${iv.thema}`, S.anzeige(s), `
    <pre class="prompt" style="max-height:60vh;color:var(--text)">${esc(text)}</pre>
    <div class="knopfspalte" style="margin-top:12px">
      ${btn('Als Word-Datei', { ton: 'violet', symbol: 'download', id: 'w' })}
      ${geist('Kopieren', { symbol: 'copy', id: 'c' })}
    </div>`, (el) => {
    el.querySelector('#w').onclick = () => alsWord(`${dateiName(iv.thema + '-' + s.pseudonym)}.doc`, iv.thema, `<h1>${esc(iv.thema)}</h1><p><b>${esc(S.anzeige(s))}</b></p>${textHtml(text)}`);
    el.querySelector('#c').onclick = () => kopieren(text);
  });
}

function alleAlsWord() {
  const teile = Object.entries(iv.ergebnisse).map(([id, text], i) => {
    const s = S.schueler(id);
    return `${i ? '<div style="page-break-before:always"></div>' : ''}
      <h1>${esc(iv.thema)}</h1><p><b>${esc(S.anzeige(s))}</b> · ${esc(S.klasse(iv.klasseId)?.code || '')} · ${esc(iv.lf)}</p>${textHtml(text)}`;
  });
  if (!teile.length) return toast('Noch nichts erzeugt');
  alsWord(`individuelle-blaetter-${dateiName(iv.thema)}.doc`, iv.thema, teile.join(''));
}

/* ============================================================
 * 9-Schritt-Assistent (Material für die ganze Klasse)
 * ============================================================ */

let as = null;
const SCHRITTE = ['Klasse', 'Lernfeld', 'Thema', 'Zielniveau', 'Materialtyp', 'KI-Modell', 'Vorlage', 'Einstellungen', 'Vorschau'];

export function assistent(_a, q = {}) {
  const d = S.state();
  if (!d.klassen.length) return ohneKlasse('assistent');
  if (!as || q.klasse || q.typ) {
    const kId = q.klasse || d.klassen[0]?.id || '';
    const k = S.klasse(kId);
    as = {
      schritt: q.thema ? 4 : 1, klasseId: kId, lf: q.lf || k?.lernfelder[0]?.code || '',
      thema: q.thema ? decodeURIComponent(q.thema) : '', niveau: q.niveau ? decodeURIComponent(q.niveau) : 'Wiederholung',
      typ: q.typ || 'Arbeitsblatt', modell: `${d.profil.ki.anbieter} · ${d.profil.ki.modell}`,
      vorlage: 'Kopfzeile der Schule verwenden', umfang: 'mittel', sprache: 'normal', zusatz: '',
      optionen: ['Operatoren einbauen', 'Musterlösung erstellen', 'Quellenfeld einfügen'],
    };
  }
  zeichneAS();
}

function zeichneAS() {
  const d = S.state();
  const k = S.klasse(as.klasseId);
  const s = as.schritt;
  let inhalt = '';

  if (s === 1) inhalt = d.klassen.map((x) => `<button class="wahl ${as.klasseId === x.id ? 'an' : ''}" data-wert="${x.id}">
    <span class="txt"><b>${esc(x.code)}</b><small>${x.typ === 'BM' ? 'Büromanagement' : 'Öffentlicher Dienst'} · ${x.jahr}. Jahr</small></span>
    <span class="${as.klasseId === x.id ? 't-note' : 'faint'}">${icon(as.klasseId === x.id ? 'checkCircle' : 'circle', 19)}</span></button>`).join('') || leer('Keine Klasse angelegt.');

  if (s === 2) inhalt = (k?.lernfelder || []).map((l) => `<button class="wahl ${as.lf === l.code ? 'an' : ''}" data-wert="${l.code}">
    <span class="txt"><b>${esc(l.code)}${l.name ? ' – ' + esc(l.name) : ''}</b></span>
    <span class="${as.lf === l.code ? 't-note' : 'faint'}">${icon(as.lf === l.code ? 'checkCircle' : 'circle', 19)}</span></button>`).join('') || leer('Für diese Klasse sind keine Lernfelder hinterlegt.');

  if (s === 3) {
    const themen = k?.lernfelder.find((l) => l.code === as.lf)?.themen || [];
    inhalt = feld('Thema', 'thema', { wert: as.thema, platz: 'z. B. Lieferungsverzug' })
      + (themen.length ? `<div class="chips" id="tc">${themen.map((t) => `<button class="chip ${t.name === as.thema ? 'an' : ''}" data-wert="${esc(t.name)}">${esc(t.name)}</button>`).join('')}</div>` : '');
  }
  if (s === 4) inhalt = S.NIVEAUS.map((n) => `<button class="wahl ${as.niveau === n ? 'an' : ''}" data-wert="${esc(n)}"><span class="txt"><b>${esc(n)}</b></span>
    <span class="${as.niveau === n ? 't-note' : 'faint'}">${icon(as.niveau === n ? 'checkCircle' : 'circle', 19)}</span></button>`).join('');
  if (s === 5) inhalt = S.MATERIALTYPEN.map((t) => `<button class="wahl ${as.typ === t ? 'an' : ''}" data-wert="${esc(t)}"><span class="txt"><b>${esc(t)}</b></span>
    <span class="${as.typ === t ? 't-note' : 'faint'}">${icon(as.typ === t ? 'checkCircle' : 'circle', 19)}</span></button>`).join('');
  if (s === 6) inhalt = `${karte(`${kv('Anbieter', esc(S.KI_ANBIETER.find((a) => a.id === d.profil.ki.anbieter)?.label || '–'))}${kv('Modell', esc(d.profil.ki.modell || '–'))}
      ${kv('Zugang', KI.hatZugang() ? 'hinterlegt' : 'nicht hinterlegt', KI.hatZugang() ? 't-ok' : 't-warn')}`)}
    <div class="knopfspalte" style="margin-top:12px">${geist('KI-Anbindung ändern', { symbol: 'settings', route: 'w/ki' })}</div>
    ${box('info', 'Ohne eigenen Zugang erzeugt die App einen fertigen Prompt, den Sie in Claude oder ChatGPT einfügen. Mit Zugang entsteht das Material direkt hier.')}`;
  if (s === 7) inhalt = ['Kopfzeile der Schule verwenden', 'Schlicht ohne Kopfzeile', 'Zweispaltig mit Lösungsrand', 'Eigenes Layout aus dem Gedächtnis']
    .map((v) => `<button class="wahl ${as.vorlage === v ? 'an' : ''}" data-wert="${esc(v)}"><span class="txt"><b>${esc(v)}</b></span>
      <span class="${as.vorlage === v ? 't-note' : 'faint'}">${icon(as.vorlage === v ? 'checkCircle' : 'circle', 19)}</span></button>`).join('')
    + box('info', `Aktuelles Standardlayout: ${d.profil.layout}`);
  if (s === 8) inhalt = `
    <div class="feld"><label>Umfang</label><div class="chips" data-chips="umfang">${['kurz', 'mittel', 'ausführlich'].map((u) => `<button class="chip ${as.umfang === u ? 'an' : ''}" data-wert="${u}">${u}</button>`).join('')}</div></div>
    <div class="feld"><label>Sprache</label><div class="chips" data-chips="sprache">${['einfach', 'normal', 'fachsprachlich'].map((u) => `<button class="chip ${as.sprache === u ? 'an' : ''}" data-wert="${u}">${u}</button>`).join('')}</div></div>
    <div class="feld"><label>Weitere Optionen</label>${S.AB_OPTIONEN.map((o) => `
      <button class="wahl ${as.optionen.includes(o) ? 'an' : ''}" data-opt="${esc(o)}" style="padding:11px 13px">
        <span class="txt"><b style="font-weight:500">${esc(o)}</b></span>
        <span class="${as.optionen.includes(o) ? 't-note' : 'faint'}">${icon(as.optionen.includes(o) ? 'checkCircle' : 'circle', 18)}</span></button>`).join('')}</div>
    ${feld('Zusätzliche Hinweise', 'zusatz', { wert: as.zusatz, zeilen: 2, platz: 'z. B. Bezug zur Bürobedarf GmbH' })}`;
  if (s === 9) {
    inhalt = `${karte(`${kv('Material', esc(as.typ))}${kv('Klasse', esc(k?.code || '–'))}${kv('Lernfeld', esc(as.lf || '–'))}${kv('Thema', esc(as.thema || '–'))}
      ${kv('Niveau', esc(as.niveau))}${kv('Umfang', esc(as.umfang))}${kv('Optionen', as.optionen.length + ' gewählt')}`)}
      <div id="raus" style="margin-top:14px"></div>`;
  }

  screenEl().innerHTML = `
    ${nav({ titel: as.typ + ' erstellen', unter: `Schritt ${s} von 9 · ${SCHRITTE[s - 1]}`, symbol: 'fileEdit', grad: 'g-indigo' })}
    <div class="schritte">${SCHRITTE.map((_, i) => `<i class="${i < s ? 'an' : ''}"></i>`).join('')}</div>
    <div class="pad">${inhalt}
      <div class="knopfreihe" style="margin-top:16px">
        ${s > 1 ? geist('Zurück', { symbol: 'left', id: 'zur' }) : ''}
        ${s < 9 ? btn('Weiter', { ton: 'indigo', symbol: 'arrowRight', id: 'weiter' }) : ''}
      </div>
    </div>`;

  const el = screenEl();
  $('#zur', el)?.addEventListener('click', () => { uebernehmenAS(); as.schritt--; zeichneAS(); });
  $('#weiter', el)?.addEventListener('click', () => {
    uebernehmenAS();
    if (as.schritt === 3 && !as.thema.trim()) return toast('Bitte ein Thema angeben');
    as.schritt++; zeichneAS(); window.scrollTo(0, 0);
  });
  $$('[data-wert]', el).forEach((b) => b.onclick = () => {
    const v = b.dataset.wert;
    if (s === 1) { as.klasseId = v; as.lf = S.klasse(v)?.lernfelder[0]?.code || ''; }
    if (s === 2) as.lf = v;
    if (s === 3) { as.thema = v; $('[name=thema]', el).value = v; zeichneAS(); return; }
    if (s === 4) as.niveau = v;
    if (s === 5) as.typ = v;
    if (s === 7) as.vorlage = v;
    if (s === 8) {
      const gruppe = b.closest('[data-chips]')?.dataset.chips;
      if (gruppe) { as[gruppe] = v; zeichneAS(); return; }
    }
    if (s < 9 && [1, 2, 4, 5, 7].includes(s)) { as.schritt++; zeichneAS(); window.scrollTo(0, 0); }
  });
  $$('[data-opt]', el).forEach((b) => b.onclick = () => {
    const o = b.dataset.opt;
    as.optionen = as.optionen.includes(o) ? as.optionen.filter((x) => x !== o) : [...as.optionen, o];
    zeichneAS();
  });

  if (s === 9) {
    const prompt = KI.promptArbeitsblatt(as);
    ergebnis('#raus', prompt, {
      titel: `${as.typ}: ${as.thema}`, dateiname: dateiName(`${as.typ}-${as.thema}`), prompt, maxTokens: 6000,
      archiv: { art: as.typ, klasseId: as.klasseId, lf: as.lf, thema: as.thema },
    });
    S.merken('Unterrichtspräferenz', `Zuletzt: ${k?.code || ''} · ${as.lf} · ${as.thema}`);
  }
}

function uebernehmenAS() {
  const w = werte(screenEl());
  if (w.thema !== undefined) as.thema = w.thema;
  if (w.zusatz !== undefined) as.zusatz = w.zusatz;
}
