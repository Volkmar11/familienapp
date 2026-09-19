/* Erste Einrichtung: Grunddaten, optional erste Klasse, Datenschutz und KI-Zugang */

import * as S from './store.js';
import { $, $$, esc, icon, screenEl, btn, geist, feld, werte, karte, box, toast, logoQuelle } from './ui.js';

let schritt = 1;
let entwurf = { klasse: null };
const SCHRITTE = ['Grunddaten', 'Erste Klasse', 'Datenschutz & KI'];

export function einrichten() {
  const p = S.state().profil;
  let inhalt = '';

  if (schritt === 1) {
    inhalt = `
      <p class="klein dim" style="margin-bottom:16px;line-height:1.6">
        Diese App richtet sich jede Lehrkraft selbst ein. Es sind keine Klassen und keine Namen vorgegeben –
        alles, was Sie eintragen, bleibt ausschließlich auf diesem Gerät.</p>
      ${feld('Ihr Name', 'name', { wert: p.name, platz: 'Vorname Nachname' })}
      <div class="feld-2">
        ${feld('Kürzel', 'kuerzel', { wert: p.kuerzel, platz: 'z. B. Vr' })}
        ${feld('Rolle / Fächer', 'rolle', { wert: p.rolle, platz: 'z. B. Lehrkraft BWL / Recht' })}
      </div>
      ${feld('Schule', 'schule', { wert: p.schule, platz: 'Name der Schule' })}`;
  }

  if (schritt === 2) {
    inhalt = `
      <p class="klein dim" style="margin-bottom:16px;line-height:1.6">
        Legen Sie Ihre erste Klasse an – oder überspringen Sie diesen Schritt und machen es später in Ruhe.
        Bekannte Lernfelder werden mit Bezeichnung und Themen vorbelegt.</p>
      ${feld('Bezeichnung der Klasse', 'code', { wert: entwurf.klasse?.code || '', platz: 'z. B. 1BM1' })}
      <div class="feld-2">
        ${feld('Bildungsgang', 'typ', { wert: entwurf.klasse?.typ || 'BM', optionen: [['BM', 'Büromanagement'], ['ÖD', 'Öffentlicher Dienst']] })}
        ${feld('Ausbildungsjahr', 'jahr', { wert: entwurf.klasse?.jahr || '1', optionen: ['1', '2', '3'] })}
      </div>
      <div class="feld"><label>Lernfelder mit Vorlage</label>
        <div class="chips" id="lfChips">${S.LF_VORLAGEN.map((c) => `<button class="chip" data-lf="${c}">${c}</button>`).join('')}</div>
      </div>
      ${feld('Lernfelder (Kürzel, durch Komma getrennt)', 'lfs', { wert: entwurf.klasse?.lfs || '', platz: 'LF4, LF5',
        hinweis: 'Andere Kürzel sind möglich – Bezeichnung und Themen tragen Sie dann selbst ein.' })}`;
  }

  if (schritt === 3) {
    const a = S.KI_ANBIETER.find((x) => x.id === p.ki.anbieter) || S.KI_ANBIETER[0];
    inhalt = `
      ${karte(`<div class="schalter" style="padding-top:0"><div class="txt"><b>Pseudonyme statt Klarnamen</b>
        <small>Namen erscheinen als Kürzel wie 1BM1-004 – in Listen, Exporten und jeder KI-Anfrage.</small></div>
        <input type="checkbox" class="kipp" name="anonymisieren" ${p.anonymisieren ? 'checked' : ''}></div>`)}
      ${box('info', 'Sie können jederzeit umschalten. Klarnamen lassen sich zusätzlich verschlüsselt im Tresor ablegen.')}
      <div class="trenn"></div>
      <p class="klein dim" style="margin-bottom:14px;line-height:1.6">
        Ohne KI-Zugang erzeugt die App fertige Prompts zum Kopieren oder zum Öffnen in Claude bzw. ChatGPT.
        Mit einem eigenen Schlüssel entsteht das Material direkt in der App. Beides lässt sich später ändern.</p>
      ${feld('Anbieter', 'anbieter', { wert: p.ki.anbieter, optionen: S.KI_ANBIETER.map((x) => [x.id, x.label]) })}
      ${a.modelle.length ? feld('Modell', 'modell', { wert: p.ki.modell, optionen: a.modelle })
        : feld('Modellname', 'modell', { wert: p.ki.modell, platz: 'z. B. llama3.1:8b' })}
      ${p.ki.anbieter === 'kompatibel' ? feld('Server-Adresse', 'basisUrl', { wert: p.ki.basisUrl, platz: 'https://ki.meine-schule.de/v1' }) : ''}
      ${feld('API-Schlüssel (optional)', 'key', { typ: 'password', wert: p.ki.key, platz: 'kann leer bleiben' })}`;
  }

  screenEl().innerHTML = `
    <div style="padding:calc(var(--safe-top) + 26px) 20px 0;text-align:center">
      <img src="${logoQuelle()}" alt="Schullogo" style="width:96px;height:96px;object-fit:contain;margin-bottom:14px">
      <h1 class="serif" style="font-size:25px;font-weight:600">${schritt === 1 ? 'Willkommen' : SCHRITTE[schritt - 1]}</h1>
      <p class="mini dim" style="margin-top:4px">Schritt ${schritt} von 3 · Einrichtung</p>
    </div>
    <div class="schritte" style="padding:16px 20px 14px">${SCHRITTE.map((_, i) => `<i class="${i < schritt ? 'an' : ''}"></i>`).join('')}</div>
    <div class="pad" style="padding-bottom:40px">
      ${inhalt}
      <div class="knopfspalte" style="margin-top:18px">
        ${btn(schritt === 3 ? 'Einrichtung abschließen' : 'Weiter', { ton: 'amber', symbol: schritt === 3 ? 'check' : 'arrowRight', id: 'weiter' })}
        ${schritt === 2 ? geist('Diesen Schritt überspringen', { id: 'ueber' }) : ''}
        ${schritt > 1 ? geist('Zurück', { symbol: 'left', id: 'zurueck' }) : ''}
      </div>
    </div>`;

  const el = screenEl();
  $('#weiter', el).onclick = () => weiter(el);
  $('#ueber', el)?.addEventListener('click', () => { entwurf.klasse = null; schritt = 3; einrichten(); });
  $('#zurueck', el)?.addEventListener('click', () => { sichern(el); schritt--; einrichten(); });
  $('[name=anbieter]', el)?.addEventListener('change', (e) => {
    const neu = S.KI_ANBIETER.find((x) => x.id === e.target.value);
    S.aendern((d) => { d.profil.ki.anbieter = e.target.value; d.profil.ki.modell = neu.modelle[0] || ''; });
    einrichten();
  });
  $$('#lfChips .chip', el).forEach((c) => c.onclick = () => {
    const eingabe = $('[name=lfs]', el);
    const liste = eingabe.value.split(',').map((x) => x.trim()).filter(Boolean);
    const lf = c.dataset.lf;
    eingabe.value = (liste.includes(lf) ? liste.filter((x) => x !== lf) : [...liste, lf]).join(', ');
    c.classList.toggle('an');
  });
}

