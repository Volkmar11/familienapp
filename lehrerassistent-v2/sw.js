/* Service Worker – macht die App offlinefähig. */
const CACHE = 'lehrerassistent2-v2';
const DATEIEN = [
  './', './index.html', './app.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/ui.js', './js/icons.js', './js/ki.js', './js/dsgvo.js',
  './js/generieren.js', './js/tresor.js', './js/sprache.js',
  './js/screens-start.js', './js/screens-klassen.js', './js/screens-material.js',
  './js/screens-werkzeuge.js', './js/screens-profil.js', './js/screens-einrichten.js',
  './fonts/fraunces-latin.woff2', './fonts/fraunces-latin-ext.woff2',
  './fonts/manrope-latin.woff2', './fonts/manrope-latin-ext.woff2',
  './icons/icon-256.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/schullogo.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((n) => Promise.all(n.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const kopie = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, kopie)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((t) => t || caches.match('./index.html')))
  );
});
