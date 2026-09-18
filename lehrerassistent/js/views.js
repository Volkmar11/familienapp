/* Die fuenf Hauptbereiche: Start, Klassen, Sprache, Sync, Profil */

import * as S from './state.js';
import { $, $$, esc, sheet, schliessen, toast, feld, werte, frage, kopieren, herunterladen, grad } from './ui.js';
import * as Sp from './sprache.js';
import * as Tresor from './vault.js';
import { WERKZEUGE } from './werkzeuge.js';
import { gehe } from './router.js';

const view = () => $('#view');

function gruss() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : 'Guten Abend';
}

export function offeneHinweise() {
  const d = S.state();
  const hin = [];
  d.aufgaben.filter((a) => !a.erledigt && a.faellig).forEach((a) => {
    const t = S.tageBis(a.faellig);
    if (t !== null && t <= 1) hin.push({ icon: '✅', grad: 'grad-amber', titel: a.titel, text: t < 0 ? `überfällig seit ${Math.abs(t)} Tag(en)` : t === 0 ? 'heute fällig' : 'morgen fällig', route: 'w:organisation' });
  });
  d.termine.forEach((t) => {
    const tg = S.tageBis(t.datum);
    if (tg !== null && tg >= 0 && tg <= 1) hin.push({ icon: '📅', grad: 'grad-sky', titel: t.titel, text: `${tg === 0 ? 'heute' : 'morgen'}${t.zeit ? ', ' + t.zeit + ' Uhr' : ''}`, route: 'w:kalender' });
  });
  if (Tresor.tresorVorhanden() && !Tresor.istOffen()) hin.push({ icon: '🔐', grad: 'grad-green', titel: 'Tresor ist verschlossen', text: 'Klarnamen sind geschützt', route: 'w:tresor' });
  if (!Tresor.tresorVorhanden() && d.schueler.some((s) => s.name)) hin.push({ icon: '🔐', grad: 'grad-rose', titel: 'Klarnamen ohne Tresor', text: 'Jetzt verschlüsselt ablegen', route: 'w:tresor' });
  return hin;
}

/* ---------------- Start ---------------- */

export function start() {
  const d = S.state();
  const name = d.profil.name ? `, ${d.profil.name.split(' ')[0]}` : '';
  const tag = new Date().getDay();
  const heuteStunden = d.stundenplan.filter((s) => s.tag === tag).sort((a, b) => a.stunde - b.stunde);
  const termine = [...d.termine].filter((t) => S.tageBis(t.datum) >= 0).sort((a, b) => (a.datum + (a.zeit || '')).localeCompare(b.datum + (b.zeit || ''))).slice(0, 3);
  const aufgaben = d.aufgaben.filter((a) => !a.erledigt).sort((a, b) => (a.prio - b.prio) || (a.faellig || 'z').localeCompare(b.faellig || 'z')).slice(0, 4);

  view().innerHTML = `
    <div class="page-title">${gruss()}${esc(name)}</div>
    <div class="page-sub">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}${d.profil.schule ? ' · ' + esc(d.profil.schule) : ''}</div>

    <div class="feld"><input id="suche" type="search" placeholder="🔍 Suchen: Notizen, Material, Klassen, Termine …"></div>
    <div id="sucheErgebnis"></div>

    <div class="quick">
      <button data-go="w:material"><span>📄</span>Material</button>
      <button data-go="sprache"><span>🎤</span>Diktat</button>
      <button data-go="w:notizen"><span>📝</span>Notiz</button>
    </div>

    <div class="section">
      <div class="section-h">Heute im Unterricht <button class="act" data-go="w:kalender">Plan öffnen</button></div>
      <div class="card">
        ${tag === 0 || tag === 6 ? '<div class="muted tiny">Wochenende – kein Unterricht eingetragen.</div>'
          : heuteStunden.length ? heuteStunden.map((s) => {
            const k = S.klasse(s.klasseId);
            return `<div class="row"><div class="ic grad-blue">${s.stunde}.</div>
              <div class="txt"><b>${esc(s.fach || k?.name || 'Stunde')}</b><small>${esc(k?.name || '')}${s.raum ? ' · Raum ' + esc(s.raum) : ''}</small></div></div>`;
          }).join('') : '<div class="muted tiny">Noch kein Stundenplan hinterlegt. <b data-go="w:kalender" style="color:var(--amber);cursor:pointer">Jetzt anlegen</b></div>'}
      </div>
    </div>

    <div class="section">
      <div class="section-h">Nächste Termine <button class="act" data-go="w:kalender">Alle</button></div>
      ${termine.length ? `<div class="card">${termine.map((t) => `<div class="row"><div class="ic grad-sky">📅</div>
        <div class="txt"><b>${esc(t.titel)}</b><small>${S.fmtDatum(t.datum)}${t.zeit ? ', ' + esc(t.zeit) + ' Uhr' : ''}${t.ort ? ' · ' + esc(t.ort) : ''}</small></div></div>`).join('')}</div>`
        : '<div class="empty">Keine anstehenden Termine.</div>'}
    </div>

    <div class="section">
      <div class="section-h">Aufgaben <button class="act" data-go="w:organisation">Alle</button></div>
      ${aufgaben.length ? `<div class="liste">${aufgaben.map((a) => `<div class="item" data-auf="${a.id}">
        <button class="chk" data-fertig="${a.id}" aria-label="erledigt"></button>
        <div class="txt"><b>${esc(a.titel)}</b><small>${S.PRIOS[a.prio] || ''}${a.faellig ? ' · fällig ' + S.fmtKurz(a.faellig) : ''}</small></div>
        <span class="pt pt-${a.prio}"></span></div>`).join('')}</div>`
        : '<div class="empty">Keine offenen Aufgaben. 🎉</div>'}
    </div>

    <div class="section">
      <div class="section-h">Werkzeuge</div>
      <div class="tools">
        ${WERKZEUGE.map((w, i) => `<button class="tool" data-go="w:${w.id}">
          <div class="ic ${w.grad}">${w.icon}</div>${esc(w.kurz)}</button>`).join('')}
      </div>
    </div>`;

  $('#suche').oninput = (e) => suchen(e.target.value);
  $$('[data-fertig]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    S.aendern((d2) => { const a = d2.aufgaben.find((x) => x.id === b.dataset.fertig); if (a) { a.erledigt = true; a.erledigtAm = S.jetzt(); } });
    toast('Erledigt ✓'); start();
  });
  $$('[data-auf]').forEach((el) => el.onclick = () => gehe('w:organisation'));
}

