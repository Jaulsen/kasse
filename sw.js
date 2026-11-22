/* Service Worker: hält die App-Dateien für den Offline-Betrieb bereit.
   Mit Netz wird immer zuerst die aktuelle Version geholt, ohne Netz die gespeicherte. */
const CACHE = 'kasse-v1.1';
const DATEIEN = ['./', 'index.html', 'app.js', 'config.js', 'demo-daten.js', 'manifest.webmanifest', 'logo.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const eigen = url.origin === self.location.origin;
  const schrift = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!eigen && !schrift) return;                 // Google-Schnittstelle nie zwischenspeichern
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const netz = await Promise.race([fetch(req), new Promise((_, nein) => setTimeout(() => nein(new Error('timeout')), 4000))]);
      if (netz && netz.ok) cache.put(req, netz.clone());
      return netz;
    } catch (err) {
      const alt = await cache.match(req, { ignoreSearch: eigen });
      if (alt) return alt;
      if (req.mode === 'navigate') return cache.match('index.html');
      throw err;
    }
  })());
});
