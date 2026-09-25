// Unser Haus – begehbares 3D-Modell
// Koordinaten: X = u (entlang der Straße, Richtung NO), Y = Höhe über Hofniveau, Z = v (von der Straße in die Tiefe, Richtung SO).
// Quelle aller Maße: LoD2/ALKIS des LGL Baden-Württemberg, Details nach Fotos.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const loadMsg = $('#loadmsg');
const loadBar = $('#loadbar');
const progress = (p, msg) => { loadBar.style.width = `${Math.round(p * 100)}%`; if (msg) loadMsg.textContent = msg; };

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  loadMsg.textContent = 'Dieser Browser kann kein WebGL darstellen. Bitte Safari oder Chrome in aktueller Version öffnen.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 6000);
camera.rotation.order = 'YXZ';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

// ------------------------------------------------------------------ Hilfsfunktionen
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ Texturen (prozedural, Canvas)
function cnv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
function wrapBlob(g, S, x, y, rad, paint) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    const X = x + ox, Y = y + oy;
    if (X + rad < 0 || Y + rad < 0 || X - rad > S || Y - rad > S) continue;
    paint(X, Y);
  }
}
function grain(g, S, amt, r) {
  const id = g.getImageData(0, 0, S, S), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 255 * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
function plasterCanvas(base, { streaks = 0, seed = 1, amt = 0.07, S = 512 } = {}) {
  const c = cnv(S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    const x = r() * S, y = r() * S, rad = 12 + r() * 60, dark = r() < 0.5;
    wrapBlob(g, S, x, y, rad, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, rad);
      gr.addColorStop(0, dark ? 'rgba(70,70,62,0.035)' : 'rgba(255,255,255,0.05)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
    });
  }
  grain(g, S, amt, r);
  for (let i = 0; i < streaks; i++) {
    const x = r() * S, w = 1 + r() * 4, len = S * (0.25 + r() * 0.8), y0 = r() * S, a = 0.03 + r() * 0.08;
    for (const off of [0, -S]) {
      const gr = g.createLinearGradient(0, y0 + off, 0, y0 + off + len);
      gr.addColorStop(0, `rgba(80,88,88,${a})`); gr.addColorStop(1, 'rgba(80,88,88,0)');
      g.fillStyle = gr; g.fillRect(x, y0 + off, w, len);
    }
  }
  return c;
}
function tileCanvas(seed = 3) {
  const S = 512, c = cnv(S), g = c.getContext('2d'), r = rng(seed);
  const cols = 4, rows = 4, tw = S / cols, th = S / rows;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = col * tw, y = row * th, k = 0.86 + r() * 0.24;
    const b = [150 * k, 62 * k, 40 * k];
    const rgb = (f, a = 1) => `rgba(${b[0] * f | 0},${b[1] * f | 0},${b[2] * f | 0},${a})`;
    const gr = g.createLinearGradient(x, 0, x + tw, 0);
    gr.addColorStop(0, rgb(0.62)); gr.addColorStop(0.1, rgb(0.95)); gr.addColorStop(0.5, rgb(1));
    gr.addColorStop(0.7, rgb(1.14)); gr.addColorStop(0.88, rgb(0.98)); gr.addColorStop(1, rgb(0.6));
    g.fillStyle = gr; g.fillRect(x, y, tw, th);
    const gv = g.createLinearGradient(0, y, 0, y + th);
    gv.addColorStop(0, 'rgba(0,0,0,0.22)'); gv.addColorStop(0.16, 'rgba(0,0,0,0)');
    gv.addColorStop(0.86, 'rgba(0,0,0,0.04)'); gv.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = gv; g.fillRect(x, y, tw, th);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() < 0.55 ? `rgba(45,32,22,${r() * 0.22})` : `rgba(200,180,150,${r() * 0.12})`;
      g.fillRect(x + r() * tw, y + r() * th, 1 + r() * 2.5, 1 + r() * 2.5);
    }
  }
  return c;
}
function herringCanvas(palette, joint, seed, unit = 32) {
  const P = 8, S = unit * P, c = cnv(S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = joint; g.fillRect(0, 0, S, S);
  const brick = (bx, by, bw, bh) => {
    const col = palette[(r() * palette.length) | 0];
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const X = bx * unit + ox, Y = by * unit + oy, W = bw * unit, H = bh * unit;
      if (X > S || Y > S || X + W < 0 || Y + H < 0) continue;
      g.fillStyle = col; g.fillRect(X + 1.5, Y + 1.5, W - 3, H - 3);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(X + 1.5, Y + 1.5, W - 3, 2);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(X + 1.5, Y + H - 3.5, W - 3, 2);
    }
  };
  for (let hx = 0; hx < P; hx++) for (let hy = 0; hy < P; hy++) {
    if ((((hx - hy) % 4) + 4) % 4 !== 0) continue;
    brick(hx, hy, 2, 1); brick(hx + 2, hy - 1, 1, 2);
  }
  grain(g, S, 0.06, r);
  return c;
}
function speckleCanvas(base, specks, { seed = 5, S = 512, n = 6000, size = [1, 3], amt = 0.08, blobs = [] } = {}) {
  const c = cnv(S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (const [col, count, rmin, rmax] of blobs) {
    for (let i = 0; i < count; i++) {
      const x = r() * S, y = r() * S, rad = rmin + r() * (rmax - rmin);
      wrapBlob(g, S, x, y, rad, (X, Y) => {
        const gr = g.createRadialGradient(X, Y, 0, X, Y, rad);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
      });
    }
  }
  for (let i = 0; i < n; i++) {
    g.fillStyle = specks[(r() * specks.length) | 0];
    const s = size[0] + r() * (size[1] - size[0]);
    g.fillRect(r() * S, r() * S, s, s);
  }
  grain(g, S, amt, r);
  return c;
}
function lawnCanvas(seed = 7) {
  const S = 512, c = speckleCanvas('#8e9352', [], { seed, S, n: 0, amt: 0.05, blobs: [
    ['rgba(178,170,104,0.55)', 40, 30, 90], ['rgba(98,128,58,0.5)', 45, 25, 80], ['rgba(122,118,70,0.45)', 30, 20, 60]] });
  const g = c.getContext('2d'), r = rng(seed + 1);
  const cols = ['#6d7d3b', '#9aa05a', '#b5ae6c', '#5b6e33', '#8a904e', '#a39a5c'];
  g.lineWidth = 1.1;
  for (let i = 0; i < 14000; i++) {
    const x = r() * S, y = r() * S, a = -Math.PI / 2 + (r() - 0.5) * 1.2, l = 3 + r() * 6;
    g.strokeStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = 0.55;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}
function woodCanvas(base, line, seed, S = 256, vertical = false) {
  const c = cnv(S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const p = r() * S, w = 0.5 + r() * 1.6;
    g.fillStyle = line; g.globalAlpha = 0.12 + r() * 0.25;
    if (vertical) g.fillRect(p, 0, w, S); else g.fillRect(0, p, S, w);
  }
  g.globalAlpha = 1; grain(g, S, 0.06, r);
  return c;
}
function stripesCanvas(bg, line, n, { S = 256, vertical = false, lw = 2, alpha = false } = {}) {
  const c = cnv(S), g = c.getContext('2d');
  if (!alpha) { g.fillStyle = bg; g.fillRect(0, 0, S, S); }
  g.fillStyle = line;
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) * S / n;
    if (vertical) g.fillRect(p - lw / 2, 0, lw, S); else g.fillRect(0, p - lw / 2, S, lw);
  }
  return c;
}
function pvCanvas() {
  const W = 256, H = 420, c = cnv(W, H), g = c.getContext('2d');
  g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#18243b'; g.fillRect(8, 8, W - 16, H - 16);
  const cw = (W - 16) / 6, ch = (H - 16) / 10;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) {
    const gr = g.createLinearGradient(0, 8 + j * ch, 0, 8 + (j + 1) * ch);
    gr.addColorStop(0, '#22345a'); gr.addColorStop(1, '#1a2946');
    g.fillStyle = gr; g.fillRect(9 + i * cw, 9 + j * ch, cw - 2, ch - 2);
  }
  g.fillStyle = 'rgba(190,200,215,0.35)';
  for (let i = 1; i < 6; i++) g.fillRect(8 + i * cw - 0.5, 8, 1, H - 16);
  return c;
}
function corrugatedCanvas() {
  const S = 128, c = cnv(S), g = c.getContext('2d');
  for (let x = 0; x < S; x++) {
    const s = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 8);
    g.fillStyle = `rgba(${225 + 25 * s | 0},${230 + 22 * s | 0},${228 + 20 * s | 0},1)`;
    g.fillRect(x, 0, 1, S);
  }
  return c;
}
function gridAlphaCanvas(col, n, lw, S = 128) {
  const c = cnv(S), g = c.getContext('2d');
  g.strokeStyle = col; g.lineWidth = lw;
  for (let i = 0; i <= n; i++) {
    const p = i * S / n;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  return c;
}
function latticeCanvas(col, S = 256) {
  const c = cnv(S), g = c.getContext('2d');
  g.strokeStyle = col; g.lineWidth = 11; g.lineCap = 'butt';
  for (let i = -4; i <= 8; i++) {
    const o = i * S / 4;
    g.beginPath(); g.moveTo(o, 0); g.lineTo(o + S, S); g.stroke();
    g.beginPath(); g.moveTo(o + S, 0); g.lineTo(o, S); g.stroke();
  }
  return c;
}
function railCanvas() {
  const S = 256, c = cnv(S), g = c.getContext('2d');
  g.strokeStyle = '#4a3326'; g.lineWidth = 12;
  for (let i = -3; i <= 7; i++) { const o = i * S / 4; g.beginPath(); g.moveTo(o, S); g.lineTo(o + S, 0); g.stroke(); }
  g.fillStyle = '#4a3326'; g.fillRect(0, 0, S, 14); g.fillRect(0, S - 14, S, 14);
  return c;
}
function ivyCanvas(seed = 21) {
  const W = 512, H = 256, c = cnv(W, H), g = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < 2600; i++) {
    const x = r() * W, yTop = H * (0.08 + 0.35 * noise3(x / 60, 1, 1));
    const y = yTop + r() * (H - yTop);
    const s = 5 + r() * 9, k = r();
    g.fillStyle = k < 0.4 ? '#2f5227' : k < 0.8 ? '#3d6a2f' : '#5a8a3c';
    g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  return c;
}
function leavesCanvas(seed = 31) {
  const S = 256, c = speckleCanvas('#e2e8d6', ['#bfcaa9', '#f3f6ec', '#a9b893', '#d2dbc1', '#c9d4b6'], { seed, S, n: 5200, size: [2, 5], amt: 0.06 });
  return c;
}
function shingleWallCanvas() {
  // untere 2,9 m Putz, darüber dunkle Schieferschindeln (Nachbarwand an der Einfahrt)
  const W = 256, H = 1024, c = cnv(W, H), g = c.getContext('2d'), r = rng(41);
  const split = H - (2.9 / 8) * H;
  g.drawImage(plasterCanvas('#e5e0cc', { seed: 42, S: 256 }), 0, split, W, H - split);
  g.drawImage(plasterCanvas('#e5e0cc', { seed: 43, S: 256 }), 0, split + 256, W, 256);
  g.fillStyle = '#2d2522'; g.fillRect(0, 0, W, split);
  const sw = 32, sh = 22;
  for (let y = split - sh; y > -sh; y -= sh * 0.62) {
    const off = ((Math.round(y / sh) & 1) ? sw / 2 : 0);
    for (let x = -sw; x < W + sw; x += sw) {
      const k = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${58 * k | 0},${47 * k | 0},${44 * k | 0})`;
      g.beginPath(); g.moveTo(x + off, y); g.lineTo(x + off + sw - 2, y); g.lineTo(x + off + sw - 2, y + sh * 0.7);
      g.lineTo(x + off + sw / 2, y + sh); g.lineTo(x + off, y + sh * 0.7); g.closePath(); g.fill();
    }
  }
  g.fillStyle = '#3a2f2b'; g.fillRect(0, split - 4, W, 6);
  return c;
}
function garageDoorCanvas() {
  const S = 256, c = cnv(S), g = c.getContext('2d');
  g.fillStyle = '#e9e9e5'; g.fillRect(0, 0, S, S);
  for (let i = 1; i < 4; i++) {
    const y = i * S / 4;
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y - 2, S, 3);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, y + 1, S, 1.5);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, i * 6.4, S, 1); }
  return c;
}
function blindsCanvas() {
  const W = 128, H = 256, c = cnv(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#f3f2ee'); gr.addColorStop(1, '#d8d8d4');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 5) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, y, W, 1.5); }
  g.fillStyle = 'rgba(40,50,60,0.55)'; g.fillRect(0, H * 0.9, W, H * 0.1);
  return c;
}
function doorCanvas(base, glass) {
  const W = 128, H = 256, c = cnv(W, H), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
  g.strokeRect(14, 14, W - 28, H - 28);
  if (glass) { g.fillStyle = '#9fb1b9'; g.fillRect(W / 2 - 12, 28, 24, H - 56); }
  g.fillStyle = '#b8b8b8'; g.fillRect(W - 26, H * 0.5, 14, 4);
  return c;
}
function plankCanvas() {
  const W = 128, H = 256, c = woodCanvas('#7d5d3f', '#3b2a1c', 51, 128, true), g = c.getContext('2d');
  for (let x = 0; x < W; x += 21) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 2, W); }
  return c;
}
function palisadeCanvas() {
  const W = 256, H = 64, c = cnv(W, H), g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const x = i * W / 8, gr = g.createLinearGradient(x, 0, x + W / 8, 0);
    gr.addColorStop(0, '#8f8b83'); gr.addColorStop(0.45, '#c9c4ba'); gr.addColorStop(1, '#7c786f');
    g.fillStyle = gr; g.fillRect(x, 0, W / 8, H);
  }
  return c;
}

// ------------------------------------------------------------------ Materialien
const T = {
  house: tex(plasterCanvas('#eceeec', { streaks: 90, seed: 11 }), [0.5, 0.5]),
  cream: tex(plasterCanvas('#e6d7a9', { streaks: 30, seed: 12, amt: 0.1 }), [0.5, 0.5]),
  white: tex(plasterCanvas('#ecebe6', { streaks: 25, seed: 14 }), [0.5, 0.5]),
  neighbor: tex(plasterCanvas('#ffffff', { streaks: 12, seed: 13, amt: 0.05 }), [0.4, 0.4]),
  tiles: tex(tileCanvas(3), [1 / 1.2, 1 / 1.36]),
  paverRed: tex(herringCanvas(['#8a5a47', '#7d5040', '#94634f', '#835445', '#76493b'], '#5b463b', 61), [1.25, 1.25]),
  paverGrey: tex(herringCanvas(['#8d8b86', '#9a9892', '#85837e', '#a19f98'], '#5e5c58', 62), [1.25, 1.25]),
  paverTerr: tex(herringCanvas(['#7a716a', '#857b72', '#6f6760', '#8e847a', '#7d6a60'], '#4f4843', 63), [1.25, 1.25]),
  sidewalk: tex(herringCanvas(['#a6a5a1', '#9b9a96', '#b0afab', '#949390'], '#6a6966', 64), [1.25, 1.25]),
  asphalt: tex(speckleCanvas('#58595b', ['#6c6d6f', '#48494b', '#777878', '#3f4042'], { seed: 71, n: 20000, size: [1, 2.2], amt: 0.1 }), [0.25, 0.25]),
  lawn: tex(lawnCanvas(7), [1 / 3, 1 / 3]),
  soil: tex(speckleCanvas('#6a5540', ['#57442f', '#7d6a53', '#4a3a29', '#8b7b62'], { seed: 81, n: 9000, size: [1, 3] }), [0.5, 0.5]),
  sand: tex(speckleCanvas('#d5c49c', ['#c8b68c', '#e0d2ae', '#bfae86'], { seed: 82, n: 9000, size: [1, 2] }), [0.5, 0.5]),
  gravel: tex(speckleCanvas('#b9b3a6', ['#9c968a', '#d4cfc5', '#8a857b', '#c8c1b3', '#a8a295'], { seed: 83, n: 16000, size: [2, 5], amt: 0.12 }), [0.8, 0.8]),
  rubber: tex(gridAlphaCanvas('#26282a', 2, 3), [2, 2]),
  slabs: tex(stripesCanvas('#b5b0a6', '#7f7a72', 2, { S: 128, lw: 2 }), [1 / 0.6, 1 / 1.0]),
  wood: tex(woodCanvas('#4a3528', '#1f150f', 91), [1, 1]),
  woodLight: tex(woodCanvas('#a8865e', '#6e5236', 92), [1, 1]),
  pv: tex(pvCanvas(), [1, 1]),
  corr: tex(corrugatedCanvas(), [1 / 0.5, 1]),
  net: tex(gridAlphaCanvas('#1a1a1a', 10, 2), [4, 4]),
  mesh: tex(gridAlphaCanvas('#3d5b3d', 8, 2.2), [2, 2]),
  lattice: tex(latticeCanvas('#6b5a44'), [1.4, 1.4]),
  rail: tex(railCanvas(), [1.2, 1]),
  ivy: tex(ivyCanvas(), [1, 1]),
  leaves: tex(leavesCanvas(), [2, 2]),
  shingle: tex(shingleWallCanvas(), [1 / 1.2, 1 / 8]),
  garage: tex(garageDoorCanvas(), [1, 1]),
  blinds: tex(blindsCanvas(), [1, 1]),
  shutter: tex(stripesCanvas('#cfc9bd', '#9d978b', 26, { S: 128, lw: 1.5 }), [1, 1]),
  entry: tex(doorCanvas('#3b2e28', true), [1, 1]),
  plank: tex(plankCanvas(), [1, 1]),
  palisade: tex(palisadeCanvas(), [1 / 0.96, 1]),
  roofFlat: tex(speckleCanvas('#7c5446', ['#6b473b', '#8a6152', '#5e4036'], { seed: 95, n: 7000 }), [0.5, 0.5]),
  cabinet: tex(gridAlphaCanvas('#f2f2f2', 6, 6), [1, 3]),
};
T.shingle.wrapT = THREE.ClampToEdgeWrapping;

const M = {};
function mat(name, o, cast = true) { const m = new THREE.MeshStandardMaterial(o); m.name = name; m.userData.cast = cast; M[name] = m; return m; }
mat('wallHouse', { map: T.house, roughness: 0.95 });
mat('wallCream', { map: T.cream, roughness: 0.95 });
mat('wallWhite', { map: T.white, roughness: 0.95 });
mat('plinth', { map: T.white, color: '#c4c3bd', roughness: 0.95 });
mat('reveal', { color: '#dedfdb', roughness: 0.9 });
mat('revealCream', { color: '#d8cba2', roughness: 0.9 });
mat('frame', { color: '#2d2623', roughness: 0.55 });
mat('frameWhite', { color: '#ebeae5', roughness: 0.6 });
mat('frameWood', { color: '#a27b52', roughness: 0.8 });
mat('glass', { color: '#61788a', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.25, emissive: '#ffcf8f', emissiveIntensity: 0 });
mat('glassBlind', { map: T.blinds, metalness: 0.3, roughness: 0.18, emissive: '#ffcf8f', emissiveIntensity: 0 });
mat('shutter', { map: T.shutter, roughness: 0.7 });
mat('sill', { color: '#4a4643', metalness: 0.45, roughness: 0.45 });
mat('tiles', { map: T.tiles, roughness: 0.82 });
mat('tileEdge', { color: '#7b3625', roughness: 0.8 });
mat('ridge', { color: '#7f3a28', roughness: 0.75 });
mat('soffit', { map: T.wood, roughness: 0.85 });
mat('fascia', { color: '#3b2b22', roughness: 0.8 });
mat('gutter', { color: '#3b312c', metalness: 0.45, roughness: 0.45 });
mat('pv', { map: T.pv, metalness: 0.4, roughness: 0.28 });
mat('chimney', { color: '#d6d5cf', roughness: 0.95 });
mat('wood', { map: T.wood, roughness: 0.85 });
mat('woodLight', { map: T.woodLight, roughness: 0.85 });
mat('corr', { map: T.corr, transparent: true, opacity: 0.62, side: THREE.DoubleSide, roughness: 0.35, depthWrite: false }, false);
mat('garageDoor', { map: T.garage, roughness: 0.6 });
mat('entryDoor', { map: T.entry, roughness: 0.6 });
mat('plankDoor', { map: T.plank, roughness: 0.85 });
mat('roofFlat', { map: T.roofFlat, roughness: 0.95 });
mat('metal', { color: '#a3a8ab', metalness: 0.65, roughness: 0.4 });
mat('darkMetal', { color: '#2b2b2b', metalness: 0.5, roughness: 0.5 });
mat('concrete', { color: '#b3b0a8', roughness: 0.95 });
mat('curb', { color: '#a9a8a2', roughness: 0.9 });
mat('ivy', { map: T.ivy, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
mat('lattice', { map: T.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
mat('rail', { map: T.rail, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
mat('net', { map: T.net, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }, false);
mat('mesh', { map: T.mesh, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }, false);
mat('palisade', { map: T.palisade, roughness: 0.95 });
mat('cabinet', { map: T.cabinet, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
mat('whitePlastic', { color: '#f1f1ee', roughness: 0.5 });
mat('red', { color: '#c7342b', roughness: 0.5 });
mat('blue', { color: '#2f62b6', roughness: 0.5 });
mat('yellow', { color: '#e8b52e', roughness: 0.5 });
mat('green', { color: '#2f7a42', roughness: 0.5 });
mat('teal', { color: '#39a8a2', roughness: 0.45 });
mat('black', { color: '#1d1d1d', roughness: 0.6 });
mat('rubberBlack', { color: '#161616', roughness: 0.9 });
mat('terracotta', { color: '#b8693f', roughness: 0.85 });
mat('rope', { color: '#ede6d8', roughness: 0.9 });
mat('caravan', { color: '#f0efe9', roughness: 0.45 });
mat('caravanTrim', { color: '#6d7378', roughness: 0.5 });
mat('tint', { color: '#1d2329', metalness: 0.6, roughness: 0.12 });
mat('binGreen', { color: '#2e6a3a', roughness: 0.6 });
mat('parasol', { color: '#d7ccb3', roughness: 0.9 });
mat('rock', { color: '#6f6b66', roughness: 0.95, flatShading: true });
mat('pebble', { color: '#e9e6df', roughness: 0.8 });
mat('glassTable', { color: '#a9bcb8', metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.72 }, false);
mat('trunk', { color: '#5b4636', roughness: 0.95 });
mat('bulb', { color: '#fff4d6', emissive: '#ffe2a8', emissiveIntensity: 0.4 }, false);
mat('chalk', { color: '#2e3b33', roughness: 0.9 });
// Boden
mat('asphalt', { map: T.asphalt, roughness: 0.95 }, false);
mat('sidewalk', { map: T.sidewalk, roughness: 0.95 }, false);
mat('paverRed', { map: T.paverRed, roughness: 0.92 }, false);
mat('paverGrey', { map: T.paverGrey, roughness: 0.92 }, false);
mat('paverTerr', { map: T.paverTerr, roughness: 0.92 }, false);
mat('lawn', { map: T.lawn, roughness: 1 }, false);
mat('soil', { map: T.soil, roughness: 1 }, false);
mat('sand', { map: T.sand, roughness: 1 }, false);
mat('gravel', { map: T.gravel, roughness: 1 }, false);
mat('rubber', { map: T.rubber, color: '#45484b', roughness: 0.95 }, false);
mat('slabs', { map: T.slabs, roughness: 0.95 }, false);
mat('field', { color: '#7f8566', roughness: 1 }, false);
// Nachbarn und Pflanzen
mat('wallNeighbor', { map: T.neighbor, vertexColors: true, roughness: 0.95 });
mat('shingleWall', { map: T.shingle, roughness: 0.9 });
mat('leaves', { map: T.leaves, vertexColors: true, roughness: 0.85 });
mat('yucca', { color: '#5f7d4c', roughness: 0.7, side: THREE.DoubleSide });
for (const k of ['asphalt', 'sidewalk', 'paverRed', 'paverGrey', 'paverTerr', 'lawn', 'soil', 'sand', 'gravel', 'rubber', 'slabs']) {
  M[k].polygonOffset = true; M[k].polygonOffsetFactor = -1; M[k].polygonOffsetUnits = -1;
}

// ------------------------------------------------------------------ Geometrie-Bausteine
const S = new THREE.Group(); // statische Szene, wird am Ende nach Material zusammengefasst
scene.add(S);
function addMesh(geo, m, matrix) {
  const mesh = new THREE.Mesh(geo, m);
  if (matrix) mesh.applyMatrix4(matrix);
  S.add(mesh);
  return mesh;
}
function box(w, h, d, m, x, y, z, ry = 0) {
  return addMesh(new THREE.BoxGeometry(w, h, d), m, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
}
function cyl(rt, rb, h, m, x, y, z, seg = 14) {
  return addMesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, new THREE.Matrix4().setPosition(x, y, z));
}
function beam(p0, p1, w, h, m, upv = UP) {
  const dir = new THREE.Vector3().subVectors(p1, p0); const L = dir.length(); dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, upv);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
  const g = new THREE.BoxGeometry(L, h, w);
  const mtx = new THREE.Matrix4().makeBasis(dir, up2, side).setPosition(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5));
  return addMesh(g, m, mtx);
}
function pipe(p0, p1, r, m, seg = 10) {
  const dir = new THREE.Vector3().subVectors(p1, p0); const L = dir.length();
  const g = new THREE.CylinderGeometry(r, r, L, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  return addMesh(g, m, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5), q, V3(1, 1, 1)));
}
function pipeline(pts, r, m) { for (let i = 0; i < pts.length - 1; i++) pipe(pts[i], pts[i + 1], r, m); }
function quad(p0, p1, p2, p3, m, uvs = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p0.toArray(), ...p1.toArray(), ...p2.toArray(), ...p3.toArray()], 3));
  const L1 = p0.distanceTo(p1) * uvs, L3 = p0.distanceTo(p3) * uvs;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L1, 0, L1, L3, 0, L3], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return addMesh(g, m);
}
// horizontale Fläche aus (u,v)-Punkten
function flat(pts, y, m) {
  const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, -v)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  return addMesh(g, m);
}
const rect = (u0, v0, u1, v1, y, m) => flat([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], y, m);

// Wand mit lokalem Koordinatensystem: x entlang der Wand, y nach oben, z nach außen
function makeWall(origin, n) {
  const ax = new THREE.Vector3().crossVectors(UP, n).normalize();
  return { M: new THREE.Matrix4().makeBasis(ax, UP, n).setPosition(origin) };
}
function wallShape(W, outline, holes, m) {
  const sh = new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const o of holes) {
    const p = new THREE.Path();
    p.moveTo(o.x0, o.y0); p.lineTo(o.x1, o.y0); p.lineTo(o.x1, o.y1); p.lineTo(o.x0, o.y1); p.closePath();
    sh.holes.push(p);
  }
  const g = new THREE.ShapeGeometry(sh);
  g.applyMatrix4(W.M);
  return addMesh(g, m);
}
function wbox(W, cx, cy, cz, w, h, d, m) { const g = new THREE.BoxGeometry(w, h, d); g.translate(cx, cy, cz); g.applyMatrix4(W.M); return addMesh(g, m); }
function wplane(W, cx, cy, cz, w, h, m) { const g = new THREE.PlaneGeometry(w, h); g.translate(cx, cy, cz); g.applyMatrix4(W.M); return addMesh(g, m); }
function wpoint(W, x, y, z) { return V3(x, y, z).applyMatrix4(W.M); }

const FR = 0.075;
function opening(W, o) {
  const { x0, x1, y0, y1 } = o;
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const dr = o.depth ?? 0.26, rv = o.reveal || M.reveal, fm = o.frame || M.frame;
  wbox(W, x0 + 0.01, cy, -dr / 2, 0.02, h, dr, rv);
  wbox(W, x1 - 0.01, cy, -dr / 2, 0.02, h, dr, rv);
  wbox(W, cx, y1 - 0.01, -dr / 2, w, 0.02, dr, rv);
  if (y0 > 0.02) wbox(W, cx, y0 + 0.01, -dr / 2, w, 0.02, dr, rv);
  const zf = -(o.recess ?? 0.11);
  const leaf = { garage: M.garageDoor, entry: M.entryDoor, wood: M.plankDoor }[o.type];
  if (leaf) {
    const fw = o.type === 'garage' ? 0.05 : 0.07;
    wbox(W, x0 + fw / 2, cy, zf, fw, h, 0.08, fm); wbox(W, x1 - fw / 2, cy, zf, fw, h, 0.08, fm);
    wbox(W, cx, y1 - fw / 2, zf, w, fw, 0.08, fm);
    wplane(W, cx, cy - fw / 2, zf - 0.01, w - 2 * fw + 0.01, h - fw, leaf);
    if (o.type === 'entry') wbox(W, cx + w * 0.33, cy, zf + 0.03, 0.03, 0.3, 0.05, M.metal);
    return;
  }
  wbox(W, x0 + FR / 2, cy, zf, FR, h, 0.07, fm); wbox(W, x1 - FR / 2, cy, zf, FR, h, 0.07, fm);
  wbox(W, cx, y1 - FR / 2, zf, w, FR, 0.07, fm); wbox(W, cx, y0 + FR / 2, zf, w, FR, 0.07, fm);
  const panes = (o.type === 'win2' || o.type === 'door2') ? 2 : 1, mw = 0.09;
  const inner = w - 2 * FR - (panes - 1) * mw, ih = h - 2 * FR, sw = 0.05;
  const widths = panes === 2 ? [inner * (o.split ?? 0.5), inner * (1 - (o.split ?? 0.5))] : [inner];
  let xl = x0 + FR;
  for (let i = 0; i < panes; i++) {
    const iw = widths[i], px = xl + iw / 2; xl += iw + mw;
    if (i > 0) wbox(W, px - iw / 2 - mw / 2, cy, zf, mw, ih, 0.07, fm);
    wbox(W, px - iw / 2 + sw / 2, cy, zf + 0.012, sw, ih, 0.06, fm); wbox(W, px + iw / 2 - sw / 2, cy, zf + 0.012, sw, ih, 0.06, fm);
    wbox(W, px, cy + ih / 2 - sw / 2, zf + 0.012, iw, sw, 0.06, fm); wbox(W, px, cy - ih / 2 + sw / 2, zf + 0.012, iw, sw, 0.06, fm);
    wplane(W, px, cy, zf - 0.005, iw - 2 * sw + 0.02, ih - 2 * sw + 0.02, o.blind ? M.glassBlind : M.glass);
    if (o.handle) wbox(W, px + (i === 0 ? iw / 2 - 0.09 : -iw / 2 + 0.09), cy, zf + 0.05, 0.025, 0.14, 0.03, M.metal);
  }
  if (o.shutter) { const s = h * o.shutter; wplane(W, cx, y1 - s / 2, zf + 0.055, w - 0.03, s, M.shutter); }
  if (o.type === 'win1' || o.type === 'win2') wbox(W, cx, y0 - 0.02, 0.035, w + 0.1, 0.04, 0.16, M.sill);
}
// Dachplatte: untere Ecken A,B (Traufe), C,D (First), gegen den Uhrzeigersinn von oben
function slab(A, B, C, D, th, topM, sideM, botM) {
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(D, A)).normalize();
  const off = n.clone().multiplyScalar(th);
  const [a, b, c, d] = [A, B, C, D].map((p) => p.clone().add(off));
  quad(a, b, c, d, topM);
  quad(A, D, C, B, botM);
  quad(A, B, b, a, sideM); quad(B, C, c, b, sideM); quad(C, D, d, c, sideM); quad(D, A, a, d, sideM);
  return { n, a, b, c, d };
}

// ------------------------------------------------------------------ Kollision (2D in u,v)
const SEG = []; const CIR = []; const FOOT = [];
function segAdd(a, b) { SEG.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], minx: Math.min(a[0], b[0]), maxx: Math.max(a[0], b[0]), minz: Math.min(a[1], b[1]), maxz: Math.max(a[1], b[1]) }); }
function polyAdd(pts, foot = true) { for (let i = 0; i < pts.length; i++) segAdd(pts[i], pts[(i + 1) % pts.length]); if (foot) FOOT.push(pts); }
function rectAdd(u0, v0, u1, v1, foot = true) { polyAdd([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], foot); }
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ================================================================== Unser Haus
const HU0 = -4.643, HU1 = 4.293, HV0 = -5.557, HV1 = 3.65, EAVE = 5.232, RIDGE = 9.18;
const HUC = (HU0 + HU1) / 2, HW = HU1 - HU0, HD = HV1 - HV0, TAN = (RIDGE - EAVE) / (HW / 2);

function buildHouse() {
  const gable = [[0, 0], [HW, 0], [HW, EAVE], [HW / 2, RIDGE], [0, EAVE]];
  // Straßenseite (Giebel nach NW), x = Abstand von der NO-Ecke, so wie auf dem Foto von links
  const front = makeWall(V3(HU1, 0, HV0), V3(0, 0, -1));
  const fOpen = [
    { x0: 1.24, x1: 3.14, y0: 1.65, y1: 3.16, type: 'win2', blind: true },
    { x0: 5.20, x1: 7.10, y0: 1.65, y1: 3.20, type: 'win2', blind: true, split: 0.68 },
    { x0: 2.21, x1: 3.56, y0: 4.59, y1: 6.02, type: 'win1', shutter: 0.78 },
    { x0: 5.04, x1: 6.39, y0: 4.57, y1: 5.97, type: 'win1', shutter: 0.07, handle: true },
    { x0: 4.16, x1: 4.70, y0: 7.43, y1: 8.14, type: 'win1' },
  ];
  wallShape(front, gable, fOpen, M.wallHouse); fOpen.forEach((o) => opening(front, o));
  wplane(front, HW / 2, 0.21, 0.012, HW, 0.42, M.plinth);
  wbox(front, HW / 2, 6.9, 0.01, HW - 2 * (6.9 - EAVE) / TAN - 0.12, 0.025, 0.012, M.reveal);

  // Rückseite zum Hof
  const rear = makeWall(V3(HU0, 0, HV1), V3(0, 0, 1));
  const rOpen = [
    { x0: 1.64, x1: 3.04, y0: 0.45, y1: 2.60, type: 'door2' },
    { x0: 3.49, x1: 4.09, y0: 1.35, y1: 2.35, type: 'win1' },
    { x0: 1.34, x1: 2.54, y0: 4.00, y1: 5.30, type: 'win1', shutter: 0.45 },
    { x0: 3.29, x1: 4.19, y0: 3.47, y1: 5.55, type: 'door1' },
  ];
  wallShape(rear, gable, rOpen, M.wallHouse); rOpen.forEach((o) => opening(rear, o));
  wplane(rear, 2.65, 0.21, 0.012, 5.3, 0.42, M.plinth);

  // Seitenwand zur Einfahrt (Fenster und Eingang angenommen)
  const sw = makeWall(V3(HU0, 0, HV0), V3(-1, 0, 0));
  const sOpen = [
    { x0: 1.46, x1: 2.66, y0: 1.50, y1: 2.90, type: 'win2' },
    { x0: 4.36, x1: 5.41, y0: 0.60, y1: 2.75, type: 'entry' },
    { x0: 6.76, x1: 7.46, y0: 1.90, y1: 2.70, type: 'win1' },
    { x0: 1.56, x1: 2.56, y0: 3.95, y1: 5.00, type: 'win1' },
    { x0: 6.36, x1: 7.36, y0: 3.95, y1: 5.00, type: 'win1' },
  ];
  wallShape(sw, [[0, 0], [HD, 0], [HD, EAVE], [0, EAVE]], sOpen, M.wallHouse); sOpen.forEach((o) => opening(sw, o));
  wplane(sw, HD / 2, 0.21, 0.012, HD, 0.42, M.plinth);
  // Eingangsstufen und Vordach
  const dv = HV0 + 4.885;
  box(0.45, 0.6, 1.5, M.concrete, HU0 - 0.225, 0.3, dv);
  box(0.3, 0.4, 1.5, M.concrete, HU0 - 0.6, 0.2, dv);
  box(0.3, 0.2, 1.5, M.concrete, HU0 - 0.9, 0.1, dv);
  box(1.0, 0.05, 1.6, M.glassTable, HU0 - 0.5, 3.05, dv);
  box(1.0, 0.06, 0.05, M.metal, HU0 - 0.5, 3.03, dv - 0.8); box(1.0, 0.06, 0.05, M.metal, HU0 - 0.5, 3.03, dv + 0.8);
  rectAdd(HU0 - 1.05, dv - 0.75, HU0, dv + 0.75, false);

  // Grenzwand nach NO ohne Öffnungen
  const ne = makeWall(V3(HU1, 0, HV1), V3(1, 0, 0));
  wallShape(ne, [[0, 0], [HD, 0], [HD, EAVE], [0, EAVE]], [], M.wallHouse);
  rectAdd(HU0, HV0, HU1, HV1);

  // Satteldach mit Überständen
  const ov = 0.35, vo = 0.22, th = 0.2, yE = EAVE - ov * TAN;
  const swR = slab(V3(HU0 - ov, yE, HV0 - vo), V3(HU0 - ov, yE, HV1 + vo), V3(HUC, RIDGE, HV1 + vo), V3(HUC, RIDGE, HV0 - vo), th, M.tiles, M.fascia, M.soffit);
  slab(V3(HU1 + ov, yE, HV1 + vo), V3(HU1 + ov, yE, HV0 - vo), V3(HUC, RIDGE, HV0 - vo), V3(HUC, RIDGE, HV1 + vo), th, M.tiles, M.fascia, M.soffit);
  pipe(V3(HUC, RIDGE + 0.2, HV0 - vo - 0.02), V3(HUC, RIDGE + 0.2, HV1 + vo + 0.02), 0.14, M.ridge);
  const topY = (u) => RIDGE + th / Math.cos(Math.atan(TAN)) - Math.abs(u - HUC) * TAN;
  for (const vv of [HV0 - vo + 0.08, HV1 + vo - 0.08]) {
    beam(V3(HU0 - ov, topY(HU0 - ov) + 0.04, vv), V3(HUC, topY(HUC) + 0.04, vv), 0.16, 0.08, M.tileEdge);
    beam(V3(HU1 + ov, topY(HU1 + ov) + 0.04, vv), V3(HUC, topY(HUC) + 0.04, vv), 0.16, 0.08, M.tileEdge);
  }
  // Rinnen und Fallrohre
  pipe(V3(HU0 - ov + 0.03, yE - 0.04, HV0 - vo), V3(HU0 - ov + 0.03, yE - 0.04, HV1 + vo), 0.07, M.gutter);
  pipe(V3(HU1 + ov - 0.03, yE - 0.04, HV0 - vo), V3(HU1 + ov - 0.03, yE - 0.04, HV1 + vo), 0.07, M.gutter);
  pipeline([V3(HU1 + ov - 0.05, yE - 0.06, HV0 - 0.14), V3(HU1 - 0.12, yE - 0.4, HV0 - 0.09), V3(HU1 - 0.12, 0.12, HV0 - 0.09)], 0.045, M.gutter);
  pipeline([V3(HU0 - ov + 0.05, yE - 0.06, HV0 - 0.14), V3(HU1 - 8.5, yE - 0.4, HV0 - 0.09), V3(HU1 - 8.5, 0.12, HV0 - 0.09)], 0.045, M.gutter);
  pipeline([V3(HU0 - ov + 0.05, yE - 0.06, HV1 + 0.14), V3(HU0 + 0.14, yE - 0.4, HV1 + 0.09), V3(HU0 + 0.14, 0.12, HV1 + 0.09)], 0.045, M.gutter);
  // Kamin
  box(0.55, 1.8, 0.65, M.chimney, 0.15, 9.05, 0.75);
  box(0.7, 0.07, 0.8, M.darkMetal, 0.15, 9.98, 0.75);
  // Photovoltaik auf der SW-Dachfläche (Luftbild 2023: 3 Reihen × 8 Module, oben 4 frei)
  const dS = new THREE.Vector3().subVectors(V3(HUC, RIDGE, 0), V3(HU0 - ov, yE, 0)).normalize();
  const nS = swR.n;
  for (const [row, sr] of [[0, 1.30], [1, 2.98], [2, 4.66]].map(([i, s]) => [i, s])) {
    for (let i = 0; i < 8; i++) {
      if (row === 0 && i >= 3 && i <= 6) continue;
      const vc = -4.52 + i * 1.01;
      const c = V3(HUC, RIDGE, vc).addScaledVector(dS, -sr).addScaledVector(nS, th + 0.12);
      beam(c.clone().addScaledVector(dS, -0.82), c.clone().addScaledVector(dS, 0.82), 0.99, 0.045, M.pv);
    }
  }

  // ---------- Anbau hinten rechts (NO), mit Balkon
  const aU0 = 0.654, aU1 = 4.27, aV0 = HV1, aV1 = 7.48, aE1 = 6.101, aR = 6.813, aRU = 2.199, aE2 = 4.857;
  const aSW = makeWall(V3(aU0, 0, aV0), V3(-1, 0, 0));
  const aOpen = [
    { x0: 1.80, x1: 2.75, y0: 0.0, y1: 2.10, type: 'entry', reveal: M.revealCream },
    { x0: 1.90, x1: 2.80, y0: 4.0, y1: 5.1, type: 'win1', reveal: M.revealCream },
  ];
  wallShape(aSW, [[0, 0], [aV1 - aV0, 0], [aV1 - aV0, aE1], [0, aE1]], aOpen, M.wallCream); aOpen.forEach((o) => opening(aSW, o));
  wallShape(makeWall(V3(aU1, 0, aV1), V3(1, 0, 0)), [[0, 0], [aV1 - aV0, 0], [aV1 - aV0, aE2], [0, aE2]], [], M.wallCream);
  wallShape(makeWall(V3(aU0, 0, aV1), V3(0, 0, 1)), [[0, 0], [aU1 - aU0, 0], [aU1 - aU0, aE2], [aRU - aU0, aR], [0, aE1]], [], M.wallCream);
  const s1 = (aR - aE1) / (aRU - aU0), s2 = (aR - aE2) / (aU1 - aRU);
  slab(V3(aU0 - 0.3, aE1 - 0.3 * s1, aV0), V3(aU0 - 0.3, aE1 - 0.3 * s1, aV1 + 0.12), V3(aRU, aR, aV1 + 0.12), V3(aRU, aR, aV0), 0.16, M.tiles, M.fascia, M.soffit);
  slab(V3(aU1 + 0.03, aE2 - 0.03 * s2, aV1 + 0.12), V3(aU1 + 0.03, aE2 - 0.03 * s2, aV0), V3(aRU, aR, aV0), V3(aRU, aR, aV1 + 0.12), 0.16, M.tiles, M.fascia, M.soffit);
  pipe(V3(aU0 - 0.28, aE1 - 0.34 * s1, aV0 + 0.05), V3(aU0 - 0.28, aE1 - 0.34 * s1, aV1 + 0.12), 0.06, M.gutter);
  pipeline([V3(aU0 - 0.28, aE1 - 0.4 * s1, 6.95), V3(aU0 - 0.08, aE1 - 0.7, 6.97), V3(aU0 - 0.08, 0.12, 6.97)], 0.04, M.gutter);
  rectAdd(aU0, aV0, aU1, aV1);
  // Balkon im Winkel zwischen Giebel und Anbau
  const bU0 = -1.95;
  box(aU0 - bU0, 0.14, 1.5, M.wood, (aU0 + bU0) / 2, 3.35, aV0 + 0.75);
  box(0.12, 5.8, 0.12, M.wood, bU0 + 0.06, 2.9, aV0 + 1.44);
  beam(V3(bU0 + 0.03, 4.42, aV0), V3(bU0 + 0.03, 4.42, aV0 + 1.5), 0.08, 0.07, M.wood);
  beam(V3(bU0, 4.42, aV0 + 1.47), V3(aU0, 4.42, aV0 + 1.47), 0.08, 0.07, M.wood);
  const rl1 = new THREE.PlaneGeometry(1.46, 0.92); rl1.rotateY(Math.PI / 2); rl1.translate(bU0 + 0.03, 3.9, aV0 + 0.74); addMesh(rl1, M.rail);
  const rl2 = new THREE.PlaneGeometry(aU0 - bU0, 0.92); rl2.translate((aU0 + bU0) / 2, 3.9, aV0 + 1.47); addMesh(rl2, M.rail);
  beam(V3(bU0, 5.72, aV0 + 1.44), V3(aU0, 5.9, aV0 + 1.44), 0.1, 0.14, M.wood);
  beam(V3(bU0 + 0.06, 5.72, aV0), V3(bU0 + 0.06, 5.72, aV0 + 1.5), 0.1, 0.14, M.wood);
  for (let i = 0; i < 6; i++) { const uu = bU0 + 0.25 + i * 0.44; beam(V3(uu, 5.86, aV0 + 0.02), V3(uu, 5.86, aV0 + 1.55), 0.06, 0.05, M.wood); }
  CIR.push([bU0 + 0.06, aV0 + 1.44, 0.12]);

  // ---------- Schuppen (ehem. Scheune) entlang der NO-Grenze
  const sU0 = -0.33, sU1 = 4.18, sV0 = 7.054, sV1 = 15.77, sE1 = 4.60, sE2 = 4.745, sR = 6.408, sRU = 1.98;
  const sSW = makeWall(V3(sU0, 0, sV0), V3(-1, 0, 0));
  const shOpen = [
    { x0: 0.30, x1: 1.20, y0: 0, y1: 2.05, type: 'wood', frame: M.frameWood, reveal: M.revealCream, recess: 0.08 },
    { x0: 1.85, x1: 2.75, y0: 0, y1: 2.05, type: 'wood', frame: M.frameWood, reveal: M.revealCream, recess: 0.08 },
    { x0: 4.55, x1: 5.15, y0: 3.0, y1: 3.5, type: 'win1', frame: M.frameWhite, reveal: M.revealCream },
  ];
  wallShape(sSW, [[0, 0], [sV1 - sV0, 0], [sV1 - sV0, sE1], [0, sE1]], shOpen, M.wallCream); shOpen.forEach((o) => opening(sSW, o));
  wplane(sSW, (sV1 - sV0) / 2, 0.2, 0.012, sV1 - sV0, 0.4, M.plinth);
  const sRet = (0.643 - sU0);
  wallShape(makeWall(V3(0.643, 0, sV0), V3(0, 0, -1)), [[0, 0], [sRet, 0], [sRet, sE1], [0, sE1 + sRet * (sR - sE1) / (sRU - sU0)]], [], M.wallCream);
  wallShape(makeWall(V3(sU1, 0, sV1), V3(1, 0, 0)), [[0, 0], [sV1 - aV1, 0], [sV1 - aV1, sE2], [0, sE2]], [], M.wallCream);
  wallShape(makeWall(V3(sU0, 0, sV1), V3(0, 0, 1)), [[0, 0], [sU1 - sU0, 0], [sU1 - sU0, sE2], [sRU - sU0, sR], [0, sE1]], [], M.wallCream);
  const t1 = (sR - sE1) / (sRU - sU0), t2 = (sR - sE2) / (sU1 - sRU), sOv = 0.95;
  const sSlab = slab(V3(sU0 - sOv, sE1 - sOv * t1, sV0), V3(sU0 - sOv, sE1 - sOv * t1, sV1 + 0.25), V3(sRU, sR, sV1 + 0.25), V3(sRU, sR, sV0), 0.16, M.tiles, M.fascia, M.soffit);
  slab(V3(sU1 + 0.1, sE2 - 0.1 * t2, sV1 + 0.25), V3(sU1 + 0.1, sE2 - 0.1 * t2, aV1), V3(sRU, sR, aV1), V3(sRU, sR, sV1 + 0.25), 0.16, M.tiles, M.fascia, M.soffit);
  pipe(V3(sRU, sR + 0.16, sV0), V3(sRU, sR + 0.16, sV1 + 0.27), 0.12, M.ridge);
  // Dachfenster
  const dS2 = new THREE.Vector3().subVectors(V3(sRU, sR, 0), V3(sU0 - sOv, sE1 - sOv * t1, 0)).normalize();
  const sky0 = V3(sU0 - sOv, sE1 - sOv * t1, 10.15).addScaledVector(dS2, 2.45).addScaledVector(sSlab.n, 0.2);
  beam(sky0.clone().addScaledVector(dS2, -0.52), sky0.clone().addScaledVector(dS2, 0.52), 1.42, 0.07, M.sill);
  beam(sky0.clone().addScaledVector(dS2, -0.44).addScaledVector(sSlab.n, 0.03), sky0.clone().addScaledVector(dS2, 0.44).addScaledVector(sSlab.n, 0.03), 1.26, 0.04, M.glass);
  const yG = sE1 - (sOv - 0.02) * t1 - 0.04;
  pipe(V3(sU0 - sOv + 0.03, yG, sV0), V3(sU0 - sOv + 0.03, yG, sV1 + 0.25), 0.065, M.gutter);
  pipe(V3(sU0 - sOv + 0.06, yG, 15.9), V3(sU0 - sOv + 0.06, 1.0, 15.9), 0.045, M.gutter);
  cyl(0.33, 0.3, 0.95, M.teal, sU0 - sOv + 0.2, 0.475, 15.55); CIR.push([sU0 - sOv + 0.2, 15.55, 0.34]);
  polyAdd([[sU0, sV0], [0.643, sV0], [0.643, aV1], [sU1, aV1], [sU1, sV1], [sU0, sV1]]);
  // Lichterkette unter dem Schuppendach
  for (let v = 7.6; v < 15.5; v += 0.42) {
    const t = ((v - 7.6) % 2.6) / 2.6;
    const y = 3.35 - Math.sin(t * Math.PI) * 0.22;
    addMesh(new THREE.SphereGeometry(0.035, 8, 6), M.bulb, new THREE.Matrix4().setPosition(sU0 - 0.25, y, v));
  }

  // ---------- Garage (Flachdach 3,13 m)
  const gU0 = -9.18, gU1 = -5.04, gV0 = 10.24, gV1 = 19.40, gH = 3.13;
  const gNW = makeWall(V3(gU1, 0, gV0), V3(0, 0, -1));
  const gOpen = [{ x0: 0.45, x1: 3.60, y0: 0, y1: 2.20, type: 'garage', frame: M.frameWhite, reveal: M.reveal, recess: 0.12 }];
  wallShape(gNW, [[0, 0], [gU1 - gU0, 0], [gU1 - gU0, gH], [0, gH]], gOpen, M.wallWhite); opening(gNW, gOpen[0]);
  const gNE = makeWall(V3(gU1, 0, gV1), V3(1, 0, 0));
  wallShape(gNE, [[0, 0], [gV1 - gV0, 0], [gV1 - gV0, gH], [0, gH]], [], M.wallWhite);
  const ivy = new THREE.PlaneGeometry(6.2, 2.7); ivy.translate(3.4, 1.35, 0.04); ivy.applyMatrix4(gNE.M); addMesh(ivy, M.ivy);
  wallShape(makeWall(V3(gU0, 0, gV1), V3(0, 0, 1)), [[0, 0], [gU1 - gU0, 0], [gU1 - gU0, gH], [0, gH]], [], M.wallWhite);
  wallShape(makeWall(V3(gU0, 0, gV0), V3(-1, 0, 0)), [[0, 0], [gV1 - gV0, 0], [gV1 - gV0, gH], [0, gH]], [], M.wallWhite);
  box(gU1 - gU0 + 0.1, 0.12, gV1 - gV0 + 0.1, M.roofFlat, (gU0 + gU1) / 2, gH - 0.04, (gV0 + gV1) / 2);
  box(gU1 - gU0 + 0.14, 0.1, 0.05, M.metal, (gU0 + gU1) / 2, gH + 0.04, gV0 - 0.05);
  box(gU1 - gU0 + 0.14, 0.1, 0.05, M.metal, (gU0 + gU1) / 2, gH + 0.04, gV1 + 0.05);
  box(0.05, 0.1, gV1 - gV0 + 0.14, M.metal, gU1 + 0.05, gH + 0.04, (gV0 + gV1) / 2);
  box(0.05, 0.1, gV1 - gV0 + 0.14, M.metal, gU0 - 0.05, gH + 0.04, (gV0 + gV1) / 2);
  rectAdd(gU0, gV0, gU1, gV1);

  // ---------- Überdachung hinter der Garage (SW), mit Schaukel, Strickleiter und Ringen
  const pU0 = -9.10, pU1 = -4.03, pV0 = 19.38, pV1 = 22.55;
  const yAt = (v) => 2.55 + (v - pV0) * (0.35 / (pV1 - pV0));
  for (const [u, v] of [[-9.02, 22.45], [-6.55, 22.45], [-4.1, 22.45], [-4.1, 19.5]]) { box(0.12, yAt(v) - 0.12, 0.12, M.wood, u, (yAt(v) - 0.12) / 2, v); CIR.push([u, v, 0.1]); }
  beam(V3(pU0, yAt(22.45) - 0.08, 22.45), V3(pU1, yAt(22.45) - 0.08, 22.45), 0.1, 0.16, M.wood);
  beam(V3(-4.1, yAt(pV0) - 0.08, pV0), V3(-4.1, yAt(pV1) - 0.08, pV1 + 0.05), 0.1, 0.16, M.wood);
  for (let u = pU0 + 0.1; u <= pU1; u += 0.8) beam(V3(u, yAt(pV0) + 0.02, pV0), V3(u, yAt(pV1) + 0.02, pV1 + 0.1), 0.06, 0.1, M.wood);
  quad(V3(pU0 - 0.05, yAt(pV0) + 0.09, pV0), V3(pU1 + 0.08, yAt(pV0) + 0.09, pV0), V3(pU1 + 0.08, yAt(pV1) + 0.12, pV1 + 0.12), V3(pU0 - 0.05, yAt(pV1) + 0.12, pV1 + 0.12), M.corr);
  const hb = yAt(22.45) - 0.16;
  for (const du of [-0.18, 0.18]) pipe(V3(-7.9 + du, hb, 22.45), V3(-7.9 + du, 0.35, 22.45), 0.012, M.rope);
  for (let y = 0.45; y < hb - 0.2; y += 0.3) pipe(V3(-8.08, y, 22.45), V3(-7.72, y, 22.45), 0.018, M.woodLight);
  pipe(V3(-6.7, hb, 22.45), V3(-6.7, 0.5, 22.45), 0.012, M.rope);
  cyl(0.17, 0.17, 0.04, M.red, -6.7, 0.47, 22.45, 20);
  for (const du of [-0.2, 0.2]) {
    pipe(V3(-5.6 + du, hb, 22.45), V3(-5.6 + du, 1.66, 22.45), 0.012, M.rope);
    const ring = new THREE.TorusGeometry(0.09, 0.016, 8, 20); ring.translate(-5.6 + du, 1.57, 22.45); addMesh(ring, M.red);
  }
  // ---------- Überdachung hinter dem Schuppen (NO), mit Lichterkette
  const qU0 = 0.15, qU1 = 4.10, qV0 = 15.73, qV1 = 23.2;
  const yQ = (u) => 2.48 + (u - qU0) * (0.36 / (qU1 - qU0));
  for (const [u, v] of [[0.22, 16.0], [0.22, 19.6], [0.22, 23.1], [2.05, 23.12], [3.72, 23.15]]) { box(0.12, yQ(u) - 0.12, 0.12, M.wood, u, (yQ(u) - 0.12) / 2, v); CIR.push([u, v, 0.1]); }
  beam(V3(0.22, yQ(0.22) - 0.08, qV0), V3(0.22, yQ(0.22) - 0.08, qV1 + 0.05), 0.1, 0.16, M.wood);
  beam(V3(qU0, yQ(qU0) - 0.08, 23.12), V3(qU1, yQ(qU1) - 0.08, 23.12), 0.1, 0.16, M.wood);
  for (let v = qV0 + 0.15; v <= qV1; v += 0.8) beam(V3(qU0 - 0.1, yQ(qU0) + 0.02, v), V3(qU1, yQ(qU1) + 0.02, v), 0.06, 0.1, M.wood);
  quad(V3(qU0 - 0.15, yQ(qU0) + 0.09, qV1 + 0.1), V3(qU0 - 0.15, yQ(qU0) + 0.09, qV0), V3(qU1, yQ(qU1) + 0.09, qV0), V3(qU1, yQ(qU1) + 0.09, qV1 + 0.1), M.corr);
  for (let v = qV0 + 0.2; v < qV1; v += 0.3) {
    const t = ((v - qV0 - 0.2) % 2.4) / 2.4;
    addMesh(new THREE.SphereGeometry(0.04, 8, 6), M.bulb, new THREE.Matrix4().setPosition(0.12, 2.28 - Math.sin(t * Math.PI) * 0.28, v));
  }
  segAdd([4.1, 19.9], [3.62, 23.2]);
}

// ================================================================== Hof, Terrasse, Garten
const PLANTS = []; // Blob-Pflanzen: [x,y,z,sx,sy,sz,farbe]
const TRUNKS = []; // [x,z,y0,y1,r]
const CONIFERS = []; // [x,z,h,r]
let gateL, gateR, gateAngle = 0;
function plant(x, y, z, sx, sy, sz, col) { PLANTS.push([x, y, z, sx, sy, sz, new THREE.Color(col)]); }

function buildYard(parcel) {
  // Grundstücksboden
  flat(parcel, 0, M.lawn);
  flat([[-9.2, -5.47], [HU0, -5.47], [HU0, HV1], [-9.2, HV1]], 0.012, M.paverGrey);
  flat([[-9.2, HV1], [0.654, HV1], [0.654, 7.054], [-0.33, 7.054], [-0.33, 15.8], [-5.04, 15.8], [-5.04, 10.24], [-9.2, 10.24]], 0.012, M.paverRed);
  flat([[-5.04, 15.72], [4.12, 15.72], [3.9, 23.3], [-4.0, 23.35], [-4.0, 19.38], [-5.04, 19.38]], 0.012, M.paverTerr);
  rect(-9.15, 19.4, -4.0, 23.35, 0.02, M.rubber);
  rect(-9.15, 23.35, -4.3, 28.6, 0.02, M.sand);
  rect(-4.0, 17.95, -3.12, 23.35, 0.022, M.gravel);
  rect(-3.0, 23.8, 2.95, 30.7, 0.02, M.soil);
  rect(-4.3, 23.8, -3.75, 28.6, 0.022, M.soil);
  rect(-3.72, 23.9, -3.12, 31.6, 0.03, M.slabs);
  box(0.6, 0.03, 0.5, M.darkMetal, -3.42, 0.025, 23.62);
  // Einfassungen der Beete
  for (const [u0, v0, u1, v1] of [[-2.8, 25.2, -1.2, 30.4], [-0.8, 24.9, 2.7, 30.4]]) {
    box(u1 - u0, 0.12, 0.05, M.woodLight, (u0 + u1) / 2, 0.06, v0); box(u1 - u0, 0.12, 0.05, M.woodLight, (u0 + u1) / 2, 0.06, v1);
    box(0.05, 0.12, v1 - v0, M.woodLight, u0, 0.06, (v0 + v1) / 2); box(0.05, 0.12, v1 - v0, M.woodLight, u1, 0.06, (v0 + v1) / 2);
  }
  box(0.08, 0.1, 7.7, M.concrete, -3.08, 0.05, 27.75);

  // Hochbeete im Hof, zweistufig mit Palisaden
  const hb = [[-3.65, -2.85, 0.36], [-4.75, -3.65, 0.66]];
  for (const [u0, u1, h] of hb) {
    const v0 = 7.0, v1 = 15.2;
    const pal = (w, x, z, ry) => { const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z)); addMesh(g, M.palisade); };
    pal(v1 - v0, u1, (v0 + v1) / 2, Math.PI / 2); pal(u1 - u0, (u0 + u1) / 2, v0, Math.PI); pal(u1 - u0, (u0 + u1) / 2, v1, 0);
    rect(u0, v0, u1, v1, h, M.soil);
  }
  rectAdd(-4.75, 7.0, -2.85, 15.2, false);
  const r = rng(99);
  for (let i = 0; i < 16; i++) {
    const tier = i % 2, u = tier ? -4.2 + (r() - 0.5) * 0.7 : -3.25 + (r() - 0.5) * 0.4, v = 7.4 + r() * 7.4;
    const k = r(), col = k < 0.35 ? '#8a9a7c' : k < 0.6 ? '#6e8a4c' : k < 0.8 ? '#9c8fb0' : '#7d9460';
    const s = 0.22 + r() * 0.28; plant(u, (tier ? 0.66 : 0.36) + s * 0.6, v, s, s * 0.8, s, col);
  }
  TRUNKS.push([-4.2, 12.8, 0.66, 2.5, 0.09]);
  plant(-4.2, 3.3, 12.8, 1.9, 1.25, 1.9, '#58803b'); plant(-3.6, 2.9, 13.6, 1.1, 0.8, 1.1, '#62883f');
  CIR.push([-4.2, 12.8, 0.2]);

  // Palettenpodest, Tonne, Schirm, Laufrad, Bollerwagen, Bank
  box(2.1, 0.28, 1.2, M.woodLight, -2.3, 0.14, HV1 + 0.6);
  for (let i = 0; i < 5; i++) box(2.1, 0.02, 0.14, M.wood, -2.3, 0.285, HV1 + 0.1 + i * 0.25);
  box(0.58, 0.95, 0.72, M.binGreen, -4.2, 0.475, 4.35); box(0.62, 0.06, 0.78, M.binGreen, -4.2, 0.98, 4.33); rectAdd(-4.5, 4.0, -3.9, 4.7, false);
  cyl(0.02, 0.02, 2.3, M.metal, -4.45, 1.15, 5.7); addMesh(new THREE.ConeGeometry(0.17, 1.35, 12), M.parasol, new THREE.Matrix4().setPosition(-4.45, 1.75, 5.7));
  for (const dz of [-0.33, 0.33]) { const w = new THREE.TorusGeometry(0.17, 0.035, 8, 20); w.rotateY(Math.PI / 2); w.translate(-2.2, 0.2, 5.4 + dz); addMesh(w, M.black); }
  beam(V3(-2.2, 0.22, 5.07), V3(-2.2, 0.5, 5.73), 0.04, 0.04, M.blue); box(0.1, 0.03, 0.22, M.black, -2.2, 0.52, 5.35);
  box(0.5, 0.3, 0.9, M.red, -1.15, 0.42, 6.35); for (const [du, dz] of [[-0.27, -0.3], [0.27, -0.3], [-0.27, 0.3], [0.27, 0.3]]) { const w = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14); w.rotateZ(Math.PI / 2); w.translate(-1.15 + du, 0.13, 6.35 + dz); addMesh(w, M.black); }
  beam(V3(-1.15, 0.45, 5.9), V3(-1.15, 0.9, 5.45), 0.03, 0.03, M.black);
  // Bank an der Schuppenwand
  for (let i = 0; i < 4; i++) box(0.09, 0.03, 1.4, M.woodLight, -0.62 - i * 0.1, 0.46, 12.9);
  for (let i = 0; i < 3; i++) box(0.03, 0.08, 1.4, M.woodLight, -0.37, 0.6 + i * 0.13, 12.9);
  for (const z of [12.25, 13.55]) { box(0.45, 0.46, 0.04, M.black, -0.62, 0.23, z); box(0.04, 0.9, 0.04, M.black, -0.38, 0.45, z); }
  rectAdd(-0.85, 12.2, -0.33, 13.6, false);
  box(0.3, 0.8, 0.3, M.wood, -0.62, 0.4, 11.2); box(0.42, 0.25, 0.42, M.woodLight, -0.62, 0.9, 11.2);
  box(0.32, 0.3, 0.9, M.wood, -0.55, 0.15, 10.2);

  // Terrasse: Tisch, Kirschlorbeer mit Rankgitter, Trog, Rosenbogen, Rankgitter am Pfosten
  cyl(0.5, 0.5, 0.012, M.glassTable, -1.4, 0.73, 16.9, 28);
  const tr = new THREE.TorusGeometry(0.5, 0.018, 6, 28); tr.rotateX(Math.PI / 2); tr.translate(-1.4, 0.725, 16.9); addMesh(tr, M.metal);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; beam(V3(-1.4 + Math.cos(a) * 0.42, 0.72, 16.9 + Math.sin(a) * 0.42), V3(-1.4 + Math.cos(a) * 0.3, 0.0, 16.9 + Math.sin(a) * 0.3), 0.025, 0.025, M.metal); }
  CIR.push([-1.4, 16.9, 0.55]);
  box(3.24, 0.3, 0.12, M.concrete, -1.5, 0.15, 17.95); box(0.12, 0.3, 3.35, M.concrete, -3.12, 0.15, 19.62);
  const lt1 = new THREE.PlaneGeometry(3.24, 0.72); lt1.translate(-1.5, 0.66, 17.95); addMesh(lt1, M.lattice);
  const lt2 = new THREE.PlaneGeometry(3.35, 0.72); lt2.rotateY(Math.PI / 2); lt2.translate(-3.12, 0.66, 19.62); addMesh(lt2, M.lattice);
  rect(-3.08, 17.99, 0.1, 21.3, 0.03, M.soil);
  plant(-1.45, 1.95, 19.75, 1.75, 1.6, 1.75, '#3d6a2c'); plant(-2.2, 1.35, 20.5, 1.15, 1.0, 1.1, '#44732f'); plant(-0.7, 1.5, 20.6, 1.0, 1.1, 1.0, '#3a6429');
  for (const [u, v] of [[-1.3, 19.4], [-1.8, 19.9], [-0.9, 20.0]]) TRUNKS.push([u, v, 0, 1.2, 0.05]);
  rectAdd(-3.18, 17.9, 0.12, 21.35, false);
  box(0.6, 0.32, 0.38, M.concrete, -1.1, 0.16, 17.55);
  for (const u of [-4.0, -3.12]) cyl(0.025, 0.025, 2.0, M.darkMetal, u, 1.0, 23.35, 8);
  const arc = new THREE.TorusGeometry(0.44, 0.022, 6, 20, Math.PI); arc.translate(-3.56, 2.0, 23.35); addMesh(arc, M.darkMetal);
  for (let i = 0; i < 5; i++) box(0.035, 2.3, 0.03, M.woodLight, 0.28 + 0.1 + i * 0.12, 1.15, 23.28);
  for (let i = 0; i < 6; i++) box(0.55, 0.03, 0.03, M.woodLight, 0.62, 0.3 + i * 0.38, 23.28);
  for (let i = 0; i < 8; i++) plant(0.62 + (r() - 0.5) * 0.4, 0.6 + r() * 1.7, 23.25, 0.18, 0.22, 0.12, '#8d6f45');
  // Schränke, Spielzeug unter der NO-Überdachung
  for (const v of [16.6, 17.45, 18.3]) box(0.5, 1.85, 0.8, M.cabinet, 3.72, 0.925, v);
  rectAdd(3.46, 16.18, 3.98, 18.72, false);
  const colors = [M.red, M.yellow, M.blue, M.green];
  for (let i = 0; i < 4; i++) cyl(0.26 - i * 0.03, 0.26 - i * 0.03, 0.18, colors[i], 2.9, 0.09 + i * 0.2, 18.9, 16);
  cyl(0.03, 0.03, 0.9, M.red, 2.9, 0.45, 18.9);
  box(0.32, 0.22, 0.65, M.red, 2.5, 0.22, 20.3); box(0.2, 0.2, 0.15, M.red, 2.5, 0.42, 20.05);
  box(0.62, 0.52, 0.03, M.chalk, 2.1, 1.1, 17.1, 0.4); beam(V3(1.9, 0, 17.0), V3(2.05, 1.45, 17.05), 0.03, 0.03, M.woodLight); beam(V3(2.3, 0, 17.3), V3(2.15, 1.45, 17.15), 0.03, 0.03, M.woodLight);

  // Garten: Steingarten, Yucca, Rosmarin mit Seilzaun, Bohnenstangen, Sandkasten, Trampolin, Tor
  const rk = rng(7);
  for (let i = 0; i < 9; i++) { const g = new THREE.DodecahedronGeometry(0.12 + rk() * 0.14, 0); g.scale(1.3, 0.7, 1); g.translate(-2.5 + (rk() - 0.5) * 0.9, 0.08, 24.2 + (rk() - 0.5) * 0.6); addMesh(g, M.rock); }
  for (let i = 0; i < 26; i++) { const g = new THREE.SphereGeometry(0.035 + rk() * 0.03, 6, 5); g.scale(1.2, 0.6, 1); g.translate(-2.1 + (rk() - 0.5) * 0.8, 0.04, 24.0 + (rk() - 0.5) * 0.5); addMesh(g, M.pebble); }
  const yc = [-1.85, 0.0, 24.75];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, tilt = 0.25 + (i % 5) * 0.14, L = 0.55 + (i % 3) * 0.12;
    const g = new THREE.PlaneGeometry(0.045, L); g.translate(0, L / 2, 0); g.rotateX(tilt); g.rotateY(a); g.translate(yc[0], 0.12, yc[2]); addMesh(g, M.yucca);
  }
  plant(-0.3, 0.72, 26.9, 0.95, 0.75, 0.9, '#6d7f62'); plant(-0.9, 0.5, 27.6, 0.5, 0.45, 0.5, '#76886a');
  for (let i = 0; i < 10; i++) plant(-2.4 + (i % 2) * 0.7, 0.22, 25.6 + i * 0.45, 0.28, 0.22, 0.28, i % 3 ? '#a59c6a' : '#8f9a6c');
  const posts = [[-2.75, 25.3], [-2.75, 27.3], [-2.75, 29.2], [-1.15, 29.2], [-1.15, 25.3]];
  for (const [u, v] of posts) cyl(0.035, 0.035, 0.9, M.woodLight, u, 0.45, v, 8);
  cyl(0.06, 0.06, 0.12, M.darkMetal, -2.75, 0.96, 25.3, 8);
  for (let i = 0; i < posts.length - 1; i++) for (const y of [0.45, 0.78]) {
    const a = posts[i], b = posts[i + 1];
    pipe(V3(a[0], y, a[1]), V3(b[0], y - 0.06, b[1]), 0.012, M.rope);
  }
  for (let v = 25.0; v <= 28.6; v += 0.6) { beam(V3(2.95, 0, v), V3(3.2, 2.25, v), 0.03, 0.03, M.woodLight); beam(V3(3.45, 0, v), V3(3.2, 2.25, v), 0.03, 0.03, M.woodLight); }
  beam(V3(3.2, 2.15, 24.9), V3(3.2, 2.15, 28.7), 0.03, 0.03, M.woodLight);
  for (let i = 0; i < 12; i++) plant(3.2 + (r() - 0.5) * 0.5, 0.4 + r() * 1.6, 25 + r() * 3.6, 0.18, 0.25, 0.18, i % 2 ? '#7c8a45' : '#9a8b52');
  plant(3.35, 1.4, 25.4, 1.2, 1.2, 1.1, '#5f7f3d'); TRUNKS.push([3.35, 25.4, 0, 0.6, 0.06]);
  // Sandkasten mit Deckel, Trampolin
  box(1.8, 0.25, 2.3, M.woodLight, -0.25, 0.125, 33.5); box(1.84, 0.03, 2.34, M.green, -0.25, 0.265, 33.5);
  const tc = [-1.67, 38.1], tR = 1.38;
  const frame = new THREE.TorusGeometry(tR, 0.045, 8, 40); frame.rotateX(Math.PI / 2); frame.translate(tc[0], 0.58, tc[1]); addMesh(frame, M.blue);
  cyl(tR - 0.12, tR - 0.12, 0.01, M.rubberBlack, tc[0], 0.57, tc[1], 36);
  const netG = new THREE.CylinderGeometry(tR, tR, 1.75, 36, 1, true); netG.translate(tc[0], 0.58 + 0.875, tc[1]); addMesh(netG, M.net);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, x = tc[0] + Math.cos(a) * (tR + 0.04), z = tc[1] + Math.sin(a) * (tR + 0.04);
    cyl(0.025, 0.025, 2.45, i % 2 ? M.blue : M.whitePlastic, x, 1.22, z, 8);
    cyl(0.03, 0.03, 0.58, M.metal, tc[0] + Math.cos(a + 0.5) * tR, 0.29, tc[1] + Math.sin(a + 0.5) * tR, 8);
  }
  CIR.push([tc[0], tc[1], tR + 0.12]);
  // Fußballtor im Sand
  const g0 = [-8.0, 27.4], gw = 2.4, gh = 1.6, gd = 1.0;
  for (const du of [0, gw]) { pipe(V3(g0[0] + du, 0, g0[1]), V3(g0[0] + du, gh, g0[1]), 0.03, M.black); pipe(V3(g0[0] + du, gh, g0[1]), V3(g0[0] + du, 0, g0[1] + gd), 0.02, M.black); pipe(V3(g0[0] + du, 0.02, g0[1]), V3(g0[0] + du, 0.02, g0[1] + gd), 0.02, M.black); }
  pipe(V3(g0[0], gh, g0[1]), V3(g0[0] + gw, gh, g0[1]), 0.03, M.black);
  pipe(V3(g0[0], 0.02, g0[1] + gd), V3(g0[0] + gw, 0.02, g0[1] + gd), 0.02, M.black);
  quad(V3(g0[0], gh, g0[1]), V3(g0[0] + gw, gh, g0[1]), V3(g0[0] + gw, 0, g0[1] + gd), V3(g0[0], 0, g0[1] + gd), M.net, 2);
  for (const du of [0, gw]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([g0[0] + du, 0, g0[1], g0[0] + du, gh, g0[1], g0[0] + du, 0, g0[1] + gd], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1.6, 1, 0], 2)); g.computeVertexNormals(); addMesh(g, M.net); }
  rectAdd(g0[0] - 0.05, g0[1] - 0.05, g0[0] + gw + 0.05, g0[1] + gd, false);
  addMesh(new THREE.SphereGeometry(0.11, 16, 12), M.black, new THREE.Matrix4().setPosition(-3.95, 0.13, 25.6));
  addMesh(new THREE.SphereGeometry(0.12, 16, 12), M.terracotta, new THREE.Matrix4().setPosition(-5.9, 0.14, 23.1));
  // Kübel mit Oleander am Spielbereich
  for (const [u, v] of [[-8.7, 24.2], [-8.75, 25.2], [-8.15, 23.8]]) { cyl(0.28, 0.21, 0.5, M.terracotta, u, 0.25, v, 16); plant(u, 0.95, v, 0.42, 0.5, 0.42, '#3f6630'); CIR.push([u, v, 0.3]); }
  // Sträucher an der SW-Grenze, kleiner Feigenbaum, Hecke hinten
  for (const [v, s, col] of [[29.0, 0.9, '#51703a'], [30.9, 1.05, '#476836'], [32.6, 0.85, '#5a7a40'], [34.5, 1.0, '#4b6b37'], [36.4, 0.95, '#557540'], [38.3, 0.9, '#4a6a35']]) { plant(-8.6, s * 1.05, v, s, s * 1.15, s, col); CIR.push([-8.6, v, s * 0.7]); }
  for (const v of [31.8, 35.5]) CONIFERS.push([-8.75, v, 2.6, 0.55]);
  TRUNKS.push([-7.9, 29.9, 0, 1.3, 0.06]); plant(-7.9, 2.0, 29.9, 1.1, 0.8, 1.1, '#8a9a3c'); CIR.push([-7.9, 29.9, 0.15]);
  hedge(-9.1, 39.6, -2.4, 41.35, 2.8, '#4a6a33');
  hedge(0.2, 40.2, 2.2, 40.75, 1.2, '#587a3d');
  polyAdd([[-9.1, 39.6], [-2.4, 39.6], [-2.4, 41.35], [-9.1, 41.35]], false);

  // Zäune (Maschendraht, grün)
  fence([[3.62, 23.2], [2.29, 40.63]], 1.25); fence([[-9.2, 22.6], [-9.17, 41.6]], 1.25); fence([[-2.4, 40.95], [2.29, 40.63]], 1.1);
  segAdd([3.62, 23.2], [2.29, 40.63]); segAdd([-9.2, 15.3], [-9.17, 41.65]); segAdd([-2.4, 40.95], [2.29, 40.63]);

  // Wohnwagen in der Einfahrt
  const cu = -7.4, cv = 1.8, cL = 5.0, cW = 2.25;
  const body = new RoundedBoxGeometry(cW, 2.05, cL, 4, 0.22); body.translate(cu, 0.38 + 1.025, cv); addMesh(body, M.caravan);
  box(cW + 0.02, 0.07, cL - 0.3, M.caravanTrim, cu, 0.95, cv);
  box(cW + 0.02, 0.05, cL - 0.3, M.caravanTrim, cu, 2.12, cv);
  for (const side of [-1, 1]) {
    for (const [dz, w] of [[-1.5, 0.9], [0.4, 1.1], [1.8, 0.6]]) box(0.03, 0.55, w, M.tint, cu + side * (cW / 2 + 0.005), 1.72, cv + dz);
  }
  box(1.5, 0.6, 0.03, M.tint, cu, 1.75, cv - cL / 2 - 0.005);
  box(0.03, 1.75, 0.62, M.caravanTrim, cu + cW / 2 + 0.01, 1.3, cv + 1.0);
  box(0.8, 0.12, 0.8, M.caravan, cu, 2.48, cv + 0.6);
  for (const side of [-1, 1]) { const w = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 20); w.rotateZ(Math.PI / 2); w.translate(cu + side * (cW / 2 - 0.08), 0.33, cv + 0.4); addMesh(w, M.black); }
  beam(V3(cu - 0.6, 0.42, cv - cL / 2 + 0.2), V3(cu, 0.42, cv - cL / 2 - 1.1), 0.08, 0.1, M.darkMetal);
  beam(V3(cu + 0.6, 0.42, cv - cL / 2 + 0.2), V3(cu, 0.42, cv - cL / 2 - 1.1), 0.08, 0.1, M.darkMetal);
  box(0.9, 0.35, 0.45, M.caravanTrim, cu, 0.62, cv - cL / 2 - 0.35);
  rectAdd(cu - cW / 2, cv - cL / 2 - 1.1, cu + cW / 2, cv + cL / 2, false);

  // Hoftor (zweiflügelig, öffnet sich beim Näherkommen) und Pfeiler
  box(0.28, 2.05, 0.28, M.concrete, -9.06, 1.025, -5.36); rectAdd(-9.2, -5.5, -8.92, -5.22, false);
  const leaf = (len, dir) => {
    const grp = new THREE.Group();
    const add = (g, m) => { const me = new THREE.Mesh(g, m); me.castShadow = true; me.receiveShadow = true; grp.add(me); };
    const bx = (w, h, d, x, y, m) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, 0); add(g, m); };
    bx(len, 0.05, 0.05, dir * len / 2, 1.85, M.metal); bx(len, 0.05, 0.05, dir * len / 2, 0.1, M.metal);
    bx(0.05, 1.8, 0.05, dir * 0.03, 0.97, M.metal); bx(0.05, 1.8, 0.05, dir * (len - 0.03), 0.97, M.metal);
    const n = 2;
    for (let i = 0; i < n; i++) bx(len / n - 0.05, 1.68, 0.025, dir * (len / n) * (i + 0.5), 0.97, M.whitePlastic);
    return grp;
  };
  gateL = leaf(2.07, 1); gateL.position.set(-8.92, 0, -5.38); scene.add(gateL);
  gateR = leaf(2.07, -1); gateR.position.set(-4.78, 0, -5.38); scene.add(gateR);
}
function fence(pts, h) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(L / 2.5);
    for (let k = 0; k <= n; k++) { const t = k / n; cyl(0.025, 0.025, h, M.green, a[0] + (b[0] - a[0]) * t, h / 2, a[1] + (b[1] - a[1]) * t, 8); }
    const g = new THREE.PlaneGeometry(L, h - 0.05); const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(ang).setPosition((a[0] + b[0]) / 2, h / 2, (a[1] + b[1]) / 2));
    const uv = g.attributes.uv; for (let i2 = 0; i2 < uv.count; i2++) uv.setXY(i2, uv.getX(i2) * L / 0.5, uv.getY(i2) * h / 0.5);
    addMesh(g, M.mesh);
  }
}
function hedge(u0, v0, u1, v1, h, col) {
  let g = new THREE.BoxGeometry(u1 - u0, h, v1 - v0, Math.ceil((u1 - u0) * 3), Math.ceil(h * 3), Math.ceil((v1 - v0) * 3));
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const pos = g.attributes.position, c = new THREE.Color(col), cols = [], uvs = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise3(x * 1.6 + u0, y * 1.6, z * 1.6 + v0) - 0.5;
    const len = Math.hypot(x, y * 0.5, z) || 1;
    pos.setXYZ(i, x + (x / len) * n * 0.35, y + (y > 0 ? n * 0.25 : 0), z + (z / len) * n * 0.35);
    const shade = 0.7 + 0.3 * smooth(-h / 2, h / 2, y) + n * 0.25;
    cols.push(c.r * shade, c.g * shade, c.b * shade);
    uvs.push((x + z) * 0.7, y * 0.7);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  g.translate((u0 + u1) / 2, h / 2, (v0 + v1) / 2);
  addMesh(g, M.leaves);
}

// ================================================================== Straße und Umgebung (Luftbild)
function buildGround(data) {
  const O = data.ortho, U0 = O.u[0], U1 = O.u[1], VV0 = O.v[0], VV1 = O.v[1];
  const street = [[-54.76, -13.37], [-49.61, -5.37], [-9.22, -5.46], [4.24, -5.48], [17.74, -5.51], [53.31, -2.84], [56.36, 1.36], [59.93, -13.7], [55.21, -10.71], [35.31, -12.2], [18.02, -13.5], [-6.78, -13.46]];
  const hole = [[-49.61, -5.37], [-9.22, -5.46], ...data.parcel.slice(1, 5), [4.24, -5.48], [17.74, -5.51], [53.31, -2.84], [56.36, 1.36], [59.93, -13.7], [55.21, -10.71], [35.31, -12.2], [18.02, -13.5], [-6.78, -13.46], [-54.76, -13.37]];
  const sh = new THREE.Shape([V3(U0, -VV0, 0), V3(U1, -VV0, 0), V3(U1, -VV1, 0), V3(U0, -VV1, 0)].map((p) => new THREE.Vector2(p.x, p.y)));
  sh.holes.push(new THREE.Path(hole.map(([u, v]) => new THREE.Vector2(u, -v))));
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - U0) / (U1 - U0), 1 - (pos.getZ(i) - VV0) / (VV1 - VV0));
  const ortho = orthoTex;
  mat('ortho', { map: ortho, roughness: 1 }, false);
  addMesh(g, M.ortho);
  const far = new THREE.PlaneGeometry(3000, 3000); far.rotateX(-Math.PI / 2); far.translate(0, -0.3, 10);
  addMesh(far, M.field);
  flat(street, -0.12, M.asphalt);
  // Gehwege mit Bordstein
  const walks = [[-55, -7.1, 17.7, -5.47, -7.1, -1], [-55, -13.45, 17.7, -12.4, -12.4, 1]];
  for (const [u0, v0, u1, v1, vc, dir] of walks) {
    rect(u0, v0, u1, v1, 0, M.sidewalk);
    if (dir > 0) quad(V3(u0, -0.12, vc), V3(u1, -0.12, vc), V3(u1, 0, vc), V3(u0, 0, vc), M.curb);
    else quad(V3(u1, -0.12, vc), V3(u0, -0.12, vc), V3(u0, 0, vc), V3(u1, 0, vc), M.curb);
    rect(u0, vc - (dir < 0 ? 0 : 0.15), u1, vc + (dir < 0 ? 0.15 : 0), 0.004, M.curb);
  }
  // Rinne an der Bordsteinkante
  rect(-55, -7.4, 17.7, -7.1, -0.115, M.curb); rect(-55, -12.4, 17.7, -12.1, -0.115, M.curb);
}

// Nachbarhäuser aus LoD2 (Dachflächen mit dem Luftbild texturiert)
function buildNeighbors(data) {
  const O = data.ortho, U0 = O.u[0], U1 = O.u[1], VV0 = O.v[0], VV1 = O.v[1];
  const walls = { pos: [], nrm: [], uv: [], col: [] }, roofs = { pos: [], nrm: [], uv: [] }, special = { pos: [], nrm: [], uv: [] };
  const palette = ['#f3f2ee', '#ece7da', '#e9e2cd', '#efe6d0', '#e3e1db', '#f1ede4', '#e6dfd0', '#dfe0dc', '#f0e8d6'];
  const rr = rng(2024);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const tri = (flatc, kind, color) => {
    const pts = [];
    for (let i = 0; i < flatc.length; i += 3) pts.push(V3(flatc[i] / 100, flatc[i + 1] / 100, flatc[i + 2] / 100));
    if (pts.length < 3) return;
    const n = V3(0, 0, 0);
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
    if (n.lengthSq() < 1e-8) return;
    n.normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const p2 = pts.map((p) => (ay >= ax && ay >= az ? new THREE.Vector2(p.x, p.z) : ax >= az ? new THREE.Vector2(p.z, p.y) : new THREE.Vector2(p.x, p.y)));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(p2, []); } catch (e) { return; }
    let target = walls;
    if (kind === 'w') {
      const us = pts.map((p) => p.x), vs = pts.map((p) => p.z);
      if (n.x > 0.9 && Math.max(...us) < -9.05 && Math.min(...us) > -9.4 && Math.min(...vs) > -5.7 && Math.max(...vs) < 5.8) target = special;
      for (const p of pts) if (p.y < 0.6) p.y = -0.3;
    } else target = roofs;
    const t = new THREE.Vector3().crossVectors(UP, n); if (t.lengthSq() < 1e-6) t.set(1, 0, 0); t.normalize();
    for (const f of faces) {
      let [a, b, c] = f;
      tmpA.subVectors(pts[b], pts[a]); tmpB.subVectors(pts[c], pts[a]);
      if (tmpA.cross(tmpB).dot(n) < 0) [b, c] = [c, b];
      for (const k of [a, b, c]) {
        const p = pts[k];
        target.pos.push(p.x, p.y, p.z); target.nrm.push(n.x, n.y, n.z);
        if (target === roofs) target.uv.push((p.x - U0) / (U1 - U0), 1 - (p.z - VV0) / (VV1 - VV0));
        else target.uv.push(p.x * t.x + p.z * t.z, p.y);
        if (target === walls) walls.col.push(color.r, color.g, color.b);
      }
    }
  };
  for (const b of data.buildings) {
    const color = new THREE.Color(palette[(rr() * palette.length) | 0]);
    for (const w of b.w) tri(w, 'w', color);
    for (const r of b.r) tri(r, 'r', color);
    for (const g of b.g) {
      const pts = []; for (let i = 0; i < g.length; i += 3) pts.push([g[i] / 100, g[i + 2] / 100]);
      if (pts.length >= 3) polyAdd(pts);
    }
  }
  const mk = (o, m, withColor) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    addMesh(g, m);
  };
  mat('roofOrtho', { map: orthoTex, roughness: 0.85, side: THREE.DoubleSide });
  mk(walls, M.wallNeighbor, true); mk(roofs, M.roofOrtho, false); if (special.pos.length) mk(special, M.shingleWall, false);
}

// Bäume der Umgebung (aus dem Oberflächenmodell) und alle Pflanzen als Instanzen
function buildTrees(data) {
  let big = null, bd = 1e9;
  for (const [u, v, h] of data.trees) { const d = Math.hypot(u - 5, v - 36); if (h > 9 && d < bd) { bd = d; big = [u, v]; } }
  for (const [u, v, h, r0, c] of data.trees) {
    const r = clamp(r0, 1.3, 5.2);
    if (big && u === big[0] && v === big[1]) { CONIFERS.push([u, v, h, Math.min(r, 4.2)]); continue; }
    const ry = Math.min(r * 0.85, h * 0.42), cy = h - ry;
    const col = new THREE.Color(`rgb(${c[0]},${c[1]},${c[2]})`); const base = new THREE.Color('#58763d');
    col.lerp(base, 0.55).multiplyScalar(1.05);
    PLANTS.push([u, cy, v, r, ry, r * 0.95, col]);
    TRUNKS.push([u, v, 0, cy - ry * 0.4, clamp(0.08 + h * 0.012, 0.1, 0.3)]);
    if (h > 4) CIR.push([u, v, 0.3]);
  }
  // Blob-Geometrie für Kronen
  let blob = new THREE.IcosahedronGeometry(1, 3); blob.deleteAttribute('uv'); blob = mergeVertices(blob);
  const bp = blob.attributes.position, bc = [];
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const n = noise3(x * 2.2 + 3, y * 2.2, z * 2.2) * 0.34 + noise3(x * 5 + 7, y * 5, z * 5) * 0.12;
    const s = 0.82 + n;
    bp.setXYZ(i, x * s, y * s, z * s);
    const sh = 0.62 + 0.38 * smooth(-1, 0.9, y); bc.push(sh, sh, sh);
  }
  blob.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  const buv = []; for (let i = 0; i < bp.count; i++) buv.push(Math.atan2(bp.getZ(i), bp.getX(i)) * 1.2, bp.getY(i) * 1.5);
  blob.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
  blob.computeVertexNormals();
  const canopyMat = new THREE.MeshStandardMaterial({ map: T.leaves, vertexColors: true, roughness: 0.82 });
  const im = new THREE.InstancedMesh(blob, canopyMat, PLANTS.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  PLANTS.forEach((p, i) => {
    q.setFromAxisAngle(UP, (i * 2.399) % (Math.PI * 2));
    m4.compose(V3(p[0], p[1], p[2]), q, V3(p[3], p[4], p[5])); im.setMatrixAt(i, m4); im.setColorAt(i, p[6]);
  });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
  for (const [x, z, h] of CONIFERS) { if (h > 5) TRUNKS.push([x, z, 0, h * 0.2, 0.2]); CIR.push([x, z, 0.3]); }
  // Stämme
  const tg = new THREE.CylinderGeometry(0.75, 1, 1, 8); tg.translate(0, 0.5, 0);
  const tm = new THREE.InstancedMesh(tg, M.trunk, TRUNKS.length);
  TRUNKS.forEach(([x, z, y0, y1, r], i) => { m4.compose(V3(x, y0, z), q.identity(), V3(r, Math.max(0.1, y1 - y0), r)); tm.setMatrixAt(i, m4); });
  tm.castShadow = true; scene.add(tm);
  // Nadelbäume
  const cg = new THREE.ConeGeometry(1, 1, 12, 6); cg.translate(0, 0.5, 0);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i); const n = 1 + (noise3(x * 4, y * 9, z * 4) - 0.5) * 0.35 * (1 - y); cp.setXYZ(i, x * n, y, z * n); }
  cg.computeVertexNormals();
  const coneMat = new THREE.MeshStandardMaterial({ map: T.leaves, color: '#3f5c36', roughness: 0.85 });
  const cm = new THREE.InstancedMesh(cg, coneMat, CONIFERS.length * 3);
  let k = 0;
  for (const [x, z, h, r] of CONIFERS) {
    for (let j = 0; j < 3; j++) {
      const y0 = h * (0.12 + j * 0.25), hh = h * (0.55 - j * 0.1), rr = r * (1 - j * 0.24);
      m4.compose(V3(x, y0, z), q.setFromAxisAngle(UP, j * 1.3), V3(rr, hh, rr)); cm.setMatrixAt(k++, m4);
    }
  }
  cm.castShadow = true; cm.receiveShadow = true; scene.add(cm);
}

// Statische Geometrie nach Material zusammenfassen (wenige Draw-Calls, auch auf dem iPhone flüssig)
function mergeStatic() {
  S.updateMatrixWorld(true);
  const buckets = new Map();
  for (const m of [...S.children]) {
    if (!m.isMesh) continue;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const key = m.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: m.material, list: [] });
    buckets.get(key).list.push(g);
    m.geometry.dispose();
  }
  S.clear();
  for (const { mat: mm, list } of buckets.values()) {
    const needColor = !!mm.vertexColors;
    for (const g of list) {
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (needColor && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (!needColor && g.attributes.color) g.deleteAttribute('color');
    }
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mm);
    mesh.castShadow = mm.userData.cast !== false;
    mesh.receiveShadow = true;
    S.add(mesh);
  }
}

// ================================================================== Himmel und Sonne
const sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
const envSky = new Sky(); envSky.scale.setScalar(1000);
const envScene = new THREE.Scene(); envScene.add(envSky);
for (const s of [sky, envSky]) { const u = s.material.uniforms; u.turbidity.value = 5.5; u.rayleigh.value = 1.25; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; }
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
const sun = new THREE.DirectionalLight('#fff4e5', 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 280 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
const sunTarget = new THREE.Object3D(); sunTarget.position.set(-2, 0, 14); scene.add(sunTarget); sun.target = sunTarget;
scene.add(sun);
const hemi = new THREE.HemisphereLight('#bcd3ee', '#8a7f68', 0.5); scene.add(hemi);
scene.fog = new THREE.Fog('#cfdbe8', 110, 520);

const LAT = 49.2315, LON = 8.5172;
function sunPos(date) {
  const rad = Math.PI / 180, d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + LON) * rad - ra, phi = LAT * rad;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { alt, az };
}
let envTimer = 0;
function setTime(minutes) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(minutes / 60), minutes % 60);
  const { alt, az } = sunPos(d);
  const e = Math.sin(az) * Math.cos(alt), n = Math.cos(az) * Math.cos(alt), up = Math.sin(alt);
  const dir = V3(0.83787 * e + 0.54591 * n, up, 0.54591 * e - 0.83787 * n).normalize();
  for (const s of [sky, envSky]) s.material.uniforms.sunPosition.value.copy(dir);
  const day = smooth(-0.04, 0.2, up), low = 1 - smooth(0.05, 0.45, up);
  sun.position.copy(sunTarget.position).addScaledVector(dir, 140);
  sun.intensity = 3.1 * day;
  sun.color.set('#fff5e8').lerp(new THREE.Color('#ffc58a'), low * 0.8);
  hemi.intensity = 0.12 + 0.45 * day;
  scene.environmentIntensity = 0.15 + 0.6 * day;
  const fog = new THREE.Color('#cfdbe8').lerp(new THREE.Color('#e3c3a1'), low * 0.6 * day).lerp(new THREE.Color('#1c2331'), 1 - smooth(-0.1, 0.05, up));
  scene.fog.color.copy(fog);
  renderer.toneMappingExposure = 0.8 + 0.25 * (1 - day);
  const night = 1 - smooth(-0.06, 0.06, up);
  M.glass.emissiveIntensity = night * 0.55; M.glassBlind.emissiveIntensity = night * 0.7;
  M.bulb.emissiveIntensity = 0.4 + night * 2.2;
  clearTimeout(envTimer);
  envTimer = setTimeout(() => { const old = envRT; envRT = pmrem.fromScene(envScene, 0, 0.1, 2000); scene.environment = envRT.texture; if (old) old.dispose(); }, 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0'), mm = String(minutes % 60).padStart(2, '0');
  $('#timeOut').textContent = `${hh}:${mm}`;
}

// ================================================================== Steuerung
const player = { x: -0.8, z: -13.2, yaw: 0, pitch: 0.12, eye: 1.65, eyeTarget: 1.65 };
const R = 0.28;
let mode = 'walk';
const keys = new Set();
const orbit = new OrbitControls(camera, canvas);
orbit.enabled = false; orbit.enableDamping = true; orbit.dampingFactor = 0.08;
orbit.minDistance = 8; orbit.maxDistance = 170; orbit.maxPolarAngle = 1.45;
orbit.target.set(-1.5, 1.5, 15);

function collide(p) {
  for (let it = 0; it < 3; it++) {
    for (const s of SEG) {
      if (p.x < s.minx - R || p.x > s.maxx + R || p.z < s.minz - R || p.z > s.maxz + R) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / L2, 0, 1);
      const ex = p.x - (s.ax + t * dx), ez = p.z - (s.az + t * dz), d2 = ex * ex + ez * ez;
      if (d2 < R * R) { const d = Math.sqrt(d2) || 1e-4; p.x += (ex / d) * (R - d); p.z += (ez / d) * (R - d); }
    }
    for (const [cx, cz, cr] of CIR) {
      const ex = p.x - cx, ez = p.z - cz, rr = cr + R, d2 = ex * ex + ez * ez;
      if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1e-4; p.x += (ex / d) * (rr - d); p.z += (ez / d) * (rr - d); }
    }
    if (gateAngle < 0.35 && p.z > -5.8 && p.z < -4.95 && p.x > -9.0 && p.x < -4.7) p.z = p.z < -5.38 ? Math.min(p.z, -5.38 - R) : Math.max(p.z, -5.38 + R);
  }
  p.x = clamp(p.x, -97, 97); p.z = clamp(p.z, -87, 107);
}
function blocked(x, z) { return FOOT.some((f) => pointInPoly(x, z, f)); }

const VIEWS = {
  strasse: { x: -0.8, z: -13.2, look: [-0.2, 4.2, -5.5] },
  einfahrt: { x: -6.9, z: -8.4, look: [-6.9, 1.6, 6] },
  hof: { x: -1.95, z: 17.1, look: [-2.5, 2.4, 3.6] },
  terrasse: { x: -3.2, z: 13.2, look: [0.4, 1.2, 22.5] },
  garten: { x: -3.9, z: 21.3, look: [-2.2, 1.0, 40] },
};
let tween = null;
function setView(name, instant = false) {
  document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.view === name)));
  if (name === 'oben') {
    mode = 'orbit'; orbit.enabled = true;
    camera.position.set(-26, 34, -20); orbit.target.set(-1.5, 1.5, 15); orbit.update();
    return;
  }
  const v = VIEWS[name];
  const dx = v.look[0] - v.x, dz = v.look[2] - v.z;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(v.look[1] - player.eyeTarget, Math.hypot(dx, dz));
  if (mode === 'orbit') { mode = 'walk'; orbit.enabled = false; Object.assign(player, { x: v.x, z: v.z, yaw, pitch }); return; }
  let dyaw = yaw - player.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  tween = { t: 0, from: { x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch }, to: { x: v.x, z: v.z, yaw: player.yaw + dyaw, pitch } };
  if (instant) { Object.assign(player, tween.to); tween = null; }
}

// Zeiger: links Joystick (Touch), sonst Umschauen
const stickEl = $('#stick'), knob = stickEl.querySelector('i');
let stickId = null, lookId = null, stickO = { x: 0, y: 0 }, stick = { x: 0, y: 0 }, lastLook = { x: 0, y: 0 };
let moved = false;
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'walk') return;
  canvas.focus({ preventScroll: true });
  if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.45 && stickId === null) {
    stickId = e.pointerId; stickO = { x: e.clientX, y: e.clientY }; stick = { x: 0, y: 0 };
    stickEl.style.left = `${e.clientX}px`; stickEl.style.top = `${e.clientY}px`; knob.style.transform = ''; stickEl.hidden = false;
  } else if (lookId === null) { lookId = e.pointerId; lastLook = { x: e.clientX, y: e.clientY }; }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignorieren */ }
  tween = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'walk') return;
  if (e.pointerId === stickId) {
    let dx = e.clientX - stickO.x, dy = e.clientY - stickO.y; const L = Math.hypot(dx, dy), max = 52;
    if (L > max) { dx *= max / L; dy *= max / L; }
    stick = { x: dx / max, y: dy / max }; knob.style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === lookId) {
    const k = e.pointerType === 'mouse' ? 0.0032 : 0.0048;
    player.yaw -= (e.clientX - lastLook.x) * k; player.pitch = clamp(player.pitch - (e.clientY - lastLook.y) * k, -1.3, 1.3);
    lastLook = { x: e.clientX, y: e.clientY }; hideHint();
  }
});
const endPtr = (e) => {
  if (e.pointerId === stickId) { stickId = null; stick = { x: 0, y: 0 }; stickEl.hidden = true; }
  if (e.pointerId === lookId) lookId = null;
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) { keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// ================================================================== Lageplan
const mm = $('#minimap'), mg = mm.getContext('2d');
const MAP = { u0: -15.5, v0: -16, s: 432 / 62 };
let mapBase = null;
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawMapBase(data) {
  const c = cnv(mm.width, mm.height), g = c.getContext('2d');
  const P = (u, v) => [(u - MAP.u0) * MAP.s, (v - MAP.v0) * MAP.s];
  const poly = (pts, fill, stroke) => { g.beginPath(); pts.forEach(([u, v], i) => { const [x, y] = P(u, v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); } };
  g.fillStyle = css('--panel-solid') || '#fbfaf7'; g.fillRect(0, 0, c.width, c.height);
  poly([[-60, -13.45], [60, -13.45], [60, -5.47], [-60, -5.47]], 'rgba(120,120,120,0.35)');
  poly(data.parcel, 'rgba(120,150,80,0.22)', css('--ink') || '#2a2522');
  for (const f of FOOT_NEIGHBOR) poly(f, 'rgba(120,112,104,0.45)');
  const tile = css('--tile') || '#a3462c';
  for (const f of OUR_FOOT) poly(f, tile);
  g.fillStyle = 'rgba(70,110,50,0.5)';
  for (const p of PLANTS) { if (p[3] < 0.9) continue; const [x, y] = P(p[0], p[2]); g.beginPath(); g.arc(x, y, p[3] * MAP.s * 0.9, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = css('--muted') || '#6c645d'; g.font = '600 15px -apple-system, system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('Straße', P(-1, -9.9)[0], P(-1, -9.9)[1] + 5);
  mapBase = c;
}
const FOOT_NEIGHBOR = [], OUR_FOOT = [[[HU0, HV0], [HU1, HV0], [HU1, HV1], [HU0, HV1]], [[0.654, 3.65], [4.27, 3.65], [4.27, 7.48], [0.654, 7.48]], [[-0.33, 7.054], [4.18, 7.054], [4.18, 15.77], [-0.33, 15.77]], [[-9.18, 10.24], [-5.04, 10.24], [-5.04, 19.4], [-9.18, 19.4]]];
function drawMap() {
  if (!mapBase) return;
  mg.drawImage(mapBase, 0, 0);
  if (mode !== 'walk') return;
  const x = (player.x - MAP.u0) * MAP.s, y = (player.z - MAP.v0) * MAP.s;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), a = Math.atan2(fz, fx);
  mg.fillStyle = 'rgba(163,70,44,0.28)';
  mg.beginPath(); mg.moveTo(x, y); mg.arc(x, y, 46, a - 0.55, a + 0.55); mg.closePath(); mg.fill();
  mg.fillStyle = '#a3462c'; mg.strokeStyle = '#fff'; mg.lineWidth = 3;
  mg.beginPath(); mg.arc(x, y, 7, 0, Math.PI * 2); mg.fill(); mg.stroke();
}
mm.addEventListener('pointerdown', (e) => {
  const rct = mm.getBoundingClientRect();
  const u = MAP.u0 + ((e.clientX - rct.left) / rct.width) * mm.width / MAP.s;
  const v = MAP.v0 + ((e.clientY - rct.top) / rct.height) * mm.height / MAP.s;
  if (blocked(u, v)) return;
  if (mode === 'orbit') { mode = 'walk'; orbit.enabled = false; }
  document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  tween = null; player.x = u; player.z = v; collide(player); hideHint();
});

// ================================================================== Oberfläche
let hintTimer = 0;
const hint = $('#hint');
const coarse = window.matchMedia('(pointer: coarse)').matches;
hint.textContent = coarse ? 'Links ziehen: gehen · rechts wischen: umschauen' : 'W A S D oder Pfeiltasten: gehen · Maus ziehen: umschauen';
function hideHint() { if (!hint.classList.contains('off')) { clearTimeout(hintTimer); hintTimer = setTimeout(() => hint.classList.add('off'), 1500); } }
document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { setView(c.dataset.view); hideHint(); }));
const timeIn = $('#time');
timeIn.addEventListener('input', () => setTime(+timeIn.value));
$('#kidBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on)); player.eyeTarget = on ? 1.1 : 1.65;
});
const info = $('#info');
const openInfo = () => { info.hidden = false; $('#infoClose').focus(); };
$('#infoBtn').addEventListener('click', openInfo); $('#helpBtn').addEventListener('click', openInfo);
$('#infoClose').addEventListener('click', () => { info.hidden = true; });
info.addEventListener('click', (e) => { if (e.target === info) info.hidden = true; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') info.hidden = true; });
const pk = $('#plankopf'), pkBtn = $('#pkToggle');
const setPk = (open) => { pk.classList.toggle('collapsed', !open); pkBtn.setAttribute('aria-expanded', String(open)); };
pkBtn.addEventListener('click', () => setPk(pk.classList.contains('collapsed')));
if (window.innerWidth < 700) setPk(false);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ================================================================== Laden und Starten
let orthoTex;
const clock = new THREE.Clock();
async function start() {
  progress(0.1);
  const [data, img] = await Promise.all([
    fetch('data/umgebung.json').then((r) => { if (!r.ok) throw new Error('Umgebungsdaten fehlen'); return r.json(); }),
    new THREE.TextureLoader().loadAsync('data/luftbild.jpg'),
  ]);
  orthoTex = img; orthoTex.colorSpace = THREE.SRGBColorSpace; orthoTex.anisotropy = ANISO;
  progress(0.45, 'Baue Haus, Hof und Garten …');
  await new Promise((r) => setTimeout(r, 30));
  buildGround(data);
  buildHouse();
  const n0 = FOOT.length;
  buildYard(data.parcel);
  buildNeighbors(data);
  for (let i = n0; i < FOOT.length; i++) FOOT_NEIGHBOR.push(FOOT[i]);
  buildTrees(data);
  progress(0.8, 'Fasse Geometrie zusammen …');
  await new Promise((r) => setTimeout(r, 30));
  mergeStatic();
  drawMapBase(data);
  const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  const t0 = mins >= 450 && mins <= 1170 ? Math.round(mins / 5) * 5 : 960;
  timeIn.value = String(t0); setTime(t0);
  resize();
  const hash = location.hash.replace('#', '');
  setView(VIEWS[hash] || hash === 'oben' ? hash : 'strasse');
  if (!VIEWS[hash] && hash !== 'oben') { player.x = VIEWS.strasse.x; player.z = VIEWS.strasse.z; }
  if (tween) { Object.assign(player, tween.to); tween = null; }
  progress(1);
  $('#loading').hidden = true;
  renderer.setAnimationLoop(loop);
}
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'walk') {
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 0.9);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - Math.pow(-2 * tween.t + 2, 2) / 2;
      for (const k of ['x', 'z', 'yaw', 'pitch']) player[k] = tween.from[k] + (tween.to[k] - tween.from[k]) * e;
      if (tween.t >= 1) tween = null;
    } else {
      let f = 0, s = 0, turn = 0;
      if (keys.has('w') || keys.has('arrowup')) f += 1;
      if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      if (keys.has('d')) s += 1;
      if (keys.has('a')) s -= 1;
      if (keys.has('arrowleft') || keys.has('q')) turn += 1;
      if (keys.has('arrowright') || keys.has('e')) turn -= 1;
      player.yaw += turn * 1.7 * dt;
      let speed = keys.has('shift') ? 3.6 : 1.6;
      if (stickId !== null) { f = -stick.y; s = stick.x; speed = 2.4 * Math.min(1, Math.hypot(f, s)); const L = Math.hypot(f, s) || 1; f /= L; s /= L; }
      if (f || s) {
        fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
        const L = Math.hypot(f, s) || 1;
        player.x += (fwd.x * f + right.x * s) / L * speed * dt; player.z += (fwd.z * f + right.z * s) / L * speed * dt;
        collide(player); if (!moved) { moved = true; hideHint(); }
      }
    }
    player.eye += (player.eyeTarget - player.eye) * Math.min(1, dt * 5);
    camera.position.set(player.x, player.eye, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  } else {
    orbit.update();
  }
  // Tor öffnet sich, wenn man sich nähert
  const near = mode === 'walk' && Math.abs(player.x + 6.85) < 3.2 && Math.abs(player.z + 5.4) < 3.6;
  gateAngle += ((near ? 1.35 : 0) - gateAngle) * Math.min(1, dt * 2.2);
  gateL.rotation.y = -gateAngle; gateR.rotation.y = gateAngle;
  drawMap();
  renderer.render(scene, camera);
}
window.hausAPI = { setView, setTime, player };
start().catch((err) => {
  console.error(err);
  loadMsg.textContent = `Das Modell konnte nicht geladen werden: ${err.message}. Bitte die Seite neu laden.`;
});
