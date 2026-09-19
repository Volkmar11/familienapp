/* Profil, Erscheinungsbild, KI-Anbindung, Daten & Austausch */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, nav, kopf, abschnitt, zeile, karte, kv, leer, box, btn, geist, feld, werte,
  sheet, zu, toast, frage, datei, bildLesen, alsWord, textHtml, logoQuelle } from './ui.js';
import * as KI from './ki.js';

export function profil() {
  const d = S.state();
  const p = d.profil;
  const anbieter = S.KI_ANBIETER.find((a) => a.id === p.ki.anbieter)?.label || '–';
  screenEl().innerHTML = `
    ${kopf({ ueber: p.schule || 'Berufliche Schule', titel: 'Profil' })}
    <div class="pad">
      <div class="karte" style="display:flex;align-items:center;gap:14px;margin-bottom:18px;background:linear-gradient(135deg,rgba(255,255,255,.08),rgba(255,255,255,.02))">
        <div style="width:60px;height:60px;border-radius:18px;background:var(--g-amber);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
          <span class="serif" style="font-size:22px;font-weight:700;color:#fff">${esc(p.kuerzel || (p.name || '?').slice(0, 2).toUpperCase())}</span>
        </div>
        <div style="min-width:0">
          <p class="serif" style="font-size:20px;font-weight:600">${esc(p.name || 'Name eintragen')}</p>
          <p class="mini dim">${esc(p.rolle || '')}${p.schule ? ' · ' + esc(p.schule) : ''}</p>
          <p class="mini faint" style="margin-top:2px">Kürzel: ${esc(p.kuerzel || '–')} · ${d.klassen.length} Klassen</p>
        </div>
      </div>

      ${zeile({ symbol: 'palette', grad: 'g-amber', titel: 'Erscheinungsbild', unter: `${p.theme === 'hell' ? 'Hell' : 'Dunkel'} · Schullogo${p.schullogo ? ' eigenes' : ' der Schule'}`, id: 'design', extra: 'data-sheet="design"' })}
      ${zeile({ symbol: 'settings', grad: 'g-slate', titel: 'Persönliche Einstellungen', unter: 'Name, Kürzel, Rolle, Schule', extra: 'data-sheet="person"' })}
      ${zeile({ symbol: 'sparkles', grad: 'g-violet', titel: 'KI-Anbindung', unter: KI.hatZugang() ? `${anbieter} · ${p.ki.modell}` : 'Prompt-Modus – kein Schlüssel hinterlegt', route: 'w/ki' })}
      ${zeile({ symbol: 'mail', grad: 'g-amber', titel: 'Standardton für E-Mails', unter: esc(p.emailTon), extra: 'data-sheet="ton"' })}
      ${zeile({ symbol: 'fileEdit', grad: 'g-violet', titel: 'Standardlayout für Arbeitsblätter', unter: esc(p.layout.slice(0, 44)), extra: 'data-sheet="layout"' })}
      ${zeile({ symbol: 'shield', grad: 'g-emerald', titel: 'Datenschutzpräferenzen', unter: p.anonymisieren ? 'Pseudonyme aktiv' : 'Klarnamen werden übertragen', extra: 'data-sheet="ds"' })}
      ${zeile({ symbol: 'key', grad: 'g-rose', titel: 'Tresor & Pseudonyme', unter: d.tresor ? 'angelegt' : 'noch nicht angelegt', route: 'w/tresor' })}
      ${zeile({ symbol: 'brain', grad: 'g-slate', titel: 'Gedächtnis verwalten', unter: `${d.gedaechtnis.length} Einträge`, route: 'w/gedaechtnis' })}
      ${zeile({ symbol: 'sync', grad: 'g-green', titel: 'Daten & Austausch', unter: 'Sicherung, Import, Verbindungen', route: 'sync' })}
      ${zeile({ symbol: 'help', grad: 'g-indigo', titel: 'Hilfe & Support', unter: 'Fragen und Kontakt', route: 'w/hilfe' })}

      <p class="mini faint" style="text-align:center;margin-top:20px;line-height:1.6">
        LehrerAssistent · Version 2.0<br>Alle Daten bleiben auf diesem Gerät.</p>
    </div>`;

  $$('[data-sheet]').forEach((b) => b.onclick = () => ({ design: designSheet, person: personSheet, ton: tonSheet, layout: layoutSheet, ds: dsSheet })[b.dataset.sheet]());
}

