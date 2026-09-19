/* Klassen, Lernfelder, Themen, Lernende, Gruppen, Analysen */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, nav, kopf, abschnitt, aktion, zeile, karte, kv, leer, box, btn, geist,
  feld, werte, sheet, zu, toast, frage, chips, alsWord, dateiName } from './ui.js';
import { ergebnis } from './generieren.js';
import * as KI from './ki.js';

/* ---------- Klassenübersicht ---------- */
export function klassen() {
  const d = S.state();
  const gruppe = (titel, kurz, liste) => liste.length ? abschnitt(titel, `<div class="raster-2">${liste.map((k) => `
    <button class="kachel" data-go="klasse/${k.id}">
      <span style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span class="pille">Block ${esc(k.block || '–')}</span><span class="chev">${icon('right', 14)}</span></span>
      <b class="serif" style="font-size:20px;font-weight:600;display:block">${esc(k.code)}</b>
      <small>${esc(k.lernfelder.map((l) => l.code).join(' · ') || '—')}</small>
    </button>`).join('')}</div>`, `<button>${esc(kurz)}</button>`) : '';

  screenEl().innerHTML = `
    ${kopf({ ueber: `${d.profil.schule || 'Berufliche Schule'} · ${d.schueler.length} Lernende`, titel: 'Meine Klassen' })}
    <div class="pad">
      ${gruppe('Büromanagement', 'BM', d.klassen.filter((k) => k.typ === 'BM'))}
      ${gruppe('Öffentlicher Dienst', 'ÖD / FAA', d.klassen.filter((k) => k.typ !== 'BM'))}
      ${!d.klassen.length ? leer('Noch keine Klasse angelegt.') : ''}
      <button class="btn geist" id="neu" style="border-style:dashed;margin-top:8px">${icon('plus', 16)} Klasse hinzufügen</button>
    </div>`;
  $('#neu').onclick = () => klasseSheet();
}