function suchen(q) {
  const ziel = $('#sucheErgebnis');
  const t = q.trim().toLowerCase();
  if (t.length < 2) { ziel.innerHTML = ''; return; }
  const d = S.state();
  const tr = [];
  d.notizen.filter((n) => (n.titel + n.text).toLowerCase().includes(t)).forEach((n) => tr.push({ icon: '📝', titel: n.titel, sub: S.fmtKurz(n.datum), route: 'w:notizen' }));
  d.materialien.filter((m) => (m.thema + m.typ).toLowerCase().includes(t)).forEach((m) => tr.push({ icon: '📄', titel: m.thema, sub: m.typ, route: 'w:material' }));
  d.aufgaben.filter((a) => a.titel.toLowerCase().includes(t)).forEach((a) => tr.push({ icon: '✅', titel: a.titel, sub: a.erledigt ? 'erledigt' : 'offen', route: 'w:organisation' }));
  d.termine.filter((x) => x.titel.toLowerCase().includes(t)).forEach((x) => tr.push({ icon: '📅', titel: x.titel, sub: S.fmtKurz(x.datum), route: 'w:kalender' }));
  d.klassen.filter((k) => k.name.toLowerCase().includes(t)).forEach((k) => tr.push({ icon: '👥', titel: k.name, sub: S.BILDUNGSGAENGE[k.bildungsgang]?.label || '', route: 'klasse:' + k.id }));
  d.schueler.filter((s) => S.anzeigeName(s).toLowerCase().includes(t)).forEach((s) => tr.push({ icon: '🧑‍🎓', titel: S.anzeigeName(s), sub: S.klasse(s.klasseId)?.name || '', route: 'schueler:' + s.id }));

  ziel.innerHTML = tr.length
    ? `<div class="card" style="margin-bottom:16px">${tr.slice(0, 8).map((x) => `<div class="row" data-go="${x.route}" style="cursor:pointer">
        <div class="ic grad-slate">${x.icon}</div><div class="txt"><b>${esc(x.titel)}</b><small>${esc(x.sub)}</small></div><span class="chev">›</span></div>`).join('')}</div>`
    : '<div class="empty" style="margin-bottom:16px">Nichts gefunden.</div>';
}

/* ---------------- Klassen ---------------- */

export function klassen() {
  const d = S.state();
  view().innerHTML = `
    <div class="page-title">Klassen</div>
    <div class="page-sub">${d.klassen.length} Klassen · ${d.schueler.length} Lernende</div>
    ${d.klassen.length ? `<div class="liste">${d.klassen.map((k) => {
      const anz = S.schuelerDerKlasse(k.id).length;
      const noten = d.noten.filter((n) => S.schuelerDerKlasse(k.id).some((s) => s.id === n.schuelerId));
      const sch = S.schnitt(noten);
      return `<div class="item" data-go="klasse:${k.id}">
        <div class="ic ${grad(d.klassen.indexOf(k))}" style="width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.78rem">${esc(k.name.slice(0, 4))}</div>
        <div class="txt"><b>${esc(k.name)}</b><small>${esc(S.BILDUNGSGAENGE[k.bildungsgang]?.label || '')} · ${anz} Lernende${sch ? ' · Ø ' + sch.toFixed(2).replace('.', ',') : ''}</small></div>
        <span class="chev">›</span></div>`;
    }).join('')}</div>` : '<div class="empty">Noch keine Klasse angelegt.<br>Legen Sie Ihre erste Klasse an – Lernfelder werden automatisch vorbelegt.</div>'}
    <div class="btn-row"><button class="btn btn-amber btn-block" id="neu">＋ Klasse anlegen</button></div>`;

  $('#neu').onclick = klasseBearbeiten;
}