function personSheet() {
  const p = S.state().profil;
  sheet('Persönliche Einstellungen', '', `
    ${feld('Name', 'name', { wert: p.name })}
    <div class="feld-2">${feld('Kürzel', 'kuerzel', { wert: p.kuerzel })}${feld('Rolle', 'rolle', { wert: p.rolle })}</div>
    ${feld('Schule', 'schule', { wert: p.schule })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => { S.aendern((d) => Object.assign(d.profil, werte(el))); zu(); profil(); toast('Gespeichert'); };
  });
}

function tonSheet() {
  const p = S.state().profil;
  sheet('Standardton für E-Mails', 'Wird bei neuen Entwürfen vorgeschlagen', `
    ${feld('Ton', 'emailTon', { wert: p.emailTon, optionen: ['sachlich & freundlich', ...S.TOENE] })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => { S.aendern((d) => { d.profil.emailTon = werte(el).emailTon; }); zu(); profil(); toast('Gespeichert'); };
  });
}

function layoutSheet() {
  const p = S.state().profil;
  sheet('Standardlayout für Arbeitsblätter', 'Wird als Gestaltungsvorgabe an das Modell übergeben', `
    ${feld('Layoutvorgabe', 'layout', { wert: p.layout, zeilen: 4 })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => { S.aendern((d) => { d.profil.layout = werte(el).layout; }); zu(); profil(); toast('Gespeichert'); };
  });
}

function dsSheet() {
  const p = S.state().profil;
  sheet('Datenschutzpräferenzen', '', `
    <div class="karte">
      <div class="schalter"><div class="txt"><b>Pseudonyme statt Klarnamen</b><small>Gilt für alle KI-Anfragen, Exporte und Listen</small></div>
      <input type="checkbox" class="kipp" name="anonymisieren" ${p.anonymisieren ? 'checked' : ''}></div>
    </div>
    ${box('info', 'Bei aktiver Einstellung erscheinen in der ganzen App Pseudonyme wie 1BM1-004. Die Klarnamen bleiben im Tresor und auf diesem Gerät.')}
    <div class="knopfspalte">${btn('Speichern', { ton: 'emerald', id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => { S.aendern((d) => { d.profil.anonymisieren = !!werte(el).anonymisieren; }); zu(); profil(); toast('Gespeichert'); };
  });
}

export function designSheet() {
  const p = S.state().profil;
  sheet('Erscheinungsbild', 'Darstellung, Schullogo und App-Symbol', `
    <div class="feld"><label>Darstellung</label>
      <div class="knopfreihe">
        ${['dunkel', 'hell'].map((m) => `<button class="btn geist ${p.theme === m ? '' : ''}" data-theme="${m}"
          style="${p.theme === m ? 'border-color:var(--accent);color:var(--accent-text)' : ''}">${icon(m === 'hell' ? 'sun' : 'moon', 16)} ${m === 'hell' ? 'Hell' : 'Dunkel'}</button>`).join('')}
      </div></div>

    <div class="feld"><label>Schullogo (Titelbild, Kopfzeile, Word-Export)</label>
      <div class="karte" style="display:flex;align-items:center;gap:12px">
        <div style="width:64px;height:48px;border-radius:10px;background:var(--card-hi);display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img src="${logoQuelle()}" alt="" style="max-width:100%;max-height:100%;object-fit:contain">
        </div>
        <div style="flex:1"><p class="mini dim">${p.schullogo ? 'Eigenes Logo hinterlegt.' : 'Eingebaut: Logo der Engelbert-Bohn-Schule. Ein eigenes Logo ersetzt es nur auf diesem Gerät.'}</p></div>
      </div>
      <div class="knopfreihe" style="margin-top:8px">
        ${geist('Eigenes Logo wählen', { symbol: 'upload', id: 'logoWahl' })}${p.schullogo ? geist('Zurücksetzen', { symbol: 'trash', id: 'logoWeg' }) : ''}
      </div>
      <input type="file" id="logoDatei" accept="image/*" hidden>
    </div>

    <div class="feld"><label>App-Symbol für den Homebildschirm</label>
      <div class="karte" style="display:flex;align-items:center;gap:12px">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--g-blue);display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img src="${p.appIcon || 'icons/icon-256.png'}" alt="" style="width:100%;height:100%;object-fit:cover">
        </div>
        <div style="flex:1"><p class="mini dim">Wird beim nächsten Hinzufügen zum Homebildschirm verwendet.</p></div>
      </div>
      <div class="knopfreihe" style="margin-top:8px">
        ${geist('Symbol wählen', { symbol: 'upload', id: 'iconWahl' })}${p.appIcon ? geist('Entfernen', { symbol: 'trash', id: 'iconWeg' }) : ''}
      </div>
      <input type="file" id="iconDatei" accept="image/*" hidden>
    </div>
    ${box('info', 'Ein hier hinterlegtes Symbol gilt nur auf diesem Gerät. Damit es für alle gilt, kann es fest in die App eingebaut werden.')}`, (el) => {
    el.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => {
      S.aendern((d) => { d.profil.theme = b.dataset.theme; });
      document.documentElement.dataset.theme = b.dataset.theme;
      zu(); profil();
    });
    const laden = async (input, feldname, kante) => {
      const f = input.files[0]; if (!f) return;
      try {
        const bild = await bildLesen(f, kante);
        S.aendern((d) => { d.profil[feldname] = bild; });
        zu(); profil(); toast('Gespeichert');
      } catch (e) { toast(e.message); }
    };
    el.querySelector('#logoWahl').onclick = () => el.querySelector('#logoDatei').click();
    el.querySelector('#logoDatei').onchange = (e) => laden(e.target, 'schullogo', 520);
    el.querySelector('#iconWahl').onclick = () => el.querySelector('#iconDatei').click();
    el.querySelector('#iconDatei').onchange = (e) => laden(e.target, 'appIcon', 512);
    el.querySelector('#logoWeg')?.addEventListener('click', () => { S.aendern((d) => { d.profil.schullogo = null; }); zu(); profil(); });
    el.querySelector('#iconWeg')?.addEventListener('click', () => { S.aendern((d) => { d.profil.appIcon = null; }); zu(); profil(); });
  });
}

/* ---------- KI-Anbindung ---------- */
export function kiSeite() {
  const p = S.state().profil;
  const a = S.KI_ANBIETER.find((x) => x.id === p.ki.anbieter) || S.KI_ANBIETER[0];
  screenEl().innerHTML = `
    ${nav({ titel: 'KI-Anbindung', unter: KI.hatZugang() ? 'Direktes Erzeugen aktiv' : 'Prompt-Modus', symbol: 'sparkles', grad: 'g-violet' })}
    <div class="pad">
      ${box(KI.hatZugang() ? 'ok' : 'info', KI.hatZugang()
        ? 'Anfragen laufen direkt von diesem Gerät zum Anbieter. Schlüssel und Daten werden nicht über einen Server geleitet.'
        : 'Ohne Schlüssel erzeugt die App fertige Prompts zum Kopieren oder zum Öffnen in Claude bzw. ChatGPT. Beide Wege stehen immer zur Verfügung.',
        KI.hatZugang() ? 'Zugang hinterlegt' : 'Kein Zugang hinterlegt')}

      ${feld('Anbieter', 'anbieter', { wert: p.ki.anbieter, optionen: S.KI_ANBIETER.map((x) => [x.id, x.label]) })}
      ${a.modelle.length ? feld('Modell', 'modell', { wert: p.ki.modell, optionen: [...new Set([...a.modelle, p.ki.modell].filter(Boolean))] })
        : feld('Modellname', 'modell', { wert: p.ki.modell, platz: 'z. B. llama3.1:8b' })}
      ${p.ki.anbieter === 'kompatibel' ? feld('Server-Adresse', 'basisUrl', { wert: p.ki.basisUrl, platz: 'https://ki.meine-schule.de/v1',
        hinweis: 'OpenAI-kompatible Schnittstelle, z. B. ein schuleigener Server, Ollama oder LM Studio.' }) : ''}
      ${feld('API-Schlüssel', 'key', { typ: 'password', wert: p.ki.key, platz: p.ki.anbieter === 'anthropic' ? 'sk-ant-…' : 'sk-…',
        hinweis: 'Wird ausschließlich im Speicher dieses Geräts abgelegt und nur an den gewählten Anbieter gesendet.' })}

      <div class="knopfspalte">
        ${btn('Speichern', { ton: 'violet', symbol: 'check', id: 'speichern' })}
        ${geist('Verbindung testen', { symbol: 'sparkles', id: 'test' })}
        ${p.ki.key ? geist('Schlüssel entfernen', { symbol: 'trash', id: 'weg' }) : ''}
      </div>
      <div id="test-raus" style="margin-top:12px"></div>

      ${abschnitt('Womit die App arbeitet', karte([
        ['Claude (Anthropic)', 'Schlüssel unter console.anthropic.com anlegen.'],
        ['ChatGPT (OpenAI)', 'Schlüssel unter platform.openai.com anlegen.'],
        ['Schuleigenes Modell', 'Jede OpenAI-kompatible Adresse, auch im Schulnetz.'],
        ['Ohne Zugang', 'Prompt kopieren und im gewohnten Fenster einfügen.'],
      ].map(([t, u]) => kv(t, esc(u))).join('')))}
      ${box('warn', 'Bei Cloud-Anbietern verlässt der Prompt Ihr Gerät. Die Datenschutz-Ampel prüft vorher auf Personenbezug; mit aktiver Pseudonymisierung werden keine Klarnamen übertragen.')}
    </div>`;

  $('[name=anbieter]').onchange = (e) => {
    const neu = S.KI_ANBIETER.find((x) => x.id === e.target.value);
    S.aendern((d) => { d.profil.ki.anbieter = e.target.value; d.profil.ki.modell = neu.modelle[0] || d.profil.ki.modell; });
    kiSeite();
  };
  $('#speichern').onclick = () => {
    const w = werte(screenEl());
    S.aendern((d) => Object.assign(d.profil.ki, { anbieter: w.anbieter, modell: w.modell, key: (w.key || '').trim(), basisUrl: (w.basisUrl || '').trim() }));
    toast('Gespeichert'); kiSeite();
  };
  $('#weg')?.addEventListener('click', () => { S.aendern((d) => { d.profil.ki.key = ''; }); kiSeite(); toast('Schlüssel entfernt'); });
  $('#test').onclick = async () => {
    const w = werte(screenEl());
    S.aendern((d) => Object.assign(d.profil.ki, { anbieter: w.anbieter, modell: w.modell, key: (w.key || '').trim(), basisUrl: (w.basisUrl || '').trim() }));
    const raus = $('#test-raus');
    raus.innerHTML = box('info', 'Test läuft …');
    try {
      const antwort = await KI.anfragen('Antworte ausschließlich mit dem Wort: bereit', { maxTokens: 20 });
      raus.innerHTML = box('ok', `Antwort des Modells: „${antwort.slice(0, 60)}"`, 'Verbindung steht');
    } catch (e) { raus.innerHTML = box('bad', e.message, 'Verbindung fehlgeschlagen'); }
  };
}

/* ---------- Daten & Austausch ---------- */
export function sync() {
  const d = S.state();
  const groesse = Math.round((JSON.stringify(d).length / 1024) * 10) / 10;
  screenEl().innerHTML = `
    ${kopf({ ueber: 'Alles bleibt auf diesem Gerät', titel: 'Daten & Austausch' })}
    <div class="pad">
      ${abschnitt('Bestand', karte([
        ['Klassen', d.klassen.length], ['Lernende', d.schueler.length], ['Gruppen', d.gruppen.length],
        ['Unterrichtsstunden', d.stunden.length], ['Termine', d.termine.length], ['Aufgaben', d.aufgaben.length],
        ['Notizen', d.notizen.length], ['Materialien', d.materialien.length],
      ].map(([t, n]) => kv(t, `<span class="pille">${n}</span>`)).join('') + kv('Belegter Speicher', `<span class="pille note">${groesse} KB</span>`)))}

      ${abschnitt('Sicherung', `
        ${zeile({ symbol: 'download', grad: 'g-blue', titel: 'Sicherung herunterladen', unter: 'Gesamter Bestand als JSON-Datei', chev: false, extra: 'id="export"' })}
        ${zeile({ symbol: 'upload', grad: 'g-blue', titel: 'Sicherung einspielen', unter: 'Ersetzt den aktuellen Bestand', chev: false, extra: 'id="import"' })}
        ${zeile({ symbol: 'fileText', grad: 'g-violet', titel: 'Materialarchiv exportieren', unter: `${d.materialien.length} Materialien als Word-Datei`, chev: false, extra: 'id="archiv"' })}
        <input type="file" id="datei" accept="application/json,.json" hidden>`)}

      ${abschnitt('Verbindungen', karte(`
        ${kv('SchülerAssistent (S+)', '<span class="pille">geplant</span>')}
        ${kv('WebUntis', '<span class="pille note">über .ics-Import</span>')}
        ${kv('Moodle / Schulmail', '<span class="pille">über Export</span>')}
        ${kv('KI-Anbindung', KI.hatZugang() ? '<span class="pille ok">aktiv</span>' : '<span class="pille warn">Prompt-Modus</span>')}`))}

      ${abschnitt('Auf dem iPhone installieren', karte(`<p class="mini dim" style="line-height:1.6">
        Safari öffnen → Teilen-Symbol → <b>Zum Home-Bildschirm</b>. Danach startet LehrerAssistent wie eine App,
        mit eigenem Symbol und ohne Safari-Leiste – auch ohne Internet.</p>`))}

      ${abschnitt('Zum Ausprobieren', `
        ${zeile({ symbol: 'sparkles', grad: 'g-violet', titel: 'Beispielklasse laden', unter: 'vier erfundene Profile, um die individuellen Blätter zu testen', chev: false, extra: 'id="demo"' })}
        ${zeile({ symbol: 'settings', grad: 'g-slate', titel: 'Einrichtung erneut starten', unter: 'Grunddaten, erste Klasse, Datenschutz', chev: false, extra: 'id="neuEinrichten"' })}
        ${zeile({ symbol: 'trash', grad: 'g-rose', titel: 'Alles löschen', unter: 'setzt die App auf den Auslieferungszustand zurück', chev: false, extra: 'id="leer"' })}`)}
    </div>`;

  $('#export').onclick = () => { datei(`lehrerassistent-sicherung-${S.heute()}.json`, JSON.stringify(S.state(), null, 2), 'application/json'); S.protokoll('Sicherung erstellt'); };
  $('#import').onclick = () => $('#datei').click();
  $('#datei').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const neu = JSON.parse(await f.text());
      if (!neu || !neu.profil) throw new Error('kein gültiges Format');
      if (!await frage('Sicherung einspielen?', 'Der aktuelle Bestand auf diesem Gerät wird ersetzt.', 'Ersetzen')) return;
      S.aendern((dd) => { Object.keys(neu).forEach((k) => { dd[k] = neu[k]; }); });
      document.documentElement.dataset.theme = S.state().profil.theme || 'dunkel';
      toast('Sicherung eingespielt'); location.hash = '#/start';
    } catch (err) { toast('Datei konnte nicht gelesen werden: ' + err.message); }
  };
  $('#archiv').onclick = () => {
    const m = S.state().materialien.filter((x) => x.ergebnis);
    if (!m.length) return toast('Noch keine fertigen Materialien');
    alsWord(`materialarchiv-${S.heute()}.doc`, 'Materialarchiv',
      m.map((x, i) => `${i ? '<div style="page-break-before:always"></div>' : ''}<h1>${esc(x.titel)}</h1><p>${esc(x.art || '')} · ${S.fmtDatum(x.datum)}</p>${textHtml(x.ergebnis)}`).join(''));
  };
  $('#demo').onclick = async () => {
    if (!await frage('Beispielklasse laden?', 'Es entsteht die Klasse BSP1 mit vier erfundenen Profilen – zusätzlich zu Ihren eigenen Daten. Sie lässt sich jederzeit wieder löschen.', 'Laden')) return;
    S.beispieleLaden(); location.hash = '#/klassen'; toast('Beispielklasse BSP1 angelegt');
  };
  $('#neuEinrichten').onclick = () => { S.aendern((d) => { d.profil.eingerichtet = false; }); location.hash = '#/einrichten'; };
  $('#leer').onclick = async () => {
    if (!await frage('Wirklich alles löschen?', 'Klassen, Lernende, Notizen und Materialien werden entfernt und die Einrichtung startet neu. Erstellen Sie vorher eine Sicherung.', 'Alles löschen')) return;
    S.zuruecksetzen(); location.hash = '#/einrichten'; toast('Alles gelöscht');
  };
}
