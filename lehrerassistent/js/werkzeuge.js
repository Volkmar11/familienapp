/* Die zehn Werkzeuge des LehrerAssistenten */

import * as S from './state.js';
import { $, $$, esc, sheet, schliessen, toast, feld, werte, frage, kopieren, herunterladen, alsWord, textZuHtml } from './ui.js';
import * as KI from './ki.js';
import * as DS from './dsgvo.js';
import * as Tresor from './vault.js';
import { gehe } from './router.js';

const view = () => $('#view');

export const WERKZEUGE = [
  { id: 'organisation', icon: '🗂️', kurz: 'Organisation', titel: 'Organisationsassistent', grad: 'grad-blue' },
  { id: 'notizen', icon: '📝', kurz: 'Notizen', titel: 'Unterrichtsnotizen', grad: 'grad-amber' },
  { id: 'material', icon: '📄', kurz: 'Material', titel: 'Individuelle Materialien', grad: 'grad-violet' },
  { id: 'analyse', icon: '📊', kurz: 'Analysen', titel: 'Schüleranalysen', grad: 'grad-teal' },
  { id: 'mail', icon: '✉️', kurz: 'E-Mails', titel: 'Berufliche E-Mails', grad: 'grad-sky' },
  { id: 'dsgvo', icon: '🛡️', kurz: 'Datenschutz', titel: 'Datenschutz-Ampel', grad: 'grad-green' },
  { id: 'tresor', icon: '🔐', kurz: 'Tresor', titel: 'Lokaler Tresor', grad: 'grad-rose' },
  { id: 'kalender', icon: '📅', kurz: 'Kalender', titel: 'Stundenplan & Termine', grad: 'grad-blue' },
  { id: 'hinweise', icon: '🔔', kurz: 'Hinweise', titel: 'Benachrichtigungen', grad: 'grad-amber' },
  { id: 'gedaechtnis', icon: '🧠', kurz: 'Gedächtnis', titel: 'Gedächtnis', grad: 'grad-slate' },
];

export function werkzeug(id) {
  const w = WERKZEUGE.find((x) => x.id === id);
  if (!w) return gehe('start');
  window.scrollTo(0, 0);
  ({ organisation, notizen, material, analyse, mail, dsgvo, tresor, kalender, hinweise, gedaechtnis })[id]();
}

function kopf(id, unterzeile) {
  const w = WERKZEUGE.find((x) => x.id === id);
  return `<div class="row" style="margin-bottom:14px">
    <div class="ic ${w.grad}" style="width:44px;height:44px;border-radius:14px;font-size:1.25rem">${w.icon}</div>
    <div class="txt"><div class="page-title" style="font-size:1.32rem;margin:0">${esc(w.titel)}</div>
    <small class="muted">${esc(unterzeile)}</small></div></div>`;
}

/* Gemeinsamer Ergebnisbereich fuer KI-Prompts */
function promptBlock(prompt, { dateiname = 'material', titel = 'KI-Ausgabe', beimSpeichern = null } = {}) {
  const p = DS.pruefen(prompt);
  const warnen = (S.state().profil.warnAbStufe === 'gelb' && p.stufe !== 'gruen') || p.stufe === 'rot';
  return `<div id="ampelBlock" style="margin:14px 0">${DS.ampelHtml(p)}</div>
    ${warnen ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" id="anon">🔒 Text anonymisieren</button></div>' : ''}
    <div class="section-h" style="margin-top:16px">Fertiger Prompt</div>
    <pre class="prompt" id="promptText">${esc(prompt)}</pre>
    <div class="btn-row">
      <button class="btn btn-amber" id="kopieren">📋 Prompt kopieren</button>
      <a class="btn btn-ghost" id="claude" href="${KI.claudeLink(prompt)}" target="_blank" rel="noopener">➚ In Claude öffnen</a>
      <a class="btn btn-ghost" id="gpt" href="${KI.chatgptLink(prompt)}" target="_blank" rel="noopener">➚ In ChatGPT</a>
      ${KI.hatSchluessel() ? '<button class="btn btn-blue" id="direkt">✨ Direkt erzeugen</button>' : ''}
    </div>
    <div id="kiErgebnis"></div>`;
}

function promptBlockBinden(prompt, { dateiname = 'material', titel = 'KI-Ausgabe', beimSpeichern = null } = {}) {
  let aktuell = prompt;
  const neu = (p) => {
    aktuell = p;
    $('#promptText').textContent = p;
    $('#ampelBlock').innerHTML = DS.ampelHtml(DS.pruefen(p));
    $('#claude').href = KI.claudeLink(p);
    $('#gpt').href = KI.chatgptLink(p);
  };
  $('#anon')?.addEventListener('click', () => { neu(DS.anonymisieren(aktuell)); toast('Personenbezug entfernt'); });
  $('#kopieren').onclick = () => kopieren(aktuell);
  $('#direkt')?.addEventListener('click', async () => {
    const b = $('#direkt'); b.disabled = true; b.textContent = '… wird erzeugt';
    $('#kiErgebnis').innerHTML = '<div class="card" style="margin-top:14px"><small class="muted">Die Anfrage läuft direkt von diesem Gerät zur API. Das kann einen Moment dauern.</small></div>';
    try {
      const text = await KI.anfragen(aktuell);
      $('#kiErgebnis').innerHTML = `<div class="section-h" style="margin-top:18px">Ergebnis</div>
        <pre class="prompt" id="ergText">${esc(text)}</pre>
        <div class="btn-row">
          <button class="btn btn-amber btn-sm" id="ergKopieren">📋 Kopieren</button>
          <button class="btn btn-ghost btn-sm" id="ergWord">📄 Als Word-Datei</button>
          ${beimSpeichern ? '<button class="btn btn-ghost btn-sm" id="ergSpeichern">💾 Ins Archiv</button>' : ''}
        </div>`;
      $('#ergKopieren').onclick = () => kopieren(text);
      $('#ergWord').onclick = () => alsWord(`${dateiname}.doc`, titel, textZuHtml(text));
      $('#ergSpeichern')?.addEventListener('click', () => beimSpeichern(text));
      S.protokollieren('KI-Anfrage gesendet', titel);
    } catch (e) {
      $('#kiErgebnis').innerHTML = `<div class="ampel rot" style="margin-top:14px"><div class="pt">⚠️</div><div><b>Nicht erzeugt</b><small>${esc(e.message)}</small></div></div>`;
    }
    b.disabled = false; b.textContent = '✨ Direkt erzeugen';
  });
}

/* ---------------- 1 Organisationsassistent ---------------- */

