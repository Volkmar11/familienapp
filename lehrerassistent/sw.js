/* Service Worker: macht den LehrerAssistenten offlinefaehig. */
const CACHE = 'lehrerassistent-v1';
const DATEIEN = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/state.js', './js/ui.js', './js/views.js', './js/werkzeuge.js',
  './js/router.js', './js/ki.js', './js/dsgvo.js', './js/vault.js', './js/sprache.js',
  './icons/icon-256.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((namen) =>
    Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((t) => t || caches.match('./index.html')))
  );
});