export function klasseBearbeiten(id = null) {
  const k = id ? S.klasse(id) : null;
  sheet(k ? 'Klasse bearbeiten' : 'Neue Klasse', 'Lernfelder werden aus dem Rahmenlehrplan vorbelegt und bleiben änderbar.', `
    ${feld('Bezeichnung', 'name', { wert: k?.name || '', platzhalter: 'z. B. 1BM1' })}
    ${feld('Bildungsgang', 'bildungsgang', { wert: k?.bildungsgang || 'BM', optionen: Object.entries(S.BILDUNGSGAENGE).map(([v, o]) => [v, o.label]) })}
    <div class="feld-2">${feld('Ausbildungsjahr', 'jahrgang', { wert: k?.jahrgang || '1', optionen: ['1', '2', '3'] })}${feld('Raum', 'raum', { wert: k?.raum || '' })}</div>
    ${feld('Notiz zur Klasse', 'notiz', { wert: k?.notiz || '', zeilen: 2, platzhalter: 'Besonderheiten, Termine, Absprachen' })}
    <div class="btn-row">
      <button class="btn btn-amber" data-ok>${k ? 'Speichern' : 'Anlegen'}</button>
      ${k ? '<button class="btn btn-danger" data-loesch>Klasse löschen</button>' : ''}
    </div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      if (!w.name.trim()) { toast('Bitte eine Bezeichnung angeben'); return; }
      if (k) S.aendern(() => Object.assign(k, w));
      else S.aendern((d) => d.klassen.push({ id: S.uid(), ...w, lernfelder: [], angelegt: S.jetzt() }));
      S.merken('klassen', w.name);
      schliessen(); gehe(k ? 'klasse:' + k.id : 'klassen');
      toast('Gespeichert');
    };
    el.querySelector('[data-loesch]')?.addEventListener('click', async () => {
      if (!await frage('Klasse löschen?', `${k.name} und alle zugehörigen Lernenden, Noten und Beobachtungen werden entfernt.`, 'Endgültig löschen')) return;
      S.aendern((d) => {
        const ids = d.schueler.filter((s) => s.klasseId === k.id).map((s) => s.id);
        d.schueler = d.schueler.filter((s) => s.klasseId !== k.id);
        d.noten = d.noten.filter((n) => !ids.includes(n.schuelerId));
        d.beobachtungen = d.beobachtungen.filter((b) => !ids.includes(b.schuelerId));
        d.klassen = d.klassen.filter((x) => x.id !== k.id);
      });
      schliessen(); gehe('klassen'); toast('Klasse gelöscht');
    });
  });
}

export function klasseDetail(id) {
  const k = S.klasse(id);
  if (!k) return gehe('klassen');
  const sus = S.schuelerDerKlasse(id);
  const lf = S.lernfelderFuer(k);
  view().innerHTML = `
    <div class="page-title">${esc(k.name)}</div>
    <div class="page-sub">${esc(S.BILDUNGSGAENGE[k.bildungsgang]?.label || '')}${k.jahrgang ? ' · ' + esc(k.jahrgang) + '. Ausbildungsjahr' : ''}${k.raum ? ' · Raum ' + esc(k.raum) : ''}</div>
    ${k.notiz ? `<div class="card" style="margin-bottom:16px"><small class="muted">${esc(k.notiz)}</small></div>` : ''}

    <div class="btn-row" style="margin-bottom:18px">
      <button class="btn btn-amber btn-sm" data-go="w:material">📄 Material</button>
      <button class="btn btn-ghost btn-sm" data-go="w:analyse">📊 Analyse</button>
      <button class="btn btn-ghost btn-sm" id="bearbeiten">⚙︎ Bearbeiten</button>
    </div>

    <div class="section">
      <div class="section-h">Lernende (${sus.length}) <button class="act" id="neuSus">＋ hinzufügen</button></div>
      ${sus.length ? `<div class="liste">${sus.map((s) => {
        const f = S.foerderbedarf(s.id);
        return `<div class="item" data-go="schueler:${s.id}">
          <div class="ic grad-slate" style="width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:.9rem">🧑‍🎓</div>
          <div class="txt"><b>${esc(S.anzeigeName(s))}</b><small>${esc(s.pseudonym)}${f.schnitt ? ' · Ø ' + f.schnitt.toFixed(2).replace('.', ',') : ' · noch keine Noten'}</small></div>
          ${f.bedarf ? '<span class="chip gelb">Förderbedarf</span>' : ''}<span class="chev">›</span></div>`;
      }).join('')}</div>` : '<div class="empty">Noch niemand eingetragen. Über den Tresor können Sie eine Klassenliste importieren.</div>'}
    </div>

    <div class="section">
      <div class="section-h">Lernfelder <button class="act" id="lfEdit">bearbeiten</button></div>
      <div class="card">${lf.length ? lf.map((x) => `<div class="row"><div class="ic grad-violet" style="font-size:.72rem;font-weight:800">LF${x.nr}</div>
        <div class="txt"><b style="font-size:.85rem;white-space:normal">${esc(x.titel)}</b></div></div>`).join('')
        : '<div class="muted tiny">Keine Lernfelder hinterlegt.</div>'}</div>
      <div class="tiny muted" style="margin-top:8px">Quelle: ${esc(S.BILDUNGSGAENGE[k.bildungsgang]?.quelle || '')}</div>
    </div>`;

  $('#bearbeiten').onclick = () => klasseBearbeiten(k.id);
  $('#neuSus').onclick = () => schuelerBearbeiten(null, k.id);
  $('#lfEdit').onclick = () => lernfelderBearbeiten(k);
}

function lernfelderBearbeiten(k) {
  const lf = S.lernfelderFuer(k);
  sheet('Lernfelder anpassen', k.name, `
    <div class="feld"><label>Ein Lernfeld je Zeile, Format: Nr|Titel</label>
    <textarea name="lf" rows="12">${esc(lf.map((x) => `${x.nr}|${x.titel}`).join('\n'))}</textarea>
    <div class="hint">Leer lassen und speichern stellt die Vorbelegung des Rahmenlehrplans wieder her.</div></div>
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button></div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const roh = werte(el).lf.trim();
      const neu = roh ? roh.split('\n').map((z) => {
        const [nr, ...rest] = z.split('|');
        return { nr: Number(String(nr).replace(/\D/g, '')) || 0, titel: rest.join('|').trim() || z.trim() };
      }).filter((x) => x.titel) : [];
      S.aendern(() => { k.lernfelder = neu; });
      schliessen(); klasseDetail(k.id); toast('Lernfelder gespeichert');
    };
  });
}

