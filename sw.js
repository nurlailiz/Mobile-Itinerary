// Offline support: cache the app shell, serve it cache-first, refresh in background.
// Bump the version number whenever app files change; "⋯ → Update app" fetches the newest one.
const CACHE = 'swipe-itinerary-v1.3'; // same number as APP_VERSION in app.js
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'cloud.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache so a new version gets fresh files
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Also keep the Firebase code library (versioned, never changes) so the app starts offline
  const firebaseSdk = url.href.startsWith('https://www.gstatic.com/firebasejs/');
  if (e.request.method !== 'GET' || (url.origin !== location.origin && !firebaseSdk)) return;
  // App files: always ask the website whether they changed (cheap check), never trust a stale HTTP cache
  const fresh = firebaseSdk ? e.request : new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' });
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(fresh).then((res) => {
        if (res.ok) {
          const copy = res.clone(); // must copy before the page starts reading the response
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