export function klasseSheet(id = null) {
  const k = id ? S.klasse(id) : null;
  sheet(k ? 'Klasse bearbeiten' : 'Neue Klasse', 'Lernfelder lassen sich anschließend anpassen.', `
    ${feld('Bezeichnung', 'code', { wert: k?.code || '', platz: 'z. B. 1BM1' })}
    <div class="feld-2">
      ${feld('Bildungsgang', 'typ', { wert: k?.typ || 'BM', optionen: [['BM', 'Büromanagement'], ['ÖD', 'Öffentlicher Dienst']] })}
      ${feld('Block', 'block', { wert: k?.block || 'A', optionen: ['A', 'B', '—'] })}
    </div>
    ${feld('Ausbildungsjahr', 'jahr', { wert: k?.jahr || '1', optionen: ['1', '2', '3'] })}
    ${feld('Lernfelder (Kürzel, durch Komma getrennt)', 'lfs', { wert: (k?.lernfelder || []).map((l) => l.code).join(', '), platz: 'LF4, LF5',
      hinweis: `Vorlagen mit Themen vorhanden für: ${S.LF_VORLAGEN.join(', ')}` })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}${k ? geist('Klasse löschen', { symbol: 'trash', id: 'weg' }) : ''}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      if (!w.code.trim()) return toast('Bitte eine Bezeichnung angeben');
      const lfs = w.lfs.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
      const bauen = (code) => k?.lernfelder.find((l) => l.code === code) || S.lernfeldVorlage(code);
      if (k) S.aendern(() => Object.assign(k, { code: w.code.trim(), typ: w.typ, block: w.block, jahr: w.jahr, lernfelder: lfs.map(bauen) }));
      else S.aendern((d) => d.klassen.push({ id: S.uid(), code: w.code.trim(), typ: w.typ, block: w.block, jahr: w.jahr, lernfelder: lfs.map(S.lernfeldVorlage) }));
      zu(); toast('Gespeichert'); location.hash = '#/klassen';
    };
    el.querySelector('#weg')?.addEventListener('click', async () => {
      if (!await frage('Klasse löschen?', `${k.code} samt Lernenden, Noten und Gruppen entfernen.`, 'Endgültig löschen')) return;
      S.aendern((d) => {
        d.schueler = d.schueler.filter((s) => s.klasseId !== k.id);
        d.gruppen = d.gruppen.filter((g) => g.klasseId !== k.id);
        d.klassen = d.klassen.filter((x) => x.id !== k.id);
      });
      zu(); location.hash = '#/klassen';
    });
  });
}

/* ---------- Klassendetail ---------- */
export function klasse([id]) {
  const k = S.klasse(id);
  if (!k) return klassen();
  const sus = S.schuelerDer(id);
  const gr = S.gruppenDer(id);
  const schnitt = S.klassenSchnitt(id);
  const aufg = S.state().aufgaben.filter((a) => !a.erledigt && a.klasseId === id);
  const stunden = S.state().stunden.filter((s) => s.klasseId === id);

  screenEl().innerHTML = `
    ${nav({ titel: 'Klasse ' + k.code, unter: `${sus.length} Lernende${schnitt !== null ? ' · Ø ' + S.note(schnitt) : ''} · ${k.lernfelder.map((l) => l.code).join(', ')}`, symbol: 'cap', grad: 'g-blue',
      rechts: `<button class="zurueck" id="bearb" aria-label="Bearbeiten">${icon('settings', 17)}</button>` })}
    <div class="pad">
      ${abschnitt('Lernfelder', (k.lernfelder.length ? k.lernfelder.map((l, i) => {
        const fertig = l.themen.filter((t) => t.status === 'erledigt').length;
        return zeile({ symbol: 'book', grad: i % 2 ? 'g-teal' : 'g-violet', titel: `${k.code} – ${l.code}${l.name ? ': ' + l.name : ''}`,
          unter: l.themen.length ? `${l.themen.length} Themen · ${fertig} behandelt` : 'Noch keine Themen hinterlegt',
          route: `lernfeld/${k.id}/${l.code}` });
      }).join('') : leer('Keine Lernfelder hinterlegt.')))}

      ${abschnitt('Lernende', `
        ${zeile({ symbol: 'users', grad: 'g-sky', titel: 'Schülerliste anzeigen', unter: `${sus.length} Lernende`, route: 'liste/' + k.id })}
        ${zeile({ symbol: 'chart', grad: 'g-sky', titel: 'Klasse analysieren', unter: 'Notenschnitt & Verteilung', route: 'analyse/' + k.id })}
        ${zeile({ symbol: 'wand', grad: 'g-violet', titel: 'Individuelle Arbeitsblätter', unter: 'je Person passend zum Lernstand', route: 'w/individuell?klasse=' + k.id })}`)}

      ${abschnitt('Schülergruppen', `${gr.length ? gr.map((g) => zeile({ symbol: 'users', grad: 'g-indigo', titel: g.name,
        unter: `${g.schuelerIds.length} Lernende · ${g.niveau}`, route: 'gruppe/' + g.id })).join('') : leer('Noch keine Gruppen.')}
        <button class="btn geist" id="neueGruppe" style="border-style:dashed">${icon('plus', 15)} Gruppe anlegen</button>`)}

      ${stunden.length ? abschnitt('Unterricht', stunden.map((s) => zeile({ symbol: 'calendar', grad: 'g-green',
        titel: `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][s.tag]} ${s.zeit}`, unter: `${s.lf || ''} ${s.thema || ''} · ${s.ort || ''}`, route: 'stunde/' + s.id })).join('')) : ''}

      ${aufg.length ? abschnitt('Offene Aufgaben', aufg.map((a) => zeile({ punkt: a.prio === 'hoch' ? 'b-bad' : 'b-warn', titel: a.titel,
        unter: a.faellig ? 'fällig ' + S.fmtKurz(a.faellig) : '', route: 'aufgabe/' + a.id })).join('')) : ''}
    </div>`;
  $('#bearb').onclick = () => klasseSheet(k.id);
  $('#neueGruppe').onclick = () => gruppeSheet(null, k.id);
}

/* ---------- Lernfeld & Thema ---------- */
export function lernfeld([klasseId, lfCode]) {
  const k = S.klasse(klasseId);
  const l = k?.lernfelder.find((x) => x.code === lfCode);
  if (!l) return klassen();
  screenEl().innerHTML = `
    ${nav({ titel: `${k.code} – ${l.code}`, unter: l.name || 'Lernfeld', symbol: 'book', grad: 'g-violet',
      rechts: `<button class="zurueck" id="bearb" aria-label="Themen bearbeiten">${icon('pencil', 16)}</button>` })}
    <div class="pad">
      ${box('info', 'Tippen Sie ein Thema an: dort finden Sie Lernziel, Stand und die direkte Materialerstellung.')}
      ${l.themen.length ? l.themen.map((t, i) => `
        <button class="zeile ${t.status === 'aktuell' ? 'aktiv' : ''}" data-go="thema/${k.id}/${l.code}/${i}">
          <span class="tile ${t.status === 'erledigt' ? 'g-green' : t.status === 'aktuell' ? 'g-violet' : ''}"
            style="${t.status === 'offen' ? 'background:var(--card-hi);color:var(--dim)' : ''};width:28px;height:28px;border-radius:50%;font-size:11px;font-weight:800;box-shadow:none">
            ${t.status === 'erledigt' ? icon('check', 14) : i + 1}</span>
          <span class="txt"><b style="font-weight:${t.status === 'aktuell' ? 700 : 500}">${esc(t.name)}</b></span>
          ${t.status === 'aktuell' ? '<span class="pille" style="color:#a5b4fc">nächstes</span>' : ''}
          <span class="chev">${icon('right', 15)}</span></button>`).join('') : leer('Noch keine Themen hinterlegt.')}
    </div>`;
  $('#bearb').onclick = () => themenSheet(k, l);
}

function themenSheet(k, l) {
  sheet('Themen bearbeiten', `${k.code} · ${l.code}`, `
    ${feld('Bezeichnung des Lernfelds', 'name', { wert: l.name || '' })}
    ${feld('Themen – ein Thema je Zeile', 'themen', { zeilen: 10, wert: l.themen.map((t) => (t.status === 'erledigt' ? '+ ' : t.status === 'aktuell' ? '> ' : '') + t.name).join('\n'),
      hinweis: 'Ein „+" am Zeilenanfang markiert behandelte Themen, ein „>" das aktuelle Thema.' })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      const themen = w.themen.split('\n').map((z) => z.trim()).filter(Boolean).map((z) => {
        if (z.startsWith('+')) return { name: z.slice(1).trim(), status: 'erledigt' };
        if (z.startsWith('>')) return { name: z.slice(1).trim(), status: 'aktuell' };
        return { name: z, status: 'offen' };
      });
      S.aendern(() => { l.name = w.name; l.themen = themen; });
      zu(); toast('Gespeichert'); location.hash = `#/lernfeld/${k.id}/${l.code}`;
    };
  });
}

