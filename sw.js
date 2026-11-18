// Offline support: cache the app shell, serve it cache-first, refresh in background.
const CACHE = 'swipe-itinerary-v11';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'cloud.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Also keep the Firebase code library (versioned, never changes) so the app starts offline
  const firebaseSdk = url.href.startsWith('https://www.gstatic.com/firebasejs/');
  if (e.request.method !== 'GET' || (url.origin !== location.origin && !firebaseSdk)) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
