/* Rompemeteoros — service worker (iPhone / app web instalada)
 * Siempre intenta traer la versión más nueva del juego (actualización instantánea).
 * Sin internet, usa la última versión guardada. */
const CACHE = 'rompemeteoros-v1';
const CORE = ['./', './index.html', './game/index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // tipografías, etc.: red normal
  if (url.pathname.endsWith('.apk')) return;                  // el APK no se guarda
  // primero la red (versión nueva al instante); si no hay conexión, lo guardado
  e.respondWith(
    fetch(req, { cache: 'no-store' }).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./game/index.html')))
  );
});