export function thema([klasseId, lfCode, idx]) {
  const k = S.klasse(klasseId);
  const l = k?.lernfelder.find((x) => x.code === lfCode);
  const t = l?.themen[Number(idx)];
  if (!t) return klassen();
  const material = S.state().materialien.filter((m) => m.thema === t.name);
  const q = `?klasse=${k.id}&lf=${l.code}&thema=${encodeURIComponent(t.name)}`;
  screenEl().innerHTML = `
    ${nav({ titel: t.name, unter: `${k.code} · ${l.code}`, symbol: 'book', grad: 'g-violet' })}
    <div class="pad">
      ${karte(`${kv('Klasse', esc(k.code))}${kv('Lernfeld', esc(l.code + (l.name ? ' – ' + l.name : '')))}${kv('Status', t.status === 'erledigt' ? 'behandelt' : t.status === 'aktuell' ? 'aktuelles Thema' : 'offen',
        t.status === 'erledigt' ? 't-ok' : t.status === 'aktuell' ? 't-warn' : '')}
        <div style="padding-top:10px"><p class="mini dim" style="margin-bottom:3px">Lernziel</p>
        <p class="klein">Die Lernenden können ${esc(t.name)} erläutern, an einem Praxisfall anwenden und die Folgen beurteilen.</p></div>`)}
      <div class="knopfspalte" style="margin:14px 0">
        ${btn('Individuelle Arbeitsblätter', { ton: 'violet', symbol: 'wand', route: 'w/individuell' + q })}
        ${geist('Arbeitsblatt für die Klasse', { symbol: 'fileEdit', route: 'assistent' + q })}
        ${geist('Lernsituation entwerfen', { symbol: 'target', id: 'ls' })}
        ${geist('Status ändern', { symbol: 'check', id: 'status' })}
      </div>
      ${material.length ? abschnitt('Passendes Material', material.map((m) => zeile({ symbol: 'fileText', grad: 'g-violet', titel: m.titel, unter: S.fmtKurz(m.datum), route: 'material/' + m.id })).join('')) : ''}
      <div id="raus"></div>
    </div>`;
  $('#status').onclick = () => {
    const folge = { offen: 'aktuell', aktuell: 'erledigt', erledigt: 'offen' };
    S.aendern(() => { t.status = folge[t.status]; });
    thema([klasseId, lfCode, idx]); toast('Status: ' + t.status);
  };
  $('#ls').onclick = () => {
    const prompt = KI.promptLernsituation({ klasseId: k.id, lf: l.code, thema: t.name });
    ergebnis('#raus', prompt, { titel: 'Lernsituation ' + t.name, dateiname: dateiName('lernsituation-' + t.name),
      archiv: { art: 'Lernsituation', klasseId: k.id, lf: l.code, thema: t.name }, prompt });
    $('#raus').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

/* ---------- Schülerliste & Detail ---------- */
export function liste([klasseId]) {
  const k = S.klasse(klasseId);
  const alle = S.schuelerDer(klasseId);
  let filter = 'Alle';
  const zeichne = () => {
    const sus = filter === 'Förderbedarf' ? alle.filter((s) => ['erhoeht', 'dringend'].includes(S.lernstand(s).stufe))
      : filter === 'Stark' ? alle.filter((s) => S.lernstand(s).stufe === 'stark') : alle;
    $('#liste').innerHTML = sus.length ? sus.map((s) => {
      const d = S.schnitt(s);
      const ini = S.kuerzel(s);
      const st = S.lernstand(s);
      return `<button class="zeile" data-go="schueler/${s.id}">
        <span class="tile g-slate" style="font-size:12px;font-weight:700">${esc(ini)}</span>
        <span class="txt"><b>${esc(S.anzeige(s))}</b><small>${esc(s.pseudonym)} · Mitarbeit: ${esc(s.mitarbeit || '–')}</small></span>
        ${st.stufe === 'dringend' ? '<span class="pille bad">dringend</span>' : st.stufe === 'erhoeht' ? '<span class="pille warn">Förderbedarf</span>' : ''}
        <span class="rechts serif ${S.notenFarbe(d)}">Ø ${S.note(d)}</span>
        <span class="chev">${icon('right', 15)}</span></button>`;
    }).join('') : leer('Niemand in dieser Auswahl.');
  };
  screenEl().innerHTML = `
    ${nav({ titel: 'Klasse ' + (k?.code || ''), unter: `${alle.length} Lernende`, symbol: 'users', grad: 'g-sky',
      rechts: `<button class="zurueck" id="neu" aria-label="Hinzufügen">${icon('plus', 18)}</button>` })}
    <div class="pad">
      ${chips('f', ['Alle', 'Förderbedarf', 'Stark'], 'Alle')}
      <div id="liste"></div>
    </div>`;
  zeichne();
  $$('[data-chips=f] .chip').forEach((c) => c.onclick = () => {
    $$('[data-chips=f] .chip').forEach((x) => x.classList.remove('an'));
    c.classList.add('an'); filter = c.dataset.wert; zeichne();
  });
  $('#neu').onclick = () => schuelerSheet(null, klasseId);
}

export function schueler([id]) {
  const s = S.schueler(id);
  if (!s) return klassen();
  const k = S.klasse(s.klasseId);
  const st = S.lernstand(s);
  const ab = KI.ableitung(s);
  screenEl().innerHTML = `
    ${nav({ titel: S.anzeige(s), unter: `${k?.code || ''} · ${s.pseudonym}`, symbol: 'user', grad: 'g-sky',
      rechts: `<button class="zurueck" id="bearb" aria-label="Bearbeiten">${icon('pencil', 16)}</button>` })}
    <div class="pad">
      ${st.stufe === 'dringend' ? box('bad', st.gruende.join(' · '), 'Dringender Förderbedarf')
        : st.stufe === 'erhoeht' ? box('warn', st.gruende.join(' · '), 'Erhöhter Förderbedarf')
        : st.stufe === 'stark' ? box('ok', 'Leistungsstark – Differenzierung nach oben sinnvoll.', 'Stärken ausbauen') : ''}

      ${abschnitt('Lernstand', karte(`
        ${Object.entries(s.noten || {}).map(([lf, n]) => kv(lf + (k?.lernfelder.find((l) => l.code === lf)?.name ? ' – ' + k.lernfelder.find((l) => l.code === lf).name : ''), esc(n))).join('')}
        ${kv('Durchschnitt', S.note(st.schnitt), S.notenFarbe(st.schnitt))}
        ${kv('Mitarbeit', esc(s.mitarbeit || '–'))}${kv('Arbeitsweise', esc(s.verhalten || '–'))}${kv('Fehlzeiten', esc(s.fehlzeiten || '–'))}`),
        `<button id="noten">Noten ${icon('pencil', 12)}</button>`)}

      ${abschnitt('Beobachtungen', (s.notizen?.length ? s.notizen.map((n) => `
        <div class="zeile" data-notiz="${n.id}" style="cursor:default">
          <span class="dim">${icon('notebook', 16)}</span>
          <span class="txt"><b style="font-weight:500;white-space:normal">${esc(n.text)}</b><small>${S.fmtKurz(n.datum)}</small></span>
          <span class="chev" data-weg="${n.id}" style="cursor:pointer">${icon('x', 15)}</span></div>`).join('')
        : leer('Noch keine Beobachtungen erfasst.')) + `<button class="btn geist" id="neueNotiz" style="border-style:dashed;margin-top:8px">${icon('plus', 15)} Beobachtung hinzufügen</button>`)}

      ${s.kollegen?.length ? abschnitt('Rückmeldungen aus anderen Fächern', karte(s.kollegen.map((x) => kv(x.fach, esc(x.text))).join(''))) : ''}

      ${abschnitt('Abgeleitete Anpassung', karte(`
        <p class="mini dim" style="margin-bottom:8px">Diese Anpassung verwendet die App automatisch für individuelle Arbeitsblätter:</p>
        ${kv('Niveau', esc(ab.niveau))}${kv('Umfang', esc(ab.umfang))}
        ${ab.schwerpunkt.length ? kv('Schwerpunkt', esc(ab.schwerpunkt.join('; '))) : ''}
        ${ab.hilfen.length ? kv('Hilfen', esc(ab.hilfen.join('; '))) : ''}
        ${ab.zusatz.length ? kv('Zusatz', esc(ab.zusatz.join('; '))) : ''}`))}

      ${s.foerder ? box('info', s.foerder, 'Förderhinweis') : ''}

      <div class="knopfspalte">
        ${btn('Individuelles Arbeitsblatt', { ton: 'violet', symbol: 'wand', route: `w/individuell?klasse=${s.klasseId}&nur=${s.id}` })}
        ${geist('Zusammenfassung auf einem Blatt', { symbol: 'fileText', route: 'blatt/' + s.id })}
        ${geist('Förderplan erzeugen', { symbol: 'target', id: 'plan' })}
      </div>
      <div id="raus"></div>
    </div>`;

  $('#bearb').onclick = () => schuelerSheet(s.id);
  $('#noten').onclick = () => schuelerSheet(s.id);
  $('#neueNotiz').onclick = () => notizSheet(s.id);
  $$('[data-weg]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    S.aendern(() => { s.notizen = s.notizen.filter((n) => n.id !== b.dataset.weg); });
    schueler([id]);
  });
  $('#plan').onclick = () => {
    const prompt = KI.promptFoerderplan(s, { anonym: S.state().profil.anonymisieren });
    ergebnis('#raus', prompt, { titel: 'Förderplan ' + S.anzeige(s), dateiname: dateiName('foerderplan-' + s.pseudonym),
      archiv: { art: 'Förderplan', klasseId: s.klasseId, schuelerId: s.id }, prompt });
    $('#raus').scrollIntoView({ behavior: 'smooth' });
  };
}

function notizSheet(schuelerId) {
  const s = S.schueler(schuelerId);
  sheet('Beobachtung festhalten', S.anzeige(s), `
    ${feld('Beobachtung', 'text', { zeilen: 3, platz: 'z. B. unsicher bei rechtlichen Fachbegriffen' })}
    ${feld('Datum', 'datum', { typ: 'date', wert: S.heute() })}
    ${box('info', 'Beobachtungen fließen direkt in die individuellen Arbeitsblätter ein – je konkreter, desto passender das Material.')}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      if (!w.text.trim()) return toast('Bitte einen Text eingeben');
      S.aendern(() => { s.notizen = [{ id: S.uid(), datum: w.datum, text: w.text.trim() }, ...(s.notizen || [])]; });
      zu(); schueler([schuelerId]); toast('Beobachtung gespeichert');
    };
  });
}

export function schuelerSheet(id = null, klasseId = null) {
  const s = id ? S.schueler(id) : null;
  const kId = s?.klasseId || klasseId;
  const k = S.klasse(kId);
  const lfs = (k?.lernfelder || []).map((l) => l.code);
  const felder = lfs.length ? lfs : Object.keys(s?.noten || { LF4: '' });
  sheet(s ? 'Angaben bearbeiten' : 'Lernende/n hinzufügen', 'Klarnamen bleiben auf diesem Gerät.', `
    ${feld('Name', 'name', { wert: s?.name || '', platz: 'Vorname Nachname' })}
    ${feld('Pseudonym', 'pseudonym', { wert: s?.pseudonym || `${k?.code || 'KL'}-${String(S.schuelerDer(kId).length + 1).padStart(3, '0')}`, hinweis: 'Erscheint in allen KI-Anfragen und Exporten.' })}
    <div class="feld"><label>Noten</label><div class="feld-2">
      ${felder.map((lf) => `<input name="note_${lf}" value="${esc(s?.noten?.[lf] || '')}" placeholder="${lf} z. B. 2,3">`).join('')}
    </div></div>
    ${feld('Mitarbeit', 'mitarbeit', { wert: s?.mitarbeit || 'gut', optionen: ['hervorragend', 'sehr gut', 'gut', 'befriedigend', 'wechselhaft', 'schwankend', 'zurückhaltend', 'gering'] })}
    ${feld('Arbeitsweise / Verhalten', 'verhalten', { wert: s?.verhalten || '', platz: 'z. B. zuverlässig, leicht ablenkbar' })}
    ${feld('Fehlzeiten', 'fehlzeiten', { wert: s?.fehlzeiten || '0 Tage' })}
    ${feld('Förderhinweis', 'foerder', { wert: s?.foerder || '', zeilen: 2, platz: 'Woran soll gearbeitet werden?' })}
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}${s ? geist('Löschen', { symbol: 'trash', id: 'weg' }) : ''}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      const noten = {};
      Object.entries(w).forEach(([n, v]) => { if (n.startsWith('note_') && String(v).trim()) noten[n.slice(5)] = String(v).trim(); });
      const daten = { name: w.name.trim(), pseudonym: w.pseudonym.trim(), noten, mitarbeit: w.mitarbeit, verhalten: w.verhalten, fehlzeiten: w.fehlzeiten, foerder: w.foerder };
      if (s) S.aendern(() => Object.assign(s, daten));
      else S.aendern((d) => d.schueler.push({ id: S.uid(), klasseId: kId, notizen: [], kollegen: [], ...daten }));
      zu(); toast('Gespeichert');
      location.hash = s ? `#/schueler/${s.id}` : `#/liste/${kId}`;
    };
    el.querySelector('#weg')?.addEventListener('click', async () => {
      if (!await frage('Eintrag löschen?', S.anzeige(s), 'Löschen')) return;
      S.aendern((d) => { d.schueler = d.schueler.filter((x) => x.id !== s.id); d.gruppen.forEach((g) => { g.schuelerIds = g.schuelerIds.filter((x) => x !== s.id); }); });
      zu(); location.hash = `#/liste/${kId}`;
    });
  });
}

