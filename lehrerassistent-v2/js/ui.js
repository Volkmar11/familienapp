/* Bausteine der Oberfläche */

import { icon } from './icons.js';
import { state } from './store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const screenEl = () => $('#screen');

/* ---------- Kopfzeilen ---------- */
export function nav({ titel, unter = '', symbol = '', grad = 'g-blue', zurueck = true, rechts = '' }) {
  return `<div class="nav">
    ${zurueck ? `<button class="zurueck" data-zurueck aria-label="Zurück">${icon('left', 20)}</button>` : ''}
    ${symbol ? `<div class="tile ${grad}">${icon(symbol, 19)}</div>` : ''}
    <div class="txt"><h1 class="serif">${esc(titel)}</h1>${unter ? `<p>${esc(unter)}</p>` : ''}</div>
    ${rechts}</div>`;
}

export function kopf({ ueber, titel, kursiv = '', rechts = '', logo = true }) {
  const p = state().profil;
  const marke = p.schullogo
    ? `<div class="logo-kachel"><img src="${p.schullogo}" alt="Schullogo"></div>`
    : `<div class="logo-kachel"><span>L+</span></div>`;
  return `<div class="kopf">
    ${logo ? marke : ''}
    <div class="txt"><p>${esc(ueber)}</p><h1 class="serif">${esc(titel)}${kursiv ? `<br><span class="kursiv">${esc(kursiv)}</span>` : ''}</h1></div>
    ${rechts}</div>`;
}

export const abschnitt = (titel, inhalt, aktion = '') =>
  `<div class="abschnitt">${titel ? `<div class="abschnitt-kopf"><h3 class="serif">${esc(titel)}</h3>${aktion}</div>` : ''}${inhalt}</div>`;

export const aktion = (label, route) => `<button data-go="${esc(route)}">${esc(label)} ${icon('right', 13)}</button>`;

/* ---------- Zeilen & Karten ---------- */
export function zeile({ symbol, grad = 'g-slate', titel, unter = '', route = '', id = '', pille = '', pilleTon = '', rechts = '', punkt = '', chev = true, extra = '' }) {
  return `<button class="zeile" ${route ? `data-go="${esc(route)}"` : ''} ${id ? `data-id="${esc(id)}"` : ''} ${extra}>
    ${punkt ? `<span class="punkt ${punkt}"></span>` : ''}
    ${symbol ? `<span class="tile ${grad}">${icon(symbol, 19)}</span>` : ''}
    <span class="txt"><b>${esc(titel)}</b>${unter ? `<small>${esc(unter)}</small>` : ''}</span>
    ${pille ? `<span class="pille ${pilleTon}">${esc(pille)}</span>` : ''}
    ${rechts ? `<span class="rechts">${rechts}</span>` : ''}
    ${chev ? `<span class="chev">${icon('right', 15)}</span>` : ''}</button>`;
}

export const karte = (inhalt, extra = '') => `<div class="karte" ${extra}>${inhalt}</div>`;
export const kv = (k, v, klasse = '') => `<div class="kv"><span>${esc(k)}</span><b class="${klasse}">${v}</b></div>`;
export const leer = (text) => `<div class="leer">${esc(text)}</div>`;
export const box = (ton, text, titel = '') =>
  `<div class="box ${ton}">${icon(ton === 'ok' ? 'shieldCheck' : ton === 'info' ? 'info' : 'warn', 17)}<div>${titel ? `<b>${esc(titel)}</b>` : ''}<p>${esc(text)}</p></div></div>`;

export const kachel = ({ symbol, grad, titel, unter = '', route = '', id = '' }) =>
  `<button class="kachel" ${route ? `data-go="${esc(route)}"` : ''} ${id ? `data-id="${esc(id)}"` : ''}>
    <span class="tile ${grad}">${icon(symbol, 19)}</span><b>${esc(titel)}</b>${unter ? `<small>${esc(unter)}</small>` : ''}</button>`;

export const btn = (label, { ton = 'amber', symbol = '', id = '', route = '', klasse = '', attr = '' } = {}) => {
  const grad = { amber: 'g-amber', blue: 'g-blue', violet: 'g-violet', emerald: 'g-emerald', sky: 'g-sky', teal: 'g-teal', indigo: 'g-indigo', rose: 'g-rose', slate: 'g-slate' }[ton];
  return `<button class="btn ${grad ? grad : ''} ${klasse}" ${id ? `id="${id}"` : ''} ${route ? `data-go="${esc(route)}"` : ''} ${attr}>
    ${symbol ? icon(symbol, 17) : ''}${esc(label)}</button>`;
};
export const geist = (label, { symbol = '', id = '', route = '', attr = '' } = {}) =>
  `<button class="btn geist" ${id ? `id="${id}"` : ''} ${route ? `data-go="${esc(route)}"` : ''} ${attr}>${symbol ? icon(symbol, 16) : ''}${esc(label)}</button>`;