export function organisation() {
  const d = S.state();
  const offen = d.aufgaben.filter((a) => !a.erledigt).sort((a, b) => (a.prio - b.prio) || (a.faellig || 'z').localeCompare(b.faellig || 'z'));
  const fertig = d.aufgaben.filter((a) => a.erledigt).slice(-8).reverse();

  view().innerHTML = kopf('organisation', 'Der Tag, geplant in Sekunden.') + `
    <div class="btn-row" style="margin-bottom:16px">
      <button class="btn btn-amber btn-sm" id="neu">＋ Aufgabe</button>
      <button class="btn btn-ghost btn-sm" id="planen">✨ Tag planen lassen</button>
    </div>
    <div class="section">
      <div class="section-h">Offen (${offen.length})</div>
      ${offen.length ? `<div class="liste">${offen.map((a) => `<div class="item" data-edit="${a.id}">
        <button class="chk" data-fertig="${a.id}"></button>
        <div class="txt"><b>${esc(a.titel)}</b><small>${S.PRIOS[a.prio]}${a.faellig ? ` · fällig ${S.fmtKurz(a.faellig)}${S.tageBis(a.faellig) < 0 ? ' (überfällig)' : ''}` : ''}${a.klasseId ? ' · ' + esc(S.klasse(a.klasseId)?.name || '') : ''}</small></div>
        <span class="pt pt-${a.prio}"></span></div>`).join('')}</div>` : '<div class="empty">Nichts offen. 🎉</div>'}
    </div>
    ${fertig.length ? `<div class="section"><div class="section-h">Zuletzt erledigt</div>
      <div class="liste">${fertig.map((a) => `<div class="item erledigt"><button class="chk on" data-zurueck="${a.id}">✓</button>
      <div class="txt"><b>${esc(a.titel)}</b><small>${a.erledigtAm ? S.fmtKurz(a.erledigtAm) : ''}</small></div></div>`).join('')}</div></div>` : ''}`;

  $('#neu').onclick = () => aufgabeSheet();
  $$('[data-fertig]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    S.aendern((dd) => { const a = dd.aufgaben.find((x) => x.id === b.dataset.fertig); if (a) { a.erledigt = true; a.erledigtAm = S.jetzt(); } });
    organisation();
  });
  $$('[data-zurueck]').forEach((b) => b.onclick = () => {
    S.aendern((dd) => { const a = dd.aufgaben.find((x) => x.id === b.dataset.zurueck); if (a) { a.erledigt = false; delete a.erledigtAm; } });
    organisation();
  });
  $$('[data-edit]').forEach((el) => el.onclick = () => aufgabeSheet(el.dataset.edit));
  $('#planen').onclick = () => {
    const daten = offen.map((a) => `- ${a.titel} (Priorität ${S.PRIOS[a.prio]}${a.faellig ? `, fällig ${a.faellig}` : ''})`).join('\n') || '- keine offenen Aufgaben';
    const termine = S.state().termine.filter((t) => S.tageBis(t.datum) >= 0 && S.tageBis(t.datum) <= 7)
      .map((t) => `- ${t.datum}${t.zeit ? ' ' + t.zeit : ''}: ${t.titel}`).join('\n');
    const prompt = KI.promptOrganisation({
      daten: `Offene Aufgaben:\n${daten}\n\nTermine der nächsten 7 Tage:\n${termine || '- keine'}`,
      auftrag: 'Erstelle einen realistischen Wochenplan für eine Lehrkraft mit vollem Stundendeputat. Ordne die Aufgaben Tagen und Zeitblöcken zu.',
    });
    sheet('Tagesplanung', 'Der Prompt enthält nur Aufgabentitel – keine Schülerdaten.', promptBlock(prompt, { dateiname: 'wochenplan', titel: 'Wochenplan' }),
      () => promptBlockBinden(prompt, { dateiname: 'wochenplan', titel: 'Wochenplan' }));
  };
}

function aufgabeSheet(id = null) {
  const a = id ? S.state().aufgaben.find((x) => x.id === id) : null;
  sheet(a ? 'Aufgabe bearbeiten' : 'Neue Aufgabe', '', `
    ${feld('Aufgabe', 'titel', { wert: a?.titel || '', platzhalter: 'z. B. Klassenarbeit 2BM2 korrigieren' })}
    <div class="feld-2">
      ${feld('Priorität', 'prio', { wert: a?.prio || 2, optionen: [['1', 'hoch'], ['2', 'mittel'], ['3', 'niedrig']] })}
      ${feld('Fällig am', 'faellig', { typ: 'date', wert: a?.faellig || '' })}
    </div>
    ${feld('Klasse (optional)', 'klasseId', { wert: a?.klasseId || '', optionen: [['', '– keine –'], ...S.state().klassen.map((k) => [k.id, k.name])] })}
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button>
    ${a ? '<button class="btn btn-danger" data-loesch>Löschen</button>' : ''}</div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      if (!w.titel.trim()) { toast('Bitte einen Text eingeben'); return; }
      w.prio = Number(w.prio);
      if (a) S.aendern(() => Object.assign(a, w));
      else S.aendern((d) => d.aufgaben.push({ id: S.uid(), ...w, erledigt: false, angelegt: S.jetzt() }));
      schliessen(); organisation(); toast('Gespeichert');
    };
    el.querySelector('[data-loesch]')?.addEventListener('click', () => {
      S.aendern((d) => { d.aufgaben = d.aufgaben.filter((x) => x.id !== a.id); });
      schliessen(); organisation(); toast('Gelöscht');
    });
  });
}

/* ---------------- 2 Unterrichtsnotizen ---------------- */

let notizFilter = '';

export function notizen() {
  const d = S.state();
  const liste = d.notizen
    .filter((n) => !notizFilter || n.kategorie === notizFilter)
    .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));

  view().innerHTML = kopf('notizen', 'Festhalten, was wichtig ist – auch per Stimme.') + `
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn btn-amber btn-sm" id="neu">＋ Notiz</button>
      <button class="btn btn-ghost btn-sm" id="diktat">🎤 Diktieren</button>
    </div>
    <div class="seg" style="margin-bottom:14px" id="filter">
      <button data-kat="" class="${notizFilter === '' ? 'on' : ''}">Alle</button>
      ${S.NOTIZ_KATEGORIEN.map((k) => `<button data-kat="${k}" class="${notizFilter === k ? 'on' : ''}">${k}</button>`).join('')}
    </div>
    ${liste.length ? `<div class="liste">${liste.map((n) => `<div class="item" data-n="${n.id}">
      <div class="txt"><b>${esc(n.titel || n.text.slice(0, 40))}</b>
      <small>${esc(n.kategorie || '')}${n.klasseId ? ' · ' + esc(S.klasse(n.klasseId)?.name || '') : ''}${n.lernfeld ? ' · ' + esc(n.lernfeld) : ''} · ${S.fmtKurz(n.datum)}${n.quelle === 'Diktat' ? ' · 🎤' : ''}</small></div>
      <span class="chev">›</span></div>`).join('')}</div>` : '<div class="empty">Noch keine Notizen in dieser Kategorie.</div>'}`;

  $$('#filter button').forEach((b) => b.onclick = () => { notizFilter = b.dataset.kat; notizen(); });
  $('#neu').onclick = () => notizSheet();
  $('#diktat').onclick = () => gehe('sprache');
  $$('[data-n]').forEach((el) => el.onclick = () => notizSheet(el.dataset.n));
}

function notizSheet(id = null) {
  const n = id ? S.state().notizen.find((x) => x.id === id) : null;
  const d = S.state();
  sheet(n ? 'Notiz' : 'Neue Notiz', n ? S.fmtDatum(n.datum) : '', `
    ${feld('Titel', 'titel', { wert: n?.titel || '' })}
    ${feld('Text', 'text', { wert: n?.text || '', zeilen: 5 })}
    <div class="feld-2">
      ${feld('Kategorie', 'kategorie', { wert: n?.kategorie || 'Unterricht', optionen: S.NOTIZ_KATEGORIEN })}
      ${feld('Klasse', 'klasseId', { wert: n?.klasseId || '', optionen: [['', '– keine –'], ...d.klassen.map((k) => [k.id, k.name])] })}
    </div>
    ${feld('Lernfeld (optional)', 'lernfeld', { wert: n?.lernfeld || '', platzhalter: 'z. B. LF4' })}
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button>
      ${n ? '<button class="btn btn-ghost" data-kopie>📋 Kopieren</button><button class="btn btn-danger" data-loesch>Löschen</button>' : ''}</div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      if (!w.text.trim() && !w.titel.trim()) { toast('Bitte etwas eintragen'); return; }
      if (n) S.aendern(() => Object.assign(n, w));
      else S.aendern((dd) => dd.notizen.push({ id: S.uid(), ...w, datum: S.heute(), quelle: 'Text' }));
      S.aendern((dd) => { dd.gedaechtnis.notizen = (dd.gedaechtnis.notizen || 0) + 1; });
      schliessen(); notizen(); toast('Gespeichert');
    };
    el.querySelector('[data-kopie]')?.addEventListener('click', () => kopieren(`${n.titel}\n\n${n.text}`));
    el.querySelector('[data-loesch]')?.addEventListener('click', () => {
      S.aendern((dd) => { dd.notizen = dd.notizen.filter((x) => x.id !== n.id); });
      schliessen(); notizen(); toast('Gelöscht');
    });
  });
}