/* ---------- Zusammenfassung auf einem Blatt ---------- */
export function blatt([id]) {
  const s = S.schueler(id);
  if (!s) return klassen();
  const k = S.klasse(s.klasseId);
  const st = S.lernstand(s);
  const p = S.state().profil;
  const block = (t, x) => `<div class="babschnitt"><div class="btitel">${esc(t)}</div><div class="btext">${esc(x || '–')}</div></div>`;
  screenEl().innerHTML = `
    ${nav({ titel: 'Zusammenfassung', unter: `${S.anzeige(s)} · ${k?.code || ''}`, symbol: 'fileText', grad: 'g-sky' })}
    <div class="pad">
      <div class="blatt" id="blatt">
        <div class="bkopf">
          <div>${p.schullogo ? `<img class="logo" src="${p.schullogo}" alt="">` : `<div style="font-size:11px;font-weight:700;color:#1F4E79">${esc(p.schule || '')}</div>`}
            <h4>${esc(S.anzeige(s))}</h4>
            <div class="bmeta">Klasse ${esc(k?.code || '')} · Stand ${new Date().toLocaleDateString('de-DE')}</div></div>
          <div style="text-align:right"><div class="bmeta">Ø</div><div class="serif" style="font-size:22px;font-weight:700;color:#1F4E79">${S.note(st.schnitt)}</div></div>
        </div>
        ${block('Notenstand', Object.entries(s.noten || {}).map(([lf, n]) => `${lf}: ${n}`).join(' · '))}
        ${block('Mitarbeit und Arbeitsweise', `${s.mitarbeit || '–'} · ${s.verhalten || '–'}`)}
        ${block('Fehlzeiten', s.fehlzeiten)}
        ${block('Beobachtungen', (s.notizen || []).map((n) => `${S.fmtKurz(n.datum)}: ${n.text}`).join('\n') || 'keine')}
        ${block('Rückmeldungen aus anderen Fächern', (s.kollegen || []).map((x) => `${x.fach}: ${x.text}`).join('\n') || 'keine')}
        ${block('Entwicklungsfelder', s.foerder)}
        ${block('Vereinbarungen im Gespräch', '\n\n')}
      </div>
      <div class="knopfspalte">
        ${btn('Als Word-Datei speichern', { ton: 'sky', symbol: 'download', id: 'word' })}
        ${geist('Für Elternsprechtag mit Gesprächsleitfaden', { symbol: 'sparkles', id: 'leitfaden' })}
      </div>
      <div id="raus"></div>
    </div>`;
  $('#word').onclick = () => {
    const html = `<h1>Gesprächsmappe ${esc(S.anzeige(s))}</h1>
      <p>Klasse ${esc(k?.code || '')} · Stand ${new Date().toLocaleDateString('de-DE')} · Durchschnitt ${S.note(st.schnitt)}</p>
      <h2>Notenstand</h2><table><tr>${Object.keys(s.noten || {}).map((x) => `<th>${x}</th>`).join('')}</tr>
      <tr>${Object.values(s.noten || {}).map((x) => `<td>${esc(x)}</td>`).join('')}</tr></table>
      <h2>Mitarbeit und Arbeitsweise</h2><p>${esc(s.mitarbeit || '')} · ${esc(s.verhalten || '')}<br>Fehlzeiten: ${esc(s.fehlzeiten || '')}</p>
      <h2>Beobachtungen</h2><ul>${(s.notizen || []).map((n) => `<li>${S.fmtKurz(n.datum)}: ${esc(n.text)}</li>`).join('') || '<li>keine</li>'}</ul>
      <h2>Entwicklungsfelder</h2><p>${esc(s.foerder || '')}</p>
      <h2>Gesprächsnotizen</h2><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><h2>Vereinbarungen</h2><p>&nbsp;</p><p>&nbsp;</p>`;
    alsWord(`gespraech-${dateiName(s.pseudonym)}.doc`, 'Gesprächsmappe', html);
  };
  $('#leitfaden').onclick = () => {
    const anonym = S.state().profil.anonymisieren;
    const prompt = `## Auftrag
Erstelle einen Gesprächsleitfaden für ein Elternsprechtagsgespräch (15 Minuten).

## Lernprofil
${KI.profilText(s, { anonym })}

## Vorgaben
- Gliederung: Einstieg, Stärken, Entwicklungsfelder, konkrete Vereinbarungen, Abschluss
- Wertschätzend und lösungsorientiert formulieren, keine Schuldzuweisungen
- Je Punkt eine mögliche Gesprächsfrage ergänzen`;
    ergebnis('#raus', prompt, { titel: 'Gesprächsleitfaden ' + S.anzeige(s), dateiname: dateiName('leitfaden-' + s.pseudonym), prompt,
      archiv: { art: 'Gesprächsleitfaden', klasseId: s.klasseId, schuelerId: s.id } });
    $('#raus').scrollIntoView({ behavior: 'smooth' });
  };
}

