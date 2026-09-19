/* Gemeinsamer Ergebnisbereich: Prompt zeigen, kopieren, extern öffnen – oder direkt erzeugen. */

import { $, $$, esc, icon, btn, geist, karte, box, toast, kopieren, alsWord, textHtml, dateiName } from './ui.js';
import * as KI from './ki.js';
import * as DS from './dsgvo.js';
import { state, aendern, uid, heute, protokoll } from './store.js';

export function ampelBlock(prompt) {
  const p = DS.pruefen(prompt);
  const [ton, titel, text] = DS.AMPEL[p.stufe];
  const liste = p.funde.length
    ? `<ul class="mini dim" style="margin:8px 0 0 18px;line-height:1.7">${p.funde.map((f) => `<li>${esc(f.was)}${f.beispiele?.length ? ` <span class="faint">(${esc(f.beispiele.join(', ').slice(0, 60))})</span>` : ''}</li>`).join('')}</ul>`
    : '';
  return `<div class="box ${ton}">${icon(p.stufe === 'gruen' ? 'shieldCheck' : 'warn', 17)}<div><b>${titel}</b><p>${text}</p>${liste}</div></div>`;
}

/* Ein Ergebnisbereich, der überall gleich funktioniert.
   opts: { titel, dateiname, archiv:{art, klasseId, lf, thema, schuelerId}, maxTokens, anonymisierbar } */
export function ergebnis(ziel, prompt, opts = {}) {
  const el = typeof ziel === 'string' ? $(ziel) : ziel;
  let aktuell = prompt;
  const zugang = KI.hatZugang();

  el.innerHTML = `
    <div id="ampel">${ampelBlock(aktuell)}</div>
    ${opts.anonymisierbar !== false && DS.pruefen(aktuell).stufe !== 'gruen' ? `<div style="margin-bottom:12px">${geist('Personenbezug ersetzen', { symbol: 'shield', id: 'anon' })}</div>` : ''}
    <div class="knopfspalte">
      ${zugang ? btn('Jetzt erzeugen', { ton: 'violet', symbol: 'sparkles', id: 'los' }) : ''}
      <div class="knopfreihe">
        ${geist('Prompt kopieren', { symbol: 'copy', id: 'kopieren' })}
        ${geist('Prompt ansehen', { symbol: 'fileText', id: 'zeigen' })}
      </div>
      <div class="knopfreihe">
        <a class="btn geist" id="claude" href="${KI.claudeLink(aktuell)}" target="_blank" rel="noopener">${icon('external', 15)} Claude</a>
        <a class="btn geist" id="gpt" href="${KI.gptLink(aktuell)}" target="_blank" rel="noopener">${icon('external', 15)} ChatGPT</a>
      </div>
      ${zugang ? '' : `<p class="mini faint" style="text-align:center;line-height:1.5">Ohne eigenen Zugang läuft die App im Prompt-Modus.<br>
        <b data-go="w/ki" style="color:var(--accent-text);cursor:pointer">KI-Zugang hinterlegen</b>, um direkt in der App zu erzeugen.</p>`}
    </div>
    <pre class="prompt" id="promptText" hidden>${esc(aktuell)}</pre>
    <div id="ausgabe"></div>`;

  const neu = (p) => {
    aktuell = p;
    $('#promptText', el).textContent = p;
    $('#ampel', el).innerHTML = ampelBlock(p);
    $('#claude', el).href = KI.claudeLink(p);
    $('#gpt', el).href = KI.gptLink(p);
  };
  $('#anon', el)?.addEventListener('click', () => { neu(DS.anonymisieren(aktuell)); toast('Personenbezug ersetzt'); });
  $('#kopieren', el).onclick = () => kopieren(aktuell);
  $('#zeigen', el).onclick = () => {
    const p = $('#promptText', el);
    p.hidden = !p.hidden;
    $('#zeigen', el).lastChild.textContent = p.hidden ? 'Prompt ansehen' : 'Prompt verbergen';
  };
  $('#los', el)?.addEventListener('click', () => starten(el, () => aktuell, opts));
  return { text: () => aktuell, setzen: neu };
}

async function starten(el, promptFn, opts) {
  const knopf = $('#los', el);
  const aus = $('#ausgabe', el);
  knopf.disabled = true;
  knopf.innerHTML = `${icon('sync', 17, 'class="dreh"')}wird erzeugt …`;
  aus.innerHTML = `<div class="box info">${icon('info', 17)}<div><p>Die Anfrage läuft direkt von diesem Gerät zum Modell. Je nach Umfang dauert das 10–60 Sekunden.</p></div></div>`;
  try {
    const text = await KI.anfragen(promptFn(), { system: KI.system(), maxTokens: opts.maxTokens || 4000 });
    zeigeErgebnis(aus, text, opts);
    protokoll('KI-Anfrage gesendet', opts.titel || '');
  } catch (e) {
    aus.innerHTML = `<div class="box bad">${icon('warn', 17)}<div><b>Nicht erzeugt</b><p>${esc(e.message)}</p></div></div>`;
  }
  knopf.disabled = false;
  knopf.innerHTML = `${icon('sparkles', 17)}Erneut erzeugen`;
}

export function zeigeErgebnis(aus, text, opts = {}) {
  const name = dateiName(opts.dateiname || opts.titel || 'material');
  aus.innerHTML = `<div class="trenn"></div>
    <div class="abschnitt-kopf"><h3 class="serif">Ergebnis</h3></div>
    <pre class="prompt" style="max-height:460px;color:var(--text)">${esc(text)}</pre>
    <div class="knopfspalte" style="margin-top:12px">
      <div class="knopfreihe">${geist('Kopieren', { symbol: 'copy', id: 'e-kopieren' })}${geist('Word-Datei', { symbol: 'download', id: 'e-word' })}</div>
      ${opts.archiv ? geist('Im Materialarchiv speichern', { symbol: 'folder', id: 'e-archiv' }) : ''}
    </div>`;
  $('#e-kopieren', aus).onclick = () => kopieren(text);
  $('#e-word', aus).onclick = () => alsWord(`${name}.doc`, opts.titel || 'Material', `<h1>${esc(opts.titel || 'Material')}</h1>${textHtml(text)}`);
  $('#e-archiv', aus)?.addEventListener('click', () => {
    archivieren({ ...opts.archiv, titel: opts.titel, ergebnis: text, prompt: opts.prompt || '' });
    toast('Im Archiv gespeichert');
  });
}

export function archivieren(m) {
  aendern((d) => d.materialien.unshift({ id: uid(), datum: heute(), ...m }));
}