export function schuelerBearbeiten(id = null, klasseId = null) {
  const s = id ? S.state().schueler.find((x) => x.id === id) : null;
  const kId = s?.klasseId || klasseId;
  sheet(s ? 'Lernende/r bearbeiten' : 'Lernende/n hinzufügen',
    'Klarnamen bleiben auf diesem Gerät. Für die KI wird ausschließlich das Pseudonym verwendet.', `
    ${feld('Pseudonym', 'pseudonym', { wert: s?.pseudonym || S.naechstesPseudonym(kId), hint: 'So erscheint die Person in allen KI-Anfragen und Exporten.' })}
    ${feld('Name (optional, bleibt lokal)', 'name', { wert: s?.name || '', platzhalter: 'Vorname Nachname' })}
    ${feld('Klasse', 'klasseId', { wert: kId || '', optionen: S.state().klassen.map((k) => [k.id, k.name]) })}
    ${feld('Notiz', 'notiz', { wert: s?.notiz || '', zeilen: 2 })}
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button>
    ${s ? '<button class="btn btn-danger" data-loesch>Löschen</button>' : ''}</div>`, (el) => {
    el.querySelector('[data-ok]').onclick = async () => {
      const w = werte(el);
      if (!w.pseudonym.trim()) { toast('Bitte ein Pseudonym vergeben'); return; }
      if (s) S.aendern(() => Object.assign(s, w));
      else S.aendern((d) => d.schueler.push({ id: S.uid(), ...w, angelegt: S.jetzt() }));
      if (w.name && Tresor.istOffen()) { try { await Tresor.eintragen(w.pseudonym, w.name, w.klasseId); } catch { /* still */ } }
      schliessen(); gehe('klasse:' + w.klasseId); toast('Gespeichert');
    };
    el.querySelector('[data-loesch]')?.addEventListener('click', async () => {
      if (!await frage('Eintrag löschen?', `${S.anzeigeName(s)} samt Noten und Beobachtungen entfernen.`, 'Löschen')) return;
      S.aendern((d) => {
        d.schueler = d.schueler.filter((x) => x.id !== s.id);
        d.noten = d.noten.filter((n) => n.schuelerId !== s.id);
        d.beobachtungen = d.beobachtungen.filter((b) => b.schuelerId !== s.id);
      });
      schliessen(); gehe('klasse:' + s.klasseId); toast('Gelöscht');
    });
  });
}

export function schuelerDetail(id) {
  const d = S.state();
  const s = d.schueler.find((x) => x.id === id);
  if (!s) return gehe('klassen');
  const k = S.klasse(s.klasseId);
  const noten = S.notenVon(s.id);
  const f = S.foerderbedarf(s.id);
  const beob = d.beobachtungen.filter((b) => b.schuelerId === s.id).sort((a, b) => b.datum.localeCompare(a.datum));
  const lf = S.lernfelderFuer(k);

  view().innerHTML = `
    <div class="page-title">${esc(S.anzeigeName(s))}</div>
    <div class="page-sub">${esc(s.pseudonym)}${k ? ' · ' + esc(k.name) : ''}</div>
    ${f.bedarf ? `<div class="ampel gelb" style="margin-bottom:16px"><div class="pt">🟡</div><div><b>Förderbedarf erkannt</b><small>${esc(f.gruende.join(' · '))}</small></div></div>` : ''}

    <div class="section">
      <div class="section-h">Noten ${f.schnitt ? `· Ø ${f.schnitt.toFixed(2).replace('.', ',')}` : ''} <button class="act" id="neueNote">＋ Note</button></div>
      ${noten.length ? `<div class="card">${noten.map((n) => `<div class="row">
        <div class="ic ${Number(n.wert) <= 2 ? 'grad-green' : Number(n.wert) <= 4 ? 'grad-amber' : 'grad-rose'}" style="font-weight:800">${esc(n.wert)}</div>
        <div class="txt"><b>${esc(n.art)}</b><small>${esc(n.lernfeld || '')} · ${S.fmtKurz(n.datum)} · Gewicht ${esc(n.gewicht || 1)}</small></div>
        <button class="chk" data-notenweg="${n.id}">✕</button></div>`).join('')}</div>` : '<div class="empty">Noch keine Noten erfasst.</div>'}
    </div>

    <div class="section">
      <div class="section-h">Beobachtungen <button class="act" id="neueBeob">＋ Beobachtung</button></div>
      ${beob.length ? `<div class="liste">${beob.slice(0, 12).map((b) => `<div class="item">
        <span class="pt ${b.bewertung === 'positiv' ? 'pt-3' : b.bewertung === 'negativ' ? 'pt-1' : 'pt-2'}"></span>
        <div class="txt"><b style="white-space:normal;font-weight:600">${esc(b.text)}</b><small>${S.fmtDatum(b.datum)}</small></div>
        <button class="chk" data-beobweg="${b.id}">✕</button></div>`).join('')}</div>` : '<div class="empty">Noch keine Beobachtungen.</div>'}
    </div>

    <div class="btn-row">
      <button class="btn btn-ghost btn-sm" id="bearbeiten">⚙︎ Bearbeiten</button>
      <button class="btn btn-ghost btn-sm" id="mappe">📁 Elternsprechtag-Mappe</button>
    </div>`;

  $('#bearbeiten').onclick = () => schuelerBearbeiten(s.id);
  $('#neueNote').onclick = () => noteSheet(s, lf);
  $('#neueBeob').onclick = () => beobachtungSheet(s);
  $('#mappe').onclick = () => import('./werkzeuge.js').then((m) => m.elternmappe(s.id));
  $$('[data-notenweg]').forEach((b) => b.onclick = () => {
    S.aendern((dd) => { dd.noten = dd.noten.filter((n) => n.id !== b.dataset.notenweg); });
    schuelerDetail(id);
  });
  $$('[data-beobweg]').forEach((b) => b.onclick = () => {
    S.aendern((dd) => { dd.beobachtungen = dd.beobachtungen.filter((x) => x.id !== b.dataset.beobweg); });
    schuelerDetail(id);
  });
}

