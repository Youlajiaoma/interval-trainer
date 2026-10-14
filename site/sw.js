/* v2.7 PWA app shell; native SVG sight-reading feedback. */
const CACHE_NAME = 'interval-trainer-pwa-v2.7.0';
const ROOT = self.registration.scope;
const AUDIO_CACHE = 'interval-trainer-recordings-v1';
const CORE_FILES = [
  './','./index.html','./styles.css','./sight.css','./logic.js',
  './review.js','./statistics.js','./storage.js','./app.js','./sight.js','./vendor/vexflow-loader.js',
  './pwa-register.js','./update.html','./manifest.webmanifest','./vendor/vexflow.js',
  './assets/piano-samples.js','./assets/melodic-recordings.js',
  './icons/icon-192.png','./icons/icon-512.png',
  './LICENSE_AUDIO_GPL2.txt','./UPSTREAM_AUDIO_COPYRIGHT.txt','./LICENSE_SIGHT_CLEF.txt','./LICENSE_VEXFLOW_MIT.txt'
];
const AUDIO_FILES = [
  'assets/melodic-recordings/min2_up_guitar.m4a',
  'assets/melodic-recordings/min2_up_piano.m4a',
  'assets/melodic-recordings/min2_up_sax.m4a',
  'assets/melodic-recordings/min2_up_flute.m4a',
  'assets/melodic-recordings/min2_down_guitar.m4a',
  'assets/melodic-recordings/min2_down_sax.m4a',
  'assets/melodic-recordings/min2_down_piano.m4a',
  'assets/melodic-recordings/min2_down_flute.m4a',
  'assets/melodic-recordings/maj2_up_piano.m4a',
  'assets/melodic-recordings/maj2_up_sax.m4a',
  'assets/melodic-recordings/maj2_up_guitar.m4a',
  'assets/melodic-recordings/maj2_up_flute.m4a',
  'assets/melodic-recordings/maj2_down_piano.m4a',
  'assets/melodic-recordings/maj2_down_guitar.m4a',
  'assets/melodic-recordings/maj2_down_sax.m4a',
  'assets/melodic-recordings/maj2_down_flute.m4a',
  'assets/melodic-recordings/min3_up_sax.m4a',
  'assets/melodic-recordings/min3_up_piano.m4a',
  'assets/melodic-recordings/min3_up_guitar.m4a',
  'assets/melodic-recordings/min3_up_flute.m4a',
  'assets/melodic-recordings/min3_down_guitar.m4a',
  'assets/melodic-recordings/min3_down_flute.m4a',
  'assets/melodic-recordings/min3_down_piano.m4a',
  'assets/melodic-recordings/min3_down_sax.m4a',
  'assets/melodic-recordings/maj3_up_sax.m4a',
  'assets/melodic-recordings/maj3_up_guitar.m4a',
  'assets/melodic-recordings/maj3_up_flute.m4a',
  'assets/melodic-recordings/maj3_up_piano.m4a',
  'assets/melodic-recordings/maj3_down_flute.m4a',
  'assets/melodic-recordings/maj3_down_sax.m4a',
  'assets/melodic-recordings/maj3_down_piano.m4a',
  'assets/melodic-recordings/maj3_down_guitar.m4a',
  'assets/melodic-recordings/per4_up_piano.m4a',
  'assets/melodic-recordings/per4_up_guitar.m4a',
  'assets/melodic-recordings/per4_up_sax.m4a',
  'assets/melodic-recordings/per4_up_flute.m4a',
  'assets/melodic-recordings/per4_down_sax.m4a',
  'assets/melodic-recordings/per4_down_guitar.m4a',
  'assets/melodic-recordings/per4_down_piano.m4a',
  'assets/melodic-recordings/per4_down_flute.m4a',
  'assets/melodic-recordings/tritone4_up_flute.m4a',
  'assets/melodic-recordings/tritone4_up_guitar.m4a',
  'assets/melodic-recordings/tritone4_up_sax.m4a',
  'assets/melodic-recordings/tritone4_up_piano.m4a',
  'assets/melodic-recordings/tritone5_down_guitar.m4a',
  'assets/melodic-recordings/tritone5_down_piano.m4a',
  'assets/melodic-recordings/tritone5_down_sax.m4a',
  'assets/melodic-recordings/tritone5_down_flute.m4a',
  'assets/melodic-recordings/per5_up_guitar.m4a',
  'assets/melodic-recordings/per5_up_piano.m4a',
  'assets/melodic-recordings/per5_up_sax.m4a',
  'assets/melodic-recordings/per5_up_flute.m4a',
  'assets/melodic-recordings/per5_down_sax.m4a',
  'assets/melodic-recordings/per5_down_guitar.m4a',
  'assets/melodic-recordings/per5_down_piano.m4a',
  'assets/melodic-recordings/per5_down_flute.m4a',
  'assets/melodic-recordings/min6_up_guitar.m4a',
  'assets/melodic-recordings/min6_up_sax.m4a',
  'assets/melodic-recordings/min6_up_piano.m4a',
  'assets/melodic-recordings/min6_up_flute.m4a',
  'assets/melodic-recordings/min6_down_sax.m4a',
  'assets/melodic-recordings/min6_down_piano.m4a',
  'assets/melodic-recordings/min6_down_flute.m4a',
  'assets/melodic-recordings/min6_down_guitar.m4a',
  'assets/melodic-recordings/maj6_up_guitar.m4a',
  'assets/melodic-recordings/maj6_up_piano.m4a',
  'assets/melodic-recordings/maj6_up_sax.m4a',
  'assets/melodic-recordings/maj6_up_flute.m4a',
  'assets/melodic-recordings/maj6_down_guitar.m4a',
  'assets/melodic-recordings/maj6_down_piano.m4a',
  'assets/melodic-recordings/maj6_down_sax.m4a',
  'assets/melodic-recordings/maj6_down_flute.m4a',
  'assets/melodic-recordings/min7_up_sax.m4a',
  'assets/melodic-recordings/min7_up_guitar.m4a',
  'assets/melodic-recordings/min7_up_flute.m4a',
  'assets/melodic-recordings/min7_up_piano.m4a',
  'assets/melodic-recordings/min7_down_sax.m4a',
  'assets/melodic-recordings/min7_down_guitar.m4a',
  'assets/melodic-recordings/min7_down_flute.m4a',
  'assets/melodic-recordings/min7_down_piano.m4a',
  'assets/melodic-recordings/maj7_up_guitar.m4a',
  'assets/melodic-recordings/maj7_up_sax.m4a',
  'assets/melodic-recordings/maj7_up_piano.m4a',
  'assets/melodic-recordings/maj7_up_flute.m4a',
  'assets/melodic-recordings/maj7_down_sax.m4a',
  'assets/melodic-recordings/maj7_down_piano.m4a',
  'assets/melodic-recordings/maj7_down_flute.m4a',
  'assets/melodic-recordings/maj7_down_guitar.m4a',
  'assets/melodic-recordings/per8_up_sax.m4a',
  'assets/melodic-recordings/per8_up_guitar.m4a',
  'assets/melodic-recordings/per8_up_piano.m4a',
  'assets/melodic-recordings/per8_up_flute.m4a',
  'assets/melodic-recordings/per8_down_guitar.m4a',
  'assets/melodic-recordings/per8_down_piano.m4a',
  'assets/melodic-recordings/per8_down_sax.m4a',
  'assets/melodic-recordings/per8_down_flute.m4a'
];
const ROOT_PATH = new URL(ROOT).pathname;
const NETWORK_FIRST = new Set(['pwa-register.js', 'update.html']);

