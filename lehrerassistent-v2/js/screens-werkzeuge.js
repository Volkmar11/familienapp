/* Organisation, Notizen, E-Mails, Datenschutz, Tresor, Kalender, Gedächtnis */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, nav, abschnitt, zeile, karte, kv, leer, box, btn, geist, feld, werte,
  sheet, zu, toast, frage, chips, kopieren, datei, alsWord, dateiName } from './ui.js';
import { ergebnis, ampelBlock } from './generieren.js';
import * as KI from './ki.js';
import * as DS from './dsgvo.js';
import * as T from './tresor.js';
import { aufgabeSheet, terminSheet } from './screens-start.js';

/* ---------- 1 Organisationsassistent ---------- */
export function organisation() {
  const d = S.state();
  const offen = S.offeneAufgaben();
  const fertig = d.aufgaben.filter((a) => a.erledigt).slice(0, 6);
  screenEl().innerHTML = `
    ${nav({ titel: 'Organisationsassistent', unter: 'Der Tag, geplant in Minuten', symbol: 'todo', grad: 'g-blue',
      rechts: `<button class="zurueck" id="neu" aria-label="Neue Aufgabe">${icon('plus', 18)}</button>` })}
    <div class="pad">
      <div class="knopfspalte" style="margin-bottom:16px">
        ${btn('Tag planen lassen', { ton: 'blue', symbol: 'sparkles', id: 'plan' })}
      </div>
      <div id="raus"></div>
      ${abschnitt(`Offen (${offen.length})`, offen.length ? offen.map((a) => `
        <div class="zeile" data-go="aufgabe/${a.id}">
          <button class="zurueck" data-fertig="${a.id}" style="width:26px;height:26px;border-radius:8px">${icon('check', 13)}</button>
          <span class="txt"><b>${esc(a.titel)}</b><small>${esc(a.prio)}${a.faellig ? ' · fällig ' + S.fmtKurz(a.faellig) + (S.tageBis(a.faellig) < 0 ? ' (überfällig)' : '') : ''}</small></span>
          <span class="punkt ${a.prio === 'hoch' ? 'b-bad' : a.prio === 'mittel' ? 'b-warn' : 'b-note'}"></span>
        </div>`).join('') : leer('Nichts offen.'))}
      ${fertig.length ? abschnitt('Zuletzt erledigt', fertig.map((a) => zeile({ titel: a.titel, unter: 'erledigt', chev: false, id: a.id, extra: `data-auf="${a.id}"` })).join('')) : ''}
    </div>`;
  $('#neu').onclick = () => aufgabeSheet();
  $$('[data-fertig]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    S.aendern((d2) => { const a = d2.aufgaben.find((x) => x.id === b.dataset.fertig); if (a) { a.erledigt = true; a.erledigtAm = S.jetzt(); } });
    organisation(); toast('Erledigt');
  });
  $$('[data-auf]').forEach((b) => b.onclick = () => {
    S.aendern((d2) => { const a = d2.aufgaben.find((x) => x.id === b.dataset.auf); if (a) a.erledigt = false; });
    organisation();
  });
  $('#plan').onclick = () => {
    const prompt = KI.promptTagesplan();
    ergebnis('#raus', prompt, { titel: 'Tagesplanung', dateiname: 'tagesplan', prompt });
    $('#raus').scrollIntoView({ behavior: 'smooth' });
  };
}