/* ---------------- 3 Individuelle Materialien (9 Schritte) ---------------- */

let mat = null;
const SCHRITTE = ['Klasse', 'Lernfeld', 'Thema', 'Niveau', 'Materialtyp', 'KI-Modell', 'Layout', 'Einstellungen', 'Vorschau'];

export function material() {
  const d = S.state();
  view().innerHTML = kopf('material', 'Arbeitsblätter im 9-Schritt-Assistenten.') + `
    <div class="btn-row" style="margin-bottom:16px"><button class="btn btn-amber btn-block" id="neu">✨ Neues Material erstellen</button></div>
    <div class="section">
      <div class="section-h">Archiv (${d.materialien.length})</div>
      ${d.materialien.length ? `<div class="liste">${[...d.materialien].reverse().map((m) => `<div class="item" data-m="${m.id}">
        <div class="ic grad-violet" style="width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center">📄</div>
        <div class="txt"><b>${esc(m.thema)}</b><small>${esc(m.typ)}${m.klasseName || m.klasseId ? ' · ' + esc(m.klasseName || S.klasse(m.klasseId)?.name || '') : ''}${m.lernfeld ? ' · ' + esc(m.lernfeld) : ''} · ${S.fmtKurz(m.datum)}</small></div>
        <span class="chev">›</span></div>`).join('')}</div>`
      : '<div class="empty">Noch kein Material erzeugt.</div>'}
    </div>`;
  $('#neu').onclick = () => { mat = neuerAuftrag(); assistent(1); };
  $$('[data-m]').forEach((el) => el.onclick = () => archivEintrag(el.dataset.m));
}

function neuerAuftrag() {
  const p = S.state().profil;
  const lieblingsKlasse = S.topWert('klassen');
  const k = S.state().klassen.find((x) => x.name === lieblingsKlasse) || S.state().klassen[0];
  return {
    klasseId: k?.id || '', lernfeld: '', thema: '', niveau: S.NIVEAUS[1],
    typ: S.topWert('materialtypen') || S.MATERIALTYPEN[0], modell: p.modell, layout: p.layout,
    optionen: { umfang: '1–2 Seiten', sprache: 'Deutsch, fachsprachlich korrekt', handlungsorientiert: true, differenzierung: false, musterloesung: true, erwartungshorizont: false, quellen: true, qr: false, dsgvo: true },
    zusatz: '',
  };
}

function assistent(schritt) {
  window.scrollTo(0, 0);
  const d = S.state();
  const k = S.klasse(mat.klasseId);
  const lf = S.lernfelderFuer(k);
  let inhalt = '';

  if (schritt === 1) {
    inhalt = d.klassen.length
      ? `<div class="liste">${d.klassen.map((x) => `<div class="item" data-w="${x.id}" ${mat.klasseId === x.id ? 'style="border-color:rgba(252,211,77,.5)"' : ''}>
          <div class="txt"><b>${esc(x.name)}</b><small>${esc(S.BILDUNGSGAENGE[x.bildungsgang]?.label || '')}</small></div>
          ${mat.klasseId === x.id ? '<span class="chip gelb">gewählt</span>' : ''}</div>`).join('')}</div>
        <div class="btn-row"><button class="btn btn-ghost btn-sm" id="ohne">ohne Klassenbezug</button></div>`
      : `<div class="empty">Noch keine Klasse angelegt.</div><div class="btn-row"><button class="btn btn-ghost" id="ohne">Ohne Klassenbezug fortfahren</button></div>`;
  } else if (schritt === 2) {
    inhalt = lf.length
      ? `<div class="liste">${lf.map((x) => `<div class="item" data-w="LF${x.nr}" ${mat.lernfeld === 'LF' + x.nr ? 'style="border-color:rgba(252,211,77,.5)"' : ''}>
          <div class="ic grad-violet" style="width:38px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:800">LF${x.nr}</div>
          <div class="txt"><b style="white-space:normal;font-weight:600;font-size:.86rem">${esc(x.titel)}</b></div></div>`).join('')}</div>`
      : '<div class="empty">Für diese Klasse sind keine Lernfelder hinterlegt.</div>';
    inhalt += `<div class="btn-row"><button class="btn btn-ghost btn-sm" id="ohne">Fach statt Lernfeld</button></div>`;
  } else if (schritt === 3) {
    inhalt = feld('Thema', 'thema', { wert: mat.thema, platzhalter: 'z. B. Lieferungsverzug – Rechte des Käufers', hint: 'Je konkreter, desto besser das Ergebnis.' })
      + feld('Zusätzliche Hinweise (optional)', 'zusatz', { wert: mat.zusatz, zeilen: 3, platzhalter: 'z. B. Bezug zum Ausbildungsbetrieb, Fallbeispiel Büromaterialbestellung' });
  } else if (schritt === 4) {
    inhalt = `<div class="liste">${S.NIVEAUS.map((n) => `<div class="item" data-w="${esc(n)}" ${mat.niveau === n ? 'style="border-color:rgba(252,211,77,.5)"' : ''}><div class="txt"><b>${esc(n)}</b></div></div>`).join('')}</div>`;
  } else if (schritt === 5) {
    inhalt = `<div class="liste">${S.MATERIALTYPEN.map((t) => `<div class="item" data-w="${esc(t)}" ${mat.typ === t ? 'style="border-color:rgba(252,211,77,.5)"' : ''}><div class="txt"><b>${esc(t)}</b></div></div>`).join('')}</div>`;
  } else if (schritt === 6) {
    inhalt = `<div class="liste">${S.MODELLE.map((m) => `<div class="item" data-w="${m.id}" ${mat.modell === m.id ? 'style="border-color:rgba(252,211,77,.5)"' : ''}>
      <div class="txt"><b>${esc(m.label)}</b><small>${m.api ? 'direkt anfragbar, wenn ein API-Schlüssel hinterlegt ist' : 'Prompt kopieren und im gewohnten Fenster einfügen'}</small></div></div>`).join('')}</div>`;
  } else if (schritt === 7) {
    inhalt = feld('Layout / Vorlage', 'layout', { wert: mat.layout, zeilen: 3, hint: 'Wird als Gestaltungsvorgabe an das Modell übergeben.' })
      + `<div class="btn-row"><button class="btn btn-ghost btn-sm" id="std">Standard aus Profil übernehmen</button></div>`;
  } else if (schritt === 8) {
    const o = mat.optionen;
    inhalt = `<div class="card">
      ${[['handlungsorientiert', 'Handlungsorientierte Lernsituation', 'Vollständige berufliche Handlung als Rahmen'],
         ['differenzierung', 'Differenzierung in 3 Niveaustufen', 'Basis, Standard, Erweiterung'],
         ['musterloesung', 'Musterlösung', 'Lösungen direkt mitliefern'],
         ['erwartungshorizont', 'Erwartungshorizont', 'Bewertungsraster mit Punkten'],
         ['quellen', 'Quellen- und Paragraphenangaben', 'z. B. §§ BGB/HGB'],
         ['qr', 'QR-Code-Feld', 'Platz für die digitale Fassung'],
         ['dsgvo', 'DSGVO-Hinweis in der Fußzeile', 'Keine personenbezogenen Daten']]
        .map(([k2, t, s]) => `<div class="schalter"><div class="txt"><b>${t}</b><small>${s}</small></div>
          <input type="checkbox" name="${k2}" ${o[k2] ? 'checked' : ''}></div>`).join('')}
    </div>
    <div class="feld-2" style="margin-top:12px">
      ${feld('Umfang', 'umfang', { wert: o.umfang, optionen: ['1 Seite', '1–2 Seiten', '2–3 Seiten', '4 Seiten und mehr'] })}
      ${feld('Sprache/Stil', 'sprache', { wert: o.sprache, optionen: ['Deutsch, fachsprachlich korrekt', 'Deutsch, einfache Sprache', 'Deutsch mit englischen Fachbegriffen'] })}
    </div>`;
  } else if (schritt === 9) {
    const prompt = bauePrompt();
    inhalt = `<div class="card" style="margin-bottom:8px">
      <div class="row"><div class="txt"><b>${esc(mat.typ)}</b><small>${esc(mat.thema || 'ohne Thema')} · ${esc(k?.name || 'ohne Klasse')}${mat.lernfeld ? ' · ' + esc(mat.lernfeld) : ''} · ${esc(mat.niveau)}</small></div></div>
    </div>` + promptBlock(prompt, { dateiname: 'material', titel: mat.thema || 'Material' });
  }

  view().innerHTML = kopf('material', `Schritt ${schritt} von 9 · ${SCHRITTE[schritt - 1]}`) + `
    <div class="steps">${SCHRITTE.map((_, i) => `<i class="${i < schritt ? 'on' : ''}"></i>`).join('')}</div>
    ${inhalt}
    <div class="btn-row">
      ${schritt > 1 ? '<button class="btn btn-ghost" id="zurueck">‹ Zurück</button>' : '<button class="btn btn-ghost" id="abbruch">Abbrechen</button>'}
      ${schritt < 9 ? '<button class="btn btn-amber" id="weiter">Weiter ›</button>' : '<button class="btn btn-ghost" id="archiv">💾 In Archiv speichern</button>'}
    </div>`;

  $('#zurueck') && ($('#zurueck').onclick = () => { uebernehmenSchritt(schritt); assistent(schritt - 1); });
  $('#abbruch') && ($('#abbruch').onclick = () => material());
  $('#weiter') && ($('#weiter').onclick = () => {
    uebernehmenSchritt(schritt);
    if (schritt === 3 && !mat.thema.trim()) { toast('Bitte ein Thema angeben'); return; }
    assistent(schritt + 1);
  });
  $('#std') && ($('#std').onclick = () => { mat.layout = S.state().profil.layout; assistent(7); });
  $('#ohne') && ($('#ohne').onclick = () => {
    if (schritt === 1) mat.klasseId = '';
    if (schritt === 2) mat.lernfeld = '';
    assistent(schritt + 1);
  });
  $$('[data-w]').forEach((el) => el.onclick = () => {
    const w = el.dataset.w;
    if (schritt === 1) mat.klasseId = w;
    if (schritt === 2) mat.lernfeld = w;
    if (schritt === 4) mat.niveau = w;
    if (schritt === 5) mat.typ = w;
    if (schritt === 6) mat.modell = w;
    assistent(schritt + 1);
  });

  if (schritt === 9) {
    const prompt = bauePrompt();
    promptBlockBinden(prompt, { dateiname: (mat.thema || 'material').replace(/[^\wäöüß-]+/gi, '-').toLowerCase(), titel: mat.thema, beimSpeichern: (text) => speichernInsArchiv(text) });
    $('#archiv').onclick = () => speichernInsArchiv('');
  }
}

