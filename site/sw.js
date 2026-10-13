/* v1.5 offline app shell and piano samples. Increment cache version for releases. */
const CACHE_NAME = 'interval-trainer-pwa-v1.5.0';
const ROOT = self.registration.scope;
const FILES = [
  './', './index.html', './styles.css', './logic.js', './assets/piano-samples.js',
  './review.js', './statistics.js', './storage.js', './app.js', './pwa-register.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './UPSTREAM_AUDIO_COPYRIGHT.txt', './LICENSE_AUDIO_GPL2.txt'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES.map(file => new URL(file, ROOT)))));
  // Do not force activation over an open practice session.
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
  if (url.origin !== new URL(ROOT).origin || !url.pathname.startsWith(new URL(ROOT).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      // Cache only files within our own static directory, never unrelated endpoints.
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