function sichern(el) {
  const w = werte(el);
  if (schritt === 1) S.aendern((d) => Object.assign(d.profil, { name: w.name || '', kuerzel: w.kuerzel || '', rolle: w.rolle || '', schule: w.schule || '' }));
  if (schritt === 2) entwurf.klasse = { code: w.code || '', typ: w.typ, jahr: w.jahr, lfs: w.lfs || '' };
  if (schritt === 3) S.aendern((d) => {
    d.profil.anonymisieren = !!w.anonymisieren;
    Object.assign(d.profil.ki, { anbieter: w.anbieter, modell: w.modell || '', key: (w.key || '').trim(), basisUrl: (w.basisUrl || '').trim() });
  });
}

function weiter(el) {
  sichern(el);
  if (schritt === 1) {
    if (!S.state().profil.name.trim()) return toast('Bitte tragen Sie Ihren Namen ein');
    schritt = 2; einrichten(); window.scrollTo(0, 0); return;
  }
  if (schritt === 2) {
    const k = entwurf.klasse;
    if (k?.code?.trim()) {
      const lfs = (k.lfs || '').split(',').map((x) => x.trim()).filter(Boolean);
      S.aendern((d) => d.klassen.push({ id: S.uid(), code: k.code.trim(), typ: k.typ, block: 'A', jahr: k.jahr,
        lernfelder: lfs.map(S.lernfeldVorlage) }));
    }
    schritt = 3; einrichten(); window.scrollTo(0, 0); return;
  }
  S.aendern((d) => { d.profil.eingerichtet = true; });
  S.protokoll('Einrichtung abgeschlossen');
  schritt = 1; entwurf = { klasse: null };
  location.hash = '#/start';
  toast('Fertig – die App gehört jetzt Ihnen');
}