function uebernehmenSchritt(schritt) {
  const w = werte(view());
  if (schritt === 3) { mat.thema = w.thema ?? mat.thema; mat.zusatz = w.zusatz ?? mat.zusatz; }
  if (schritt === 7) mat.layout = w.layout ?? mat.layout;
  if (schritt === 8) {
    ['handlungsorientiert', 'differenzierung', 'musterloesung', 'erwartungshorizont', 'quellen', 'qr', 'dsgvo'].forEach((k) => { mat.optionen[k] = !!w[k]; });
    mat.optionen.umfang = w.umfang || mat.optionen.umfang;
    mat.optionen.sprache = w.sprache || mat.optionen.sprache;
  }
}

function bauePrompt() {
  const k = S.klasse(mat.klasseId);
  const lfTitel = k ? S.lernfelderFuer(k).find((x) => `LF${x.nr}` === mat.lernfeld) : null;
  return KI.promptMaterial({
    typ: mat.typ, thema: mat.thema, niveau: mat.niveau,
    klasseLabel: k ? `${k.name} – ${S.BILDUNGSGAENGE[k.bildungsgang]?.label || ''}${k.jahrgang ? `, ${k.jahrgang}. Ausbildungsjahr` : ''}` : 'Berufsschule, kaufmännischer Bereich',
    lernfeld: mat.lernfeld ? `${mat.lernfeld}${lfTitel ? ' – ' + lfTitel.titel : ''}` : '',
    layout: mat.layout, optionen: mat.optionen, zusatz: mat.zusatz,
  });
}

function speichernInsArchiv(ergebnis) {
  const k = S.klasse(mat.klasseId);
  S.aendern((d) => d.materialien.push({
    id: S.uid(), thema: mat.thema || 'Ohne Titel', typ: mat.typ, klasseId: mat.klasseId, klasseName: k?.name || '',
    lernfeld: mat.lernfeld, niveau: mat.niveau, modell: mat.modell, layout: mat.layout,
    optionen: { ...mat.optionen }, prompt: bauePrompt(), ergebnis: ergebnis || '', datum: S.heute(),
  }));
  S.merken('materialtypen', mat.typ);
  S.merken('lernfelder', mat.lernfeld);
  if (k) S.merken('klassen', k.name);
  toast('Im Archiv gespeichert');
  material();
}

function archivEintrag(id) {
  const m = S.state().materialien.find((x) => x.id === id);
  if (!m) return;
  sheet(m.thema, `${m.typ}${m.lernfeld ? ' · ' + m.lernfeld : ''} · ${S.fmtDatum(m.datum)}`, `
    ${m.ergebnis ? `<div class="section-h">Ergebnis</div><pre class="prompt">${esc(m.ergebnis)}</pre>` : '<div class="card"><small class="muted">Für dieses Material ist nur der Auftrag gespeichert. Prompt kopieren und im KI-Fenster ausführen.</small></div>'}
    <div class="section-h" style="margin-top:14px">Prompt</div>
    <pre class="prompt">${esc(m.prompt || '')}</pre>
    <div class="btn-row">
      <button class="btn btn-amber btn-sm" data-kopieren>📋 Prompt kopieren</button>
      ${m.ergebnis ? '<button class="btn btn-ghost btn-sm" data-word>📄 Als Word-Datei</button>' : ''}
      <button class="btn btn-danger btn-sm" data-loesch>Löschen</button>
    </div>`, (el) => {
    el.querySelector('[data-kopieren]').onclick = () => kopieren(m.prompt || '');
    el.querySelector('[data-word]')?.addEventListener('click', () => alsWord(`${(m.thema || 'material').replace(/[^\wäöüß-]+/gi, '-').toLowerCase()}.doc`, m.thema, `<h1>${esc(m.thema)}</h1>${textZuHtml(m.ergebnis)}`));
    el.querySelector('[data-loesch]').onclick = () => {
      S.aendern((d) => { d.materialien = d.materialien.filter((x) => x.id !== m.id); });
      schliessen(); material(); toast('Gelöscht');
    };
  });
}

/* ---------------- 4 Schüleranalysen ---------------- */

let analyseKlasse = '';