/* ---------- Klassenanalyse ---------- */
export function analyse([klasseId]) {
  const k = S.klasse(klasseId);
  const sus = S.schuelerDer(klasseId);
  const werte_ = sus.map(S.schnitt).filter((x) => x !== null);
  const mittel = werte_.length ? werte_.reduce((a, b) => a + b, 0) / werte_.length : null;
  const gruppen = [
    ['1,0 – 2,0', werte_.filter((a) => a <= 2).length, 'b-ok'],
    ['2,1 – 3,0', werte_.filter((a) => a > 2 && a <= 3).length, 'b-note'],
    ['3,1 – 4,0', werte_.filter((a) => a > 3 && a <= 4).length, 'b-warn'],
    ['über 4,0', werte_.filter((a) => a > 4).length, 'b-bad'],
  ];
  const max = Math.max(1, ...gruppen.map((g) => g[1]));
  const auff = sus.map((s) => ({ s, l: S.lernstand(s) })).filter((x) => ['dringend', 'erhoeht'].includes(x.l.stufe));

  screenEl().innerHTML = `
    ${nav({ titel: 'Klassenanalyse ' + (k?.code || ''), unter: `${sus.length} Lernende`, symbol: 'chart', grad: 'g-sky' })}
    <div class="pad">
      ${karte(`<div style="text-align:center"><p class="mini dim">Notenschnitt der Klasse</p>
        <p class="serif ${S.notenFarbe(mittel)}" style="font-size:40px;font-weight:700;margin-top:4px">Ø ${S.note(mittel)}</p></div>`)}
      ${abschnitt('Notenverteilung', karte(gruppen.map(([l, n, c]) => `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span class="klein" style="font-weight:600">${l}</span>
          <span class="klein dim">${n} ${n === 1 ? 'Person' : 'Personen'}</span></div>
          <div class="balken"><i class="${c}" style="width:${Math.round((n / max) * 100)}%"></i></div>
        </div>`).join('')))}
      ${abschnitt('Auffällig', auff.length ? auff.map(({ s, l }) => zeile({ punkt: l.stufe === 'dringend' ? 'b-bad' : 'b-warn',
        titel: S.anzeige(s), unter: l.gruende.join(' · '), route: 'schueler/' + s.id })).join('') : leer('Keine Auffälligkeiten.'))}
      <div class="knopfspalte">
        ${btn('KI-Auswertung der Lerngruppe', { ton: 'sky', symbol: 'sparkles', id: 'ki' })}
        ${geist('Bericht als Word-Datei', { symbol: 'download', id: 'word' })}
        ${geist('Individuelle Arbeitsblätter für die Auffälligen', { symbol: 'wand', route: `w/individuell?klasse=${klasseId}&auswahl=foerder` })}
      </div>
      <div id="raus"></div>
    </div>`;
  $('#ki').onclick = () => {
    const prompt = KI.promptKlassenanalyse(klasseId, { anonym: S.state().profil.anonymisieren });
    ergebnis('#raus', prompt, { titel: 'Analyse ' + (k?.code || ''), dateiname: dateiName('analyse-' + k?.code), prompt,
      archiv: { art: 'Klassenanalyse', klasseId } });
    $('#raus').scrollIntoView({ behavior: 'smooth' });
  };
  $('#word').onclick = () => {
    const html = `<h1>Lernstandsbericht ${esc(k?.code || '')}</h1>
      <p>Stand ${new Date().toLocaleDateString('de-DE')} · ${sus.length} Lernende · Klassenschnitt ${S.note(mittel)}</p>
      <table><tr><th>Pseudonym</th><th>Ø</th><th>Mitarbeit</th><th>Hinweis</th></tr>
      ${sus.map((s) => { const l = S.lernstand(s); return `<tr><td>${esc(s.pseudonym)}</td><td>${S.note(l.schnitt)}</td><td>${esc(s.mitarbeit || '')}</td><td>${esc(l.gruende.join('; '))}</td></tr>`; }).join('')}</table>`;
    alsWord(`lernstand-${dateiName(k?.code)}.doc`, 'Lernstandsbericht', html);
  };
}