function noteSheet(s, lf) {
  sheet('Note erfassen', S.anzeigeName(s), `
    <div class="feld-2">
      ${feld('Note', 'wert', { wert: '3', optionen: ['1', '1,5', '2', '2,5', '3', '3,5', '4', '4,5', '5', '6'] })}
      ${feld('Gewicht', 'gewicht', { wert: '1', optionen: [['1', 'einfach'], ['2', 'doppelt'], ['0.5', 'halb']] })}
    </div>
    ${feld('Art der Leistung', 'art', { wert: 'Klassenarbeit', optionen: ['Klassenarbeit', 'Test', 'Mündliche Mitarbeit', 'Präsentation', 'Projekt', 'Hausaufgabe', 'Sonstiges'] })}
    ${feld('Lernfeld', 'lernfeld', { wert: '', optionen: [['', '– ohne –'], ...lf.map((x) => [`LF${x.nr}`, `LF${x.nr} ${x.titel.slice(0, 40)}`])] })}
    ${feld('Datum', 'datum', { typ: 'date', wert: S.heute() })}
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button></div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      S.aendern((d) => d.noten.push({ id: S.uid(), schuelerId: s.id, ...w, wert: String(w.wert).replace(',', '.') }));
      schliessen(); schuelerDetail(s.id); toast('Note gespeichert');
    };
  });
}

function beobachtungSheet(s) {
  sheet('Beobachtung festhalten', S.anzeigeName(s), `
    ${feld('Beobachtung', 'text', { zeilen: 3, platzhalter: 'z. B. arbeitet konzentriert an der Fallstudie mit' })}
    ${feld('Einordnung', 'bewertung', { wert: 'neutral', optionen: [['positiv', 'positiv'], ['neutral', 'neutral'], ['negativ', 'kritisch']] })}
    ${feld('Datum', 'datum', { typ: 'date', wert: S.heute() })}
    <div class="btn-row"><button class="btn btn-amber" data-ok>Speichern</button></div>`, (el) => {
    el.querySelector('[data-ok]').onclick = () => {
      const w = werte(el);
      if (!w.text.trim()) { toast('Bitte einen Text eingeben'); return; }
      S.aendern((d) => d.beobachtungen.push({ id: S.uid(), schuelerId: s.id, klasseId: s.klasseId, ...w }));
      schliessen(); schuelerDetail(s.id); toast('Beobachtung gespeichert');
    };
  });
}

/* ---------------- Sprache ---------------- */

let erkennung = null;
let letzterText = '';

export function sprache() {
  const verf = Sp.erkennungVerfuegbar();
  view().innerHTML = `
    <div class="page-title">Sprachsteuerung</div>
    <div class="page-sub">Sagen Sie in einem Satz, was zu tun ist – die App legt Arbeitsblatt, Beobachtung, Termin, Aufgabe oder Notiz an.</div>

    <button class="mic-big" id="mic">🎤</button>
    <div class="welle" id="welle">${'<i></i>'.repeat(7)}</div>
    <div class="tiny muted" style="text-align:center;margin-bottom:14px" id="status">
      ${verf ? 'Tippen Sie auf das Mikrofon und sprechen Sie.' : 'Dieser Browser kennt keine Spracherkennung – nutzen Sie das Mikrofon Ihrer Tastatur im Textfeld unten.'}
    </div>

    ${feld('Diktat / Text', 'text', { zeilen: 4, platzhalter: 'z. B. Mach ein Arbeitsblatt zum Lieferungsverzug für die 1BM1 in LF4 und trage den Termin Notenkonferenz am Dienstag um 10 Uhr ein' })}

    <div class="btn-row">
      <button class="btn btn-amber" id="auswerten">✨ Auswerten &amp; anlegen</button>
      <button class="btn btn-ghost" id="leeren">Leeren</button>
    </div>

    <div id="ergebnis" style="margin-top:18px"></div>

    <div class="section" style="margin-top:22px">
      <div class="section-h">Beispiele zum Antippen</div>
      <div class="liste">${Sp.BEISPIELE.map((b, i) => `<div class="item" data-bsp="${i}"><div class="txt"><b style="white-space:normal;font-weight:600">${esc(b)}</b></div></div>`).join('')}</div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="row"><div class="ic grad-green">🔒</div><div class="txt"><b>Wo bleibt das Gesagte?</b>
      <small>Der Text wird nur auf diesem Gerät ausgewertet – durch feste Regeln, ohne Cloud. Erst wenn Sie ein Material erzeugen lassen, geht ein Prompt (nach Ihrer Freigabe) an das gewählte KI-Modell.</small></div></div>
    </div>`;

  const ta = $('[name=text]');
  ta.value = letzterText;
  ta.oninput = () => { letzterText = ta.value; };
  $('#leeren').onclick = () => { ta.value = ''; letzterText = ''; $('#ergebnis').innerHTML = ''; };
  $('#auswerten').onclick = () => auswerten(ta.value);
  $$('[data-bsp]').forEach((el) => el.onclick = () => { ta.value = Sp.BEISPIELE[el.dataset.bsp]; letzterText = ta.value; auswerten(ta.value); });
  $('#mic').onclick = () => mikroUmschalten(ta);
}

export function mikroUmschalten(ta) {
  const mic = $('#mic') || $('#tabmic');
  const welle = $('#welle');
  if (erkennung) {
    erkennung.stop(); erkennung = null;
    mic?.classList.remove('rec'); welle?.classList.remove('rec');
    $('#status') && ($('#status').textContent = 'Aufnahme beendet.');
    return;
  }
  if (!Sp.erkennungVerfuegbar()) { toast('Bitte das Mikrofon der Tastatur im Textfeld nutzen'); ta?.focus(); return; }
  erkennung = Sp.starten({
    onText: (alles) => { if (ta) { ta.value = alles; letzterText = alles; } },
    onEnde: () => {
      erkennung = null;
      mic?.classList.remove('rec'); welle?.classList.remove('rec');
      const s = $('#status'); if (s) s.textContent = 'Aufnahme beendet – jetzt auswerten.';
    },
    onFehler: (m) => { toast(m); erkennung = null; mic?.classList.remove('rec'); welle?.classList.remove('rec'); },
  });
  if (erkennung) {
    mic?.classList.add('rec'); welle?.classList.add('rec');
    const s = $('#status'); if (s) s.textContent = 'Ich höre zu …';
  }
}

function auswerten(text) {
  const treffer = Sp.analysieren(text);
  const ziel = $('#ergebnis');
  if (!treffer.length) { ziel.innerHTML = '<div class="empty">Kein Auftrag erkannt. Formulieren Sie z. B. „Arbeitsblatt zu … für die 1BM1“.</div>'; return; }
  ziel.innerHTML = `<div class="section-h">Erkannt (${treffer.length})</div>
    <div class="liste">${treffer.map((t, i) => `<div class="treffer"><div class="vic ${t.grad}">${t.icon}</div>
      <div class="txt" style="flex:1"><b>${esc(t.label)}</b><small class="muted tiny">${esc(t.text)}</small></div></div>`).join('')}</div>
    <div class="btn-row"><button class="btn btn-amber btn-block" id="uebernehmen">✓ ${treffer.length} Eintrag/Einträge anlegen</button></div>`;

  $('#uebernehmen').onclick = () => {
    treffer.forEach((t) => uebernehmen(t));
    S.protokollieren('Diktat übernommen', `${treffer.length} Einträge`);
    toast(`${treffer.length} Eintrag/Einträge angelegt`);
    letzterText = '';
    gehe('start');
  };
}

function uebernehmen(t) {
  const d = t.daten;
  S.aendern((db) => {
    if (t.typ === 'termin') db.termine.push({ id: S.uid(), titel: d.titel, datum: d.datum, zeit: d.zeit || '', ort: d.ort || '', quelle: 'Diktat' });
    else if (t.typ === 'aufgabe') db.aufgaben.push({ id: S.uid(), titel: d.titel, prio: d.prio, faellig: d.faellig, klasseId: d.klasseId, erledigt: false, angelegt: S.jetzt() });
    else if (t.typ === 'beobachtung') db.beobachtungen.push({ id: S.uid(), schuelerId: d.schuelerId, klasseId: d.klasseId, text: d.text, bewertung: d.bewertung, datum: d.datum });
    else if (t.typ === 'notiz') db.notizen.push({ id: S.uid(), titel: d.titel, text: d.text, kategorie: d.kategorie, klasseId: d.klasseId, schuelerId: d.schuelerId, lernfeld: d.lernfeld, datum: S.heute(), quelle: 'Diktat' });
    else if (t.typ === 'material') db.materialien.push({ id: S.uid(), thema: d.thema, typ: d.typ, klasseId: d.klasseId, klasseName: d.klasseName, lernfeld: d.lernfeld, niveau: S.NIVEAUS[1], status: 'Auftrag aus Diktat', datum: S.heute() });
  });
}

/* ---------------- Sync ---------------- */

export function sync() {
  const d = S.state();
  const groesse = Math.round((JSON.stringify(d).length / 1024) * 10) / 10;
  view().innerHTML = `
    <div class="page-title">Sync &amp; Daten</div>
    <div class="page-sub">Alles liegt auf diesem Gerät. Sicherungen erstellen Sie selbst – damit bleiben Sie unabhängig.</div>

    <div class="section">
      <div class="section-h">Datenbestand</div>
      <div class="card">
        ${[['Klassen', d.klassen.length], ['Lernende', d.schueler.length], ['Noten', d.noten.length],
           ['Beobachtungen', d.beobachtungen.length], ['Notizen', d.notizen.length], ['Materialien', d.materialien.length],
           ['Aufgaben', d.aufgaben.length], ['Termine', d.termine.length]]
          .map(([l, n]) => `<div class="row"><div class="txt"><b>${l}</b></div><span class="chip">${n}</span></div>`).join('')}
        <div class="row"><div class="txt"><b>Belegter Speicher</b><small>im Browser dieses Geräts</small></div><span class="chip blau">${groesse} KB</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Sicherung</div>
      <div class="card">
        <div class="row"><div class="ic grad-blue">⬇</div><div class="txt"><b>Sicherung herunterladen</b><small>Alle Daten als JSON-Datei</small></div></div>
        <div class="btn-row"><button class="btn btn-ghost btn-sm" id="export">Sicherung erstellen</button>
        <button class="btn btn-ghost btn-sm" id="import">Sicherung einspielen</button></div>
        <input type="file" id="datei" accept="application/json,.json" hidden>
      </div>
      <div class="card">
        <div class="row"><div class="ic grad-sky">📅</div><div class="txt"><b>Termine als Kalenderdatei</b><small>.ics für Apple Kalender, Outlook, Google</small></div></div>
        <div class="btn-row"><button class="btn btn-ghost btn-sm" id="ics">Termine exportieren</button></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Verbindungen</div>
      <div class="card">
        <div class="row"><div class="ic grad-green">🤝</div><div class="txt"><b>SchülerAssistent (S+)</b>
        <small>Die Begleit-App ist noch nicht verbunden. Material geben Sie bis dahin als Datei oder über Moodle weiter.</small></div><span class="chip">geplant</span></div>
        <div class="row"><div class="ic grad-violet">🗓️</div><div class="txt"><b>WebUntis</b>
        <small>${d.profil.untisUrl ? esc(d.profil.untisUrl) : 'Kalender-Abo (.ics) aus WebUntis im Profil hinterlegen – Termine lassen sich dann importieren.'}</small></div>
        <span class="chip ${d.profil.untisUrl ? 'gruen' : ''}">${d.profil.untisUrl ? 'hinterlegt' : 'offen'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">Auf dem iPhone installieren</div>
      <div class="card"><small class="muted">Safari öffnen → Teilen-Symbol → <b>Zum Home-Bildschirm</b>. Danach startet LehrerAssistent wie eine App – auch ohne Internet.</small></div>
    </div>`;

  $('#export').onclick = () => {
    herunterladen(`lehrerassistent-sicherung-${S.heute()}.json`, JSON.stringify(S.state(), null, 2), 'application/json');
    S.protokollieren('Sicherung erstellt');
  };
  $('#import').onclick = () => $('#datei').click();
  $('#datei').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const neu = JSON.parse(await f.text());
      if (!neu || typeof neu !== 'object' || !('profil' in neu)) throw new Error('kein gültiges Format');
      if (!await frage('Sicherung einspielen?', 'Der aktuelle Datenbestand auf diesem Gerät wird ersetzt.', 'Ersetzen')) return;
      S.aendern((d2) => { Object.keys(neu).forEach((k) => { d2[k] = neu[k]; }); });
      toast('Sicherung eingespielt'); gehe('start');
    } catch (err) { toast('Datei konnte nicht gelesen werden: ' + err.message); }
  };
  $('#ics').onclick = () => {
    const d2 = S.state();
    if (!d2.termine.length) { toast('Keine Termine vorhanden'); return; }
    herunterladen(`termine-${S.heute()}.ics`, icsBauen(d2.termine), 'text/calendar');
  };
}

export function icsBauen(termine) {
  const z = (s) => String(s).padStart(2, '0');
  const zeilen = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LehrerAssistent//DE', 'CALSCALE:GREGORIAN'];
  termine.forEach((t) => {
    const d = t.datum.replace(/-/g, '');
    const start = t.zeit ? `${d}T${t.zeit.replace(':', '')}00` : d;
    const ende = t.zeit ? `${d}T${z(Number(t.zeit.slice(0, 2)) + 1)}${t.zeit.slice(3, 5)}00` : d;
    zeilen.push('BEGIN:VEVENT', `UID:${t.id}@lehrerassistent`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      t.zeit ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${start}`,
      t.zeit ? `DTEND:${ende}` : `DTEND;VALUE=DATE:${ende}`,
      `SUMMARY:${(t.titel || '').replace(/[,;]/g, ' ')}`,
      t.ort ? `LOCATION:${t.ort}` : '', 'END:VEVENT');
  });
  zeilen.push('END:VCALENDAR');
  return zeilen.filter(Boolean).join('\r\n');
}

