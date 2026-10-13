/* v1.9 offline app shell, user-provided melodic recordings and user-confirmed PWA updates. */
const CACHE_NAME = 'interval-trainer-pwa-v1.9.0';
const ROOT = self.registration.scope;
const FILES = [
  './', './index.html', './styles.css', './logic.js', './assets/piano-samples.js',
  './assets/melodic-recordings.js',
  './review.js', './statistics.js', './storage.js', './app.js', './pwa-register.js',
  './update.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './UPSTREAM_AUDIO_COPYRIGHT.txt', './LICENSE_AUDIO_GPL2.txt',
"assets/melodic-recordings/min2_up_guitar.m4a",
  "assets/melodic-recordings/min2_up_piano.m4a",
  "assets/melodic-recordings/min2_up_sax.m4a",
  "assets/melodic-recordings/min2_up_flute.m4a",
  "assets/melodic-recordings/min2_down_guitar.m4a",
  "assets/melodic-recordings/min2_down_sax.m4a",
  "assets/melodic-recordings/min2_down_piano.m4a",
  "assets/melodic-recordings/min2_down_flute.m4a",
  "assets/melodic-recordings/maj2_up_piano.m4a",
  "assets/melodic-recordings/maj2_up_sax.m4a",
  "assets/melodic-recordings/maj2_up_guitar.m4a",
  "assets/melodic-recordings/maj2_up_flute.m4a",
  "assets/melodic-recordings/maj2_down_piano.m4a",
  "assets/melodic-recordings/maj2_down_guitar.m4a",
  "assets/melodic-recordings/maj2_down_sax.m4a",
  "assets/melodic-recordings/maj2_down_flute.m4a",
  "assets/melodic-recordings/min3_up_sax.m4a",
  "assets/melodic-recordings/min3_up_piano.m4a",
  "assets/melodic-recordings/min3_up_guitar.m4a",
  "assets/melodic-recordings/min3_up_flute.m4a",
  "assets/melodic-recordings/min3_down_guitar.m4a",
  "assets/melodic-recordings/min3_down_flute.m4a",
  "assets/melodic-recordings/min3_down_piano.m4a",
  "assets/melodic-recordings/min3_down_sax.m4a",
  "assets/melodic-recordings/maj3_up_sax.m4a",
  "assets/melodic-recordings/maj3_up_guitar.m4a",
  "assets/melodic-recordings/maj3_up_flute.m4a",
  "assets/melodic-recordings/maj3_up_piano.m4a",
  "assets/melodic-recordings/maj3_down_flute.m4a",
  "assets/melodic-recordings/maj3_down_sax.m4a",
  "assets/melodic-recordings/maj3_down_piano.m4a",
  "assets/melodic-recordings/maj3_down_guitar.m4a",
  "assets/melodic-recordings/per4_up_piano.m4a",
  "assets/melodic-recordings/per4_up_guitar.m4a",
  "assets/melodic-recordings/per4_up_sax.m4a",
  "assets/melodic-recordings/per4_up_flute.m4a",
  "assets/melodic-recordings/per4_down_sax.m4a",
  "assets/melodic-recordings/per4_down_guitar.m4a",
  "assets/melodic-recordings/per4_down_piano.m4a",
  "assets/melodic-recordings/per4_down_flute.m4a",
  "assets/melodic-recordings/tritone4_up_flute.m4a",
  "assets/melodic-recordings/tritone4_up_guitar.m4a",
  "assets/melodic-recordings/tritone4_up_sax.m4a",
  "assets/melodic-recordings/tritone4_up_piano.m4a",
  "assets/melodic-recordings/tritone5_down_guitar.m4a",
  "assets/melodic-recordings/tritone5_down_piano.m4a",
  "assets/melodic-recordings/tritone5_down_sax.m4a",
  "assets/melodic-recordings/tritone5_down_flute.m4a",
  "assets/melodic-recordings/per5_up_guitar.m4a",
  "assets/melodic-recordings/per5_up_piano.m4a",
  "assets/melodic-recordings/per5_up_sax.m4a",
  "assets/melodic-recordings/per5_up_flute.m4a",
  "assets/melodic-recordings/per5_down_sax.m4a",
  "assets/melodic-recordings/per5_down_guitar.m4a",
  "assets/melodic-recordings/per5_down_piano.m4a",
  "assets/melodic-recordings/per5_down_flute.m4a",
  "assets/melodic-recordings/min6_up_guitar.m4a",
  "assets/melodic-recordings/min6_up_sax.m4a",
  "assets/melodic-recordings/min6_up_piano.m4a",
  "assets/melodic-recordings/min6_up_flute.m4a",
  "assets/melodic-recordings/min6_down_sax.m4a",
  "assets/melodic-recordings/min6_down_piano.m4a",
  "assets/melodic-recordings/min6_down_flute.m4a",
  "assets/melodic-recordings/min6_down_guitar.m4a",
  "assets/melodic-recordings/maj6_up_guitar.m4a",
  "assets/melodic-recordings/maj6_up_piano.m4a",
  "assets/melodic-recordings/maj6_up_sax.m4a",
  "assets/melodic-recordings/maj6_up_flute.m4a",
  "assets/melodic-recordings/maj6_down_guitar.m4a",
  "assets/melodic-recordings/maj6_down_piano.m4a",
  "assets/melodic-recordings/maj6_down_sax.m4a",
  "assets/melodic-recordings/maj6_down_flute.m4a",
  "assets/melodic-recordings/min7_up_sax.m4a",
  "assets/melodic-recordings/min7_up_guitar.m4a",
  "assets/melodic-recordings/min7_up_flute.m4a",
  "assets/melodic-recordings/min7_up_piano.m4a",
  "assets/melodic-recordings/min7_down_sax.m4a",
  "assets/melodic-recordings/min7_down_guitar.m4a",
  "assets/melodic-recordings/min7_down_flute.m4a",
  "assets/melodic-recordings/min7_down_piano.m4a",
  "assets/melodic-recordings/maj7_up_guitar.m4a",
  "assets/melodic-recordings/maj7_up_sax.m4a",
  "assets/melodic-recordings/maj7_up_piano.m4a",
  "assets/melodic-recordings/maj7_up_flute.m4a",
  "assets/melodic-recordings/maj7_down_sax.m4a",
  "assets/melodic-recordings/maj7_down_piano.m4a",
  "assets/melodic-recordings/maj7_down_flute.m4a",
  "assets/melodic-recordings/maj7_down_guitar.m4a",
  "assets/melodic-recordings/per8_up_sax.m4a",
  "assets/melodic-recordings/per8_up_guitar.m4a",
  "assets/melodic-recordings/per8_up_piano.m4a",
  "assets/melodic-recordings/per8_up_flute.m4a",
  "assets/melodic-recordings/per8_down_guitar.m4a",
  "assets/melodic-recordings/per8_down_piano.m4a",
  "assets/melodic-recordings/per8_down_sax.m4a",
  "assets/melodic-recordings/per8_down_flute.m4a"
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
