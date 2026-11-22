/* The shared version file supplies the app version and deployment build ID. */
importScripts('./build-info.js');
importScripts('./assets/harmony-songs.js?v=2.21.3-local-audio2');
const CACHE_NAME = `interval-trainer-pwa-v${self.TonaloomBuildInfo.version}-${self.TonaloomBuildInfo.build}-local-audio2-ui6-popover2`;
const ROOT = self.registration.scope;
const AUDIO_CACHE = 'interval-trainer-recordings-v1';
const HARMONY_CACHE = 'interval-trainer-harmony-recordings-v1';
const HARMONY_FILES = [...new Set(self.TonaloomHarmonySongs.flatMap(song =>
  [...Object.values(song.stems || {}),...song.tracks.map(track => track.src)].filter(src => typeof src === 'string' && src.startsWith('assets/harmony-practice/'))))];
const CORE_FILES = [
  './motion.js?v=2.21.3',
  './','./index.html','./styles.css?v=2.21.3','./sight.css?v=2.21.3','./theme.css?v=2.21.3-ui6','./logic.js','./modules.js?v=2.21.3',
  './review.js?v=2.21.3','./statistics.js?v=2.21.3-popover2','./audio.js?v=2.21.3','./storage.js','./app.js?v=2.21.3-local-audio2','./vendor/vexflow-loader.js','./sight.js?v=2.21.3','./staff-interval.js?v=2.21.3','./build-info.js','./build-info.js?v=2.21.3',
  './pwa-register.js','./update.html','./manifest.webmanifest','./vendor/vexflow.js',
  './daily-tasks.js?v=2.21.3','./pitch.js?v=2.21.3','./singing.js?v=2.21.3','./singing.css?v=2.21.3',
  './assets/harmony-songs.js?v=2.21.3-local-audio2','./harmony-mix.js?v=2.21.3-local-audio2','./harmony-practice.js?v=2.21.3-local-audio2','./harmony-practice.css?v=2.21.3-local-audio2',
  './assets/piano-samples.js','./assets/melodic-recordings.js',
  './icons/icon-192.png?v=2.11.0','./icons/icon-512.png?v=2.11.0',
  './LICENSE_AUDIO_GPL2.txt','./UPSTREAM_AUDIO_COPYRIGHT.txt','./LICENSE_SIGHT_CLEF.txt','./LICENSE_VEXFLOW_MIT.txt'
];
const AUDIO_FILES = [
  'assets/melodic-recordings/min2_up_guitar.wav',
  'assets/melodic-recordings/min2_up_piano.wav',
  'assets/melodic-recordings/min2_up_sax.wav',
  'assets/melodic-recordings/min2_up_flute.wav',
  'assets/melodic-recordings/min2_down_guitar.wav',
  'assets/melodic-recordings/min2_down_sax.wav',
  'assets/melodic-recordings/min2_down_piano.wav',
  'assets/melodic-recordings/min2_down_flute.wav',
  'assets/melodic-recordings/maj2_up_piano.wav',
  'assets/melodic-recordings/maj2_up_sax.wav',
  'assets/melodic-recordings/maj2_up_guitar.wav',
  'assets/melodic-recordings/maj2_up_flute.wav',
  'assets/melodic-recordings/maj2_down_piano.wav',
  'assets/melodic-recordings/maj2_down_guitar.wav',
  'assets/melodic-recordings/maj2_down_sax.wav',
  'assets/melodic-recordings/maj2_down_flute.wav',
  'assets/melodic-recordings/min3_up_sax.wav',
  'assets/melodic-recordings/min3_up_piano.wav',
  'assets/melodic-recordings/min3_up_guitar.wav',
  'assets/melodic-recordings/min3_up_flute.wav',
  'assets/melodic-recordings/min3_down_guitar.wav',
  'assets/melodic-recordings/min3_down_flute.wav',
  'assets/melodic-recordings/min3_down_piano.wav',
  'assets/melodic-recordings/min3_down_sax.wav',
  'assets/melodic-recordings/maj3_up_sax.wav',
  'assets/melodic-recordings/maj3_up_guitar.wav',
  'assets/melodic-recordings/maj3_up_flute.wav',
  'assets/melodic-recordings/maj3_up_piano.wav',
  'assets/melodic-recordings/maj3_down_flute.wav',
  'assets/melodic-recordings/maj3_down_sax.wav',
  'assets/melodic-recordings/maj3_down_piano.wav',
  'assets/melodic-recordings/maj3_down_guitar.wav',
  'assets/melodic-recordings/per4_up_piano.wav',
  'assets/melodic-recordings/per4_up_guitar.wav',
  'assets/melodic-recordings/per4_up_sax.wav',
  'assets/melodic-recordings/per4_up_flute.wav',
  'assets/melodic-recordings/per4_down_sax.wav',
  'assets/melodic-recordings/per4_down_guitar.wav',
  'assets/melodic-recordings/per4_down_piano.wav',
  'assets/melodic-recordings/per4_down_flute.wav',
  'assets/melodic-recordings/tritone4_up_flute.wav',
  'assets/melodic-recordings/tritone4_up_guitar.wav',
  'assets/melodic-recordings/tritone4_up_sax.wav',
  'assets/melodic-recordings/tritone4_up_piano.wav',
  'assets/melodic-recordings/tritone5_down_guitar.wav',
  'assets/melodic-recordings/tritone5_down_piano.wav',
  'assets/melodic-recordings/tritone5_down_sax.wav',
  'assets/melodic-recordings/tritone5_down_flute.wav',
  'assets/melodic-recordings/per5_up_guitar.wav',
  'assets/melodic-recordings/per5_up_piano.wav',
  'assets/melodic-recordings/per5_up_sax.wav',
  'assets/melodic-recordings/per5_up_flute.wav',
  'assets/melodic-recordings/per5_down_sax.wav',
  'assets/melodic-recordings/per5_down_guitar.wav',
  'assets/melodic-recordings/per5_down_piano.wav',
  'assets/melodic-recordings/per5_down_flute.wav',
  'assets/melodic-recordings/min6_up_guitar.wav',
  'assets/melodic-recordings/min6_up_sax.wav',
  'assets/melodic-recordings/min6_up_piano.wav',
  'assets/melodic-recordings/min6_up_flute.wav',
  'assets/melodic-recordings/min6_down_sax.wav',
  'assets/melodic-recordings/min6_down_piano.wav',
  'assets/melodic-recordings/min6_down_flute.wav',
  'assets/melodic-recordings/min6_down_guitar.wav',
  'assets/melodic-recordings/maj6_up_guitar.wav',
  'assets/melodic-recordings/maj6_up_piano.wav',
  'assets/melodic-recordings/maj6_up_sax.wav',
  'assets/melodic-recordings/maj6_up_flute.wav',
  'assets/melodic-recordings/maj6_down_guitar.wav',
  'assets/melodic-recordings/maj6_down_piano.wav',
  'assets/melodic-recordings/maj6_down_sax.wav',
  'assets/melodic-recordings/maj6_down_flute.wav',
  'assets/melodic-recordings/min7_up_sax.wav',
  'assets/melodic-recordings/min7_up_guitar.wav',
  'assets/melodic-recordings/min7_up_flute.wav',
  'assets/melodic-recordings/min7_up_piano.wav',
  'assets/melodic-recordings/min7_down_sax.wav',
  'assets/melodic-recordings/min7_down_guitar.wav',
  'assets/melodic-recordings/min7_down_flute.wav',
  'assets/melodic-recordings/min7_down_piano.wav',
  'assets/melodic-recordings/maj7_up_guitar.wav',
  'assets/melodic-recordings/maj7_up_sax.wav',
  'assets/melodic-recordings/maj7_up_piano.wav',
  'assets/melodic-recordings/maj7_up_flute.wav',
  'assets/melodic-recordings/maj7_down_sax.wav',
  'assets/melodic-recordings/maj7_down_piano.wav',
  'assets/melodic-recordings/maj7_down_flute.wav',
  'assets/melodic-recordings/maj7_down_guitar.wav',
  'assets/melodic-recordings/per8_up_sax.wav',
  'assets/melodic-recordings/per8_up_guitar.wav',
  'assets/melodic-recordings/per8_up_piano.wav',
  'assets/melodic-recordings/per8_up_flute.wav',
  'assets/melodic-recordings/per8_down_guitar.wav',
  'assets/melodic-recordings/per8_down_piano.wav',
  'assets/melodic-recordings/per8_down_sax.wav',
  'assets/melodic-recordings/per8_down_flute.wav'
];
const ROOT_PATH = new URL(ROOT).pathname;
const NETWORK_FIRST = new Set(['pwa-register.js', 'update.html', 'assets/harmony-songs.js']);