/* ---------------- Profil ---------------- */

export function profil() {
  const p = S.state().profil;
  view().innerHTML = `
    <div class="page-title">Profil</div>
    <div class="page-sub">Ihre Einstellungen – nur auf diesem Gerät gespeichert.</div>

    <div class="section">
      <div class="section-h">Person &amp; Schule</div>
      <div class="card">
        ${feld('Name', 'name', { wert: p.name, platzhalter: 'Vorname Nachname' })}
        <div class="feld-2">${feld('Kürzel', 'kuerzel', { wert: p.kuerzel, platzhalter: 'z. B. Vr' })}${feld('Rolle', 'rolle', { wert: p.rolle })}</div>
        ${feld('Schule', 'schule', { wert: p.schule, platzhalter: 'Kaufmännische Berufsschule …' })}
      </div>
    </div>

    <div class="section">
      <div class="section-h">Erscheinungsbild</div>
      <div class="card">
        <div class="feld"><label>Darstellung</label>
        <div class="seg" id="theme">
          ${[['dunkel', '🌙 Dunkel'], ['hell', '☀️ Hell']].map(([v, l]) => `<button data-theme="${v}" class="${p.theme === v ? 'on' : ''}">${l}</button>`).join('')}
        </div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-h">KI &amp; Vorlagen</div>
      <div class="card">
        ${feld('Bevorzugtes Modell', 'modell', { wert: p.modell, optionen: S.MODELLE.map((m) => [m.id, m.label]) })}
        ${feld('Standardton für E-Mails', 'emailTon', { wert: p.emailTon, optionen: S.TOENE })}
        ${feld('Standardlayout Arbeitsblätter', 'layout', { wert: p.layout, zeilen: 2 })}
        ${feld('Eigener Anthropic-API-Schlüssel (optional)', 'apiKey', { typ: 'password', wert: p.apiKey, platzhalter: 'sk-ant-…', hint: 'Ohne Schlüssel erzeugt die App fertige Prompts zum Kopieren. Mit Schlüssel fragt Ihr Gerät die KI direkt – der Schlüssel bleibt lokal gespeichert und wird an niemanden sonst übertragen.' })}
      </div>
    </div>

    <div class="section">
      <div class="section-h">Datenschutz</div>
      <div class="card">
        <div class="schalter"><div class="txt"><b>Automatisch anonymisieren</b><small>Klarnamen werden vor jeder KI-Anfrage durch Pseudonyme ersetzt.</small></div>
          <input type="checkbox" name="anonymisieren" ${p.anonymisieren ? 'checked' : ''}></div>
        <div class="schalter"><div class="txt"><b>Warnen ab Stufe</b><small>Ab welcher Ampelstufe die App vor dem Versand warnt.</small></div>
          <select name="warnAbStufe" style="width:auto;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:8px">
            ${[['gelb', '🟡 gelb'], ['rot', '🔴 rot']].map(([v, l]) => `<option value="${v}" ${p.warnAbStufe === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <div class="card">
        ${feld('WebUntis-Kalenderadresse (.ics)', 'untisUrl', { wert: p.untisUrl, platzhalter: 'https://…/WebUntis/Ical.do?…' })}
      </div>
    </div>

    <div class="section">
      <div class="section-h">Gedächtnis &amp; Daten</div>
      <div class="card">
        <div class="row tap" data-go="w:gedaechtnis"><div class="ic grad-violet">🧠</div><div class="txt"><b>Gedächtnis verwalten</b><small>Gelernte Arbeitsvorlieben einsehen und löschen</small></div><span class="chev">›</span></div>
        <div class="row tap" data-go="w:dsgvo"><div class="ic grad-green">🛡️</div><div class="txt"><b>Datenschutz-Check</b><small>Text vor der KI-Nutzung prüfen</small></div><span class="chev">›</span></div>
        <div class="row tap" id="protokoll"><div class="ic grad-slate">🧾</div><div class="txt"><b>Protokoll</b><small>Letzte sicherheitsrelevante Aktionen</small></div><span class="chev">›</span></div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-amber btn-block" id="speichern">Einstellungen speichern</button>
      <button class="btn btn-danger btn-block" id="reset">Alle Daten auf diesem Gerät löschen</button>
    </div>

    <div class="tiny muted" style="text-align:center;margin-top:22px;line-height:1.7">
      LehrerAssistent · Version 1.0<br>Prototyp für den eigenen Schulalltag – keine Weitergabe an Dritte.
    </div>`;

  $$('#theme button').forEach((b) => b.onclick = () => {
    S.aendern((d) => { d.profil.theme = b.dataset.theme; });
    document.documentElement.dataset.theme = b.dataset.theme;
    profil();
  });
  $('#speichern').onclick = () => {
    const w = werte(view());
    S.aendern((d) => Object.assign(d.profil, w, { anonymisieren: !!w.anonymisieren }));
    toast('Einstellungen gespeichert');
  };
  $('#reset').onclick = async () => {
    if (!await frage('Wirklich alles löschen?', 'Klassen, Noten, Notizen, Materialien und der Tresor werden unwiderruflich von diesem Gerät entfernt. Erstellen Sie vorher eine Sicherung.', 'Alles löschen')) return;
    S.alleZuruecksetzen(); Tresor.schliessen();
    toast('Alle Daten gelöscht'); gehe('start');
  };
  $('#protokoll').onclick = () => {
    const p2 = S.state().protokoll;
    sheet('Protokoll', 'Nachvollziehbarkeit nach Art. 5 DSGVO', p2.length
      ? `<div class="liste">${p2.slice(0, 50).map((x) => `<div class="item"><div class="txt"><b style="font-weight:600">${esc(x.aktion)}</b><small>${new Date(x.zeit).toLocaleString('de-DE')}${x.detail ? ' · ' + esc(x.detail) : ''}</small></div></div>`).join('')}</div>`
      : '<div class="empty">Noch keine Einträge.</div>');
  };
}
