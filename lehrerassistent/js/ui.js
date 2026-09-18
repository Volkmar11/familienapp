/* Kleine Oberflaechen-Helfer: Sheets, Toasts, Formulare, Export */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(text, ms = 2200) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

/* Sheet oeffnen. inhalt = HTML-String, danach optional onMount(sheetEl) */
export function sheet(titel, unterzeile, inhalt, onMount) {
  const root = $('#modalroot');
  root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-grip"></div>
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <h2>${esc(titel)}</h2>
        ${unterzeile ? `<p class="sub">${esc(unterzeile)}</p>` : '<div style="height:10px"></div>'}
      </div>
      <button class="icon-btn" data-close aria-label="Schließen">✕</button>
    </div>
    <div class="sheet-body">${inhalt}</div>
  </div>`;
  root.classList.add('open');
  root.onclick = (e) => { if (e.target === root || e.target.closest('[data-close]')) schliessen(); };
  if (onMount) onMount(root.querySelector('.sheet'));
  return root.querySelector('.sheet');
}
export function schliessen() {
  const root = $('#modalroot');
  root.classList.remove('open');
  root.innerHTML = '';
}

export function frage(titel, text, jaLabel = 'Ja, weiter') {
  return new Promise((res) => {
    sheet(titel, text, `<div class="btn-row">
      <button class="btn btn-danger" data-ja>${esc(jaLabel)}</button>
      <button class="btn btn-ghost" data-close>Abbrechen</button>
    </div>`, (el) => {
      el.querySelector('[data-ja]').onclick = () => { schliessen(); res(true); };
      $('#modalroot').addEventListener('click', (e) => {
        if (e.target === $('#modalroot') || e.target.closest('[data-close]')) res(false);
      }, { once: true });
    });
  });
}

export function feld(label, name, opt = {}) {
  const { typ = 'text', wert = '', hint = '', platzhalter = '', optionen = null, zeilen = 0 } = opt;
  let eingabe;
  if (optionen) {
    eingabe = `<select name="${name}">${optionen.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${String(v) === String(wert) ? ' selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
  } else if (zeilen) {
    eingabe = `<textarea name="${name}" rows="${zeilen}" placeholder="${esc(platzhalter)}">${esc(wert)}</textarea>`;
  } else {
    eingabe = `<input type="${typ}" name="${name}" value="${esc(wert)}" placeholder="${esc(platzhalter)}">`;
  }
  return `<div class="feld"><label>${esc(label)}</label>${eingabe}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
}

export function werte(el) {
  const o = {};
  $$('input,select,textarea', el).forEach((i) => {
    if (!i.name) return;
    o[i.name] = i.type === 'checkbox' ? i.checked : i.value;
  });
  return o;
}

export async function kopieren(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('In die Zwischenablage kopiert');
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Kopiert'); } catch { toast('Kopieren nicht möglich – bitte manuell markieren'); }
    ta.remove();
    return true;
  }
}

export function herunterladen(dateiname, inhalt, typ = 'text/plain;charset=utf-8') {
  const blob = inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: typ });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = dateiname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`${dateiname} gespeichert`);
}

/* Word-kompatibles Dokument (.doc, oeffnet in Word/Pages) */
export function alsWord(dateiname, titel, htmlInhalt) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(titel)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45}h1{font-size:16pt}h2{font-size:13pt;margin-top:16pt}
table{border-collapse:collapse}td,th{border:1px solid #999;padding:4pt 6pt}</style></head>
<body>${htmlInhalt}</body></html>`;
  herunterladen(dateiname, html, 'application/msword');
}

export function textZuHtml(t) {
  return esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>');
}

export function grad(i) {
  const g = ['grad-blue', 'grad-amber', 'grad-teal', 'grad-violet', 'grad-green', 'grad-rose', 'grad-sky', 'grad-slate'];
  return g[i % g.length];
}