/* ---------- Gruppen ---------- */
export function gruppe([id]) {
  const g = S.state().gruppen.find((x) => x.id === id);
  if (!g) return klassen();
  const sus = g.schuelerIds.map(S.schueler).filter(Boolean);
  screenEl().innerHTML = `
    ${nav({ titel: g.name, unter: `${g.niveau} · ${sus.length} Lernende`, symbol: 'users', grad: 'g-indigo',
      rechts: `<button class="zurueck" id="bearb" aria-label="Bearbeiten">${icon('pencil', 16)}</button>` })}
    <div class="pad">
      ${karte(`${kv('Niveau', esc(g.niveau))}${kv('Ziel', esc(g.ziel || '–'))}${kv('Größe', sus.length + '')}`)}
      ${abschnitt('Zugeordnete Lernende', sus.map((s) => zeile({ symbol: 'user', grad: 'g-slate', titel: S.anzeige(s),
        unter: 'Ø ' + S.note(S.schnitt(s)), route: 'schueler/' + s.id })).join('') || leer('Niemand zugeordnet.'))}
      <div class="knopfspalte">
        ${btn('Individuelle Arbeitsblätter für die Gruppe', { ton: 'violet', symbol: 'wand', route: `w/individuell?klasse=${g.klasseId}&gruppe=${g.id}` })}
        ${geist('Gemeinsames Arbeitsblatt', { symbol: 'fileEdit', route: `assistent?klasse=${g.klasseId}&niveau=${encodeURIComponent(g.niveau)}` })}
      </div>
    </div>`;
  $('#bearb').onclick = () => gruppeSheet(g.id, g.klasseId);
}