/* ---------- 2 Unterrichtsnotizen ---------- */
export function notizen(_a, q = {}) {
  const d = S.state();
  let filter = 'Alle';
  const zeichne = () => {
    const liste = d.notizen.filter((n) => filter === 'Alle' || n.typ === filter)
      .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    $('#liste').innerHTML = liste.length ? liste.map((n) => zeile({
      symbol: 'notebook', grad: 'g-teal', titel: n.text.slice(0, 60),
      unter: [n.typ, S.klasse(n.klasseId)?.code, n.lf, S.fmtKurz(n.datum)].filter(Boolean).join(' · '),
      id: n.id, extra: `data-n="${n.id}"`,
    })).join('') : leer('Keine Notizen in dieser Auswahl.');
    $$('[data-n]').forEach((b) => b.onclick = () => notizSheet(b.dataset.n));
  };
  screenEl().innerHTML = `
    ${nav({ titel: 'Unterrichtsnotizen', unter: `${d.notizen.length} Einträge`, symbol: 'notebook', grad: 'g-teal',
      rechts: `<button class="zurueck" id="neu" aria-label="Neue Notiz">${icon('plus', 18)}</button>` })}
    <div class="pad">
      <div class="knopfreihe" style="margin-bottom:14px">
        ${geist('Notizen auswerten', { symbol: 'sparkles', id: 'auswerten' })}
        ${geist('Diktieren', { symbol: 'mic', id: 'diktat' })}
      </div>
      <div id="raus"></div>
      ${chips('typ', ['Alle', ...S.NOTIZ_TYPEN.slice(0, 6)], 'Alle')}
      <div id="liste"></div>
    </div>`;
  zeichne();
  $$('[data-chips=typ] .chip').forEach((c) => c.onclick = () => {
    $$('[data-chips=typ] .chip').forEach((x) => x.classList.remove('an'));
    c.classList.add('an'); filter = c.dataset.wert; zeichne();
  });
  $('#neu').onclick = () => notizSheet(null, q);
  $('#diktat').onclick = () => document.dispatchEvent(new CustomEvent('aufnahme-starten'));
  $('#auswerten').onclick = () => {
    if (!d.notizen.length) return toast('Noch keine Notizen vorhanden');
    const prompt = KI.promptNotizen(d.notizen.slice(0, 40));
    ergebnis('#raus', prompt, { titel: 'Auswertung der Unterrichtsnotizen', dateiname: 'notizen-auswertung', prompt });
    $('#raus').scrollIntoView({ behavior: 'smooth' });
  };
}