// Song recordings are part of the local app, ready before this update installs.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(file => new URL(file, ROOT)));
    const audio = await caches.open(HARMONY_CACHE), missing = [];
    for (const file of HARMONY_FILES) {
      const url = new URL(file,ROOT);
      if (!await audio.match(url)) missing.push(url);
    }
    if (missing.length) await audio.addAll(missing);
  })());
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
async function removeLegacyRecordings(audioCache) {
  const oldFiles = (await audioCache.keys()).filter(request =>
    new URL(request.url).pathname.toLowerCase().endsWith('.m4a'));
  await Promise.all(oldFiles.map(request => audioCache.delete(request)));
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
    await removeLegacyRecordings(audioCache);
    await self.clients.claim();
    // Download remaining recordings in the background, without failing the update.
    await warmAudioCache(audioCache);
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
async function localSong(request,url) {
  const cache = await caches.open(HARMONY_CACHE);
  let response = await cache.match(url.href);
  if (!response) {
    // Save a complete file, even when a native player first asks for a range.
    response = await fetch(url.href,{cache:'no-store'});
    if (!response.ok) return response;
    try { await cache.put(url.href,response.clone()); } catch (_) {}
  }
  const range = request.headers?.get('Range');
  if (!range) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer(), size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size-1,Number(match[2])) : size-1;
  if (start >= size || start > end) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  const headers = new Headers(response.headers);
  headers.set('Content-Range',`bytes ${start}-${end}/${size}`);
  headers.set('Content-Length',String(end-start+1)); headers.set('Accept-Ranges','bytes');
  return new Response(bytes.slice(start,end+1),{status:206,headers});
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==new URL(ROOT).origin||!url.pathname.startsWith(ROOT_PATH))return;
  const relative=url.pathname.slice(ROOT_PATH.length);
  if(relative.startsWith('assets/harmony-practice/')) {
    event.respondWith(localSong(request,url)); return;
  }
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
        if(response.ok)try{await cache.put(request,response.clone());}catch(_){}
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
