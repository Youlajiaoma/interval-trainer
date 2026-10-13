/* v1.8 offline app shell, melodic timbres and user-confirmed PWA updates. */
const CACHE_NAME = 'interval-trainer-pwa-v1.8.0';
const ROOT = self.registration.scope;
const FILES = [
  './', './index.html', './styles.css', './logic.js', './assets/piano-samples.js',
  './assets/melody-samples.js',
  './review.js', './statistics.js', './storage.js', './app.js', './pwa-register.js',
  './update.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './UPSTREAM_AUDIO_COPYRIGHT.txt', './LICENSE_AUDIO_GPL2.txt'
];
const ROOT_PATH = new URL(ROOT).pathname;
const NETWORK_FIRST = new Set(['pwa-register.js', 'update.html']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(FILES.map(file => new URL(file, ROOT)))));
  // Wait for user confirmation rather than interrupting an active practice session.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('interval-trainer-pwa-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== new URL(ROOT).origin || !url.pathname.startsWith(ROOT_PATH)) return;
  const relative = url.pathname.slice(ROOT_PATH.length);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (NETWORK_FIRST.has(relative)) {
      // Keep updater and recovery page fresh even under an already-installed SW.
      try {
        const response = await fetch(request, {cache: 'no-store'});
        if (response.ok && response.type === 'basic') await cache.put(new URL(relative, ROOT), response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(new URL(relative, ROOT));
        if (cached) return cached;
        throw error;
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('./index.html', ROOT));
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