// Install only essential app files. A single large recording download must not block updates.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(CORE_FILES.map(file => new URL(file, ROOT)))));
  // The update prompt still asks for confirmation before taking over.
});
async function preservePreviousRecordings(audioCache) {
  const names = (await caches.keys()).filter(n => n.startsWith('interval-trainer-pwa-') && n!==CACHE_NAME);
  for (const name of names) {
    const old = await caches.open(name);
    for (const request of await old.keys()) {
      if (!new URL(request.url).pathname.includes('/assets/melodic-recordings/')) continue;
      if (await audioCache.match(request)) continue;
      const response = await old.match(request);
      if (response) try { await audioCache.put(request,response); } catch (_) {}
    }
  }
  await Promise.all(names.map(name => caches.delete(name)));
}
async function warmAudioCache(audioCache) {
  let index = 0;
  async function next() {
    while (index<AUDIO_FILES.length) {
      const url = new URL(AUDIO_FILES[index++],ROOT);
      try {
        if(await audioCache.match(url))continue;
        const res=await fetch(url,{cache:'no-store'});
        if(res.ok)await audioCache.put(url,res);
      } catch (_) { /* Unavailable recordings remain fetchable on later online practice. */ }
    }
  }
  await Promise.all(Array.from({length:4}, next));
}
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const audioCache=await caches.open(AUDIO_CACHE);
    await preservePreviousRecordings(audioCache);
    await self.clients.claim();
    // Download remaining recordings in the background, without failing the update.
    await warmAudioCache(audioCache);
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==new URL(ROOT).origin||!url.pathname.startsWith(ROOT_PATH))return;
  const relative=url.pathname.slice(ROOT_PATH.length);
  event.respondWith((async()=>{
    const recording=relative.startsWith('assets/melodic-recordings/');
    const cache=await caches.open(recording?AUDIO_CACHE:CACHE_NAME);
    const cached=await cache.match(request);
    if(recording){
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok)try{await cache.put(request,response.clone());}catch(_){}
      return response;
    }
    if(NETWORK_FIRST.has(relative)){
      try {
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok)try{await cache.put(new URL(relative,ROOT),response.clone());}catch(_){}
        return response;
      } catch(error){if(cached)return cached;throw error;}
    }
    if(cached)return cached;
    try {
      const response=await fetch(request);
      if(response.ok)try{await cache.put(request,response.clone());}catch(_){}
      return response;
    } catch(error){
      if(request.mode==='navigate'){
        const fallback=await cache.match(new URL('./index.html',ROOT));
        if(fallback)return fallback;
      }
      throw error;
    }
  })());
});