export function notizSheet(id = null, q = {}) {
  const d = S.state();
  const n = id ? d.notizen.find((x) => x.id === id) : null;
  const kId = n?.klasseId || q.klasse || '';
  sheet(n ? 'Notiz' : 'Neue Unterrichtsnotiz', n ? S.fmtDatum(n.datum) : '', `
    ${feld('Notiz', 'text', { wert: n?.text || '', zeilen: 4, platz: 'Beobachtung, Verlauf, Absprache …' })}
    <div class="feld-2">
      ${feld('Typ', 'typ', { wert: n?.typ || 'Unterrichtsverlauf', optionen: S.NOTIZ_TYPEN })}
      ${feld('Klasse', 'klasseId', { wert: kId, optionen: [['', '– keine –'], ...d.klassen.map((k) => [k.id, k.code])] })}
    </div>
    <div class="feld-2">
      ${feld('Lernfeld', 'lf', { wert: n?.lf || q.lf || '', platz: 'z. B. LF4' })}
      ${feld('Datum', 'datum', { typ: 'date', wert: n?.datum || S.heute() })}
    </div>
    ${feld('Person zuordnen (optional)', 'schuelerId', { wert: n?.schuelerId || '', optionen: [['', '– niemand –'], ...d.schueler.map((s) => [s.id, `${S.anzeige(s)} (${S.klasse(s.klasseId)?.code || ''})`])],
      hinweis: 'Zugeordnete Notizen fließen in die individuellen Arbeitsblätter dieser Person ein.' })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}${n ? geist('Löschen', { symbol: 'trash', id: 'weg' }) : ''}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      if (!w.text.trim()) return toast('Bitte einen Text eingeben');
      if (n) S.aendern(() => Object.assign(n, w));
      else S.aendern((dd) => dd.notizen.unshift({ id: S.uid(), sicht: 'nur ich', ...w }));
      if (w.schuelerId) {
        const s = S.schueler(w.schuelerId);
        if (s && !(s.notizen || []).some((x) => x.text === w.text)) {
          S.aendern(() => { s.notizen = [{ id: S.uid(), datum: w.datum, text: w.text }, ...(s.notizen || [])]; });
        }
      }
      zu(); notizen(); toast('Gespeichert');
    };
    el.querySelector('#weg')?.addEventListener('click', () => {
      S.aendern((dd) => { dd.notizen = dd.notizen.filter((x) => x.id !== n.id); });
      zu(); notizen(); toast('Gelöscht');
    });
  });
}

/* ---------- 3 Berufliche E-Mails ---------- */
export function email() {
  const d = S.state();
  screenEl().innerHTML = `
    ${nav({ titel: 'Berufliche E-Mails', unter: 'Der richtige Ton in Sekunden', symbol: 'mail', grad: 'g-amber' })}
    <div class="pad">
      ${feld('Empfänger', 'empfaenger', { wert: '', optionen: ['Kolleginnen und Kollegen', 'Schulleitung', 'Eltern / Erziehungsberechtigte', 'Ausbildungsbetrieb', 'gesamte Klasse', 'einzelne Person', 'Sekretariat', 'externe Stelle'] })}
      ${feld('Anlass', 'anlass', { wert: 'Terminabstimmung', optionen: ['Terminabstimmung', 'Unterrichtsmaterial teilen', 'Schülerfall besprechen', 'Rückfrage zur Klasse', 'Erinnerung', 'Protokoll versenden', 'Projektarbeit', 'Datenschutzhinweis', 'Entschuldigung / Fehlzeiten', 'Gesprächseinladung'] })}
      ${feld('Betreff (optional)', 'betreff', { platz: 'wird sonst vorgeschlagen' })}
      ${feld('Worum geht es?', 'inhalt', { zeilen: 4, platz: 'Stichpunkte genügen: Klassenarbeit verschoben, neuer Termin 14.11., Stoff bleibt LF4' })}
      <div class="feld-2">
        ${feld('Ton', 'ton', { wert: d.profil.emailTon.includes('sachlich') ? 'sachlich' : 'freundlich', optionen: S.TOENE })}
        ${feld('Länge', 'laenge', { wert: 'kurz', optionen: ['sehr kurz', 'kurz', 'mittel', 'ausführlich'] })}
      </div>
      ${feld('Vertraulichkeit', 'vertraulich', { wert: 'normal', optionen: ['normal', 'intern', 'vertraulich'] })}
      <div class="knopfspalte">${btn('Entwurf vorbereiten', { ton: 'amber', symbol: 'sparkles', id: 'los' })}</div>
      <div id="raus" style="margin-top:14px"></div>
      ${d.mails.length ? abschnitt('Zuletzt verwendet', d.mails.slice(0, 5).map((m) => zeile({ symbol: 'mail', grad: 'g-slate', titel: m.empfaenger, unter: (m.inhalt || '').slice(0, 60), id: m.id, extra: `data-m="${m.id}"` })).join('')) : ''}
    </div>`;
  $('#los').onclick = () => {
    const w = werte(screenEl());
    if (!w.inhalt.trim()) return toast('Bitte den Anlass beschreiben');
    S.aendern((dd) => dd.mails.unshift({ id: S.uid(), datum: S.heute(), ...w }));
    S.merken('E-Mail-Präferenz', `Ton „${w.ton}", Länge „${w.laenge}".`);
    const prompt = KI.promptMail(w);
    ergebnis('#raus', prompt, { titel: 'E-Mail: ' + w.anlass, dateiname: dateiName('mail-' + w.anlass), prompt, maxTokens: 1500 });
    $('#raus').scrollIntoView({ behavior: 'smooth' });
  };
  $$('[data-m]').forEach((b) => b.onclick = () => {
    const m = S.state().mails.find((x) => x.id === b.dataset.m);
    if (!m) return;
    Object.entries(m).forEach(([k, v]) => { const el = $(`[name=${k}]`); if (el) el.value = v; });
    toast('Übernommen');
  });
}

/* ---------- 4 Datenschutz ---------- */
export function datenschutz() {
  const fragen = ['Enthält die Eingabe Schülernamen?', 'Enthält die Eingabe Noten?', 'Enthält die Eingabe Gesundheitsdaten?',
    'Enthält die Eingabe Verhaltensnotizen?', 'Wurde anonymisiert?', 'Wird ein lokales oder schulisch freigegebenes Modell verwendet?',
    'Liegt eine Freigabe der Schule vor?', 'Wurde der Vorgang protokolliert?'];
  const ant = {};
  screenEl().innerHTML = `
    ${nav({ titel: 'Datenschutz / DSGVO', unter: 'Prüfen, bevor Daten die Schule verlassen', symbol: 'shield', grad: 'g-emerald' })}
    <div class="pad">
      ${abschnitt('Text prüfen', `
        ${feld('Eingabe', 'text', { zeilen: 5, platz: 'Fügen Sie hier ein, was Sie an ein KI-Modell geben möchten.' })}
        <div class="knopfreihe">${geist('Prüfen', { symbol: 'shieldCheck', id: 'pruef' })}${geist('Anonymisieren', { symbol: 'eyeOff', id: 'anon' })}${geist('Kopieren', { symbol: 'copy', id: 'kop' })}</div>
        <div id="ampel" style="margin-top:12px"></div>`)}
      ${abschnitt('Checkliste vor der KI-Nutzung', `<div id="check">${fragen.map((f, i) => `
        <div class="karte" style="margin-bottom:8px;padding:13px">
          <p class="klein" style="margin-bottom:9px">${esc(f)}</p>
          <div class="knopfreihe">
            <button class="btn geist" data-f="${i}" data-w="ja" style="height:36px">ja</button>
            <button class="btn geist" data-f="${i}" data-w="nein" style="height:36px">nein</button>
          </div></div>`).join('')}</div>
        <div id="status"></div>`)}
      ${abschnitt('Grundsätze', karte([
        ['Datensparsamkeit', 'Nur erheben, was für den Unterricht nötig ist.'],
        ['Pseudonyme statt Klarnamen', 'Vor KI-Anfragen werden Namen durch Pseudonyme ersetzt.'],
        ['Verschlüsselte Ablage', 'Klarnamen liegen nur im lokalen Tresor (AES-256).'],
        ['Protokollierung', 'Jede KI-Anfrage wird lokal protokolliert.'],
        ['Löschfristen', 'Materialien und Notizen löschen, sobald der Zweck erfüllt ist.'],
      ].map(([t, u]) => kv(t, esc(u))).join('')))}
      ${box('warn', 'Diese Hinweise ersetzen keine Rechtsberatung. Verbindlich sind die Vorgaben Ihrer Schule und der zuständigen Datenschutzaufsicht.')}
      <div class="knopfspalte">${geist('Protokoll ansehen', { symbol: 'history', id: 'prot' })}</div>
    </div>`;
  const ta = () => $('[name=text]');
  $('#pruef').onclick = () => { $('#ampel').innerHTML = ampelBlock(ta().value); };
  $('#anon').onclick = () => { ta().value = DS.anonymisieren(ta().value); $('#ampel').innerHTML = ampelBlock(ta().value); toast('Personenbezug ersetzt'); };
  $('#kop').onclick = () => kopieren(ta().value);
  $$('[data-f]').forEach((b) => b.onclick = () => {
    ant[b.dataset.f] = b.dataset.w;
    $$(`[data-f="${b.dataset.f}"]`).forEach((x) => x.style.borderColor = 'var(--border)');
    b.style.borderColor = b.dataset.w === 'ja' ? 'rgba(52,211,153,.5)' : 'rgba(148,163,184,.5)';
    const kritisch = ['0', '1', '2', '3'].some((i) => ant[i] === 'ja');
    const sicher = ant['4'] === 'ja' && ant['5'] === 'ja';
    const stufe = kritisch && !sicher ? 'bad' : kritisch ? 'warn' : 'ok';
    const text = { ok: 'Grün: unkritisch – die Anfrage kann gestellt werden.', warn: 'Gelb: prüfen – Personenbezug ist entschärft, aber vorhanden.', bad: 'Rot: personenbezogene Daten erkannt – bitte anonymisieren oder ein lokales Modell nutzen.' }[stufe];
    $('#status').innerHTML = box(stufe, text, 'Ergebnis der Checkliste');
  });
  $('#prot').onclick = () => {
    const p = S.state().protokoll;
    sheet('Protokoll', 'Lokal gespeichert, Art. 5 DSGVO', p.length
      ? p.slice(0, 60).map((x) => `<div class="kv"><span>${new Date(x.zeit).toLocaleString('de-DE')}</span><b>${esc(x.aktion)}</b></div>`).join('')
      : leer('Noch keine Einträge.'));
  };
}

/* ---------- 5 Tresor ---------- */
export function tresor() {
  const auf = T.istOffen();
  const da = T.vorhanden();
  const z = auf ? T.daten().zuordnung : [];
  screenEl().innerHTML = `
    ${nav({ titel: 'Tresor & Pseudonyme', unter: 'Klarnamen verschlüsselt auf dem Gerät', symbol: 'key', grad: 'g-rose' })}
    <div class="pad">
      ${box(auf ? 'warn' : 'ok', !da ? 'Legen Sie einen Tresor an, um Klarnamen AES-256-verschlüsselt zu speichern.'
        : auf ? 'Der Tresor ist in dieser Sitzung geöffnet. Schließen Sie ihn, wenn Sie fertig sind.'
        : 'Die Zuordnungstabelle ist verschlüsselt. Ohne Passphrase bleiben nur Pseudonyme lesbar.',
        !da ? 'Noch kein Tresor' : auf ? 'Tresor geöffnet' : 'Tresor verschlossen')}
      ${!da ? `${feld('Passphrase festlegen', 'pass', { typ: 'password', hinweis: 'Mindestens 8 Zeichen. Sie wird nirgends gespeichert – ohne sie sind die Klarnamen nicht wiederherstellbar.' })}
        <div class="knopfspalte">${btn('Tresor anlegen', { ton: 'rose', symbol: 'lock', id: 'anlegen' })}</div>`
        : !auf ? `${feld('Passphrase', 'pass', { typ: 'password' })}
        <div class="knopfspalte">${btn('Tresor öffnen', { ton: 'rose', symbol: 'key', id: 'oeffnen' })}</div>`
        : `<div class="knopfspalte" style="margin-bottom:14px">
            ${btn('Klassenliste importieren (CSV)', { ton: 'rose', symbol: 'upload', id: 'import' })}
            ${geist('Anonyme Liste exportieren', { symbol: 'download', id: 'export' })}
            ${geist('Tresor schließen', { symbol: 'lock', id: 'schliessen' })}
          </div>
          <input type="file" id="datei" accept=".csv,.txt,text/csv" hidden>
          ${abschnitt(`Zuordnungstabelle (${z.length})`, z.length ? z.map((x) => `
            <div class="zeile" style="cursor:default"><span class="txt"><b>${esc(x.pseudonym)}</b><small>${esc(x.name)}</small></span>
            <span class="chev" data-weg="${esc(x.pseudonym)}" style="cursor:pointer">${icon('x', 15)}</span></div>`).join('')
            : leer('Noch keine Zuordnung. Importieren Sie eine Klassenliste als CSV (Spalten: Name;Klasse).'))}`}
      ${abschnitt('So funktioniert es', karte([
        ['1 · Liste importieren', 'Aus Excel als CSV exportieren und hier einlesen.'],
        ['2 · Pseudonyme vergeben', 'Aus „Mara König" wird 1BM1-004.'],
        ['3 · Verschlüsselt ablegen', 'AES-256-GCM, Schlüssel aus Ihrer Passphrase (PBKDF2, 250.000 Runden).'],
        ['4 · KI sieht nur Pseudonyme', 'Die Zuordnung verlässt dieses Gerät nie.'],
      ].map(([t, u]) => kv(t, esc(u))).join('')))}
      ${box('info', 'Der Export enthält ausschließlich Pseudonyme und eignet sich für die Ablage in einem Cloud- oder Kryptomator-Ordner.')}
    </div>`;

  $('#anlegen')?.addEventListener('click', async () => {
    try { await T.anlegen($('[name=pass]').value); toast('Tresor angelegt'); tresor(); } catch (e) { toast(e.message); }
  });
  $('#oeffnen')?.addEventListener('click', async () => {
    try { await T.oeffnen($('[name=pass]').value); toast('Tresor geöffnet'); tresor(); } catch (e) { toast(e.message); }
  });
  $('#schliessen')?.addEventListener('click', () => { T.schliessen(); tresor(); toast('Tresor verschlossen'); });
  $('#import')?.addEventListener('click', () => $('#datei').click());
  $('#datei')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const eintraege = T.csvLesen(await f.text());
    if (!eintraege.length) return toast('Keine Namen gefunden');
    importSheet(eintraege);
  });
  $('#export')?.addEventListener('click', () => {
    datei('klassenliste-anonym.csv', ['Pseudonym;Klasse', ...z.map((x) => `${x.pseudonym};${S.klasse(x.klasseId)?.code || ''}`)].join('\n'), 'text/csv');
  });
  $$('[data-weg]').forEach((b) => b.onclick = async () => { await T.entfernen(b.dataset.weg); tresor(); });
}

function importSheet(eintraege) {
  const d = S.state();
  sheet('Klassenliste übernehmen', `${eintraege.length} Namen erkannt`, `
    ${feld('Zielklasse', 'klasseId', { optionen: d.klassen.map((k) => [k.id, k.code]) })}
    <div class="karte"><div class="schalter"><div class="txt"><b>Klarnamen auch in der App anzeigen</b>
      <small>Aus = in Listen erscheinen nur Pseudonyme</small></div><input type="checkbox" class="kipp" name="zeigen"></div></div>
    <div class="karte" style="margin-top:10px"><p class="mini dim">${esc(eintraege.slice(0, 8).map((e) => e.name).join(', '))}${eintraege.length > 8 ? ' …' : ''}</p></div>
    <div class="knopfspalte" style="margin-top:12px">${btn('Übernehmen', { ton: 'rose', id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = async () => {
      const w = werte(el);
      const k = S.klasse(w.klasseId);
      if (!k) return toast('Bitte eine Klasse wählen');
      let n = S.schuelerDer(k.id).length;
      for (const e of eintraege) {
        n += 1;
        const pseudonym = `${k.code.replace(/\s+/g, '').toUpperCase()}-${String(n).padStart(3, '0')}`;
        S.aendern((dd) => dd.schueler.push({ id: S.uid(), klasseId: k.id, pseudonym, name: w.zeigen ? e.name : '', noten: {}, notizen: [], kollegen: [], mitarbeit: '', verhalten: '', fehlzeiten: '0 Tage', foerder: '' }));
        await T.eintragen(pseudonym, e.name, k.id);
      }
      S.protokoll('Klassenliste importiert', `${eintraege.length} Einträge · ${k.code}`);
      zu(); tresor(); toast(`${eintraege.length} Einträge übernommen`);
    };
  });
}

/* ---------- 6 Kalender & Stundenplan ---------- */
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
export function kalender() {
  const d = S.state();
  const kommend = d.termine.filter((t) => S.tageBis(t.datum) >= 0).sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit));
  screenEl().innerHTML = `
    ${nav({ titel: 'Kalender & Stundenplan', unter: 'Stunden, Termine, Import und Export', symbol: 'calendar', grad: 'g-green',
      rechts: `<button class="zurueck" id="neuStunde" aria-label="Stunde">${icon('plus', 18)}</button>` })}
    <div class="pad">
      ${abschnitt('Wochenplan', TAGE.map((tag, i) => {
        const st = d.stunden.filter((s) => s.tag === i + 1).sort((a, b) => a.zeit.localeCompare(b.zeit));
        return `<div class="karte" style="margin-bottom:8px;padding:12px">
          <p class="mini dim" style="font-weight:700;margin-bottom:${st.length ? '8px' : '0'}">${tag}${S.wochentag() === i + 1 ? ' · heute' : ''}</p>
          ${st.map((s) => `<div class="kv" data-stunde="${s.id}" style="cursor:pointer">
            <span>${esc(s.zeit)}</span><b>${esc(S.klasse(s.klasseId)?.code || '')} ${esc(s.lf || '')} · ${esc(s.ort || '')}</b></div>`).join('')}
        </div>`;
      }).join(''))}
      ${abschnitt(`Termine (${kommend.length})`, (kommend.length ? kommend.map((t) => zeile({ symbol: 'calendar', grad: 'g-sky',
        titel: t.titel, unter: `${S.fmtDatum(t.datum)}${t.zeit ? ', ' + t.zeit + ' Uhr' : ''}${t.ort ? ' · ' + t.ort : ''}`, route: 'termin/' + t.id })).join('') : leer('Keine anstehenden Termine.'))
        + `<button class="btn geist" id="neuTermin" style="border-style:dashed;margin-top:8px">${icon('plus', 15)} Termin anlegen</button>`)}
      <div class="knopfreihe">${geist('Termine exportieren (.ics)', { symbol: 'download', id: 'ics' })}${geist('Termine importieren', { symbol: 'upload', id: 'icsImp' })}</div>
      <input type="file" id="icsDatei" accept=".ics,text/calendar" hidden>
      ${box('info', 'WebUntis stellt unter „Profil → Freigaben" eine Kalenderdatei (.ics) bereit. Laden Sie sie herunter und importieren Sie sie hier – Vertretungen und Raumänderungen kommen mit.')}
    </div>`;
  $('#neuTermin').onclick = () => terminSheet();
  $('#neuStunde').onclick = () => stundeSheet();
  $$('[data-stunde]').forEach((b) => b.onclick = () => stundeSheet(b.dataset.stunde));
  $('#ics').onclick = () => {
    if (!d.termine.length) return toast('Keine Termine vorhanden');
    datei(`termine-${S.heute()}.ics`, icsBauen(d.termine), 'text/calendar');
  };
  $('#icsImp').onclick = () => $('#icsDatei').click();
  $('#icsDatei').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const neu = icsLesen(await f.text());
    if (!neu.length) return toast('Keine Termine gefunden');
    S.aendern((dd) => neu.forEach((t) => dd.termine.push({ id: S.uid(), todos: [], erinnerung: '', klasseId: '', ...t })));
    kalender(); toast(`${neu.length} Termine importiert`);
  };
}