export function analyse() {
  const d = S.state();
  if (!analyseKlasse || !S.klasse(analyseKlasse)) analyseKlasse = d.klassen[0]?.id || '';
  const k = S.klasse(analyseKlasse);
  const sus = k ? S.schuelerDerKlasse(k.id) : [];
  const alleNoten = d.noten.filter((n) => sus.some((s) => s.id === n.schuelerId));
  const gesamt = S.schnitt(alleNoten);
  const verteilung = [1, 2, 3, 4, 5, 6].map((n) => alleNoten.filter((x) => Math.round(Number(x.wert)) === n).length);
  const maxV = Math.max(1, ...verteilung);
  const foerder = sus.map((s) => ({ s, f: S.foerderbedarf(s.id) })).filter((x) => x.f.bedarf);

  view().innerHTML = kopf('analyse', 'Lernstand verstehen, Förderbedarf erkennen.') + `
    ${d.klassen.length ? `<div class="feld">${feld('Klasse', 'klasseWahl', { wert: analyseKlasse, optionen: d.klassen.map((x) => [x.id, x.name]) })}</div>` : '<div class="empty">Legen Sie zuerst eine Klasse an.</div>'}
    ${k ? `
    <div class="card">
      <div class="row"><div class="ic grad-teal">Ø</div><div class="txt"><b>${gesamt ? gesamt.toFixed(2).replace('.', ',') : '–'}</b><small>Notenschnitt der Klasse · ${alleNoten.length} Noten · ${sus.length} Lernende</small></div></div>
    </div>
    <div class="section" style="margin-top:16px">
      <div class="section-h">Notenverteilung</div>
      <div class="card">${verteilung.map((v, i) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
        <b style="width:14px;font-size:.8rem">${i + 1}</b>
        <div class="balken" style="flex:1"><i style="width:${Math.round((v / maxV) * 100)}%"></i></div>
        <small class="muted" style="width:22px;text-align:right">${v}</small></div>`).join('')}</div>
    </div>
    <div class="section">
      <div class="section-h">Förderbedarf (${foerder.length})</div>
      ${foerder.length ? `<div class="liste">${foerder.map(({ s, f }) => `<div class="item" data-s="${s.id}">
        <span class="pt pt-1"></span><div class="txt"><b>${esc(S.anzeigeName(s))}</b><small>${esc(f.gruende.join(' · '))}</small></div><span class="chev">›</span></div>`).join('')}</div>`
        : '<div class="empty">Kein Förderbedarf erkannt.</div>'}
    </div>
    <div class="section">
      <div class="section-h">Alle Lernenden</div>
      <div class="liste">${sus.map((s) => {
        const f = S.foerderbedarf(s.id);
        return `<div class="item" data-s="${s.id}"><div class="txt"><b>${esc(S.anzeigeName(s))}</b>
          <small>${esc(s.pseudonym)} · ${f.schnitt ? 'Ø ' + f.schnitt.toFixed(2).replace('.', ',') : 'keine Noten'} · ${S.notenVon(s.id).length} Noten</small></div>
          <span class="chev">›</span></div>`;
      }).join('') || '<div class="empty">Noch niemand eingetragen.</div>'}</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-amber btn-sm" id="kiAnalyse">✨ KI-Auswertung</button>
      <button class="btn btn-ghost btn-sm" id="bericht">📄 Bericht (Word)</button>
      <button class="btn btn-ghost btn-sm" id="csv">⬇ Anonymer Export (CSV)</button>
    </div>` : ''}`;

  const wahl = $('[name=klasseWahl]');
  if (wahl) wahl.onchange = (e) => { analyseKlasse = e.target.value; analyse(); };
  $$('[data-s]').forEach((el) => el.onclick = () => gehe('schueler:' + el.dataset.s));

  if (!k) return;
  $('#kiAnalyse').onclick = () => {
    const zeilen = sus.map((s) => {
      const n = S.notenVon(s.id);
      const beob = d.beobachtungen.filter((b) => b.schuelerId === s.id);
      return `- ${s.pseudonym}: Ø ${S.schnitt(n)?.toFixed(2).replace('.', ',') || '–'}; Noten: ${n.map((x) => `${x.wert}${x.lernfeld ? '(' + x.lernfeld + ')' : ''}`).join(', ') || 'keine'}; Beobachtungen: ${beob.map((b) => b.bewertung).join(', ') || 'keine'}`;
    }).join('\n');
    const prompt = KI.promptAnalyse({
      daten: `Klasse ${k.name} (${S.BILDUNGSGAENGE[k.bildungsgang]?.label || ''}), ${sus.length} Lernende, Klassenschnitt ${gesamt?.toFixed(2).replace('.', ',') || '–'}\n\n${zeilen}`,
      auftrag: 'Werte die Lerngruppe aus: Wo steht die Klasse, wer braucht Förderung, welche Maßnahmen sind im Unterricht umsetzbar? Nenne konkrete Differenzierungsideen je Lernfeld.',
    });
    sheet('KI-Auswertung', 'Nur Pseudonyme – Klarnamen bleiben auf dem Gerät.', promptBlock(prompt, { dateiname: 'analyse-' + k.name, titel: 'Analyse ' + k.name }),
      () => promptBlockBinden(prompt, { dateiname: 'analyse-' + k.name, titel: 'Analyse ' + k.name }));
  };
  $('#bericht').onclick = () => {
    const html = `<h1>Lernstandsbericht ${esc(k.name)}</h1>
      <p>Stand: ${new Date().toLocaleDateString('de-DE')} · ${sus.length} Lernende · Klassenschnitt ${gesamt ? gesamt.toFixed(2).replace('.', ',') : '–'}</p>
      <table><tr><th>Pseudonym</th><th>Name</th><th>Ø</th><th>Noten</th><th>Hinweise</th></tr>
      ${sus.map((s) => {
        const f = S.foerderbedarf(s.id);
        return `<tr><td>${esc(s.pseudonym)}</td><td>${esc(s.name || '')}</td><td>${f.schnitt ? f.schnitt.toFixed(2).replace('.', ',') : '–'}</td>
          <td>${S.notenVon(s.id).map((n) => n.wert).join(', ')}</td><td>${esc(f.gruende.join('; '))}</td></tr>`;
      }).join('')}</table>`;
    alsWord(`lernstand-${k.name.toLowerCase()}.doc`, 'Lernstandsbericht ' + k.name, html);
  };
  $('#csv').onclick = () => {
    const csv = ['Pseudonym;Schnitt;Anzahl Noten;Foerderbedarf',
      ...sus.map((s) => { const f = S.foerderbedarf(s.id); return `${s.pseudonym};${f.schnitt ? f.schnitt.toFixed(2).replace('.', ',') : ''};${S.notenVon(s.id).length};${f.bedarf ? 'ja' : 'nein'}`; })].join('\n');
    herunterladen(`analyse-${k.name.toLowerCase()}-anonym.csv`, '﻿' + csv, 'text/csv');
    S.protokollieren('Anonymer Export', k.name);
  };
}

export function elternmappe(schuelerId) {
  const d = S.state();
  const s = d.schueler.find((x) => x.id === schuelerId);
  if (!s) return;
  const k = S.klasse(s.klasseId);
  const noten = S.notenVon(s.id);
  const f = S.foerderbedarf(s.id);
  const beob = d.beobachtungen.filter((b) => b.schuelerId === s.id);
  const html = `<h1>Gesprächsmappe Elternsprechtag</h1>
    <p><b>${esc(S.anzeigeName(s))}</b>${k ? ' · Klasse ' + esc(k.name) : ''} · Stand ${new Date().toLocaleDateString('de-DE')}</p>
    <h2>Leistungsstand</h2>
    <p>Notenschnitt: <b>${f.schnitt ? f.schnitt.toFixed(2).replace('.', ',') : 'noch keine Noten'}</b></p>
    <table><tr><th>Datum</th><th>Art</th><th>Lernfeld</th><th>Note</th></tr>
    ${noten.map((n) => `<tr><td>${S.fmtKurz(n.datum)}</td><td>${esc(n.art)}</td><td>${esc(n.lernfeld || '')}</td><td>${esc(n.wert)}</td></tr>`).join('') || '<tr><td colspan="4">keine Einträge</td></tr>'}</table>
    <h2>Beobachtungen</h2>
    <ul>${beob.map((b) => `<li>${S.fmtKurz(b.datum)} – ${esc(b.text)} (${esc(b.bewertung)})</li>`).join('') || '<li>keine Einträge</li>'}</ul>
    <h2>Gesprächsnotizen</h2><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p>
    <h2>Vereinbarungen</h2><p>&nbsp;</p><p>&nbsp;</p>`;
  alsWord(`elternsprechtag-${s.pseudonym.toLowerCase()}.doc`, 'Elternsprechtag', html);
}

/* ---------------- 5 Berufliche E-Mails ---------------- */

export function mail() {
  const d = S.state();
  view().innerHTML = kopf('mail', 'Der richtige Ton – in Sekunden.') + `
    ${feld('Empfänger', 'empfaenger', { wert: '', optionen: ['Kollegin / Kollege', 'Schulleitung', 'Eltern / Erziehungsberechtigte', 'Ausbildungsbetrieb', 'gesamte Klasse', 'einzelne Schülerin / einzelner Schüler', 'Sekretariat', 'externe Stelle'] })}
    ${feld('Worum geht es?', 'inhalt', { zeilen: 4, platzhalter: 'Stichpunkte genügen: Klassenarbeit verschoben, neuer Termin 14.11., Stoff bleibt LF4' })}
    <div class="feld-2">
      ${feld('Ton', 'ton', { wert: d.profil.emailTon, optionen: S.TOENE })}
      ${feld('Länge', 'laenge', { wert: 'kurz (3–5 Sätze)', optionen: ['sehr kurz (2 Sätze)', 'kurz (3–5 Sätze)', 'ausführlich'] })}
    </div>
    <div class="card"><div class="schalter"><div class="txt"><b>Vertraulich formulieren</b><small>Keine personenbezogenen Details nennen</small></div>
      <input type="checkbox" name="vertraulich"></div></div>
    <div class="btn-row"><button class="btn btn-amber btn-block" id="erzeugen">✨ Entwurf vorbereiten</button></div>
    ${d.mails.length ? `<div class="section" style="margin-top:20px"><div class="section-h">Zuletzt verwendet</div>
      <div class="liste">${[...d.mails].reverse().slice(0, 6).map((m) => `<div class="item" data-mail="${m.id}">
        <div class="txt"><b>${esc(m.empfaenger)}</b><small>${esc((m.inhalt || '').slice(0, 60))}</small></div></div>`).join('')}</div></div>` : ''}`;

  $('#erzeugen').onclick = () => {
    const w = werte(view());
    if (!w.inhalt.trim()) { toast('Bitte den Anlass beschreiben'); return; }
    const p = S.state().profil;
    const prompt = KI.promptMail({ ...w, vertraulich: !!w.vertraulich, unterschrift: [p.name, p.kuerzel && `(${p.kuerzel})`, p.schule].filter(Boolean).join(' ') });
    S.merken('ton', w.ton);
    S.aendern((dd) => dd.mails.push({ id: S.uid(), ...w, datum: S.heute() }));
    sheet('E-Mail-Entwurf', w.empfaenger, promptBlock(prompt, { dateiname: 'email', titel: 'E-Mail' })
      + `<div class="btn-row"><a class="btn btn-ghost btn-sm" href="mailto:?body=${encodeURIComponent(w.inhalt)}">✉️ Mail-App öffnen</a></div>`,
      () => promptBlockBinden(prompt, { dateiname: 'email', titel: 'E-Mail' }));
  };
  $$('[data-mail]').forEach((el) => el.onclick = () => {
    const m = S.state().mails.find((x) => x.id === el.dataset.mail);
    if (!m) return;
    $('[name=empfaenger]').value = m.empfaenger; $('[name=inhalt]').value = m.inhalt;
    $('[name=ton]').value = m.ton; $('[name=laenge]').value = m.laenge;
    toast('Übernommen');
  });
}

/* ---------------- 6 Datenschutz-Ampel ---------------- */

export function dsgvo() {
  view().innerHTML = kopf('dsgvo', 'Grün, gelb, rot – bevor die KI startet.') + `
    ${feld('Text prüfen', 'text', { zeilen: 6, platzhalter: 'Fügen Sie hier ein, was Sie an ein KI-Modell geben möchten.' })}
    <div class="btn-row">
      <button class="btn btn-amber" id="pruefen">🛡️ Prüfen</button>
      <button class="btn btn-ghost" id="anon">🔒 Anonymisieren</button>
      <button class="btn btn-ghost" id="kopieren">📋 Kopieren</button>
    </div>
    <div id="ergebnis" style="margin-top:16px"></div>
    <div class="section" style="margin-top:22px">
      <div class="section-h">Checkliste vor jeder KI-Nutzung</div>
      <div class="card">
        ${[['Ist der Personenbezug wirklich nötig?', 'Meist genügt das Pseudonym.'],
           ['Welche Kategorie liegt vor?', 'Leistungsdaten sind sensibel, Gesundheitsdaten fallen unter Art. 9 DSGVO.'],
           ['Passt das Modell zum Schutzbedarf?', 'Für sensible Inhalte nur ein lokales oder schulisch freigegebenes Modell.'],
           ['Ist die Verarbeitung dokumentiert?', 'Die App protokolliert Ihre KI-Anfragen lokal.'],
           ['Wie lange werden Daten aufbewahrt?', 'Löschen Sie Materialien und Notizen, sobald der Zweck erfüllt ist.']]
          .map(([t, s]) => `<div class="row"><div class="ic grad-green">✓</div><div class="txt"><b style="white-space:normal">${t}</b><small>${s}</small></div></div>`).join('')}
      </div>
      <div class="tiny muted" style="margin-top:10px">Diese Hinweise ersetzen keine Rechtsberatung. Verbindlich sind die Vorgaben Ihrer Schule und der zuständigen Datenschutzaufsicht.</div>
    </div>`;

  const ta = () => $('[name=text]');
  $('#pruefen').onclick = () => { $('#ergebnis').innerHTML = DS.ampelHtml(DS.pruefen(ta().value)); };
  $('#anon').onclick = () => {
    ta().value = DS.anonymisieren(ta().value);
    $('#ergebnis').innerHTML = DS.ampelHtml(DS.pruefen(ta().value));
    toast('Personenbezug ersetzt');
  };
  $('#kopieren').onclick = () => kopieren(ta().value);
}

/* ---------------- 7 Lokaler Tresor ---------------- */

export function tresor() {
  const vorhanden = Tresor.tresorVorhanden();
  const offen = Tresor.istOffen();
  const zuordnung = offen ? Tresor.daten().zuordnung : [];

  view().innerHTML = kopf('tresor', 'Klassenlisten verschlüsselt und lokal.') + `
    <div class="ampel ${offen ? 'gelb' : 'gruen'}" style="margin-bottom:16px">
      <div class="pt">${offen ? '🔓' : '🔐'}</div>
      <div><b>${!vorhanden ? 'Noch kein Tresor angelegt' : offen ? 'Tresor ist offen' : 'Tresor ist verschlossen'}</b>
      <small>${!vorhanden ? 'Legen Sie einen Tresor an, um Klarnamen AES-256-verschlüsselt auf diesem Gerät zu speichern.'
        : offen ? 'Klarnamen sind in dieser Sitzung sichtbar. Schließen Sie den Tresor, wenn Sie fertig sind.'
        : 'Die Zuordnungstabelle ist verschlüsselt. Ohne Passphrase bleiben nur Pseudonyme lesbar.'}</small></div>
    </div>

    ${!vorhanden ? `
      ${feld('Passphrase festlegen', 'pass', { typ: 'password', hint: 'Mindestens 8 Zeichen. Die Passphrase wird nirgends gespeichert – ohne sie sind die Klarnamen nicht wiederherstellbar.' })}
      <div class="btn-row"><button class="btn btn-amber btn-block" id="anlegen">🔐 Tresor anlegen</button></div>`
    : !offen ? `
      ${feld('Passphrase', 'pass', { typ: 'password' })}
      <div class="btn-row"><button class="btn btn-amber btn-block" id="oeffnen">🔓 Tresor öffnen</button></div>`
    : `
      <div class="btn-row" style="margin-bottom:16px">
        <button class="btn btn-ghost btn-sm" id="import">⬆ Klassenliste importieren</button>
        <button class="btn btn-ghost btn-sm" id="exportAnon">⬇ Anonyme Liste</button>
        <button class="btn btn-danger btn-sm" id="schliessen">🔒 Schließen</button>
      </div>
      <input type="file" id="datei" accept=".csv,.txt,text/csv" hidden>
      <div class="section">
        <div class="section-h">Zuordnungstabelle (${zuordnung.length})</div>
        ${zuordnung.length ? `<div class="liste">${zuordnung.map((z) => `<div class="item">
          <div class="txt"><b>${esc(z.pseudonym)}</b><small>${esc(z.name)}${z.klasseId ? ' · ' + esc(S.klasse(z.klasseId)?.name || '') : ''}</small></div>
          <button class="chk" data-weg="${esc(z.pseudonym)}">✕</button></div>`).join('')}</div>`
          : '<div class="empty">Noch keine Zuordnung. Importieren Sie eine Klassenliste als CSV (Spalten: Name;Klasse).</div>'}
      </div>`}

    <div class="section" style="margin-top:20px">
      <div class="section-h">So funktioniert der Tresor</div>
      <div class="card">
        <div class="row"><div class="ic grad-rose">1</div><div class="txt"><b style="white-space:normal">Klassenliste importieren</b><small>Aus Excel als CSV exportieren, hier einlesen.</small></div></div>
        <div class="row"><div class="ic grad-rose">2</div><div class="txt"><b style="white-space:normal">Pseudonyme werden vergeben</b><small>Aus „Mara König“ wird z. B. 1BM1-004.</small></div></div>
        <div class="row"><div class="ic grad-rose">3</div><div class="txt"><b style="white-space:normal">Verschlüsselt gespeichert</b><small>AES-256-GCM, Schlüssel aus Ihrer Passphrase (PBKDF2, 250.000 Runden).</small></div></div>
        <div class="row"><div class="ic grad-rose">4</div><div class="txt"><b style="white-space:normal">KI sieht nur Pseudonyme</b><small>Die Zuordnung verlässt dieses Gerät nie.</small></div></div>
      </div>
    </div>`;

  $('#anlegen')?.addEventListener('click', async () => {
    try { await Tresor.anlegen($('[name=pass]').value); toast('Tresor angelegt'); tresor(); }
    catch (e) { toast(e.message); }
  });
  $('#oeffnen')?.addEventListener('click', async () => {
    try { await Tresor.oeffnen($('[name=pass]').value); toast('Tresor geöffnet'); tresor(); }
    catch (e) { toast(e.message); }
  });
  $('#schliessen')?.addEventListener('click', () => { Tresor.schliessen(); tresor(); toast('Tresor verschlossen'); });
  $('#import')?.addEventListener('click', () => $('#datei').click());
  $('#datei')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const eintraege = Tresor.csvLesen(await f.text());
    if (!eintraege.length) { toast('Keine Namen gefunden'); return; }
    klassenlisteUebernehmen(eintraege);
  });
  $('#exportAnon')?.addEventListener('click', () => {
    const csv = ['Pseudonym;Klasse', ...zuordnung.map((z) => `${z.pseudonym};${S.klasse(z.klasseId)?.name || ''}`)].join('\n');
    herunterladen('klassenliste-anonym.csv', '﻿' + csv, 'text/csv');
  });
  $$('[data-weg]').forEach((b) => b.onclick = async () => { await Tresor.entfernen(b.dataset.weg); tresor(); });
}

function klassenlisteUebernehmen(eintraege) {
  const d = S.state();
  sheet('Klassenliste übernehmen', `${eintraege.length} Namen erkannt`, `
    ${feld('Zielklasse', 'klasseId', { optionen: d.klassen.map((k) => [k.id, k.name]) })}
    <div class="card"><div class="schalter"><div class="txt"><b>Klarnamen auch in der App anzeigen</b>
      <small>Aus = in Listen erscheinen ausschließlich Pseudonyme. Der Klarname bleibt im Tresor.</small></div>
      <input type="checkbox" name="anzeigen"></div></div>
    <div class="card" style="margin-top:10px"><small class="muted">${esc(eintraege.slice(0, 6).map((e) => e.name).join(', '))}${eintraege.length > 6 ? ' …' : ''}</small></div>
    <div class="btn-row"><button class="btn btn-amber" data-ok>Übernehmen</button></div>`, (el) => {
    el.querySelector('[data-ok]').onclick = async () => {
      const w = werte(el);
      if (!w.klasseId) { toast('Bitte eine Klasse wählen'); return; }
      const k = S.klasse(w.klasseId);
      let n = S.schuelerDerKlasse(k.id).length;
      for (const e of eintraege) {
        n += 1;
        const pseudonym = `${k.name.replace(/\s+/g, '').toUpperCase()}-${String(n).padStart(3, '0')}`;
        S.aendern((d2) => d2.schueler.push({ id: S.uid(), klasseId: k.id, pseudonym, name: w.anzeigen ? e.name : '', angelegt: S.jetzt() }));
        await Tresor.eintragen(pseudonym, e.name, k.id);
      }
      S.protokollieren('Klassenliste importiert', `${eintraege.length} Einträge, Klasse ${k.name}`);
      schliessen(); tresor(); toast(`${eintraege.length} Einträge übernommen`);
    };
  });
}

/* ---------------- 8 Stundenplan & Termine ---------------- */

const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

export function kalender() {
  const d = S.state();
  const termine = [...d.termine].sort((a, b) => (a.datum + (a.zeit || '')).localeCompare(b.datum + (b.zeit || '')));
  const kommend = termine.filter((t) => S.tageBis(t.datum) >= 0);

  view().innerHTML = kopf('kalender', 'Der Stundenplan denkt mit.') + `
    <div class="section">
      <div class="section-h">Stundenplan <button class="act" id="planLeeren">leeren</button></div>
      <div class="plan">
        <div></div>${TAGE.map((t) => `<div class="kopf">${t}</div>`).join('')}
        ${[1, 2, 3, 4, 5, 6, 7, 8].map((std) => `<div class="std">${std}</div>` + TAGE.map((_, i) => {
          const e = d.stundenplan.find((x) => x.tag === i + 1 && x.stunde === std);
          const k = e ? S.klasse(e.klasseId) : null;
          return `<div class="zelle ${e ? 'voll' : ''}" data-zelle="${i + 1}-${std}">
            ${e ? `<b>${esc(k?.name || e.fach || '')}</b><small>${esc(e.fach || '')}${e.raum ? ' ' + esc(e.raum) : ''}</small>` : ''}</div>`;
        }).join('')).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-h">Termine (${kommend.length}) <button class="act" id="neuTermin">＋ Termin</button></div>
      ${kommend.length ? `<div class="liste">${kommend.map((t) => `<div class="item" data-t="${t.id}">
        <div class="ic grad-sky" style="width:38px;height:38px;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1">
          <b style="font-size:.7rem">${S.fmtKurz(t.datum).slice(0, 2)}</b><small style="font-size:.52rem;color:#fff">${S.fmtKurz(t.datum).slice(3, 5)}</small></div>
        <div class="txt"><b>${esc(t.titel)}</b><small>${S.fmtDatum(t.datum)}${t.zeit ? ', ' + esc(t.zeit) + ' Uhr' : ''}${t.ort ? ' · ' + esc(t.ort) : ''}</small></div>
        <span class="chev">›</span></div>`).join('')}</div>` : '<div class="empty">Keine anstehenden Termine.</div>'}
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost btn-sm" id="icsExport">⬇ .ics exportieren</button>
      <button class="btn btn-ghost btn-sm" id="icsImport">⬆ .ics importieren</button>
    </div>
    <input type="file" id="icsDatei" accept=".ics,text/calendar" hidden>
    <div class="card" style="margin-top:16px"><small class="muted">WebUntis liefert unter „Profil → Freigaben“ eine Kalenderadresse (.ics). Laden Sie die Datei herunter und importieren Sie sie hier – Vertretungen und Raumänderungen kommen so mit.</small></div>`;

  $$('[data-zelle]').forEach((el) => el.onclick = () => {
    const [tag, std] = el.dataset.zelle.split('-').map(Number);
    stundeSheet(tag, std);
  });
  $('#neuTermin').onclick = () => terminSheet();
  $$('[data-t]').forEach((el) => el.onclick = () => terminSheet(el.dataset.t));
  $('#planLeeren').onclick = async () => {
    if (!await frage('Stundenplan leeren?', 'Alle Einträge im Raster werden entfernt.', 'Leeren')) return;
    S.aendern((dd) => { dd.stundenplan = []; }); kalender();
  };
  $('#icsExport').onclick = async () => {
    const { icsBauen } = await import('./views.js');
    if (!d.termine.length) { toast('Keine Termine vorhanden'); return; }
    herunterladen(`termine-${S.heute()}.ics`, icsBauen(d.termine), 'text/calendar');
  };
  $('#icsImport').onclick = () => $('#icsDatei').click();
  $('#icsDatei').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const neu = icsLesen(await f.text());
    if (!neu.length) { toast('Keine Termine in der Datei gefunden'); return; }
    S.aendern((dd) => neu.forEach((t) => dd.termine.push({ id: S.uid(), ...t, quelle: 'ICS-Import' })));
    toast(`${neu.length} Termine importiert`); kalender();
  };
}

export function icsLesen(text) {
  const bloecke = text.split(/BEGIN:VEVENT/).slice(1);
  return bloecke.map((b) => {
    const titel = (b.match(/SUMMARY[^:]*:(.*)/) || [])[1]?.trim();
    const dt = (b.match(/DTSTART[^:]*:(\d{8})(?:T(\d{2})(\d{2}))?/) || []);
    const ort = (b.match(/LOCATION[^:]*:(.*)/) || [])[1]?.trim() || '';
    if (!titel || !dt[1]) return null;
    return { titel, datum: `${dt[1].slice(0, 4)}-${dt[1].slice(4, 6)}-${dt[1].slice(6, 8)}`, zeit: dt[2] ? `${dt[2]}:${dt[3]}` : '', ort };
  }).filter(Boolean);
}

function stundeSheet(tag, stunde) {
  const d = S.state();
  const e = d.stundenplan.find((x) => x.tag === tag && x.stunde === stunde);
  sheet(`${TAGE[tag - 1]}, ${stunde}. Stunde`, '', `
    ${feld('Klasse', 'klasseId', { wert: e?.klasseId || '', optionen: [['', '– frei –'], ...d.klassen.map((k) => [k.id, k.name])] })}
    <div class="feld-2">${feld('Fach / Lernfeld', 'fach', { wert: e?.fach || '', platzhalter: 'z. B. LF4' })}${feld('Raum', 'raum', { wert: e?.raum || '' })}</div>
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button>
      ${e ? '<button class="btn btn-danger" data-weg>Eintrag entfernen</button>' : ''}</div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      S.aendern((dd) => {
        dd.stundenplan = dd.stundenplan.filter((x) => !(x.tag === tag && x.stunde === stunde));
        if (w.klasseId || w.fach) dd.stundenplan.push({ id: S.uid(), tag, stunde, ...w });
      });
      schliessen(); kalender();
    };
    el.querySelector('[data-weg]')?.addEventListener('click', () => {
      S.aendern((dd) => { dd.stundenplan = dd.stundenplan.filter((x) => !(x.tag === tag && x.stunde === stunde)); });
      schliessen(); kalender();
    });
  });
}