export function gruppeSheet(id = null, klasseId = null) {
  const g = id ? S.state().gruppen.find((x) => x.id === id) : null;
  const kId = g?.klasseId || klasseId;
  const sus = S.schuelerDer(kId);
  sheet(g ? 'Gruppe bearbeiten' : 'Neue Gruppe', S.klasse(kId)?.code || '', `
    ${feld('Name', 'name', { wert: g?.name || '', platz: 'z. B. Fördergruppe Grundlagen' })}
    ${feld('Niveau', 'niveau', { wert: g?.niveau || 'Einstieg', optionen: S.NIVEAUS })}
    ${feld('Ziel', 'ziel', { wert: g?.ziel || '', zeilen: 2 })}
    <div class="feld"><label>Mitglieder</label><div id="mitglieder">
      ${sus.map((s) => `<label class="wahl" style="cursor:pointer">
        <span class="txt"><b>${esc(S.anzeige(s))}</b><small>Ø ${S.note(S.schnitt(s))}</small></span>
        <input type="checkbox" class="kipp" name="m_${s.id}" ${g?.schuelerIds.includes(s.id) ? 'checked' : ''}></label>`).join('')}
    </div></div>
    <div class="knopfspalte">${btn('Speichern', { id: 'ok' })}${g ? geist('Gruppe löschen', { symbol: 'trash', id: 'weg' }) : ''}</div>`, (el) => {
    el.querySelector('#ok').onclick = () => {
      const w = werte(el);
      const ids = sus.filter((s) => w['m_' + s.id]).map((s) => s.id);
      if (!w.name.trim()) return toast('Bitte einen Namen angeben');
      if (g) S.aendern(() => Object.assign(g, { name: w.name, niveau: w.niveau, ziel: w.ziel, schuelerIds: ids }));
      else S.aendern((d) => d.gruppen.push({ id: S.uid(), klasseId: kId, name: w.name, niveau: w.niveau, ziel: w.ziel, schuelerIds: ids, material: [] }));
      zu(); toast('Gespeichert'); location.hash = '#/klasse/' + kId;
    };
    el.querySelector('#weg')?.addEventListener('click', () => {
      S.aendern((d) => { d.gruppen = d.gruppen.filter((x) => x.id !== g.id); });
      zu(); location.hash = '#/klasse/' + kId;
    });
  });
}
