const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const site=path.join(__dirname,'..','site');
const root='https://example.test/interval-trainer/';
const handlers={};
const backend=new Map();
const networkOverrides=new Map();
let online=true;
let claims=0,skipWaiting=0;
const asUrl=req=>typeof req==='string'?req:req.url||req.href;
function resource(u){const relative=new URL(u).pathname.replace('/interval-trainer/','')||'index.html';return path.join(site,relative);}
function response(url){const p=resource(url);if(!fs.existsSync(p))throw Error('file missing '+url);return new Response(networkOverrides.get(url)||fs.readFileSync(p));}
async function body(response){return Buffer.from(await response.arrayBuffer());}
const cacheAPI={
 async open(name){if(!backend.has(name))backend.set(name,new Map());const entries=backend.get(name);return {
  async addAll(urls){const rows=urls.map(u=>{if(!online)throw Error('offline');return [String(u),response(String(u))]});for(const [url,res] of rows)entries.set(url,res);},
  async match(req){return entries.get(asUrl(req))?.clone()},
  async delete(req){return entries.delete(asUrl(req))},
  async put(req,res){entries.set(asUrl(req),res.clone())},
  async keys(){return [...entries.keys()].map(url=>({url}))}
 };},
 async keys(){return [...backend.keys()]},async delete(name){return backend.delete(name)}
};
const selfObj={registration:{scope:root},clients:{claim:async()=>{claims++}},addEventListener:(name,handler)=>{handlers[name]=handler},skipWaiting() {skipWaiting++}};
const env={self:selfObj,caches:cacheAPI,URL,Response,Headers,importScripts(file){
 const script=fs.readFileSync(path.join(site,file.replace(/^\.\//,'').split('?')[0]),'utf8');
 vm.runInNewContext(script,{self:selfObj});
},fetch:async(req)=>{if(!online)throw Error('network off');return response(asUrl(req))}};
vm.runInNewContext(fs.readFileSync(path.join(site,'sw.js'),'utf8'),env);
(async()=>{
 let installation;handlers.install({waitUntil:p=>{installation=p}});await installation;
 assert([...backend.values()][0].size>=13);
 assert(backend.has('interval-trainer-pwa-v2.20.4-local-local-audio1'),'cache name should match the app version, build and resource revision');
 const harmony=backend.get('interval-trainer-harmony-recordings-v1');
 const songs=selfObj.TonaloomHarmonySongs.flatMap(song=>Object.values(song.stems));
 assert.equal(harmony.size,songs.length,'歌曲未播放前，安装阶段就必须下载全部音轨');
 const old=await cacheAPI.open('interval-trainer-pwa-old');
 const savedUrl=new URL('assets/melodic-recordings/min2_up_piano.wav',root).href;
 const staleUrl=new URL('assets/melodic-recordings/maj2_up_piano.m4a',root).href;
 await old.put({url:savedUrl},response(savedUrl));
 await old.put({url:staleUrl},new Response('old audio'));
 let activation;handlers.activate({waitUntil:p=>{activation=p}});await activation;
 assert.equal(claims,1);
 assert(!backend.has('interval-trainer-pwa-old'),'old core caches should be removed after recording migration');
 const recordings=backend.get('interval-trainer-recordings-v1');
 assert.equal(recordings.size,96,'all supplied recordings should be warmed');
 assert(recordings.has(savedUrl),'previous recordings should be retained');
 assert(!recordings.has(staleUrl),'old M4A recordings should be removed');
 handlers.message({data:{type:'SKIP_WAITING'}});assert.equal(skipWaiting,1);
 async function offlineGet(p,mode='same-origin',range){let result;handlers.fetch({request:{url:new URL(p,root).toString(),method:'GET',mode,headers:new Headers(range ? {Range:range} : {})},respondWith:x=>result=x});return result;}
 const catalogPath=/src="(assets\/harmony-songs\.js[^\"]*)"/.exec(fs.readFileSync(path.join(site,'index.html'),'utf8'))[1];
 const catalogUrl=new URL(catalogPath,root).href;
 const refreshedCatalog=Buffer.from(fs.readFileSync(resource(catalogUrl),'utf8')+'\n// Refreshed song list\n');
 networkOverrides.set(catalogUrl,refreshedCatalog);
 assert.deepEqual(await body(await offlineGet(catalogPath)),refreshedCatalog,'联网时歌曲清单必须更新，不能一直使用空音轨缓存');
 online=false;
 assert.deepEqual(await body(await offlineGet(catalogPath)),refreshedCatalog,'离线时使用刚更新过的同一版本清单');
 for(const song of songs){
  const original=fs.readFileSync(resource(new URL(song,root)));
  assert.deepEqual(await body(await offlineGet(song)),original,'未播放过的完整歌曲断网后也必须可读');
  const partial=await offlineGet(song,'same-origin','bytes=44-143');
  assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),`bytes 44-143/${original.length}`);
  assert.deepEqual(await body(partial),original.subarray(44,144),'离线拖动返回正确的音频片段');
  assert.deepEqual(await body(await offlineGet(song,'same-origin','bytes=-100')),original.subarray(-100));
  assert.equal((await offlineGet(song,'same-origin',`bytes=${original.length}-`)).status,416);
 }
 assert((await body(await offlineGet('index.html'))).length>1000);
 assert((await body(await offlineGet('assets/piano-samples.js'))).length>100000);
 assert((await body(await offlineGet(''))).length>1000);
 assert((await body(await offlineGet('audio.js?v=2.20.4'))).length>1000);
 assert((await body(await offlineGet('modules.js?v=2.20.4'))).length>1000);
 const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
 const assets=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
 assets.push(...[...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match=>match[1]));
 for(const asset of assets)assert((await body(await offlineGet(asset))).length>0,'offline dependency including its version: '+asset);
 assert((await body(await offlineGet('assets/melodic-recordings/min2_up_piano.wav'))).length>100);
 assert((await body(await offlineGet('unknown-page','navigate'))).length>1000);
 await assert.rejects(offlineGet('unknown-asset.js'),/network off/);
 for(const request of [{url:'https://elsewhere.test/app.js',method:'GET'},
   {url:new URL('/outside/app.js',root).href,method:'GET'}, {url:new URL('app.js',root).href,method:'POST'}]){
  handlers.fetch({request,respondWith(){throw Error('out-of-scope request intercepted')}});
 }
 console.log('PASS ServiceWorker simulation: local songs before first play, offline full/range reads, recording migration/warming, assets and request boundaries');
})().catch(e=>{console.error(e);process.exitCode=1});