/* ---------- Formular ---------- */
export function feld(label, name, o = {}) {
  const { typ = 'text', wert = '', platz = '', hinweis = '', optionen = null, zeilen = 0 } = o;
  let el;
  if (optionen) el = `<select name="${name}">${optionen.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}"${String(v) === String(wert) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  else if (zeilen) el = `<textarea name="${name}" rows="${zeilen}" placeholder="${esc(platz)}">${esc(wert)}</textarea>`;
  else el = `<input type="${typ}" name="${name}" value="${esc(wert)}" placeholder="${esc(platz)}">`;
  return `<div class="feld"><label>${esc(label)}</label>${el}${hinweis ? `<div class="hinweis">${esc(hinweis)}</div>` : ''}</div>`;
}
export const chips = (name, werte, aktiv) =>
  `<div class="chips" data-chips="${name}">${werte.map((w) => `<button class="chip ${w === aktiv ? 'an' : ''}" data-wert="${esc(w)}">${esc(w)}</button>`).join('')}</div>`;
export const wahl = (label, { unter = '', an = false, wert = '' }) =>
  `<button class="wahl ${an ? 'an' : ''}" data-wert="${esc(wert || label)}">
    <span class="txt"><b>${esc(label)}</b>${unter ? `<small>${esc(unter)}</small>` : ''}</span>
    ${an ? `<span class="t-note">${icon('checkCircle', 19)}</span>` : `<span class="faint">${icon('circle', 19)}</span>`}</button>`;
export const schalter = (label, name, unter = '', an = false) =>
  `<div class="schalter"><div class="txt"><b>${esc(label)}</b>${unter ? `<small>${esc(unter)}</small>` : ''}</div>
   <input type="checkbox" class="kipp" name="${name}" ${an ? 'checked' : ''}></div>`;

export function werte(root) {
  const o = {};
  $$('input,select,textarea', root).forEach((i) => { if (i.name) o[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
  return o;
}

/* ---------- Sheet, Toast ---------- */
export function sheet(titel, unter, inhalt, aufbau) {
  const el = $('#sheet');
  el.innerHTML = `<div class="inhalt"><div class="griff"></div>
    <div class="kopfreihe"><div style="flex:1;min-width:0"><h2 class="serif">${esc(titel)}</h2>${unter ? `<p class="unter">${esc(unter)}</p>` : ''}</div>
    <button class="zurueck" data-zu aria-label="Schließen">${icon('x', 17)}</button></div>${inhalt}</div>`;
  el.classList.add('auf');
  el.onclick = (e) => { if (e.target === el || e.target.closest('[data-zu]')) zu(); };
  aufbau?.(el.querySelector('.inhalt'));
  return el.querySelector('.inhalt');
}
export function zu() { const el = $('#sheet'); el.classList.remove('auf'); el.innerHTML = ''; }

let tt;
export function toast(text) {
  const t = $('#toast');
  t.innerHTML = `${icon('checkCircle', 18)}<span style="font-size:13px;font-weight:600">${esc(text)}</span>`;
  t.classList.add('an'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('an'), 2400);
}
export function frage(titel, text, ja = 'Ja, fortfahren') {
  return new Promise((res) => {
    let beantwortet = false;
    sheet(titel, text, `<div class="knopfspalte">${btn(ja, { klasse: 'gefahr', id: 'ja' })}${geist('Abbrechen', { attr: 'data-zu' })}</div>`, (el) => {
      el.querySelector('#ja').onclick = () => { beantwortet = true; zu(); res(true); };
      $('#sheet').addEventListener('click', (e) => {
        if (!beantwortet && (e.target === $('#sheet') || e.target.closest('[data-zu]'))) { beantwortet = true; res(false); }
      }, { once: true });
    });
  });
}

/* ---------- Werkzeuge ---------- */
export async function kopieren(text) {
  try { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Kopiert'); } catch { toast('Bitte Text markieren und kopieren'); }
    ta.remove();
  }
}
export function datei(name, inhalt, typ = 'text/plain;charset=utf-8') {
  const blob = inhalt instanceof Blob ? inhalt : new Blob(['﻿' + inhalt], { type: typ });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`${name} gespeichert`);
}
export function alsWord(name, titel, html) {
  const p = state().profil;
  const logo = p.schullogo ? `<img src="${p.schullogo}" style="height:46px" alt="">` : '';
  const kopfzeile = `<table style="width:100%;border:none;border-bottom:2px solid #1F4E79"><tr>
    <td style="border:none;padding:0 0 6pt">${logo}<div style="font-size:9pt;color:#1F4E79"><b>${esc(p.schule || '')}</b></div></td>
    <td style="border:none;padding:0 0 6pt;text-align:right;font-size:9pt;color:#475569">${esc(p.name || '')}${p.kuerzel ? ' (' + esc(p.kuerzel) + ')' : ''}<br>${new Date().toLocaleDateString('de-DE')}</td>
  </tr></table>`;
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(titel)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111}
h1{font-size:15pt;color:#1F4E79}h2{font-size:12.5pt;color:#2E75B6;margin-top:14pt}
table{border-collapse:collapse}td,th{border:1px solid #9aa5b1;padding:4pt 6pt;font-size:10.5pt}
.fuss{margin-top:18pt;border-top:1px solid #cbd5e1;padding-top:6pt;font-size:8.5pt;color:#64748b}</style></head>
<body>${kopfzeile}${html}<div class="fuss">Erstellt mit LehrerAssistent · keine personenbezogenen Daten an Dritte übermittelt.</div></body></html>`;
  datei(name, doc, 'application/msword');
}
export const textHtml = (t) => esc(t)
  .replace(/^### (.*)$/gm, '<h2>$1</h2>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>');

export const dateiName = (s) => String(s || 'material').toLowerCase().replace(/[äöüß]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

export function bildLesen(file, maxKante = 560) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const f = Math.min(1, maxKante / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
      img.src = fr.result;
    };
    fr.onerror = () => rej(new Error('Datei konnte nicht gelesen werden'));
    fr.readAsDataURL(file);
  });
}
export { icon };
