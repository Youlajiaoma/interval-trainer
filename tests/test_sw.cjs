const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const site=path.join(__dirname,'..','site');
const root='https://example.test/interval-trainer/';
const handlers={};
const backend=new Map();
let online=true;
let claims=0,skipWaiting=0;
const asUrl=req=>typeof req==='string'?req:req.url||req.href;
function resource(u){const relative=new URL(u).pathname.replace('/interval-trainer/','')||'index.html';return path.join(site,relative);}
function response(url){const p=resource(url);if(!fs.existsSync(p))throw Error('file missing '+url);return {ok:true,type:'basic',url,body:fs.readFileSync(p),clone(){return this;}};}
const cacheAPI={
 async open(name){if(!backend.has(name))backend.set(name,new Map());const entries=backend.get(name);return {
  async addAll(urls){const rows=urls.map(u=>{if(!online)throw Error('offline');return [String(u),response(String(u))]});for(const [url,res] of rows)entries.set(url,res);},
  async match(req){return entries.get(asUrl(req))},
  async put(req,res){entries.set(asUrl(req),res)},
  async keys(){return [...entries.keys()].map(url=>({url}))}
 };},
 async keys(){return [...backend.keys()]},async delete(name){return backend.delete(name)}
};
const selfObj={registration:{scope:root},clients:{claim:async()=>{claims++}},addEventListener:(name,handler)=>{handlers[name]=handler},skipWaiting() {skipWaiting++}};
const env={self:selfObj,caches:cacheAPI,URL,fetch:async(req)=>{if(!online)throw Error('network off');return response(asUrl(req))}};
vm.runInNewContext(fs.readFileSync(path.join(site,'sw.js'),'utf8'),env);
(async()=>{
 let installation;handlers.install({waitUntil:p=>{installation=p}});await installation;
 assert([...backend.values()][0].size>=13);
 const old=await cacheAPI.open('interval-trainer-pwa-old');
 const savedUrl=new URL('assets/melodic-recordings/min2_up_piano.m4a',root).href;
 await old.put({url:savedUrl},response(savedUrl));
 let activation;handlers.activate({waitUntil:p=>{activation=p}});await activation;
 assert.equal(claims,1);
 assert(!backend.has('interval-trainer-pwa-old'),'old core caches should be removed after recording migration');
 const recordings=backend.get('interval-trainer-recordings-v1');
 assert.equal(recordings.size,96,'all supplied recordings should be warmed');
 assert(recordings.has(savedUrl),'previous recordings should be retained');
 handlers.message({data:{type:'SKIP_WAITING'}});assert.equal(skipWaiting,1);
 online=false;
 async function offlineGet(p,mode='same-origin'){let result;handlers.fetch({request:{url:new URL(p,root).toString(),method:'GET',mode},respondWith:x=>result=x});return result;}
 assert((await offlineGet('index.html')).body.length>1000);
 assert((await offlineGet('assets/piano-samples.js')).body.length>100000);
 assert((await offlineGet('')).body.length>1000);
 assert((await offlineGet('audio.js')).body.length>1000);
 assert((await offlineGet('modules.js')).body.length>1000);
 const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
 const assets=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
 assets.push(...[...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(match=>match[1]));
 for(const asset of assets)assert((await offlineGet(asset)).body.length>0,'offline dependency including its version: '+asset);
 assert((await offlineGet('assets/melodic-recordings/min2_up_piano.m4a')).body.length>100);
 assert((await offlineGet('unknown-page','navigate')).body.length>1000);
 await assert.rejects(offlineGet('unknown-asset.js'),/network off/);
 for(const request of [{url:'https://elsewhere.test/app.js',method:'GET'},
   {url:new URL('/outside/app.js',root).href,method:'GET'}, {url:new URL('app.js',root).href,method:'POST'}]){
  handlers.fetch({request,respondWith(){throw Error('out-of-scope request intercepted')}});
 }
 console.log('PASS ServiceWorker simulation: install, recording migration/warming, activation, offline assets and request boundaries');
})().catch(e=>{console.error(e);process.exitCode=1});