function stundeSheet(id = null) {
  const d = S.state();
  const s = id ? d.stunden.find((x) => x.id === id) : null;
  sheet(s ? 'Unterrichtsstunde' : 'Neue Unterrichtsstunde', '', `
    <div class="feld-2">
      ${feld('Tag', 'tag', { wert: s?.tag || 1, optionen: TAGE.map((t, i) => [i + 1, t]) })}
      ${feld('Zeit', 'zeit', { wert: s?.zeit || '07:45 – 09:15', platz: '07:45 – 09:15' })}
    </div>
    ${feld('Klasse', 'klasseId', { wert: s?.klasseId || '', optionen: d.klassen.map((k) => [k.id, k.code]) })}
    <div class="feld-2">${feld('Lernfeld', 'lf', { wert: s?.lf || '' })}${feld('Raum', 'ort', { wert: s?.ort || '' })}</div>
    ${feld('Thema', 'thema', { wert: s?.thema || '' })}
    <div class="knopfspalte">${btn('Speichern', { ton: 'green', id: 'ok' })}${s ? geist('Löschen', { symbol: 'trash', id: 'weg' }) : ''}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el); w.tag = Number(w.tag);
      if (s) S.aendern(() => Object.assign(s, w));
      else S.aendern((dd) => dd.stunden.push({ id: S.uid(), todos: [], material: [], beschreibung: '', erinnerung: '', ...w }));
      zu(); kalender(); toast('Gespeichert');
    };
    el.querySelector('#weg')?.addEventListener('click', () => {
      S.aendern((dd) => { dd.stunden = dd.stunden.filter((x) => x.id !== s.id); });
      zu(); kalender();
    });
  });
}

export function icsBauen(termine) {
  const z = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LehrerAssistent//DE'];
  termine.forEach((t) => {
    const d = (t.datum || '').replace(/-/g, '');
    if (!d) return;
    const start = t.zeit ? `${d}T${t.zeit.replace(':', '')}00` : d;
    const std = t.zeit ? String(Number(t.zeit.slice(0, 2)) + 1).padStart(2, '0') : '';
    const ende = t.zeit ? `${d}T${std}${t.zeit.slice(3, 5)}00` : d;
    z.push('BEGIN:VEVENT', `UID:${t.id}@lehrerassistent`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      t.zeit ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${start}`,
      t.zeit ? `DTEND:${ende}` : `DTEND;VALUE=DATE:${ende}`,
      `SUMMARY:${(t.titel || '').replace(/[,;]/g, ' ')}`, t.ort ? `LOCATION:${t.ort}` : '', 'END:VEVENT');
  });
  z.push('END:VCALENDAR');
  return z.filter(Boolean).join('\r\n');
}
export function icsLesen(text) {
  return text.split(/BEGIN:VEVENT/).slice(1).map((b) => {
    const titel = (b.match(/SUMMARY[^:]*:(.*)/) || [])[1]?.trim();
    const dt = b.match(/DTSTART[^:]*:(\d{8})(?:T(\d{2})(\d{2}))?/);
    const ort = (b.match(/LOCATION[^:]*:(.*)/) || [])[1]?.trim() || '';
    if (!titel || !dt) return null;
    return { titel, datum: `${dt[1].slice(0, 4)}-${dt[1].slice(4, 6)}-${dt[1].slice(6, 8)}`, zeit: dt[2] ? `${dt[2]}:${dt[3]}` : '', ort, beschreibung: '' };
  }).filter(Boolean);
}