function terminSheet(id = null) {
  const t = id ? S.state().termine.find((x) => x.id === id) : null;
  sheet(t ? 'Termin' : 'Neuer Termin', '', `
    ${feld('Titel', 'titel', { wert: t?.titel || '', platzhalter: 'z. B. Notenkonferenz' })}
    <div class="feld-2">${feld('Datum', 'datum', { typ: 'date', wert: t?.datum || S.heute() })}${feld('Uhrzeit', 'zeit', { typ: 'time', wert: t?.zeit || '' })}</div>
    ${feld('Ort', 'ort', { wert: t?.ort || '' })}
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button>
      ${t ? '<button class="btn btn-danger" data-weg>Löschen</button>' : ''}</div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      if (!w.titel.trim()) { toast('Bitte einen Titel angeben'); return; }
      if (t) S.aendern(() => Object.assign(t, w));
      else S.aendern((d) => d.termine.push({ id: S.uid(), ...w }));
      schliessen(); kalender(); toast('Gespeichert');
    };
    el.querySelector('[data-weg]')?.addEventListener('click', () => {
      S.aendern((d) => { d.termine = d.termine.filter((x) => x.id !== t.id); });
      schliessen(); kalender(); toast('Gelöscht');
    });
  });
}

/* ---------------- 9 Benachrichtigungen ---------------- */

export function hinweise() {
  return import('./views.js').then(({ offeneHinweise }) => {
    const h = offeneHinweise();
    view().innerHTML = kopf('hinweise', 'Nichts geht mehr unter.') + `
      ${h.length ? `<div class="liste">${h.map((x, i) => `<div class="item" data-h="${i}">
        <div class="ic ${x.grad}" style="width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center">${x.icon}</div>
        <div class="txt"><b>${esc(x.titel)}</b><small>${esc(x.text)}</small></div><span class="chev">›</span></div>`).join('')}</div>`
        : '<div class="empty">Alles erledigt – keine offenen Hinweise.</div>'}
      <div class="card" style="margin-top:18px"><small class="muted">Die Hinweise entstehen aus Ihren eigenen Einträgen: fällige Aufgaben, Termine heute und morgen sowie der Zustand des Tresors. Es werden keine Push-Nachrichten versendet.</small></div>`;
    $$('[data-h]').forEach((el) => el.onclick = () => gehe(h[el.dataset.h].route));
  });
}

/* ---------------- 10 Gedächtnis ---------------- */

export function gedaechtnis() {
  const g = S.state().gedaechtnis || {};
  const bereiche = [['klassen', 'Häufige Klassen', '👥'], ['lernfelder', 'Häufige Lernfelder', '📚'],
    ['materialtypen', 'Bevorzugte Materialtypen', '📄'], ['ton', 'Bevorzugter E-Mail-Ton', '✉️']];

  view().innerHTML = kopf('gedaechtnis', 'Lernt Ihre Arbeitsweise – nicht Ihre Schüler.') + `
    ${bereiche.map(([k, titel, ic]) => {
      const e = Object.entries(g[k] || {}).sort((a, b) => b[1] - a[1]);
      return `<div class="section"><div class="section-h">${titel}</div>
        ${e.length ? `<div class="card">${e.map(([w, n]) => `<div class="row"><div class="ic grad-slate">${ic}</div>
          <div class="txt"><b>${esc(w)}</b><small>${n}× verwendet</small></div>
          <button class="chk" data-weg="${k}|${esc(w)}">✕</button></div>`).join('')}</div>`
          : '<div class="empty">Noch nichts gelernt.</div>'}</div>`;
    }).join('')}
    <div class="card">
      <div class="row"><div class="ic grad-green">🔒</div><div class="txt"><b>Was hier nie landet</b>
      <small>Namen, Noten, Beobachtungen oder Gesundheitsangaben werden nicht ins Gedächtnis übernommen – nur Ihre Arbeitsvorlieben.</small></div></div>
    </div>
    <div class="btn-row"><button class="btn btn-danger btn-block" id="alles">Gedächtnis vollständig löschen</button></div>`;

  $$('[data-weg]').forEach((b) => b.onclick = () => {
    const [bereich, wert] = b.dataset.weg.split('|');
    S.aendern((d) => { delete d.gedaechtnis[bereich][wert]; });
    gedaechtnis();
  });
  $('#alles').onclick = async () => {
    if (!await frage('Gedächtnis löschen?', 'Alle gelernten Vorlieben werden entfernt.', 'Löschen')) return;
    S.aendern((d) => { d.gedaechtnis = { klassen: {}, lernfelder: {}, materialtypen: {}, ton: {}, layout: {}, notizen: 0 }; });
    gedaechtnis(); toast('Gedächtnis geleert');
  };
}