/* ---------- 7 Gedächtnis ---------- */
export function gedaechtnis() {
  const g = S.state().gedaechtnis;
  screenEl().innerHTML = `
    ${nav({ titel: 'Gedächtnis', unter: 'Transparent, bearbeitbar, löschbar', symbol: 'brain', grad: 'g-slate' })}
    <div class="pad">
      ${box('info', 'Hier steht, was sich die App über Ihre Arbeitsweise gemerkt hat. Schülerbezogene Daten landen nie im Gedächtnis – sie bleiben in den Klassen- und Personenbereichen.')}
      ${g.map((e) => `<div class="karte" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <span class="tile ${e.grad}" style="width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#fff">${icon(e.symbol, 18)}</span>
          <div style="flex:1"><b class="klein">${esc(e.kat)}</b><small class="mini faint" style="display:block">zuletzt verwendet: ${new Date(e.verwendet).toLocaleDateString('de-DE')}</small></div>
          <span class="pille ${e.aktiv ? 'ok' : ''}" data-an="${e.id}" style="cursor:pointer">${e.aktiv ? 'aktiv' : 'pausiert'}</span>
        </div>
        <p class="mini dim" style="line-height:1.5">${esc(e.info)}</p>
        ${e.punkte?.length ? `<ul class="mini dim" style="margin:8px 0 0 16px;line-height:1.7">${e.punkte.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <div class="knopfreihe" style="margin-top:10px">${geist('Bearbeiten', { symbol: 'pencil', attr: `data-edit="${e.id}"` })}${geist('Löschen', { symbol: 'trash', attr: `data-weg="${e.id}"` })}</div>
      </div>`).join('') || leer('Noch nichts gelernt.')}
      <div class="knopfspalte">${geist('Gedächtnis vollständig löschen', { symbol: 'trash', id: 'alles' })}</div>
    </div>`;
  $$('[data-an]').forEach((b) => b.onclick = () => {
    S.aendern((d) => { const e = d.gedaechtnis.find((x) => x.id === b.dataset.an); if (e) e.aktiv = !e.aktiv; });
    gedaechtnis();
  });
  $$('[data-weg]').forEach((b) => b.onclick = () => {
    S.aendern((d) => { d.gedaechtnis = d.gedaechtnis.filter((x) => x.id !== b.dataset.weg); });
    gedaechtnis(); toast('Eintrag gelöscht');
  });
  $$('[data-edit]').forEach((b) => b.onclick = () => {
    const e = S.state().gedaechtnis.find((x) => x.id === b.dataset.edit);
    sheet('Eintrag bearbeiten', e.kat, `
      ${feld('Information', 'info', { wert: e.info, zeilen: 3 })}
      ${feld('Einzelheiten (eine je Zeile)', 'punkte', { wert: (e.punkte || []).join('\n'), zeilen: 5 })}
      <div class="knopfspalte">${btn('Speichern', { ton: 'slate', id: 'ok' })}</div>`, (el) => {
      el.querySelector('#ok').onclick = () => {
        const w = werte(el);
        S.aendern(() => { e.info = w.info; e.punkte = w.punkte.split('\n').map((x) => x.trim()).filter(Boolean); e.verwendet = S.jetzt(); });
        zu(); gedaechtnis(); toast('Gespeichert');
      };
    });
  });
  $('#alles').onclick = async () => {
    if (!await frage('Gedächtnis löschen?', 'Alle gelernten Arbeitsvorlieben werden entfernt.', 'Löschen')) return;
    S.aendern((d) => { d.gedaechtnis = []; });
    gedaechtnis();
  };
}
